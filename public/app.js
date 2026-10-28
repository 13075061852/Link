import { Store } from './store.js';
import { DragSort } from './drag-sort.js';
import { setupDialogs } from './dialogs.js';
import { ThemeManager } from './theme.js';
import { UI } from './ui.js';
import { isValidUrl, debounce, isMobileLayout } from './utils.js';
import { createIcons } from './icons.js';
import { setupSidebar, closeSidebar } from './sidebar.js';
import { openDeleteConfirmModal, closeDataModal } from './data-dialog.js';
import { escapeHTML } from './utils.js';
import {
    populateCategorySelect,
    renderCategoryNav,
    renderCategoryList,
    openCategoryModal,
    closeCategoryModal
} from './categories.js';
import { openExportModal, prepareImportFile, showDropOverlay, downloadJson } from './transfer.js';

function getActiveCategoryId() {
    return document.querySelector('.category-nav-item.active')?.dataset.category || 'all';
}

function getDefaultLinkCategoryId() {
    const active = getActiveCategoryId();
    return active === 'all' ? 'uncategorized' : active;
}

function updateHeader(store) {
    const active = getActiveCategoryId();
    const name = active === 'all' ? '全部收藏'
        : active === 'uncategorized' ? '未分类' : store.getCategoryById(active).name;
    // Keep semantic navigation context without a second visible heading row.
    document.getElementById('page-title').textContent = name;
    document.title = `${name} - 小Link`;
}

function refreshView(store, ui) {
    const current = getActiveCategoryId();
    const exists = current === 'all' || current === 'uncategorized'
        || store.getCategories().some(category => category.id === current);
    // A deleted category must not leave the canvas and header disagreeing.
    if (!exists) {
        document.querySelectorAll('.category-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.category === 'all');
        });
    }
    const active = exists ? current : 'all';
    const query = document.getElementById('search-input').value;
    ui.render(store.search(query, active), true);
    renderCategoryNav(store, ui, { onChange: () => refreshView(store, ui) });
    updateHeader(store);
    populateCategorySelect(store);
}

