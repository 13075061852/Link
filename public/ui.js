import { escapeHTML, getFaviconUrl, sanitizeIconName, isMobileLayout } from './utils.js';
import { icon, createIcons } from './icons.js';
import { openDialog, closeDialog } from './dialogs.js';

const VIEW_KEY = 'link_view';

export class UI {
    constructor(store) {
        this.store = store;
        this.grid = document.getElementById('link-grid');
        this.emptyState = document.getElementById('empty-state');
        this.modalOverlay = document.getElementById('modal-overlay');
        this.modalContent = document.getElementById('modal-content');
        this.linkForm = document.getElementById('link-form');
        this.modalTitle = document.getElementById('modal-title');
        this.modalSubtitle = document.getElementById('modal-subtitle');
        this.searchInput = document.getElementById('search-input');
        this.afterRender = null;
        try { this.view = localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; }
        catch (_) { this.view = 'grid'; }

        this.render = this.render.bind(this);
    }

    init() {
        this.render(this.store.getAll(), true);
        this.setView(this.view);
        this.setupCardMenus();
        createIcons();
    }

    setupCardMenus() {
        const closeMenu = (menu, restoreFocus = false) => {
            if (restoreFocus) menu.querySelector('summary')?.focus({ preventScroll: true });
            menu.open = false;
        };
        this.grid.addEventListener('toggle', event => {
            if (!event.target.matches('.card-menu[open]')) return;
            this.grid.querySelectorAll('.card-menu[open]').forEach(menu => {
                if (menu !== event.target) closeMenu(menu);
            });
            const menu = event.target;
            menu.classList.remove('opens-up');
            const bounds = document.querySelector('.canvas').getBoundingClientRect();
            menu.classList.toggle('opens-up', menu.querySelector('.card-actions').getBoundingClientRect().bottom > bounds.bottom - 8);
        }, true);
        this.grid.addEventListener('click', event => {
            const menu = event.target.closest('.card-menu');
            if (menu && event.target.closest('.card-action')) closeMenu(menu, true);
        });
        document.addEventListener('click', event => {
            this.grid.querySelectorAll('.card-menu[open]').forEach(menu => {
                if (!menu.contains(event.target)) closeMenu(menu);
            });
        });
        document.addEventListener('keydown', event => {
            const menu = this.grid.querySelector('.card-menu[open]');
            if (event.key === 'Escape' && menu) {
                event.preventDefault(); event.stopImmediatePropagation();
                closeMenu(menu, true);
            }
        }, true);
        document.querySelector('.canvas').addEventListener('scroll', () => {
            this.grid.querySelectorAll('.card-menu[open]').forEach(menu => closeMenu(menu));
        }, { passive: true });
    }

