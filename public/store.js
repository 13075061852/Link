import { generateId, isValidUrl, sanitizeIconName } from './utils.js';

const API_DATA_URL = window.LINK_API_URL || 'https://link-api.1308715689.workers.dev/api/data';
const REMOTE_DATA_VERSION = 1;

const defaultCategories = [
    { id: 'work', name: '工作', icon: 'briefcase' },
    { id: 'entertainment', name: '娱乐', icon: 'gamepad-2' },
    { id: 'social', name: '社交', icon: 'users' },
    { id: 'education', name: '学习', icon: 'book-open' }
];

const defaultLinks = [
    {
        id: '1',
        title: 'Google',
        url: 'https://google.com',
        categoryId: 'work',
        createdAt: Date.now()
    },
    {
        id: '2',
        title: 'Bilibili',
        url: 'https://bilibili.com',
        categoryId: 'entertainment',
        createdAt: Date.now() - 10000
    },
    {
        id: '3',
        title: 'GitHub',
        url: 'https://github.com',
        categoryId: 'work',
        createdAt: Date.now() - 20000
    },
    {
        id: '4',
        title: '知乎',
        url: 'https://zhihu.com',
        categoryId: 'education',
        createdAt: Date.now() - 30000
    }
];

const BACKUP_VERSION = 1;

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeTimestamp(value, fallback = Date.now()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUrlForComparison(url) {
    try {
        return new URL(url).href;
    } catch (_) {
        return normalizeString(url);
    }
}

function normalizeUrl(value) {
    const url = normalizeString(value);
    return isValidUrl(url) ? new URL(url).href : '';
}

export class Store {
    constructor() {
        this.links = [];
        this.categories = [];
        this._saveQueue = Promise.resolve();
        this.onSaveError = null;
        this.onSaveState = null;
        this._revision = 0;
        this._savedRevision = 0;
        this._saving = false;
    }

    async init() {
        const response = await fetch(API_DATA_URL, {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error('无法连接 Cloudflare 存储 API');
        }

        const data = await response.json();
        if (!Array.isArray(data.links) || !Array.isArray(data.categories)) {
            throw new Error('云端数据格式不正确');
        }
        // An empty collection is intentional, not a reason to restore demo data.
        this.categories = this._normalizeCategories(data.categories, { allowEmpty: true });
        this.links = this._normalizeLinks(data.links, { allowEmpty: true });
        this.links.forEach(link => { link.categoryId = this._normalizeCategoryId(link.categoryId); });
    }

    _serialize() {
        return {
            version: REMOTE_DATA_VERSION,
            links: this.links,
            categories: this.categories,
            updatedAt: new Date().toISOString()
        };
    }

    async _saveRemote() {
        const response = await fetch(API_DATA_URL, {
            method: 'PUT',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(this._serialize())
        });

        if (!response.ok) {
            throw new Error('保存到 Cloudflare 失败');
        }

        return response.json();
    }

    _queueSave() {
        this._revision += 1;
        this.onSaveState?.('saving');
        if (this._saving) return this._saveQueue;
        this._saving = true;
        // Coalesce rapid reorders into the latest snapshot instead of writing
        // the whole D1 collection once for every intermediate pointer gesture.
        this._saveQueue = Promise.resolve().then(async () => {
            try {
                while (this._savedRevision < this._revision) {
                    const revision = this._revision;
                    await this._saveRemote();
                    this._savedRevision = revision;
                }
                this.onSaveState?.('saved');
            } catch (error) {
                console.error(error);
                this.onSaveState?.('error');
                this.onSaveError?.(error);
            } finally {
                this._saving = false;
            }
        });
        return this._saveQueue;
    }

    _normalizeCategories(categories, { allowEmpty = false } = {}) {
        if (!Array.isArray(categories)) {
            return [...defaultCategories];
        }

        const seen = new Set();
        const normalized = categories
            .filter(isRecord)
            .map(category => ({
                id: normalizeString(category.id),
                name: normalizeString(category.name),
                icon: sanitizeIconName(category.icon)
            }))
            .filter(category => category.id && category.id !== 'uncategorized' && category.name && !seen.has(category.id) && seen.add(category.id));

        if (normalized.length > 0) {
            return normalized;
        }

        return allowEmpty ? [] : [...defaultCategories];
    }

    _normalizeLinks(links, { allowEmpty = false } = {}) {
        if (!Array.isArray(links)) {
            return [...defaultLinks];
        }

        const seen = new Set();
        const normalized = links
            .filter(isRecord)
            .map(link => ({
                id: normalizeString(link.id),
                title: normalizeString(link.title),
                url: normalizeUrl(link.url),
                categoryId: normalizeString(link.categoryId, 'uncategorized'),
                iconData: typeof link.iconData === 'string' ? link.iconData : '',
                createdAt: normalizeTimestamp(link.createdAt)
            }))
            .filter(link => link.id && link.title && link.url && !seen.has(link.id) && seen.add(link.id));

        if (normalized.length > 0) {
            return normalized;
        }

        return allowEmpty ? [] : [...defaultLinks];
    }

    getAll() {
        return [...this.links].sort((a, b) => b.createdAt - a.createdAt);
    }

    getStats() {
        const domains = new Set();
        this.links.forEach(link => {
            try {
                domains.add(new URL(link.url).hostname.replace(/^www\./, ''));
            } catch (_) {}
        });

        return {
            totalLinks: this.links.length,
            categories: this.categories.length,
            uncategorized: this.links.filter(link => !link.categoryId || link.categoryId === 'uncategorized').length,
            domains: domains.size
        };
    }

    add(linkData) {
        const newLink = {
            id: generateId(),
            title: linkData.title,
            url: linkData.url,
            categoryId: linkData.categoryId || 'uncategorized',
            iconData: linkData.iconData || '',
            createdAt: Date.now()
        };
        this.links.push(newLink);
        this._queueSave();
        return newLink;
    }

    update(id, linkData) {
        const index = this.links.findIndex(l => l.id === id);
        if (index !== -1) {
            this.links[index] = { ...this.links[index], ...linkData };
            this._queueSave();
            return this.links[index];
        }
        return null;
    }

    moveAndReorderLink(id, targetCategoryId, orderedIds) {
        const link = this.links.find(item => item.id === id);
        if (!link) {
            return null;
        }

        const categoryId = this._normalizeCategoryId(targetCategoryId);
        link.categoryId = categoryId;
        this.reorderLinks(orderedIds, { categoryId, skipSave: true });
        this._queueSave();
        return link;
    }

    reorderLinks(orderedIds, { categoryId = null, skipSave = false } = {}) {
        const ids = Array.isArray(orderedIds) ? orderedIds.filter(Boolean) : [];
        if (ids.length === 0) {
            return this.getAll();
        }

        const categoryScope = categoryId ? this._normalizeCategoryId(categoryId) : null;
        const linkById = new Map(this.links.map(link => [link.id, link]));
        const seen = new Set();
        const orderedLinks = ids
            .map(linkId => linkById.get(linkId))
            .filter(link => {
                if (!link || seen.has(link.id)) return false;
                if (categoryScope && this._normalizeCategoryId(link.categoryId) !== categoryScope) return false;
                seen.add(link.id);
                return true;
            });

        const scopedLinks = categoryScope
            ? this.links.filter(link => this._normalizeCategoryId(link.categoryId) === categoryScope)
            : this.links;
        const remainingLinks = scopedLinks
            .filter(link => !seen.has(link.id))
            .sort((a, b) => b.createdAt - a.createdAt);

        const now = Date.now();
        [...orderedLinks, ...remainingLinks].forEach((link, index) => {
            link.createdAt = now - index;
        });

        if (!skipSave) {
            this._queueSave();
        }

        return this.getAll();
    }

    remove(id) {
        this.links = this.links.filter(l => l.id !== id);
        this._queueSave();
    }
    
    // Category methods
    getCategories() {
        return this.categories;
    }
    
    getCategoryById(id) {
        return this.categories.find(c => c.id === id) || { id: 'uncategorized', name: '未分类', icon: 'folder' };
    }

    _normalizeCategoryId(id) {
        const normalized = normalizeString(id, 'uncategorized');
        if (normalized === 'uncategorized') {
            return 'uncategorized';
        }
        return this.categories.some(category => category.id === normalized) ? normalized : 'uncategorized';
    }
    
    addCategory(categoryData) {
        const newCategory = {
            id: generateId(),
            name: categoryData.name,
            icon: sanitizeIconName(categoryData.icon)
        };
        this.categories.push(newCategory);
        this._queueSave();
        return newCategory;
    }
    
    updateCategory(id, categoryData) {
        const index = this.categories.findIndex(c => c.id === id);
        if (index !== -1) {
            this.categories[index] = {
                ...this.categories[index],
                ...categoryData,
                icon: sanitizeIconName(categoryData.icon || this.categories[index].icon)
            };
            this._queueSave();
            return this.categories[index];
        }
        return null;
    }

    reorderCategories(categoryIds) {
        const nextOrder = Array.isArray(categoryIds) ? [...new Set(categoryIds)] : [];
        const categoryById = new Map(this.categories.map(category => [category.id, category]));
        const reordered = nextOrder
            .map(id => categoryById.get(id))
            .filter(Boolean);
        const remaining = this.categories.filter(category => !nextOrder.includes(category.id));

        this.categories = [...reordered, ...remaining];
        this._queueSave();
        return this.categories;
    }
    
    removeCategory(id) {
        this.categories = this.categories.filter(c => c.id !== id);
        // Update links that belong to this category to uncategorized
        this.links = this.links.map(link => 
            link.categoryId === id ? { ...link, categoryId: 'uncategorized' } : link
        );
        this._queueSave();
    }
    
    getLinksByCategory(categoryId) {
        const normalizedCategoryId = this._normalizeCategoryId(categoryId);
        return this.links
            .filter(link => this._normalizeCategoryId(link.categoryId) === normalizedCategoryId)
            .sort((a, b) => b.createdAt - a.createdAt);
    }

    search(query, categoryId = null) {
        const lowerQuery = query.toLowerCase();
        const results = this.links.filter(link => 
            link.title.toLowerCase().includes(lowerQuery) || 
            link.url.toLowerCase().includes(lowerQuery)
        );
        if (categoryId && categoryId !== 'all') {
            const normalizedCategoryId = this._normalizeCategoryId(categoryId);
            return results
                .filter(link => this._normalizeCategoryId(link.categoryId) === normalizedCategoryId)
                .sort((a, b) => b.createdAt - a.createdAt);
        }
        return results.sort((a, b) => b.createdAt - a.createdAt);
    }

    exportData(options = {}) {
        const selectedCategoryIds = Array.isArray(options.categoryIds) && options.categoryIds.length > 0
            ? new Set(options.categoryIds)
            : null;

        const links = selectedCategoryIds
            ? this.getAll().filter(link => selectedCategoryIds.has(link.categoryId))
            : this.getAll();

        const usedCategoryIds = new Set(links
            .map(link => link.categoryId)
            .filter(categoryId => categoryId && categoryId !== 'uncategorized'));

        return {
            version: BACKUP_VERSION,
            exportedAt: new Date().toISOString(),
            scope: selectedCategoryIds ? {
                categoryIds: [...selectedCategoryIds]
            } : {
                categoryIds: null
            },
            links,
            categories: selectedCategoryIds
                ? this.getCategories().filter(category => usedCategoryIds.has(category.id))
                : this.getCategories()
        };
    }

    importData(payload, options = {}) {
        if (!isRecord(payload) || !Array.isArray(payload.links) || !Array.isArray(payload.categories)) {
            throw new Error('备份文件需要包含 links 和 categories 数组');
        }

        const mode = options.mode === 'append' ? 'append' : 'replace';

        if (mode === 'append') {
            return this.appendData(payload);
        }

        this.links = this._normalizeLinks(payload.links, { allowEmpty: true });
        this.categories = this._normalizeCategories(payload.categories, { allowEmpty: true });
        this._queueSave();

        return {
            linksCount: this.links.length,
            categoriesCount: this.categories.length
        };
    }

    appendData(payload) {
        if (!isRecord(payload)) {
            throw new Error("Invalid import file format");
        }

        const importedCategories = this._normalizeCategories(payload.categories, { allowEmpty: true });
        const importedLinks = this._normalizeLinks(payload.links, { allowEmpty: true });
        const existingCategoryIds = new Set(this.categories.map(category => category.id));
        const existingLinkIds = new Set(this.links.map(link => link.id));
        const existingLinkUrls = new Set(this.links.map(link => normalizeUrlForComparison(link.url)));
        const categoryIdMap = new Map();
        const importedCategoryById = new Map(importedCategories.map(category => [category.id, category]));
        const newCategories = [];
        const newLinks = [];
        const importedLinkIds = new Set();
        const importedLinkUrls = new Set();
        let skippedLinksCount = 0;

        importedLinks.forEach(link => {
            const normalizedUrl = normalizeUrlForComparison(link.url);
            if (existingLinkUrls.has(normalizedUrl) || importedLinkUrls.has(normalizedUrl)) {
                skippedLinksCount += 1;
                return;
            }

            importedLinkUrls.add(normalizedUrl);

            const nextLinkId = existingLinkIds.has(link.id) || importedLinkIds.has(link.id)
                ? generateId()
                : link.id;
            importedLinkIds.add(nextLinkId);

            let nextCategoryId = link.categoryId;
            if (nextCategoryId && nextCategoryId !== 'uncategorized' && importedCategoryById.has(nextCategoryId)) {
                if (!categoryIdMap.has(nextCategoryId)) {
                    const category = importedCategoryById.get(nextCategoryId);
                    const mappedCategoryId = existingCategoryIds.has(category.id) || categoryIdMap.has(category.id)
                        ? generateId()
                        : category.id;
                    categoryIdMap.set(category.id, mappedCategoryId);
                    newCategories.push({
                        ...category,
                        id: mappedCategoryId
                    });
                    existingCategoryIds.add(mappedCategoryId);
                }
                nextCategoryId = categoryIdMap.get(nextCategoryId);
            }

            newLinks.push({
                ...link,
                id: nextLinkId,
                categoryId: nextCategoryId
            });

            existingLinkUrls.add(normalizedUrl);
            existingLinkIds.add(nextLinkId);
        });

        this.categories = [...this.categories, ...newCategories];
        this.links = [...this.links, ...newLinks];
        this._queueSave();

        return {
            linksCount: newLinks.length,
            categoriesCount: newCategories.length,
            skippedLinksCount
        };
    }
}
