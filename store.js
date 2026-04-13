import { generateId } from './utils.js';

const STORAGE_KEY = 'nexus_links_v1';

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

export class Store {
    constructor() {
        this.links = this._loadLinks();
        this.categories = this._loadCategories();
        
        if (this.links.length === 0) {
            this.links = defaultLinks;
            this._saveLinks();
        }
        
        if (this.categories.length === 0) {
            this.categories = defaultCategories;
            this._saveCategories();
        }
    }

    _loadLinks() {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }
    
    _loadCategories() {
        const data = localStorage.getItem(STORAGE_KEY + '_categories');
        return data ? JSON.parse(data) : [];
    }

    _saveLinks() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.links));
    }
    
    _saveCategories() {
        localStorage.setItem(STORAGE_KEY + '_categories', JSON.stringify(this.categories));
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
                icon: normalizeString(category.icon, 'folder')
            }))
            .filter(category => category.id && category.name && !seen.has(category.id) && seen.add(category.id));

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
                url: normalizeString(link.url),
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
        this._saveLinks();
        return newLink;
    }

    update(id, linkData) {
        const index = this.links.findIndex(l => l.id === id);
        if (index !== -1) {
            this.links[index] = { ...this.links[index], ...linkData };
            this._saveLinks();
            return this.links[index];
        }
        return null;
    }

    remove(id) {
        this.links = this.links.filter(l => l.id !== id);
        this._saveLinks();
    }
    
    // Category methods
    getCategories() {
        return this.categories;
    }
    
    getCategoryById(id) {
        return this.categories.find(c => c.id === id) || { id: 'uncategorized', name: '未分类', icon: 'folder' };
    }
    
    addCategory(categoryData) {
        const newCategory = {
            id: generateId(),
            name: categoryData.name,
            icon: categoryData.icon || 'folder'
        };
        this.categories.push(newCategory);
        this._saveCategories();
        return newCategory;
    }
    
    updateCategory(id, categoryData) {
        const index = this.categories.findIndex(c => c.id === id);
        if (index !== -1) {
            this.categories[index] = { ...this.categories[index], ...categoryData };
            this._saveCategories();
            return this.categories[index];
        }
        return null;
    }
    
    removeCategory(id) {
        this.categories = this.categories.filter(c => c.id !== id);
        // Update links that belong to this category to uncategorized
        this.links = this.links.map(link => 
            link.categoryId === id ? { ...link, categoryId: 'uncategorized' } : link
        );
        this._saveCategories();
        this._saveLinks();
    }
    
    getLinksByCategory(categoryId) {
        return this.links.filter(link => link.categoryId === categoryId);
    }

    search(query) {
        const lowerQuery = query.toLowerCase();
        return this.links.filter(link => 
            link.title.toLowerCase().includes(lowerQuery) || 
            link.url.toLowerCase().includes(lowerQuery)
        ).sort((a, b) => b.createdAt - a.createdAt);
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
        if (!isRecord(payload)) {
            throw new Error("Invalid import file format");
        }

        const mode = options.mode === 'append' ? 'append' : 'replace';

        if (mode === 'append') {
            return this.appendData(payload);
        }

        this.links = this._normalizeLinks(payload.links, { allowEmpty: true });
        this.categories = this._normalizeCategories(payload.categories, { allowEmpty: true });
        this._saveLinks();
        this._saveCategories();

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
        this._saveCategories();
        this._saveLinks();

        return {
            linksCount: newLinks.length,
            categoriesCount: newCategories.length,
            skippedLinksCount
        };
    }
}
