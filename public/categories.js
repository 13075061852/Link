import { escapeHTML, sanitizeIconName, isMobileLayout } from './utils.js';
import { icon, createIcons } from './icons.js';
import { DragSort } from './drag-sort.js';
import { openDialog, closeDialog } from './dialogs.js';
import { openDeleteConfirmModal } from './data-dialog.js';

import { closeSidebar } from './sidebar.js';

const UNCategorized = { id: 'uncategorized', name: '未分类', icon: 'folder' };

export function populateCategorySelect(store, selectedId = null) {
    const container = document.getElementById('link-category-options');
    const hidden = document.getElementById('link-category');
    const categories = store.getCategories();
    const selected = categories.some(category => category.id === selectedId) ? selectedId : 'uncategorized';
    hidden.value = selected;

    const options = [UNCategorized, ...categories];
    container.innerHTML = options.map(category => `
        <button type="button" class="chip${category.id === selected ? ' is-selected' : ''}" data-category-id="${escapeHTML(category.id)}">
            ${category.id === 'uncategorized' ? icon('folder') : icon(sanitizeIconName(category.icon))}
            <span>${escapeHTML(category.name)}</span>
        </button>
    `).join('');

    container.querySelectorAll('.chip').forEach(button => {
        button.addEventListener('click', () => {
            hidden.value = button.dataset.categoryId;
            container.querySelectorAll('.chip').forEach(chip => {
                const active = chip === button;
                chip.classList.toggle('is-selected', active);
                chip.setAttribute('aria-pressed', String(active));
            });
        });
    });
    createIcons();
}

export function renderCategoryNav(store, ui, { onChange } = {}) {
    const nav = document.getElementById('category-nav');
    const categories = store.getCategories();
    const links = store.getAll();
    const active = document.querySelector('.category-nav-item.active')?.dataset.category || 'all';
    const uncategorizedCount = links.filter(link => !link.categoryId || link.categoryId === 'uncategorized').length;

    const item = ({ id, name, iconName, count, sortable }) => `
        <a href="#" class="category-nav-item${sortable ? ' category-nav-sortable' : ''}${active === id ? ' active' : ''}"
            data-category="${escapeHTML(id)}" draggable="false"
            aria-label="${escapeHTML(name)}" title="${escapeHTML(name)}"
            ${active === id ? 'aria-current="page"' : ''}>
            ${icon(iconName)}
            <span class="category-nav-label">${escapeHTML(name)}</span>
            <span class="category-nav-count">${count}</span>
            ${sortable ? `<span class="category-drag-handle" role="button" tabindex="0" aria-label="排序 ${escapeHTML(name)}，按 Alt 加方向键移动" title="拖拽排序 · Alt + ↑/↓">${icon('grip-vertical')}</span>` : ''}
        </a>
    `;

    let html = item({ id: 'all', name: '全部', iconName: 'layout-grid', count: links.length, sortable: false });
    html += item({ id: 'uncategorized', name: '未分类', iconName: 'folder', count: uncategorizedCount, sortable: false });
    categories.forEach(category => {
        html += item({
            id: category.id,
            name: category.name,
            iconName: sanitizeIconName(category.icon),
            count: store.getLinksByCategory(category.id).length,
            sortable: true
        });
    });

    const scrollTop = nav.scrollTop;
    nav.innerHTML = html;
    nav.scrollTop = scrollTop;

    nav.querySelectorAll('.category-nav-item').forEach(navItem => {
        navItem.addEventListener('click', event => {
            event.preventDefault();
            if (event.target.closest('.category-drag-handle')) return;
            nav.querySelectorAll('.category-nav-item').forEach(other => {
                other.classList.remove('active');
                other.removeAttribute('aria-current');
            });
            navItem.classList.add('active');
            navItem.setAttribute('aria-current', 'page');
            onChange?.();
            nav.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            closeSidebar();
        });
    });

    setupCategoryDragSort(nav, store, onChange);
    createIcons();
}