document.addEventListener('DOMContentLoaded', async () => {
    const store = new Store();
    const themeManager = new ThemeManager();
    const ui = new UI(store);
    const searchInput = document.getElementById('search-input');

    setupDialogs();
    setupSidebar();
    setupLinkDragSort(store, ui);
    createIcons();

    store.onSaveError = error => ui.showToast(error.message || '服务器保存失败，修改仍保留在当前页面');
    store.onSaveState = state => {
        const status = document.getElementById('sync-status');
        status.dataset.state = state;
        status.querySelector('.sync-text').textContent = {
            saving: '正在同步…',
            saved: '已同步到云端',
            error: '同步失败 · 点击重试'
        }[state];
        status.disabled = state !== 'error';
    };
    document.getElementById('sync-status').addEventListener('click', () => store._queueSave());

    try {
        await store.init();
    } catch (error) {
        console.error(error);
        document.getElementById('empty-state').hidden = true;
        document.getElementById('link-grid').hidden = false;
        document.getElementById('link-grid').innerHTML = `
            <div class="canvas-error">
                <span class="empty-icon" aria-hidden="true"><i data-lucide="cloud-off"></i></span>
                <h2 class="empty-title">暂时无法加载收藏</h2>
                <p class="empty-text">${error.message || '请检查网络连接，稍后再试。已保存的收藏不会受到影响。'}</p>
                <button id="retry-load" class="button button--quiet">重新连接</button>
            </div>
        `;
        document.querySelector('#sync-status .sync-text').textContent = '暂时无法连接';
        document.getElementById('sync-status').dataset.state = 'error';
        document.getElementById('retry-load').addEventListener('click', () => location.reload());
        createIcons();
        return;
    }

    ui.init();
    renderCategoryNav(store, ui, { onChange: () => refreshView(store, ui) });
    updateHeader(store);
    populateCategorySelect(store);
    store.onSaveState('saved');

    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', () => ui.setView(button.dataset.view));
    });

    document.getElementById('clear-search').addEventListener('click', () => {
        searchInput.value = '';
        refreshView(store, ui);
        searchInput.focus();
    });

    // Theme ------------------------------------------------------------------
    const revealTheme = trigger => event => startThemeReveal({
        themeManager,
        trigger,
        x: event.clientX,
        y: event.clientY
    });
    document.getElementById('theme-toggle').addEventListener('click', revealTheme(document.getElementById('theme-toggle')));

    // Add / edit links -------------------------------------------------------
    const openAddModal = () => {
        ui.openModal('add');
        populateCategorySelect(store, getDefaultLinkCategoryId());
    };

    document.getElementById('add-btn').addEventListener('click', openAddModal);
    document.getElementById('empty-add-btn').addEventListener('click', event => {
        if (event.currentTarget.dataset.action === 'clear') {
            searchInput.value = '';
            refreshView(store, ui);
            searchInput.focus();
            return;
        }
        openAddModal();
    });

    document.getElementById('modal-close').addEventListener('click', () => ui.closeModal());
    document.getElementById('modal-cancel').addEventListener('click', () => ui.closeModal());

    // Category management ----------------------------------------------------
    document.getElementById('manage-categories-btn').addEventListener('click', () => {
        closeSidebar();
        openCategoryModal(store, ui, () => refreshView(store, ui));
    });
    document.getElementById('category-modal-close').addEventListener('click', closeCategoryModal);

    document.getElementById('category-form').addEventListener('submit', event => {
        event.preventDefault();
        const nameInput = document.getElementById('category-name');
        const name = nameInput.value.trim();
        if (!name) {
            ui.showToast('请填写分类名称');
            return;
        }
        const iconName = document.getElementById('category-icon').value;
        store.addCategory({ name, icon: iconName });
        nameInput.value = '';
        document.getElementById('category-icon').value = 'folder';
        document.querySelectorAll('.icon-option').forEach(option => {
            const selected = option.dataset.icon === 'folder';
            option.classList.toggle('is-selected', selected);
            option.setAttribute('aria-pressed', String(selected));
        });
        renderCategoryList(store, ui, null, () => refreshView(store, ui));
        refreshView(store, ui);
        ui.showToast('分类已添加');
    });

    document.addEventListener('click', event => {
        const option = event.target.closest('.icon-option');
        if (!option) return;
        document.getElementById('category-icon').value = option.dataset.icon;
        document.querySelectorAll('.icon-option').forEach(item => {
            item.classList.toggle('is-selected', item === option);
            item.setAttribute('aria-pressed', String(item === option));
        });
    });

    // Data transfer ----------------------------------------------------------
    const importFileInput = document.getElementById('import-file-input');
    const dropOverlay = document.getElementById('drop-overlay');
    const importOptions = {
        store,
        ui,
        refresh: () => refreshView(store, ui)
    };

    const pickImport = () => {
        importFileInput.value = '';
        importFileInput.click();
    };

    const exportData = () => openExportModal(store, ui, {
        onExport: categoryIds => {
            const backup = store.exportData({ categoryIds });
            downloadJson(backup, `link-backup-${new Date().toISOString().slice(0, 10)}.json`);
            ui.showToast('已导出备份文件');
        }
    });

    document.getElementById('import-btn').addEventListener('click', pickImport);
    document.getElementById('export-btn').addEventListener('click', exportData);

    importFileInput.addEventListener('change', async () => {
        const file = importFileInput.files?.[0];
        if (!file) return;
        await prepareImportFile(file, importOptions);
        importFileInput.value = '';
    });

    document.getElementById('data-modal-close').addEventListener('click', closeDataModal);

    let dragDepth = 0;
    const isFileDrag = event => Array.from(event.dataTransfer?.types || []).includes('Files');
    document.addEventListener('dragenter', event => {
        if (!isFileDrag(event)) return;
        dragDepth += 1;
        showDropOverlay(dropOverlay, true);
    });
    document.addEventListener('dragover', event => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        showDropOverlay(dropOverlay, true);
    });
    document.addEventListener('dragleave', event => {
        if (!isFileDrag(event)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) showDropOverlay(dropOverlay, false);
    });
    document.addEventListener('drop', async event => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        dragDepth = 0;
        showDropOverlay(dropOverlay, false);
        const file = event.dataTransfer.files?.[0];
        if (file) await prepareImportFile(file, importOptions);
    });

    // Link form --------------------------------------------------------------
    const form = document.getElementById('link-form');
    form.addEventListener('submit', event => {
        event.preventDefault();
        const id = document.getElementById('link-id').value;
        const title = document.getElementById('link-title').value.trim();
        let url = document.getElementById('link-url').value.trim();
        const categoryId = document.getElementById('link-category').value;
        const iconData = document.getElementById('link-icon-data').value;

        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        if (!isValidUrl(url)) {
            ui.showToast('请输入有效的网址');
            return;
        }
        if (!title) {
            ui.showToast('请输入链接标题');
            return;
        }

        if (id) {
            store.update(id, { title, url, categoryId, iconData });
            ui.showToast('链接已更新');
        } else {
            store.add({ title, url, categoryId, iconData });
            ui.showToast('链接已添加');
        }
        refreshView(store, ui);
        ui.closeModal();
    });

    const iconPreview = document.getElementById('link-icon-preview');
    const iconPlaceholder = document.getElementById('link-icon-placeholder');
    const iconClear = document.getElementById('link-icon-clear');

    document.getElementById('link-icon-upload').addEventListener('change', event => {
        const file = event.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/') || file.size > 190 * 1024) {
            ui.showToast('请选择小于 190 KB 的图片');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = load => {
            iconPreview.src = load.target.result;
            iconPreview.hidden = false;
            iconPlaceholder.hidden = true;
            iconClear.hidden = false;
            document.getElementById('link-icon-data').value = load.target.result;
        };
        reader.readAsDataURL(file);
    });

    iconClear.addEventListener('click', () => {
        iconPreview.src = '';
        iconPreview.hidden = true;
        iconPlaceholder.hidden = false;
        iconClear.hidden = true;
        document.getElementById('link-icon-upload').value = '';
        document.getElementById('link-icon-data').value = '';
    });

    // Search -----------------------------------------------------------------
    const runSearch = debounce(() => {
        ui.render(store.search(searchInput.value.trim(), getActiveCategoryId()), true);
        updateHeader(store);
    }, 100);
    searchInput.addEventListener('input', runSearch);

    const grid = document.getElementById('link-grid');
    grid.addEventListener('click', async event => {
        const copyBtn = event.target.closest('.btn-copy');
        const editBtn = event.target.closest('.btn-edit');
        const deleteBtn = event.target.closest('.btn-delete');

        if (copyBtn) {
            event.preventDefault();
            event.stopPropagation();
            try {
                await copyToClipboard(copyBtn.dataset.url || '');
                ui.showToast('网址已复制');
            } catch (error) {
                console.error(error);
                ui.showToast('复制失败，请手动复制');
            }
            return;
        }

        if (editBtn) {
            const link = store.getAll().find(item => item.id === editBtn.dataset.id);
            if (!link) return;
            populateCategorySelect(store, link.categoryId);
            ui.openModal('edit', link);
            return;
        }

        if (deleteBtn) {
            const link = store.getAll().find(item => item.id === deleteBtn.dataset.id);
            if (!link) return;
            openDeleteConfirmModal({
                title: '删除链接',
                description: '删除后无法恢复。',
                bodyHTML: `
                    <div class="notice notice--danger">
                        <div class="notice-title">${escapeHTML(link.title)}</div>
                        <div>${escapeHTML(link.url)}</div>
                    </div>
                `,
                primaryText: '删除链接',
                onConfirm: () => {
                    store.remove(link.id);
                    refreshView(store, ui);
                    ui.showToast('链接已删除');
                }
            });
        }
    });

    // Keyboard ---------------------------------------------------------------
    document.addEventListener('keydown', event => {
        const typing = event.target.closest('input, textarea, select, [contenteditable="true"]');
        if (!typing && (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) && !document.querySelector('.dialog-overlay.open')) {
            event.preventDefault();
            searchInput.focus();
            searchInput.select?.();
        }
        if (event.key === 'Escape') {
            if (document.getElementById('data-modal-overlay').classList.contains('open')) {
                closeDataModal();
                return;
            }
            if (document.getElementById('modal-overlay').classList.contains('open')) {
                ui.closeModal();
                return;
            }
            if (document.getElementById('category-modal-overlay').classList.contains('open')) {
                closeCategoryModal();
                return;
            }
            searchInput.blur();
        }
    });

    createIcons();
});

