import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { LINK_API_URL: 'https://test.invalid/api/data' };
const { Store } = await import('../public/store.js');
const fixture = () => {
    const store = new Store();
    store.categories = [{ id: 'work', name: '工作' }, { id: 'empty', name: '空分类' }];
    store.links = ['a', 'b', 'c'].map((id, index) => ({ id, title: id, url: `https://${id}.example`, categoryId: 'work', createdAt: 3 - index }));
    return store;
};

test('empty collections are not seeded or written on load', async () => {
    const methods = [];
    globalThis.fetch = async (_, options = {}) => {
        methods.push(options.method || 'GET');
        return Response.json({ links: [], categories: [] });
    };
    const store = new Store();
    await store.init();
    assert.deepEqual(store.getAll(), []);
    assert.deepEqual(store.getCategories(), []);
    assert.deepEqual(methods, ['GET']);
});

test('reordering deduplicates IDs and preserves all links', async () => {
    const store = fixture();
    store._saveRemote = async () => ({});
    store.reorderLinks(['c', 'c', 'missing', 'a']);
    assert.deepEqual(store.getAll().map(link => link.id), ['c', 'a', 'b']);
    store.moveAndReorderLink('b', 'empty', ['b']);
    assert.deepEqual(store.getLinksByCategory('empty').map(link => link.id), ['b']);
    assert.equal(store.getAll().length, 3);
    store.reorderCategories(['empty', 'empty', 'missing']);
    assert.deepEqual(store.getCategories().map(category => category.id), ['empty', 'work']);
    await store._saveQueue;
});

test('rapid mutations coalesce and the last snapshot is saved', async () => {
    const store = fixture();
    const snapshots = [];
    const states = [];
    let resolve;
    store.onSaveState = state => states.push(state);
    store._saveRemote = async () => {
        snapshots.push(structuredClone(store._serialize()));
        if (snapshots.length === 1) await new Promise(done => { resolve = done; });
    };
    store.reorderLinks(['c', 'b', 'a']);
    await Promise.resolve();
    store.reorderLinks(['b', 'a', 'c']);
    store.reorderLinks(['a', 'c', 'b']);
    resolve();
    await store._saveQueue;
    assert.equal(snapshots.length, 2);
    assert.deepEqual(snapshots[1].links.sort((a, b) => b.createdAt - a.createdAt).map(link => link.id), ['a', 'c', 'b']);
    assert.equal(states.at(-1), 'saved');
});

test('malformed import cannot replace data with defaults', () => {
    const store = fixture();
    assert.throws(() => store.importData({}), /links/);
    assert.equal(store.getAll().length, 3);
});
