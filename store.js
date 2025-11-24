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
}
