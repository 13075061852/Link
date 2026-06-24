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
        

        this.render = this.render.bind(this);
        this.handleSearch = this.handleSearch.bind(this);
    }

    init() {
        // 默认按分类分组显示
        this.render(this.store.getAll(), true);
        lucide.createIcons();
    }

    createCardHTML(link) {
        const favicon = getFaviconUrl(link.url);
        const faviconAlt = getFaviconUrlAlt(link.url);
        const hostname = new URL(link.url).hostname;
        const category = this.store.getCategoryById(link.categoryId);
        const iconData = link.iconData;
        const iconSrc = iconData || favicon;
        const fallbackSrc = iconData ? favicon : faviconAlt;
        const categoryIcon = sanitizeIconName(category.icon);
        const safeTitle = escapeHTML(link.title);
        const safeUrl = escapeHTML(link.url);
        const safeCategoryName = escapeHTML(category.name);
        const safeIconSrc = escapeHTML(iconSrc);
        const safeFallbackSrc = escapeHTML(fallbackSrc);
        const safeHostname = escapeHTML(hostname);

        return `
            <div class="group relative h-full bg-surface border border-border rounded-xl p-3 card-hover animate-fade-in select-none">
                <div class="absolute top-2.5 right-2.5 flex gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <button data-id="${link.id}" class="btn-edit p-1.5 rounded-md text-textMuted hover:bg-surfaceHover hover:text-textMain transition-colors" title="编辑">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                    </button>
                    <button data-id="${link.id}" class="btn-delete p-1.5 rounded-md text-textMuted hover:bg-red-500/10 hover:text-red-500 transition-colors" title="删除">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
                
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="flex min-w-0 items-start gap-3 pr-12 outline-none">
                    <div class="w-12 h-12 rounded-lg bg-surfaceHover border border-border flex items-center justify-center overflow-hidden flex-shrink-0 mt-0.5 sm:h-14 sm:w-14">
                        <img
                            src="${safeIconSrc}"
                            alt="${safeTitle}"
                            class="w-full h-full object-contain"
                            data-fallback="${safeFallbackSrc}"
                            onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}else{this.classList.add('hidden');this.nextElementSibling.classList.remove('hidden');}"
                        >
                        <i data-lucide="link" class="hidden w-8 h-8 text-textMuted"></i>
                    </div>
                    <div class="flex-1 min-w-0 max-w-full">
                        <h3 class="text-sm font-medium text-textMain truncate">${safeTitle}</h3>
                        <div class="flex items-center gap-1 mt-0.5">
                            <i data-lucide="${categoryIcon}" class="w-3 h-3 shrink-0 text-textMuted"></i>
                            <span class="text-xs text-textMuted truncate">${safeCategoryName}</span>
                        </div>
                        <p class="text-sm text-textMuted truncate mt-0.5 group-hover:text-accent transition-colors font-mono opacity-80 text-xs">${safeHostname}</p>
                    </div>
                </a>
            </div>
        `;
    }

    render(links, groupedByCategory = false) {
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
                            <div class="link-container">
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
                                <div class="link-container">
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
                                    <div class="link-container">
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
                    <div class="link-container">
                        ${links.map(link => this.createCardHTML(link)).join('')}
                    </div>
                `;
            }
        }
        lucide.createIcons();
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
