const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server.cjs');

const fixture = () => ({ version: 1, categories: [{ id: 'work', name: '工作', icon: 'folder' }], links: [{ id: 'a', title: '测试', url: 'https://example.com', categoryId: 'work', iconData: '', createdAt: 123 }] });
test('data writes are atomic, authenticated-proxy compatible, versioned and persistent', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-server-test-'));
    fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(fixture()));
    let app;
    t.after(async () => { if (app?.listening) await new Promise(resolve => app.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
    async function start() {
        app = createApp({ dataDir: dir, origins: ['https://www.gbjson.cn'] });
        app.listen(0, '127.0.0.1');
        await once(app, 'listening');
        return 'http://127.0.0.1:' + app.address().port;
    }
    let base = await start();
    const initial = await fetch(base + '/api/data');
    const etag = initial.headers.get('etag');
    assert.deepEqual(await initial.json(), fixture());
    const headers = { Origin: 'https://www.gbjson.cn', 'Content-Type': 'application/json', 'If-Match': etag };
    const put = (body, custom = headers) => fetch(base + '/api/data', { method: 'PUT', headers: custom, body: JSON.stringify(body) });
    assert.equal((await put(fixture(), { ...headers, Origin: 'https://evil.example' })).status, 403);
    assert.equal((await put(fixture(), { Origin: headers.Origin, 'Content-Type': 'application/json' })).status, 428);
    assert.equal((await put({})).status, 400);
    const changed = fixture();
    changed.links[0].title = '已保存';
    const result = await put(changed);
    assert.equal(result.status, 200);
    assert.notEqual(result.headers.get('etag'), etag);
    assert.equal((await put(fixture())).status, 412);
    assert.equal(fs.readdirSync(path.join(dir, 'backups')).length, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'))), changed);
    assert.equal((await fetch(base + '/server.cjs')).status, 404);
    assert.equal((await fetch(base + '/%2e%2e%2fserver.cjs')).status, 404);
    assert.match((await fetch(base + '/')).headers.get('content-type'), /text\/html/);
    await new Promise(resolve => app.close(resolve));
    base = await start();
    assert.deepEqual(await (await fetch(base + '/api/data')).json(), changed);
    assert.equal((await fetch(base + '/api/data', { method: 'DELETE' })).status, 405);
});

test('missing or corrupt persistent data fails closed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-server-missing-'));
    try {
        assert.throws(() => createApp({ dataDir: dir }));
        fs.writeFileSync(path.join(dir, 'data.json'), '{}');
        assert.throws(() => createApp({ dataDir: dir }));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
