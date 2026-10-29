// Local assets + Hong Kong API. Never expose this development proxy publicly.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const API_URL = 'https://www.gbjson.cn/link/api/data';
const MAX_BODY = 8 * 1024 * 1024;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function createDevServer({ apiUrl = API_URL, publicDir = path.join(__dirname, '../public') } = {}) {
    const upstream = new URL(apiUrl);
    const root = path.resolve(publicDir);
    const send = (res, status, value, headers = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
        res.end(JSON.stringify(value));
    };
    const server = http.createServer(async (req, res) => {
        try {
            const port = server.address().port;
            const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
            if (!hosts.includes(req.headers.host)) return send(res, 403, { error: 'Local access only' });
            const url = new URL(req.url, 'http://' + req.headers.host);
            // Also support opening the local site at /link/, like production.
            if (url.pathname === '/link') {
                res.writeHead(302, { Location: '/link/' });
                return res.end();
            }
            const pathname = url.pathname.startsWith('/link/') ? url.pathname.slice(5) : url.pathname;
            if (pathname === '/api/data') {
                if (!['GET', 'PUT'].includes(req.method)) return send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, PUT' });
                const headers = { Accept: 'application/json' };
                let body;
                if (req.method === 'PUT') {
                    if (!hosts.some(host => req.headers.origin === 'http://' + host) || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'Local origin required' });
                    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'Expected application/json' });
                    if (!req.headers['if-match']) return send(res, 428, { error: 'Load data before saving' });
                    if (Number(req.headers['content-length']) > MAX_BODY) return send(res, 413, { error: 'Request too large' });
                    const chunks = [];
                    let size = 0;
                    for await (const chunk of req) {
                        size += chunk.length;
                        if (size > MAX_BODY) return send(res, 413, { error: 'Request too large' });
                        chunks.push(chunk);
                    }
                    body = Buffer.concat(chunks);
                    // Only verified local browser writes reach this trusted upstream.
                    headers.Origin = upstream.origin;
                    headers['Content-Type'] = 'application/json';
                    headers['If-Match'] = req.headers['if-match'];
                }
                try {
                    const response = await fetch(upstream, { method: req.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(20000) });
                    const bytes = Buffer.from(await response.arrayBuffer());
                    res.writeHead(response.status, {
                        'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
                        'Cache-Control': 'no-store',
                        'X-Content-Type-Options': 'nosniff',
                        ...(response.headers.get('etag') ? { ETag: response.headers.get('etag') } : {})
                    });
                    return res.end(bytes);
                } catch (error) {
                    console.error('Hong Kong API:', error.message);
                    return send(res, 502, { error: 'Hong Kong API unavailable. Changes were not confirmed; do not close the page.' });
                }
            }
            if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Method not allowed' });
            let relative;
            try { relative = decodeURIComponent(pathname); } catch { return send(res, 400, { error: 'Bad URL' }); }
            if (relative === '/') relative = '/index.html';
            const file = path.resolve(root, '.' + relative);
            if (!file.startsWith(root + path.sep) || relative.split('/').some(part => part.startsWith('.'))) return send(res, 404, { error: 'Not found' });
            let bytes;
            try { bytes = await fs.readFile(file); } catch { return send(res, 404, { error: 'Not found' }); }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
            res.end(req.method === 'HEAD' ? undefined : bytes);
        } catch (error) {
            console.error('Development server:', error.message);
            if (!res.headersSent) send(res, 500, { error: 'Development server error' });
            else res.end();
        }
    });
    server.requestTimeout = 30000;
    server.headersTimeout = 15000;
    return server;
}

if (require.main === module) {
    const port = Number(process.env.PORT || 8787);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        console.error('PORT must be an integer from 1 to 65535.');
        process.exit(1);
    }
    const server = createDevServer();
    server.on('error', error => {
        console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Stop the old development server and run npm run dev again.` : error.message);
        process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
        console.log(`Link local: http://127.0.0.1:${port}/`);
        console.log(`API: ${API_URL}`);
        console.log('WARNING: Saving here updates LIVE Hong Kong bookmarks.');
    });
}

module.exports = { createDevServer };