function setupCategoryDragSort(nav, store, onChange) {
    if (nav.sorter) return;
    nav.sorter = new DragSort(nav, {
        item: '.category-nav-sortable',
        handle: '.category-drag-handle',
        containers: () => [nav],
        disabled: () => isMobileLayout(),
        announce: message => { document.getElementById('sort-announcer').textContent = message; },
        onDrop: ({ items }) => {
            store.reorderCategories(items.map(item => item.dataset.category));
            onChange?.();
            populateCategorySelect(store);
        }
    });
}

export function openCategoryModal(store, ui, refresh) {
    openDialog(document.getElementById('category-modal-overlay'), document.getElementById('category-modal-content'));
    renderCategoryList(store, ui, null, refresh);
    createIcons();
}

export function closeCategoryModal() {
    closeDialog(document.getElementById('category-modal-overlay'), document.getElementById('category-modal-content'));
}

export function renderCategoryList(store, ui, editingId = null, refresh = null) {
    const list = document.getElementById('category-list');
    const categories = store.getCategories();

    if (categories.length === 0) {
        list.innerHTML = '<p class="category-empty">还没有分类。先在上面新建一个吧。</p>';
        return;
    }

    list.innerHTML = categories.map(category => {
        const count = store.getLinksByCategory(category.id).length;
        const editing = category.id === editingId;
        return `
            <div class="category-row">
                <span class="category-icon" aria-hidden="true">${icon(sanitizeIconName(category.icon))}</span>
                ${editing ? `
                    <form class="rename-form" data-id="${escapeHTML(category.id)}">
                        <input type="text" class="field-input" value="${escapeHTML(category.name)}" aria-label="分类名称" maxlength="80">
                        <button type="submit" class="button button--quiet">保存</button>
                        <button type="button" class="button button--ghost btn-cancel-rename">取消</button>
                    </form>
                ` : `
                    <div class="category-copy">
                        <div class="category-name">${escapeHTML(category.name)}</div>
                        <div class="category-meta">${count} 个链接</div>
                    </div>
                    <div class="category-row-actions">
                        <button type="button" data-id="${escapeHTML(category.id)}" class="icon-button icon-button--sm btn-edit-category" title="重命名分类" aria-label="重命名分类">${icon('pencil')}</button>
                        <button type="button" data-id="${escapeHTML(category.id)}" class="icon-button icon-button--sm btn-delete-category category-delete" title="删除分类" aria-label="删除分类">${icon('trash-2')}</button>
                    </div>
                `}
            </div>
        `;
    }).join('');

    const editingInput = list.querySelector('.rename-form input');
    if (editingInput) {
        editingInput.focus();
        editingInput.select();
    }

    list.querySelectorAll('.btn-edit-category').forEach(button => {
        button.addEventListener('click', () => renderCategoryList(store, ui, button.dataset.id, refresh));
    });
    list.querySelectorAll('.btn-cancel-rename').forEach(button => {
        button.addEventListener('click', () => renderCategoryList(store, ui, null, refresh));
    });

    list.querySelectorAll('.rename-form').forEach(form => {
        form.addEventListener('submit', event => {
            event.preventDefault();
            const categoryId = form.dataset.id;
            const name = form.querySelector('input').value.trim();
            if (!name) {
                ui?.showToast('分类名称不能为空');
                return;
            }
            store.updateCategory(categoryId, { name });
            renderCategoryList(store, ui, null, refresh);
            refresh?.();
            ui?.showToast('分类已重命名');
        });

        form.querySelector('input').addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                renderCategoryList(store, ui, null, refresh);
            }
        });
    });

    list.querySelectorAll('.btn-delete-category').forEach(button => {
        button.addEventListener('click', () => {
            const categoryId = button.dataset.id;
            const category = store.getCategoryById(categoryId);
            const count = store.getLinksByCategory(categoryId).length;
            openDeleteConfirmModal({
                title: '删除分类',
                description: '删除后，这个分类下的链接会移到未分类。',
                bodyHTML: `
                    <div class="notice notice--danger">
                        <div class="notice-title">${escapeHTML(category.name)}</div>
                        <div>${count} 个链接将移到未分类</div>
                    </div>
                `,
                primaryText: '删除分类',
                onConfirm: () => {
                    store.removeCategory(categoryId);
                    renderCategoryList(store, ui, null, refresh);
                    refresh?.();
                    ui?.showToast('分类已删除');
                }
            });
        });
    });

    createIcons();
}
