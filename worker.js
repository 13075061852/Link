const EMPTY_DATA = {
    version: 1,
    links: [],
    categories: []
};

const jsonHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Cache-Control': 'no-store'
};

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
    if (request.method === 'GET') {
        const [categories, links] = await Promise.all([
            env.DB.prepare(`
                SELECT id, name, icon
                FROM categories
                WHERE id != 'uncategorized'
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

        const validationError = validatePayload(payload);
        if (validationError) {
            return Response.json({ error: validationError }, { status: 400, headers: jsonHeaders });
        }

        const now = Date.now();
        const statements = [
            env.DB.prepare('DELETE FROM links'),
            env.DB.prepare('DELETE FROM categories'),
            env.DB.prepare(`
                INSERT OR REPLACE INTO categories (id, name, icon, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind('uncategorized', '未分类', 'folder', 0, now, now)
        ];

        payload.categories.forEach((category, index) => {
            statements.push(env.DB.prepare(`
                INSERT OR REPLACE INTO categories (id, name, icon, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind(
                String(category.id || ''),
                String(category.name || ''),
                String(category.icon || 'folder'),
                index + 1,
                now,
                now
            ));
        });

        payload.links.forEach(link => {
            statements.push(env.DB.prepare(`
                INSERT OR REPLACE INTO links (id, title, url, category_id, icon_data, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(
                String(link.id || ''),
                String(link.title || ''),
                String(link.url || ''),
                String(link.categoryId || 'uncategorized'),
                String(link.iconData || ''),
                Number(link.createdAt || now),
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

function validatePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return 'Payload must be an object';
    }

    if (!Array.isArray(payload.links)) {
        return 'links must be an array';
    }

    if (!Array.isArray(payload.categories)) {
        return 'categories must be an array';
    }

    return '';
}
