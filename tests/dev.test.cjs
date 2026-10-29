const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createDevServer } = require('../scripts/dev.cjs');

async function listen(server) {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return 'http://127.0.0.1:' + server.address().port;
}
function cleanup(t, server) {
    t.after(() => new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
    }));
}

test('local dev serves local assets and proxies Hong Kong data/ETag', async t => {
    const calls = [];
    const upstream = http.createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        calls.push({ url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() });
        const conflict = req.method === 'PUT' && req.headers['if-match'] !== '"v1"';
        res.writeHead(conflict ? 412 : 200, { 'Content-Type': 'application/json', ETag: req.method === 'PUT' && !conflict ? '"v2"' : '"v1"' });
        res.end(JSON.stringify(conflict ? { error: 'Data changed' } : { categories: [], links: [] }));
    });
    cleanup(t, upstream);
    const remote = await listen(upstream);
    const dev = createDevServer({ apiUrl: remote + '/link/api/data' });
    cleanup(t, dev);
    const base = await listen(dev);
    assert.match(await (await fetch(base + '/')).text(), /<!doctype html/i);
    assert.match((await fetch(base + '/styles.css')).headers.get('content-type'), /text\/css/);
    assert.equal((await fetch(base + '/server.cjs')).status, 404);
    assert.equal((await fetch(base + '/%2e%2e%2fpackage.json')).status, 404);
    const initial = await fetch(base + '/api/data');
    assert.equal(initial.status, 200);
    assert.equal(initial.headers.get('etag'), '"v1"');
    assert.deepEqual(await initial.json(), { categories: [], links: [] });
    assert.equal(calls[0].url, '/link/api/data');
    assert.equal((await fetch(base + '/link/')).status, 200);
    assert.equal((await fetch(base + '/link/api/data')).status, 200);
    const body = JSON.stringify({ categories: [], links: [] });
    const headers = { Origin: base, 'Content-Type': 'application/json', 'If-Match': '"v1"' };
    const saved = await fetch(base + '/api/data', { method: 'PUT', headers, body });
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get('etag'), '"v2"');
    const last = calls.at(-1);
    assert.equal(last.headers.origin, remote);
    assert.equal(last.headers['if-match'], '"v1"');
    assert.equal(last.body, body);
    assert.equal((await fetch(base + '/api/data', { method: 'PUT', headers: { ...headers, 'If-Match': '"stale"' }, body })).status, 412);
    const count = calls.length;
    for (const origin of ['https://evil.example', undefined]) {
        const unsafe = { ...headers };
        if (origin) unsafe.Origin = origin;
        else delete unsafe.Origin;
        assert.equal((await fetch(base + '/api/data', { method: 'PUT', headers: unsafe, body })).status, 403);
    }
    assert.equal((await fetch(base + '/api/data', { method: 'PUT', headers: { ...headers, 'sec-fetch-site': 'cross-site' }, body })).status, 403);
    assert.equal((await fetch(base + '/api/data', { method: 'PUT', headers: { Origin: base, 'Content-Type': 'application/json' }, body })).status, 428);
    assert.equal((await fetch(base + '/api/data', { method: 'DELETE' })).status, 405);
    const badHostStatus = await new Promise((resolve, reject) => {
        http.get(base + '/api/data', { headers: { Host: 'evil.example' } }, res => {
            res.resume();
            resolve(res.statusCode);
        }).on('error', reject);
    });
    assert.equal(badHostStatus, 403);
    assert.equal(calls.length, count, 'rejected requests must not reach upstream');
});

test('upstream failure returns 502 rather than a false save confirmation', async t => {
    const upstream = http.createServer((req, res) => res.destroy());
    cleanup(t, upstream);
    const remote = await listen(upstream);
    const dev = createDevServer({ apiUrl: remote + '/link/api/data' });
    cleanup(t, dev);
    const base = await listen(dev);
    const response = await fetch(base + '/api/data');
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /not confirmed/);
});
