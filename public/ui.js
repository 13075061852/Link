import { escapeHTML, getFaviconUrl, getFaviconUrlAlt, sanitizeIconName } from './utils.js';

export class UI {
    constructor(store) {
        this.store = store;
        this.grid = document.getElementById('link-grid');
        this.emptyState = document.getElementById('empty-state');
        this.modalOverlay = document.getElementById('modal-overlay');
        this.modalContent = document.getElementById('modal-content');
        this.linkForm = document.getElementById('link-form');
        this.modalTitle = document.getElementById('modal-title');
        this.searchInput = document.getElementById('search-input');
        this.afterRender = null;
        try { this.view = localStorage.getItem('link_view') === 'list' ? 'list' : 'grid'; }
        catch (_) { this.view = 'grid'; }
        

        this.render = this.render.bind(this);
        this.handleSearch = this.handleSearch.bind(this);
    }

    init() {
        // 默认按分类分组显示
        this.render(this.store.getAll(), true);
        this.setView(this.view);
        lucide.createIcons();
    }

    setView(view) {
        if (document.body.classList.contains('is-sorting')) return;
        this.view = view === 'list' ? 'list' : 'grid';
        this.grid.classList.toggle('list-view', this.view === 'list');
        document.querySelectorAll('[data-view]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.view === this.view));
        });
        try { localStorage.setItem('link_view', this.view); } catch (_) {}
    }

    createCardHTML(link) {
        const favicon = getFaviconUrl(link.url);
        const faviconAlt = getFaviconUrlAlt(link.url);
        const hostname = new URL(link.url).hostname.replace(/^www\./, '');
        const iconData = link.iconData;
        const iconSrc = iconData || favicon;
        const fallbackSrc = iconData ? favicon : faviconAlt;
        const safeId = escapeHTML(link.id);
        const safeTitle = escapeHTML(link.title);
        const safeUrl = escapeHTML(link.url);
        const safeIconSrc = escapeHTML(iconSrc);
        const safeFallbackSrc = escapeHTML(fallbackSrc);
        const safeHostname = escapeHTML(hostname);

        return `
            <div class="link-card group relative h-full overflow-hidden rounded-2xl border border-border bg-surface p-3 card-hover select-none" data-link-card data-link-id="${safeId}" draggable="false">
                <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" draggable="false" class="card-link flex min-w-0 items-center gap-2">
                    <div class="card-icon relative flex flex-shrink-0 items-center justify-center overflow-hidden border border-border bg-background">
                        <img
                            src="${safeIconSrc}"
                            alt="" loading="lazy" decoding="async" draggable="false"
                            class="w-full h-full object-contain"
                            data-fallback="${safeFallbackSrc}"
                            onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.classList.add('hidden');this.nextElementSibling.classList.remove('hidden');}"
                        >
                        <i data-lucide="link" class="hidden w-8 h-8 text-textMuted"></i>
                    </div>
                    <div class="flex-1 min-w-0 max-w-full">
                        <h3 class="link-title pr-1 text-sm font-semibold leading-snug text-textMain" title="${safeTitle}">${safeTitle}</h3>
                        <p class="link-host mt-1 font-mono text-xs text-textMuted opacity-80 transition-colors group-hover:text-accent">${safeHostname}</p>
                    </div>
                </a>
                <div class="card-footer flex items-center justify-between gap-2">
                    <button type="button" class="link-drag-handle flex min-w-0 items-center gap-1 text-[11px] font-medium text-textMuted" aria-label="排序 ${safeTitle}，按 Alt 加方向键移动" title="拖动手柄排序 · Alt + 方向键">
                        <i data-lucide="grip-horizontal" class="w-4 h-4 shrink-0"></i>
                    </button>
                    <div class="card-actions flex shrink-0 gap-0.5">
                        <button data-url="${safeUrl}" class="btn-copy p-1.5 rounded-full text-textMuted hover:bg-surfaceHover hover:text-textMain transition-colors" title="复制网址" aria-label="复制网址">
                            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                        </button>
                        <button data-id="${safeId}" class="btn-edit p-1.5 rounded-full text-textMuted hover:bg-surfaceHover hover:text-textMain transition-colors" title="编辑" aria-label="编辑链接">
                            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                        </button>
                        <button data-id="${safeId}" class="btn-delete p-1.5 rounded-full text-textMuted hover:bg-red-500/10 hover:text-red-500 transition-colors" title="删除" aria-label="删除链接">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    render(links, groupedByCategory = false) {
        const query = this.searchInput.value.trim();
        const activeId = document.querySelector('.category-nav-item.active')?.dataset.category || 'all';
        document.getElementById('search-status').textContent = query ? `找到 ${links.length} 个链接，清空搜索后可拖拽排序` : '';
        document.getElementById('clear-search').hidden = !query;
        this.grid.classList.toggle('link-drag-disabled', !!query);
        this.emptyState.querySelector('h3').textContent = query ? '没有找到匹配的链接' : '留一个位置，给下一个灵感';
        this.emptyState.querySelector('p').textContent = query ? '试试其他关键词，或清空搜索查看全部收藏。' : '把常用的网站收藏在这里，随时轻松抵达。';

        if (links.length === 0) {
            this.grid.innerHTML = '';
            this.grid.classList.add('hidden');
            this.emptyState.classList.remove('hidden');
            this.emptyState.classList.add('flex');
        } else {
            this.emptyState.classList.add('hidden');
            this.emptyState.classList.remove('flex');
            this.grid.classList.remove('hidden');
            
            if (groupedByCategory) {
                // 按分类分组显示
                const categories = this.store.getCategories();
                let html = '';
                
                // 如果只显示单个分类的链接，则只渲染该分类
                if (links.length > 0 && links.every(link => link.categoryId === links[0].categoryId)) {
                    const categoryId = links[0].categoryId;
                    const category = categoryId === 'uncategorized' || !categoryId ? 
                        { id: 'uncategorized', name: '未分类', icon: 'folder' } : 
                        this.store.getCategoryById(categoryId);
                    
                    html += `
                        <div class="category-section mb-8">
                            <h2 class="text-lg font-semibold text-textMain mb-4 flex min-w-0 items-center gap-2">
                                <i data-lucide="${sanitizeIconName(category.icon)}" class="w-5 h-5 shrink-0"></i>
                                <span class="truncate">${escapeHTML(category.name)}</span>
                            </h2>
                            <div class="link-container" data-category-id="${escapeHTML(category.id)}">
                                ${links.map(link => this.createCardHTML(link)).join('')}
                            </div>
                        </div>
                    `;
                } else {
                    // 显示所有分类
                    // 先处理未分类的链接
                    const uncategorizedLinks = links.filter(link => link.categoryId === 'uncategorized' || !link.categoryId);
                    if (uncategorizedLinks.length > 0) {
                        html += `
                            <div class="category-section mb-8">
                                <h2 class="text-lg font-semibold text-textMain mb-4 flex min-w-0 items-center gap-2">
                                    <i data-lucide="folder" class="w-5 h-5 shrink-0"></i>
                                    <span class="truncate">未分类</span>
                                </h2>
                                <div class="link-container" data-category-id="uncategorized">
                                    ${uncategorizedLinks.map(link => this.createCardHTML(link)).join('')}
                                </div>
                            </div>
                        `;
                    }
                    
                    // 处理其他分类
                    categories.forEach(category => {
                        const categoryLinks = links.filter(link => link.categoryId === category.id);
                        if (categoryLinks.length > 0) {
                            html += `
                                <div class="category-section mb-8">
                                    <h2 class="text-lg font-semibold text-textMain mb-4 flex min-w-0 items-center gap-2">
                                        <i data-lucide="${sanitizeIconName(category.icon)}" class="w-5 h-5 shrink-0"></i>
                                        <span class="truncate">${escapeHTML(category.name)}</span>
                                    </h2>
                                    <div class="link-container" data-category-id="${escapeHTML(category.id)}">
                                        ${categoryLinks.map(link => this.createCardHTML(link)).join('')}
                                    </div>
                                </div>
                            `;
                        }
                    });
                }
                
                this.grid.innerHTML = html;
            } else {
                // 默认平铺显示
                this.grid.innerHTML = `
                    <div class="link-container" data-category-id="all">
                        ${links.map(link => this.createCardHTML(link)).join('')}
                    </div>
                `;
            }
        }
        // Empty groups remain available as cross-category drop targets.
        if (groupedByCategory && activeId === 'all' && !query && links.length) {
            const present = new Set([...this.grid.querySelectorAll('.link-container')].map(el => el.dataset.categoryId));
            const categories = [{ id: 'uncategorized', name: '未分类', icon: 'folder' }, ...this.store.getCategories()];
            for (const category of categories) {
                if (present.has(category.id)) continue;
                const section = document.createElement('section');
                section.className = 'category-section empty-category';
                section.innerHTML = `<h2><i data-lucide="${sanitizeIconName(category.icon)}" class="w-4 h-4"></i><span>${escapeHTML(category.name)}</span></h2><div class="link-container" data-category-id="${escapeHTML(category.id)}"></div>`;
                this.grid.append(section);
            }
            // Keep empty destinations after actual collections so the first
            // screen, especially on phones, prioritizes saved links.
        }
        this.grid.querySelectorAll('.link-drag-handle').forEach(button => { button.disabled = !!query; });
        lucide.createIcons();
        if (typeof this.afterRender === 'function') {
            this.afterRender();
        }
    }

    handleSearch(e, categoryId = 'all') {
        const query = e.target.value.trim();
        const results = this.store.search(query, categoryId);
        const isGroupedByCategory = categoryId === 'all';
        this.render(results, isGroupedByCategory);
    }

    openModal(mode = 'add', linkData = null) {
        this.modalOverlay.classList.remove('hidden');

        requestAnimationFrame(() => {
            this.modalOverlay.classList.add('open');
            this.modalContent.classList.add('open');
        });

        const idInput = document.getElementById('link-id');
        const titleInput = document.getElementById('link-title');
        const urlInput = document.getElementById('link-url');

        if (mode === 'edit' && linkData) {
            this.modalTitle.textContent = '编辑链接';
            idInput.value = linkData.id;
            titleInput.value = linkData.title;
            urlInput.value = linkData.url;
            
            // 设置图片预览
            const iconData = linkData.iconData || '';
            if (iconData) {
                const preview = document.getElementById('link-icon-preview');
                const placeholder = document.getElementById('link-icon-placeholder');
                const clearBtn = document.getElementById('link-icon-clear');
                
                preview.src = iconData;
                preview.classList.remove('hidden');
                placeholder.classList.add('hidden');
                clearBtn.classList.remove('hidden');
                document.getElementById('link-icon-data').value = iconData;
            } else {
                const preview = document.getElementById('link-icon-preview');
                const placeholder = document.getElementById('link-icon-placeholder');
                const clearBtn = document.getElementById('link-icon-clear');
                
                preview.src = '';
                preview.classList.add('hidden');
                placeholder.classList.remove('hidden');
                clearBtn.classList.add('hidden');
                document.getElementById('link-icon-data').value = '';
            }
        } else {
            this.modalTitle.textContent = '添加链接';
            this.linkForm.reset();
            idInput.value = '';
            
            // 重置图片预览
            const preview = document.getElementById('link-icon-preview');
            const placeholder = document.getElementById('link-icon-placeholder');
            const clearBtn = document.getElementById('link-icon-clear');
            const upload = document.getElementById('link-icon-upload');
            
            preview.src = '';
            preview.classList.add('hidden');
            placeholder.classList.remove('hidden');
            clearBtn.classList.add('hidden');
            upload.value = '';
            document.getElementById('link-icon-data').value = '';
        }
        
        titleInput.focus();
    }

    closeModal() {
        this.modalOverlay.classList.remove('open');
        this.modalContent.classList.remove('open');
        
        setTimeout(() => {
            if (this.modalOverlay.classList.contains('open')) return;
            this.modalOverlay.classList.add('hidden');
            this.linkForm.reset();
        }, 200); // Match CSS transition duration
    }

    showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }


}