async function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

function setupLinkDragSort(store, ui) {
    const grid = document.getElementById('link-grid');
    if (!grid) return;
    new DragSort(grid, {
        item: '[data-link-card]',
        handle: '.link-drag-handle',
        containers: () => [...grid.querySelectorAll('.link-container')],
        disabled: () => isMobileLayout() || !!document.getElementById('search-input').value.trim(),
        announce: message => { document.getElementById('sort-announcer').textContent = message; },
        onDrop: ({ item, source, target, items }) => {
            const active = getActiveCategoryId();
            const categoryId = target.dataset.categoryId === 'all' ? active : target.dataset.categoryId;
            const ids = items.map(card => card.dataset.linkId);
            if (categoryId === 'all') store.reorderLinks(ids);
            else store.moveAndReorderLink(item.dataset.linkId, categoryId, ids);
            if (source !== target) refreshView(store, ui);
            updateHeader(store);
        }
    });
}

function startThemeReveal({ themeManager, trigger, x, y }) {
    const root = document.documentElement;

    // A second View Transition would skip the active one and visibly jump.
    if (root.classList.contains('theme-transitioning')) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || !document.startViewTransition) {
        themeManager.toggle();
        return;
    }

    const rect = trigger.getBoundingClientRect();
    const centerX = Number.isFinite(x) && x > 0 ? x : rect.left + rect.width / 2;
    const centerY = Number.isFinite(y) && y > 0 ? y : rect.top + rect.height / 2;
    const radius = Math.hypot(
        Math.max(centerX, window.innerWidth - centerX),
        Math.max(centerY, window.innerHeight - centerY)
    );
    const clipPath = [
        `circle(0px at ${centerX}px ${centerY}px)`,
        `circle(${Math.ceil(radius)}px at ${centerX}px ${centerY}px)`
    ];

    root.classList.add('theme-transitioning');
    let transition;
    try {
        transition = document.startViewTransition(() => themeManager.toggle());
    } catch (_) {
        root.classList.remove('theme-transitioning');
        themeManager.toggle();
        return;
    }

    let reveal;
    transition.ready.then(() => {
        reveal = root.animate(
            { clipPath },
            {
                duration: 620,
                easing: 'cubic-bezier(.4, 0, .2, 1)',
                fill: 'both',
                pseudoElement: '::view-transition-new(root)'
            }
        );
    }).catch(() => {
        transition.skipTransition();
    });

    transition.finished.catch(() => {}).finally(() => {
        reveal?.cancel();
        root.classList.remove('theme-transitioning');
    });
}