    setView(view) {
        if (document.body.classList.contains('is-sorting')) return;
        this.view = view === 'list' ? 'list' : 'grid';
        this.grid.classList.toggle('list-view', this.view === 'list');
        document.querySelectorAll('[data-view]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.view === this.view));
        });
        try { localStorage.setItem(VIEW_KEY, this.view); } catch (_) {}
    }

    createCardHTML(link) {
        const favicon = getFaviconUrl(link.url);
        const hostname = new URL(link.url).hostname.replace(/^www\./, '');
        const iconData = link.iconData;
        const iconSrc = iconData || favicon;
        const fallbackSrc = iconData ? favicon : '';
        // A missing site icon can still answer with a decodable 16px globe, so
        // remote images must be at least 24px before they replace the badge.
        // Explicitly uploaded icons are exempt from that quality threshold.
        const initial = (Array.from(link.title.trim()).find(char => /[\p{L}\p{N}]/u.test(char)) || hostname[0] || 'L').toUpperCase();
        const hue = [215, 255, 175, 330, 28, 195][Array.from(hostname).reduce((hash, char) => (hash * 31 + char.codePointAt(0)) >>> 0, 0) % 6];
        const safeId = escapeHTML(link.id);
        const safeTitle = escapeHTML(link.title);
        const safeUrl = escapeHTML(link.url);
        const safeIconSrc = escapeHTML(iconSrc);
        const safeFallbackSrc = escapeHTML(fallbackSrc);
        const safeHostname = escapeHTML(hostname);

        return `
            <article class="link-card" data-link-card data-link-id="${safeId}" draggable="false">
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" draggable="false" class="card-link">
                    <span class="card-icon" style="--badge-hue: ${hue}" aria-hidden="true">
                        <span class="site-monogram">${escapeHTML(initial)}</span>
                        <img
                            src="${safeIconSrc}"
                            alt="" loading="lazy" decoding="async" draggable="false"
                            class="site-favicon"
                            data-fallback="${safeFallbackSrc}" data-remote="${!iconData}"
                            onload="if(this.dataset.remote==='true' && Math.min(this.naturalWidth,this.naturalHeight)<24){this.parentElement.classList.remove('has-favicon');this.parentElement.classList.add('has-fallback');this.hidden=true;}else{this.hidden=false;this.parentElement.classList.remove('has-fallback');this.parentElement.classList.add('has-favicon');}"
                            onerror="this.parentElement.classList.remove('has-favicon','has-fallback');if(this.dataset.fallback){const src=this.dataset.fallback;this.dataset.fallback='';this.dataset.remote='true';this.src=src;}else{this.hidden=true;this.parentElement.classList.add('has-fallback');}"
                        >
                    </span>
                    <span class="card-copy">
                        <span class="link-title" title="${safeTitle}">${safeTitle}</span>
                        <span class="link-host" title="${safeHostname}">${safeHostname}</span>
                    </span>
                </a>
                <div class="card-footer">
                    <button type="button" class="link-drag-handle" aria-label="排序 ${safeTitle}，按 Alt 加方向键移动" title="拖动排序 · Alt + ↑/↓">
                        ${icon('grip-horizontal')}
                    </button>
                    <details class="card-menu">
                        <summary class="card-more" aria-label="更多操作：${safeTitle}" title="更多操作">${icon('ellipsis')}</summary>
                        <div class="card-actions">
                            <button type="button" data-url="${safeUrl}" class="btn-copy card-action" aria-label="复制网址">${icon('copy')}<span>复制网址</span></button>
                            <button type="button" data-id="${safeId}" class="btn-edit card-action" aria-label="编辑链接">${icon('pencil')}<span>编辑链接</span></button>
                            <button type="button" data-id="${safeId}" class="btn-delete card-action card-action--danger" aria-label="删除链接">${icon('trash-2')}<span>删除链接</span></button>
                        </div>
                    </details>
                </div>
            </article>
        `;
    }

    sectionHTML(category, links, { heading = true } = {}) {
        return `
            <section class="category-section${links.length ? '' : ' is-empty'}">
                ${heading ? `
                <div class="section-head">
                    ${icon(sanitizeIconName(category.icon))}
                    <h2 class="section-title">${escapeHTML(category.name)}</h2>
                    <span class="section-count">${links.length}</span>
                    <span class="section-rule" aria-hidden="true"></span>
                </div>` : `<h2 class="sr-only">${escapeHTML(category.name)}</h2>`}
                <div class="link-container${links.length ? '' : ' is-empty'}" data-category-id="${escapeHTML(category.id)}">
                    ${links.map(link => this.createCardHTML(link)).join('')}
                </div>
            </section>
        `;
    }

    render(links, groupedByCategory = false) {
        const query = this.searchInput.value.trim();
        const activeId = document.querySelector('.category-nav-item.active')?.dataset.category || 'all';
        document.getElementById('search-status').textContent = query ? `找到 ${links.length} 个链接` : '';
        document.getElementById('clear-search').hidden = !query;
        this.grid.classList.toggle('link-drag-disabled', !!query);

        const title = this.emptyState.querySelector('.empty-title');
        const text = this.emptyState.querySelector('.empty-text');
        const emptyButton = this.emptyState.querySelector('#empty-add-btn');
        if (query) {
            title.textContent = '没有找到匹配的链接';
            text.textContent = '换个关键词试试，或清空搜索查看全部收藏。';
            emptyButton.dataset.action = 'clear';
            emptyButton.innerHTML = `${icon('search')}<span>清空搜索</span>`;
        } else if (activeId === 'all') {
            title.textContent = '留一个位置，给下一个灵感';
            text.textContent = '把常用的网站收藏在这里，随时轻松抵达。';
            emptyButton.dataset.action = 'add';
            emptyButton.innerHTML = `${icon('plus')}<span>添加第一个链接</span>`;
        } else {
            title.textContent = '这个分类还是空的';
            text.textContent = isMobileLayout() ? '添加一条链接，开始整理你的收藏。' : '添加一条链接，或把其他分类的卡片拖进来。';
            emptyButton.dataset.action = 'add';
            emptyButton.innerHTML = `${icon('plus')}<span>添加第一个链接</span>`;
        }

        if (links.length === 0) {
            this.grid.innerHTML = '';
            this.grid.hidden = true;
            this.emptyState.hidden = false;
            createIcons();
            if (typeof this.afterRender === 'function') this.afterRender();
            return;
        }

        this.emptyState.hidden = true;
        this.grid.hidden = false;

        const uncategorized = { id: 'uncategorized', name: '未分类', icon: 'folder' };
        let html = '';

        if (groupedByCategory) {
            if (links.every(link => link.categoryId === links[0].categoryId)) {
                const categoryId = links[0].categoryId;
                const category = (!categoryId || categoryId === 'uncategorized')
                    ? uncategorized
                    : this.store.getCategoryById(categoryId);
                html = this.sectionHTML(category, links, { heading: activeId === 'all' });
            } else {
                const uncategorizedLinks = links.filter(link => !link.categoryId || link.categoryId === 'uncategorized');
                if (uncategorizedLinks.length > 0) html += this.sectionHTML(uncategorized, uncategorizedLinks);
                this.store.getCategories().forEach(category => {
                    const categoryLinks = links.filter(link => link.categoryId === category.id);
                    if (categoryLinks.length > 0) html += this.sectionHTML(category, categoryLinks);
                });
            }
        } else {
            const only = this.store.getCategoryById(links[0].categoryId);
            html = this.sectionHTML(only, links);
        }

        this.grid.innerHTML = html;

        // Empty groups stay available as cross-category drop targets.
        if (groupedByCategory && activeId === 'all' && !query) {
            const present = new Set([...this.grid.querySelectorAll('.link-container')].map(el => el.dataset.categoryId));
            [uncategorized, ...this.store.getCategories()].forEach(category => {
                if (present.has(category.id)) return;
                const section = document.createElement('section');
                section.className = 'category-section empty-category';
                section.innerHTML = this.sectionHTML(category, []);
                this.grid.append(section);
            });
        }

        this.grid.querySelectorAll('.link-drag-handle').forEach(button => { button.disabled = !!query; });
        createIcons();
        if (typeof this.afterRender === 'function') this.afterRender();
    }

    openModal(mode = 'add', linkData = null) {
        const preview = document.getElementById('link-icon-preview');
        const placeholder = document.getElementById('link-icon-placeholder');
        const clearBtn = document.getElementById('link-icon-clear');
        const upload = document.getElementById('link-icon-upload');

        if (mode === 'edit' && linkData) {
            this.modalTitle.textContent = '编辑链接';
            this.modalSubtitle.textContent = '调整标题、网址或图标，保存后立即同步。';
            document.getElementById('link-id').value = linkData.id;
            document.getElementById('link-title').value = linkData.title;
            document.getElementById('link-url').value = linkData.url;

            const iconData = linkData.iconData || '';
            document.getElementById('link-icon-data').value = iconData;
            preview.src = iconData;
            preview.hidden = !iconData;
            placeholder.hidden = !!iconData;
            clearBtn.hidden = !iconData;
        } else {
            this.modalTitle.textContent = '添加链接';
            this.modalSubtitle.textContent = '写下标题与网址，稍后随时调整。';
            this.linkForm.reset();
            document.getElementById('link-id').value = '';
            preview.src = '';
            preview.hidden = true;
            placeholder.hidden = false;
            clearBtn.hidden = true;
            upload.value = '';
            document.getElementById('link-icon-data').value = '';
        }

        openDialog(this.modalOverlay, this.modalContent);
        createIcons();
        document.getElementById('link-title').focus();
    }
    closeModal() {
        closeDialog(this.modalOverlay, this.modalContent);
    }

    showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            setTimeout(() => toast.remove(), 220);
        }, 3000);
    }
}
