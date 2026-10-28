// Dependency-free Linux hosting. Nginx proxies /link/; public editing is intentional.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BODY = 8 * 1024 * 1024;
function validate(data) {
    if (!data || !Array.isArray(data.categories) || !Array.isArray(data.links)) throw new Error('categories and links must be arrays');
    const categoryIds = new Set(['uncategorized']);
    const linkIds = new Set();
    const record = value => value && typeof value === 'object' && !Array.isArray(value);
    const text = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit;
    for (const category of data.categories) {
        if (!record(category) || !text(category.id, 128) || !text(category.name, 80) || categoryIds.has(category.id)) throw new Error('Invalid or duplicate category');
        if (typeof category.icon !== 'string' || !/^[a-z0-9-]{1,48}$/.test(category.icon)) throw new Error('Invalid category icon');
        categoryIds.add(category.id);
    }
    for (const link of data.links) {
        if (!record(link) || !text(link.id, 128) || !text(link.title, 200) || linkIds.has(link.id)) throw new Error('Invalid or duplicate link');
        let url;
        try { url = new URL(link.url); } catch { throw new Error('Invalid link URL'); }
        if (!['http:', 'https:'].includes(url.protocol) || !categoryIds.has(link.categoryId)) throw new Error('Invalid URL or category');
        if (!Number.isFinite(link.createdAt) || link.createdAt <= 0) throw new Error('Invalid timestamp');
        if (link.iconData != null && (typeof link.iconData !== 'string' || link.iconData.length > 262144)) throw new Error('Invalid icon data');
        linkIds.add(link.id);
    }
    return { version: 1, categories: data.categories, links: data.links };
}

function createApp({ dataDir, publicDir = path.join(__dirname, 'public'), origins = [] }) {
    const dataFile = path.join(dataDir, 'data.json');
    const backupDir = path.join(dataDir, 'backups');
    // Never silently start with empty data when the persistent volume is missing.
    const initial = fs.readFileSync(dataFile, 'utf8');
    validate(JSON.parse(initial));
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    let raw = Buffer.from(initial);
    const etag = () => '"' + crypto.createHash('sha256').update(raw).digest('hex') + '"';
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
    const send = (res, status, data, headers = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
        res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
    };
    const persist = next => {
        const stamp = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
        fs.copyFileSync(dataFile, path.join(backupDir, stamp + '.json'), fs.constants.COPYFILE_EXCL);
        const temp = path.join(dataDir, '.data-' + stamp);
        let fd;
        try {
            fd = fs.openSync(temp, 'wx', 0o600);
            fs.writeFileSync(fd, next);
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            fd = undefined;
            fs.renameSync(temp, dataFile);
            raw = next;
            if (process.platform !== 'win32') {
                const dirfd = fs.openSync(dataDir, 'r');
                try { fs.fsyncSync(dirfd); } finally { fs.closeSync(dirfd); }
            }
        } finally {
            if (fd !== undefined) fs.closeSync(fd);
            if (fs.existsSync(temp)) fs.unlinkSync(temp);
        }
        // Keep the last 100 pre-write snapshots; migration backup lives separately.
        try {
            const old = fs.readdirSync(backupDir).filter(name => /^\d+-[a-f0-9]+\.json$/.test(name)).sort();
            for (const name of old.slice(0, -100)) fs.unlinkSync(path.join(backupDir, name));
        } catch (error) { console.error('Backup retention:', error.message); }
    };
    return http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            if (url.pathname === '/healthz') return send(res, 200, { ok: true });
            if (url.pathname === '/api/data') {
                if (req.method === 'GET') return send(res, 200, raw, { ETag: etag() });
                if (req.method !== 'PUT') return send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, PUT' });
                if (!origins.includes(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'Origin not allowed' });
                if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'Expected application/json' });
                if (!req.headers['if-match']) return send(res, 428, { error: 'Load data before saving' });
                if (Number(req.headers['content-length']) > MAX_BODY) return send(res, 413, { error: 'Request too large' });
                let size = 0;
                const chunks = [];
                for await (const chunk of req) {
                    size += chunk.length;
                    if (size > MAX_BODY) { send(res, 413, { error: 'Request too large' }); return; }
                    chunks.push(chunk);
                }
                // Check after awaiting the body so concurrent saves cannot overwrite each other.
                if (req.headers['if-match'] !== etag()) return send(res, 412, { error: 'Data changed in another tab. Export your edits before reloading.' });
                let next;
                try { next = Buffer.from(JSON.stringify(validate(JSON.parse(Buffer.concat(chunks).toString('utf8'))))); }
                catch (error) { return send(res, 400, { error: error.message }); }
                persist(next);
                return send(res, 200, { ok: true, updatedAt: new Date().toISOString() }, { ETag: etag() });
            }
            if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Method not allowed' });
            let relative;
            try { relative = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'Bad URL' }); }
            if (relative === '/') relative = '/index.html';
            const file = path.resolve(publicDir, '.' + relative);
            if (!file.startsWith(path.resolve(publicDir) + path.sep) || relative.split('/').some(segment => segment.startsWith('.'))) return send(res, 404, { error: 'Not found' });
            let bytes;
            try { bytes = fs.readFileSync(file); } catch { return send(res, 404, { error: 'Not found' }); }
            res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
            res.end(req.method === 'HEAD' ? undefined : bytes);
        } catch (error) {
            console.error(error);
            if (!res.headersSent) send(res, 500, { error: 'Storage unavailable; changes were not confirmed' });
            else res.end();
        }
    });
}

if (require.main === module) {
    const app = createApp({
        dataDir: process.env.LINK_DATA_DIR || '/var/lib/link',
        publicDir: process.env.LINK_PUBLIC_DIR || path.join(__dirname, 'public'),
        origins: (process.env.LINK_ORIGINS || 'https://www.gbjson.cn,https://gbjson.cn').split(',')
    });
    app.requestTimeout = 30000;
    app.headersTimeout = 15000;
    app.listen(Number(process.env.PORT || 8791), '127.0.0.1', () => console.log('Link listening on loopback'));
}
module.exports = { createApp, validate };
