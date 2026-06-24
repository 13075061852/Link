const jsonHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Cache-Control': 'no-store'
};

const ICON_NAME_PATTERN = /^[a-z0-9-]{1,48}$/;
const MAX_ICON_DATA_LENGTH = 262144;

const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT 'folder',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        category_id TEXT NOT NULL DEFAULT 'uncategorized',
        icon_data TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET DEFAULT
    )`,
    'CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order, name)',
    'CREATE INDEX IF NOT EXISTS idx_links_category_id ON links(category_id)',
    'CREATE INDEX IF NOT EXISTS idx_links_created_at ON links(created_at DESC)'
];

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: jsonHeaders });
        }

        if (url.pathname === '/api/data') {
            return handleDataRequest(request, env);
        }

        return env.ASSETS.fetch(request);
    }
};

async function handleDataRequest(request, env) {
    await ensureDatabase(env);

    if (request.method === 'GET') {
        const [categories, links] = await Promise.all([
            env.DB.prepare(`
                SELECT id, name, icon
                FROM categories
                ORDER BY sort_order ASC, name ASC
            `).all(),
            env.DB.prepare(`
                SELECT
                    id,
                    title,
                    url,
                    category_id AS categoryId,
                    icon_data AS iconData,
                    created_at AS createdAt
                FROM links
                ORDER BY created_at DESC
            `).all()
        ]);

        return Response.json({
            version: 1,
            categories: categories.results || [],
            links: links.results || []
        }, { headers: jsonHeaders });
    }

    if (request.method === 'PUT') {
        let payload;

        try {
            payload = await request.json();
        } catch (_) {
            return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: jsonHeaders });
        }

        const result = normalizePayload(payload);
        if (result.error) {
            return Response.json({ error: result.error }, { status: 400, headers: jsonHeaders });
        }

        const now = Date.now();
        const { categories, links } = result.data;
        const statements = [
            env.DB.prepare('DELETE FROM links'),
            env.DB.prepare('DELETE FROM categories'),
            env.DB.prepare(`
                INSERT OR REPLACE INTO categories (id, name, icon, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind('uncategorized', '未分类', 'folder', 0, now, now)
        ];

        categories.forEach((category, index) => {
            statements.push(env.DB.prepare(`
                INSERT OR REPLACE INTO categories (id, name, icon, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind(
                category.id,
                category.name,
                category.icon,
                index + 1,
                now,
                now
            ));
        });

        links.forEach(link => {
            statements.push(env.DB.prepare(`
                INSERT OR REPLACE INTO links (id, title, url, category_id, icon_data, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(
                link.id,
                link.title,
                link.url,
                link.categoryId,
                link.iconData,
                link.createdAt,
                now
            ));
        });

        await env.DB.batch(statements);
        return Response.json({ ok: true, updatedAt: new Date(now).toISOString() }, { headers: jsonHeaders });
    }

    return Response.json({ error: 'Method not allowed' }, {
        status: 405,
        headers: {
            ...jsonHeaders,
            Allow: 'GET, PUT'
        }
    });
}

async function ensureDatabase(env) {
    await env.DB.batch(schemaStatements.map(statement => env.DB.prepare(statement)));
}

function normalizePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { error: 'Payload must be an object' };
    }

    if (!Array.isArray(payload.links)) {
        return { error: 'links must be an array' };
    }

    if (!Array.isArray(payload.categories)) {
        return { error: 'categories must be an array' };
    }

    const categories = [];
    const categoryIds = new Set(['uncategorized']);

    for (const category of payload.categories) {
        if (!isRecord(category)) {
            return { error: 'Each category must be an object' };
        }

        const id = normalizeString(category.id, 128);
        const name = normalizeString(category.name, 80);
        if (!id || !name) {
            return { error: 'Each category needs a non-empty id and name' };
        }

        if (categoryIds.has(id)) {
            return { error: `Duplicate category id: ${id}` };
        }

        categoryIds.add(id);
        categories.push({
            id,
            name,
            icon: normalizeIcon(category.icon)
        });
    }

    const links = [];
    const linkIds = new Set();

    for (const link of payload.links) {
        if (!isRecord(link)) {
            return { error: 'Each link must be an object' };
        }

        const id = normalizeString(link.id, 128);
        const title = normalizeString(link.title, 200);
        const url = normalizeUrl(link.url);
        if (!id || !title || !url) {
            return { error: 'Each link needs a non-empty id, title, and valid http(s) url' };
        }

        if (linkIds.has(id)) {
            return { error: `Duplicate link id: ${id}` };
        }

        const categoryId = normalizeString(link.categoryId, 128) || 'uncategorized';
        links.push({
            id,
            title,
            url,
            categoryId: categoryIds.has(categoryId) ? categoryId : 'uncategorized',
            iconData: normalizeIconData(link.iconData),
            createdAt: normalizeTimestamp(link.createdAt)
        });
        linkIds.add(id);
    }

    return {
        data: {
            categories,
            links
        }
    };
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value, maxLength) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().slice(0, maxLength);
}

function normalizeIcon(value) {
    return typeof value === 'string' && ICON_NAME_PATTERN.test(value) ? value : 'folder';
}

function normalizeUrl(value) {
    if (typeof value !== 'string') {
        return '';
    }

    try {
        const url = new URL(value.trim());
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch (_) {
        return '';
    }
}

function normalizeIconData(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.length <= MAX_ICON_DATA_LENGTH ? value : '';
}

function normalizeTimestamp(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
}
