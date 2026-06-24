import { Store } from './store.js';
import { ThemeManager } from './theme.js';
import { UI } from './ui.js';
import { isValidUrl, debounce, sanitizeIconName } from './utils.js';

let pendingImportPayload = null;
let pendingImportFileName = '';

function getActiveCategoryId() {
    const activeItem = document.querySelector('.category-nav-item.active');
    return activeItem?.dataset.category || 'all';
}

function getDefaultLinkCategoryId() {
    const activeCategoryId = getActiveCategoryId();
    return activeCategoryId === 'all' ? 'uncategorized' : activeCategoryId;
}

document.addEventListener('DOMContentLoaded', async () => {
    const store = new Store();
    const themeManager = new ThemeManager();
    const ui = new UI(store);
    store.onSaveError = () => ui.showToast('保存到 Cloudflare 失败');

    try {
        await store.init();
    } catch (error) {
        console.error(error);
        document.getElementById('link-grid').innerHTML = `
            <div class="rounded-2xl border border-border bg-surface/80 px-6 py-8 text-center">
                <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background text-textMuted">
                    <i data-lucide="cloud-off" class="w-5 h-5"></i>
                </div>
                <div class="font-medium text-textMain">无法加载 Cloudflare 存储</div>
                <div class="mt-2 text-sm text-textMuted">请确认 Worker 已部署，并且 D1 数据库可用。</div>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    

    ui.init();
    populateCategorySelect(store);
    renderCategoryNav(store, ui);

    // Initialize icon selection
    const firstIconBtn = document.querySelector('.category-icon-option');
    if (firstIconBtn) {
        firstIconBtn.classList.add('bg-accent', 'text-white', 'border-accent');
    }

    const themeBtn = document.getElementById('theme-toggle');
    themeBtn.addEventListener('click', (event) => {
        startThemeReveal({
            themeManager,
            store,
            trigger: themeBtn,
            x: event.clientX,
            y: event.clientY,
            onThemeChanged: () => renderCategoryNav(store, ui)
        });
    });

    const addBtn = document.getElementById('add-btn');
    addBtn.addEventListener('click', () => {
        populateCategorySelect(store, getDefaultLinkCategoryId());
        ui.openModal('add');
    });

    // Category management
    const manageCategoriesBtn = document.getElementById('manage-categories-btn');
    manageCategoriesBtn.addEventListener('click', () => {
        openCategoryModal(store, ui);
    });

    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');
    const importFileInput = document.getElementById('import-file-input');
    const dataModalOverlay = document.getElementById('data-modal-overlay');
    const dataModalContent = document.getElementById('data-modal-content');
    const dataModalTitle = document.getElementById('data-modal-title');
    const dataModalDescription = document.getElementById('data-modal-description');
    const dataModalBody = document.getElementById('data-modal-body');
    const dataModalClose = document.getElementById('data-modal-close');
    const dataModalSecondary = document.getElementById('data-modal-secondary');
    const dataModalPrimary = document.getElementById('data-modal-primary');
    const dropOverlay = document.getElementById('drop-overlay');
    const sidebar = document.querySelector('.category-sidebar');
    const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
    const mobileSidebarClose = document.getElementById('mobile-sidebar-close');
    const mobileSidebarBackdrop = document.getElementById('mobile-sidebar-backdrop');
    const mobileSearchInput = document.getElementById('mobile-search-input');
    const mobileThemeBtn = document.getElementById('mobile-theme-toggle');
    const mobileManageCategoriesBtn = document.getElementById('mobile-manage-categories-btn');
    const mobileImportBtn = document.getElementById('mobile-import-btn');
    const mobileExportBtn = document.getElementById('mobile-export-btn');
    const mobileAddBtn = document.getElementById('mobile-add-btn');

    const openMobileSidebar = () => {
        sidebar.classList.add('mobile-open');
        mobileSidebarBackdrop.classList.add('active');
        mobileSidebarToggle.setAttribute('aria-expanded', 'true');
    };

    const closeMobileSidebar = () => {
        sidebar.classList.remove('mobile-open');
        mobileSidebarBackdrop.classList.remove('active');
        mobileSidebarToggle.setAttribute('aria-expanded', 'false');
    };

    mobileSidebarToggle.addEventListener('click', () => {
        if (window.matchMedia('(min-width: 768px)').matches) return;
        sidebar.classList.contains('mobile-open') ? closeMobileSidebar() : openMobileSidebar();
    });

    mobileSidebarClose.addEventListener('click', closeMobileSidebar);
    mobileSidebarBackdrop.addEventListener('click', closeMobileSidebar);

    mobileThemeBtn.addEventListener('click', (event) => {
        startThemeReveal({
            themeManager,
            store,
            trigger: mobileThemeBtn,
            x: event.clientX,
            y: event.clientY,
            onThemeChanged: () => renderCategoryNav(store, ui)
        });
    });

    mobileAddBtn.addEventListener('click', () => {
        closeMobileSidebar();
        populateCategorySelect(store, getDefaultLinkCategoryId());
        ui.openModal('add');
    });

    mobileManageCategoriesBtn.addEventListener('click', () => {
        closeMobileSidebar();
        openCategoryModal(store, ui);
    });

    importBtn.addEventListener('click', () => {
        importFileInput.value = '';
        importFileInput.click();
    });

    mobileImportBtn.addEventListener('click', () => {
        closeMobileSidebar();
        importFileInput.value = '';
        importFileInput.click();
    });

    exportBtn.addEventListener('click', () => {
        openExportModal(store, ui, {
            onExport: (categoryIds) => {
                const backup = store.exportData({ categoryIds });
                const filename = `link-backup-${new Date().toISOString().slice(0, 10)}.json`;
                downloadJson(backup, filename);
                ui.showToast('已导出备份文件');
            },
            onClose: () => closeDataModal(dataModalOverlay, dataModalContent)
        });
    });

    mobileExportBtn.addEventListener('click', () => {
        closeMobileSidebar();
        openExportModal(store, ui, {
            onExport: (categoryIds) => {
                const backup = store.exportData({ categoryIds });
                const filename = `link-backup-${new Date().toISOString().slice(0, 10)}.json`;
                downloadJson(backup, filename);
                ui.showToast('已导出备份文件');
            },
            onClose: () => closeDataModal(dataModalOverlay, dataModalContent)
        });
    });

    importFileInput.addEventListener('change', async () => {
        const file = importFileInput.files?.[0];
        if (!file) return;
        await prepareImportFile(file, {
            store,
            ui,
            importFileInput,
            openModal: (config) => openDataModal(dataModalOverlay, dataModalContent, dataModalTitle, dataModalDescription, dataModalBody, dataModalSecondary, dataModalPrimary, config),
            refresh: () => refreshView(store, ui)
        });
    });

    let dragDepth = 0;
    const isFileDrag = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

    document.addEventListener('dragenter', (event) => {
        if (!isFileDrag(event)) return;
        dragDepth += 1;
        showDropOverlay(dropOverlay, true);
    });

    document.addEventListener('dragover', (event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        showDropOverlay(dropOverlay, true);
    });

    document.addEventListener('dragleave', (event) => {
        if (!isFileDrag(event)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) {
            showDropOverlay(dropOverlay, false);
        }
    });

    document.addEventListener('drop', async (event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        dragDepth = 0;
        showDropOverlay(dropOverlay, false);

        const file = event.dataTransfer.files?.[0];
        if (file) {
            await prepareImportFile(file, {
                store,
                ui,
                importFileInput,
                openModal: (config) => openDataModal(dataModalOverlay, dataModalContent, dataModalTitle, dataModalDescription, dataModalBody, dataModalSecondary, dataModalPrimary, config),
                refresh: () => refreshView(store, ui)
            });
        }
    });

    dataModalClose.addEventListener('click', () => closeDataModal(dataModalOverlay, dataModalContent));
    dataModalSecondary.addEventListener('click', () => closeDataModal(dataModalOverlay, dataModalContent));

    dataModalOverlay.addEventListener('click', (e) => {
        if (e.target.id === 'data-modal-overlay') {
            closeDataModal(dataModalOverlay, dataModalContent);
        }
    });

    const categoryModalCloseBtn = document.getElementById('category-modal-close');
    categoryModalCloseBtn.addEventListener('click', () => {
        closeCategoryModal();
    });

    document.getElementById('category-modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'category-modal-overlay') {
            closeCategoryModal();
        }
    });

    const modalCloseBtn = document.getElementById('modal-close');
    const modalCancelBtn = document.getElementById('modal-cancel');
    
    [modalCloseBtn, modalCancelBtn].forEach(btn => {
        btn.addEventListener('click', () => ui.closeModal());
    });


    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') {
            ui.closeModal();
        }
    });

    // 图片上传处理
    document.getElementById('link-icon-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                // 显示预览
                const preview = document.getElementById('link-icon-preview');
                const placeholder = document.getElementById('link-icon-placeholder');
                const clearBtn = document.getElementById('link-icon-clear');
                
                preview.src = event.target.result;
                preview.classList.remove('hidden');
                placeholder.classList.add('hidden');
                clearBtn.classList.remove('hidden');
                
                // 保存图片数据
                document.getElementById('link-icon-data').value = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    // 清除图标
    document.getElementById('link-icon-clear').addEventListener('click', () => {
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
    });

    const form = document.getElementById('link-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('link-id').value;
        const title = document.getElementById('link-title').value.trim();
        let url = document.getElementById('link-url').value.trim();
        const categoryId = document.getElementById('link-category').value;
        const linkIconData = document.getElementById('link-icon-data').value;

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        if (!isValidUrl(url)) {
            ui.showToast('请输入有效的网址');
            return;
        }

        if (id) {
            store.update(id, { title, url, categoryId, iconData: linkIconData });
            ui.showToast('链接已更新');
        } else {
            store.add({ title, url, categoryId, iconData: linkIconData });
            ui.showToast('链接已添加');
        }

        // 保持当前的显示模式
        const activeCategoryId = getActiveCategoryId();
        ui.render(store.search(document.getElementById('search-input').value, activeCategoryId), true);
        renderCategoryNav(store, ui);
        ui.closeModal();
    });


    // Category form submission
    const categoryForm = document.getElementById('category-form');
    categoryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const categoryName = document.getElementById('category-name').value.trim();
        const categoryIcon = document.getElementById('category-icon').value;
        
        if (categoryName) {
            store.addCategory({ name: categoryName, icon: categoryIcon });
            document.getElementById('category-name').value = '';
            document.getElementById('category-icon').value = 'folder';
            // Reset icon selection
            document.querySelectorAll('.category-icon-option').forEach(btn => {
                btn.classList.remove('bg-accent', 'text-white', 'border-accent');
                btn.classList.add('border-border');
                if (btn.dataset.icon === 'folder') {
                    btn.classList.add('bg-accent', 'text-white', 'border-accent');
                }
            });
            renderCategoryList(store, ui);
            renderCategoryNav(store, ui);
            // Update category select in link form
            populateCategorySelect(store);
            ui.showToast('分类已添加');
        }
    });

    // Category icon selection
    document.addEventListener('click', (e) => {
        if (e.target.closest('.category-icon-option')) {
            const selectedBtn = e.target.closest('.category-icon-option');
            const icon = selectedBtn.dataset.icon;
            
            // Update hidden input
            document.getElementById('category-icon').value = icon;
            
            // Update UI
            document.querySelectorAll('.category-icon-option').forEach(btn => {
                btn.classList.remove('bg-accent', 'text-white', 'border-accent');
                btn.classList.add('border-border');
            });
            
            selectedBtn.classList.add('bg-accent', 'text-white', 'border-accent');
        }
        
        // Link icon selection
        if (e.target.closest('.link-icon-option')) {
            const selectedBtn = e.target.closest('.link-icon-option');
            const icon = selectedBtn.dataset.icon;
            
            // Update hidden input
            const linkIconInput = document.getElementById('link-icon');
            if (linkIconInput) {
                linkIconInput.value = icon;
            }
            
            // Update UI
            document.querySelectorAll('.link-icon-option').forEach(btn => {
                btn.classList.remove('bg-accent', 'text-white', 'border-accent');
                btn.classList.add('border-border');
            });
            
            selectedBtn.classList.add('bg-accent', 'text-white', 'border-accent');
        }
    });


    const searchInput = document.getElementById('search-input');

    const handleSearchInput = debounce((sourceInput, targetInput) => {
        targetInput.value = sourceInput.value;
        ui.handleSearch({ target: sourceInput }, getActiveCategoryId());
    }, 200);

    searchInput.addEventListener('input', () => {
        handleSearchInput(searchInput, mobileSearchInput);
    });

    mobileSearchInput.addEventListener('input', () => {
        handleSearchInput(mobileSearchInput, searchInput);
    });


    const grid = document.getElementById('link-grid');
    grid.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.btn-edit');
        const deleteBtn = e.target.closest('.btn-delete');

        if (editBtn) {
            const id = editBtn.dataset.id;
            const link = store.getAll().find(l => l.id === id);
            if (link) {
                populateCategorySelect(store, link.categoryId);
                ui.openModal('edit', link);
            }
        } else if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            const link = store.getAll().find(l => l.id === id);
            if (!link) return;

            openDeleteConfirmModal({
                title: '删除链接',
                description: '删除后无法恢复。',
                bodyHTML: `
                    <div class="rounded-2xl border border-red-200 bg-red-500/5 px-4 py-3">
                        <div class="text-sm text-textMuted">即将删除</div>
                        <div class="mt-1 truncate font-medium text-textMain">${escapeHTML(link.title)}</div>
                        <div class="mt-1 truncate text-sm font-mono text-textMuted">${escapeHTML(link.url)}</div>
                    </div>
                `,
                primaryText: '删除链接',
                onConfirm: () => {
                    store.remove(id);
                    // 保持当前的显示模式
                    const activeCategoryId = getActiveCategoryId();
                    ui.render(store.search(searchInput.value, activeCategoryId), true);
                    renderCategoryNav(store, ui);
                    ui.showToast('链接已删除');
                }
            });
        }
    });
    

    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && !document.querySelector('.open')) {
            e.preventDefault();
            const mobileSearch = document.getElementById('mobile-search-input');
            const desktopSearch = document.getElementById('search-input');
            // If sidebar is open on mobile, focus mobile search
            if (sidebar.classList.contains('mobile-open') && mobileSearch) {
                mobileSearch.focus();
            } else if (desktopSearch) {
                desktopSearch.focus();
            }
        }
        if (e.key === 'Escape') {
            if (dataModalOverlay.classList.contains('open')) {
                closeDataModal(dataModalOverlay, dataModalContent);
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
            if (sidebar.classList.contains('mobile-open')) {
                closeMobileSidebar();
                return;
            }
            searchInput.blur();
        }
    });
});

// Populate category select dropdown
function populateCategorySelect(store, selectedId = null) {
    const categoryOptionsContainer = document.getElementById('link-category-options');
    const hiddenInput = document.getElementById('link-category');
    const categories = store.getCategories();
    const selectedCategoryId = categories.some(category => category.id === selectedId)
        ? selectedId
        : 'uncategorized';

    hiddenInput.value = selectedCategoryId;
    
    // Clear existing options
    categoryOptionsContainer.innerHTML = '';
    
    // Add "未分类" option
    const uncategorizedBtn = document.createElement('button');
    uncategorizedBtn.type = 'button';
    uncategorizedBtn.className = 'category-option max-w-full px-3 py-2 rounded-lg border text-sm transition-all ' + 
        (selectedCategoryId === 'uncategorized' ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-textMain hover:bg-surfaceHover');
    uncategorizedBtn.textContent = '未分类';
    uncategorizedBtn.dataset.categoryId = 'uncategorized';
    
    uncategorizedBtn.addEventListener('click', () => {
        // Update hidden input
        hiddenInput.value = 'uncategorized';
        
        // Update UI
        document.querySelectorAll('.category-option').forEach(btn => {
            btn.classList.remove('bg-accent', 'text-white', 'border-accent');
            btn.classList.add('bg-surface', 'border-border', 'text-textMain');
        });
        
        uncategorizedBtn.classList.remove('bg-surface', 'border-border', 'text-textMain');
        uncategorizedBtn.classList.add('bg-accent', 'text-white', 'border-accent');
    });
    
    categoryOptionsContainer.appendChild(uncategorizedBtn);
    
    // Add category options
    categories.forEach(category => {
        const categoryBtn = document.createElement('button');
        categoryBtn.type = 'button';
        categoryBtn.className = 'category-option flex max-w-full items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ' + 
            (selectedCategoryId === category.id ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-textMain hover:bg-surfaceHover');
        categoryBtn.innerHTML = `<i data-lucide="${sanitizeIconName(category.icon)}" class="w-4 h-4 shrink-0"></i><span class="min-w-0 truncate">${escapeHTML(category.name)}</span>`;
        categoryBtn.dataset.categoryId = category.id;
        
        categoryBtn.addEventListener('click', () => {
            // Update hidden input
            hiddenInput.value = category.id;
            
            // Update UI
            document.querySelectorAll('.category-option').forEach(btn => {
                btn.classList.remove('bg-accent', 'text-white', 'border-accent');
                btn.classList.add('bg-surface', 'border-border', 'text-textMain');
            });
            
            categoryBtn.classList.remove('bg-surface', 'border-border', 'text-textMain');
            categoryBtn.classList.add('bg-accent', 'text-white', 'border-accent');
            
            lucide.createIcons();
        });
        
        categoryOptionsContainer.appendChild(categoryBtn);
    });
    
    lucide.createIcons();
}

// Render category navigation
function renderCategoryNav(store, ui) {
    const categoryNav = document.getElementById('category-nav');
    const categories = store.getCategories();
    const allLinks = store.getAll();
    const activeCategory = document.querySelector('.category-nav-item.active')?.dataset.category || 'all';
    
    // Add "全部" category
    let navHTML = `
        <a href="#" class="category-nav-item flex items-center gap-3 p-3 rounded-lg text-textMain mb-1 ${activeCategory === 'all' ? 'active' : ''}" data-category="all" aria-label="全部" title="全部">
            <i data-lucide="layout-grid" class="w-5 h-5 shrink-0"></i>
            <span class="category-nav-label">全部</span>
            <span class="category-nav-count ml-auto text-xs text-textMuted">(${allLinks.length})</span>
        </a>
    `;
    
    // Add each category
    categories.forEach(category => {
        const count = store.getLinksByCategory(category.id).length;
        navHTML += `
            <a href="#" class="category-nav-item category-nav-sortable flex items-center gap-3 p-3 rounded-lg text-textMain mb-1 ${activeCategory === category.id ? 'active' : ''}" draggable="true" data-category="${escapeHTML(category.id)}" aria-label="${escapeHTML(category.name)}" title="${escapeHTML(category.name)}">
                <i data-lucide="${sanitizeIconName(category.icon)}" class="w-5 h-5 shrink-0"></i>
                <span class="category-nav-label">${escapeHTML(category.name)}</span>
                <span class="category-nav-count ml-auto text-xs text-textMuted">(${count})</span>
            </a>
        `;
    });
    
    categoryNav.innerHTML = navHTML;
    
    // Add event listeners to category nav items
    document.querySelectorAll('.category-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.category-nav-item').forEach(navItem => {
                navItem.classList.remove('active');
            });
            item.classList.add('active');
            
            const categoryId = item.dataset.category;
            if (categoryId === 'all') {
                ui.render(store.getAll(), true);
            } else {
                ui.render(store.getLinksByCategory(categoryId), true);
            }

            document.querySelector('.category-sidebar')?.classList.remove('mobile-open');
            document.getElementById('mobile-sidebar-backdrop')?.classList.remove('active');
            document.getElementById('mobile-sidebar-toggle')?.setAttribute('aria-expanded', 'false');
        });
    });

    setupCategoryDragSort(categoryNav, store, ui);
    
    lucide.createIcons();
}

function setupCategoryDragSort(categoryNav, store, ui) {
    let draggedItem = null;

    categoryNav.querySelectorAll('.category-nav-sortable').forEach(item => {
        item.addEventListener('dragstart', (event) => {
            draggedItem = item;
            item.classList.add('dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', item.dataset.category);
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            categoryNav.querySelectorAll('.drag-over').forEach(navItem => navItem.classList.remove('drag-over'));
            draggedItem = null;
        });
    });

    categoryNav.ondragover = (event) => {
        if (!draggedItem) return;
        event.preventDefault();

        const target = event.target.closest('.category-nav-sortable');
        if (!target || target === draggedItem) return;

        const targetRect = target.getBoundingClientRect();
        const shouldInsertAfter = event.clientY > targetRect.top + targetRect.height / 2;
        categoryNav.insertBefore(draggedItem, shouldInsertAfter ? target.nextSibling : target);
    };

    categoryNav.ondrop = (event) => {
        if (!draggedItem) return;
        event.preventDefault();

        const orderedIds = Array.from(categoryNav.querySelectorAll('.category-nav-sortable'))
            .map(item => item.dataset.category)
            .filter(Boolean);
        store.reorderCategories(orderedIds);

        const categoryId = document.querySelector('.category-nav-item.active')?.dataset.category || 'all';
        ui.render(categoryId === 'all' ? store.getAll() : store.getLinksByCategory(categoryId), true);
        populateCategorySelect(store);
        renderCategoryNav(store, ui);
    };
}

// Open category management modal
function openCategoryModal(store, ui) {
    const categoryModalOverlay = document.getElementById('category-modal-overlay');
    const categoryModalContent = document.getElementById('category-modal-content');
    
    categoryModalOverlay.classList.remove('hidden');
    
    requestAnimationFrame(() => {
        categoryModalOverlay.classList.add('open');
        categoryModalContent.classList.add('open');
    });

    renderCategoryList(store, ui);
}

// Close category management modal
function closeCategoryModal() {
    const categoryModalOverlay = document.getElementById('category-modal-overlay');
    const categoryModalContent = document.getElementById('category-modal-content');
    
    categoryModalOverlay.classList.remove('open');
    categoryModalContent.classList.remove('open');
    
    setTimeout(() => {
        categoryModalOverlay.classList.add('hidden');
    }, 200);
}

function openDataModal(overlay, content, titleEl, descriptionEl, bodyEl, secondaryBtn, primaryBtn, config) {
    titleEl.textContent = config.title || '';
    descriptionEl.textContent = config.description || '';
    bodyEl.innerHTML = config.bodyHTML || '';

    secondaryBtn.textContent = config.secondaryText || '取消';
    primaryBtn.textContent = config.primaryText || '确认';
    secondaryBtn.classList.toggle('hidden', config.secondaryHidden === true);
    primaryBtn.className = config.primaryClassName || 'px-4 py-2 rounded-lg text-sm font-medium bg-textMain text-background hover:opacity-90 transition-opacity shadow-md';
    secondaryBtn.className = config.secondaryClassName || 'px-4 py-2 rounded-lg text-sm font-medium text-textMuted hover:bg-surfaceHover hover:text-textMain transition-colors';

    secondaryBtn.onclick = () => {
        if (typeof config.onSecondary === 'function') {
            config.onSecondary();
            return;
        }
        closeDataModal(overlay, content);
    };

    primaryBtn.onclick = () => {
        if (typeof config.onPrimary === 'function') {
            config.onPrimary();
        }
    };

    overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
        overlay.classList.add('open');
        content.classList.add('open');
    });

    lucide.createIcons();
}

function closeDataModal(overlay, content) {
    overlay.classList.remove('open');
    content.classList.remove('open');

    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 200);
}

function openDeleteConfirmModal({ title, description, bodyHTML, primaryText = '删除', onConfirm }) {
    const overlay = document.getElementById('data-modal-overlay');
    const content = document.getElementById('data-modal-content');

    openDataModal(
        overlay,
        content,
        document.getElementById('data-modal-title'),
        document.getElementById('data-modal-description'),
        document.getElementById('data-modal-body'),
        document.getElementById('data-modal-secondary'),
        document.getElementById('data-modal-primary'),
        {
            title,
            description,
            bodyHTML,
            secondaryText: '取消',
            primaryText,
            primaryClassName: 'px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors shadow-md',
            onPrimary: () => {
                onConfirm();
                closeDataModal(overlay, content);
            },
            onSecondary: () => closeDataModal(overlay, content)
        }
    );
}

function startThemeReveal({ themeManager, trigger, x, y, onThemeChanged }) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
        themeManager.toggle();
        if (typeof onThemeChanged === 'function') {
            onThemeChanged();
        }
        return;
    }

    const rect = trigger.getBoundingClientRect();
    const centerX = Number.isFinite(x) && x > 0 ? x : rect.left + rect.width / 2;
    const centerY = Number.isFinite(y) && y > 0 ? y : rect.top + rect.height / 2;
    const radius = Math.hypot(
        Math.max(centerX, window.innerWidth - centerX),
        Math.max(centerY, window.innerHeight - centerY)
    );

    const root = document.documentElement;
    root.style.setProperty('--theme-reveal-x', `${centerX}px`);
    root.style.setProperty('--theme-reveal-y', `${centerY}px`);
    root.style.setProperty('--theme-reveal-radius', `${radius}px`);

    if (!document.startViewTransition) {
        themeManager.toggle();
        if (typeof onThemeChanged === 'function') {
            onThemeChanged();
        }
        root.style.removeProperty('--theme-reveal-x');
        root.style.removeProperty('--theme-reveal-y');
        root.style.removeProperty('--theme-reveal-radius');
        return;
    }

    const transition = document.startViewTransition(() => {
        themeManager.toggle();
        if (typeof onThemeChanged === 'function') {
            onThemeChanged();
        }
    });

    transition.finished.finally(() => {
        root.style.removeProperty('--theme-reveal-x');
        root.style.removeProperty('--theme-reveal-y');
        root.style.removeProperty('--theme-reveal-radius');
    });
}

function refreshView(store, ui) {
    const activeCategoryId = getActiveCategoryId();
    ui.render(store.search(document.getElementById('search-input').value, activeCategoryId), true);
    renderCategoryNav(store, ui);
    populateCategorySelect(store);
}

function openExportModal(store, ui, handlers) {
    const categories = store.getCategories();
    const categoryCards = [];

    categoryCards.push(`
        <label class="flex items-center gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-3 hover:bg-surface transition-colors">
            <input type="checkbox" value="uncategorized" class="h-4 w-4 accent-[var(--accent-color)]" checked>
            <div class="min-w-0">
                <div class="font-medium text-textMain">未分类</div>
                <div class="text-sm text-textMuted">没有分类的链接</div>
            </div>
        </label>
    `);

    categories.forEach(category => {
        const count = store.getLinksByCategory(category.id).length;
        categoryCards.push(`
            <label class="flex items-center gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-3 hover:bg-surface transition-colors">
                <input type="checkbox" value="${escapeHTML(category.id)}" class="h-4 w-4 accent-[var(--accent-color)]" checked>
                <div class="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-textMain">
                    <i data-lucide="${sanitizeIconName(category.icon)}" class="w-4 h-4"></i>
                </div>
                <div class="min-w-0">
                    <div class="truncate font-medium text-textMain">${escapeHTML(category.name)}</div>
                    <div class="text-sm text-textMuted">${count} 条链接</div>
                </div>
            </label>
        `);
    });

    openDataModal(
        document.getElementById('data-modal-overlay'),
        document.getElementById('data-modal-content'),
        document.getElementById('data-modal-title'),
        document.getElementById('data-modal-description'),
        document.getElementById('data-modal-body'),
        document.getElementById('data-modal-secondary'),
        document.getElementById('data-modal-primary'),
        {
            title: '导出数据',
            description: '默认已全选，你可以只导出某些分类的链接。',
            bodyHTML: `
                <div class="space-y-3">
                    <div class="grid gap-3 sm:grid-cols-2">
                        ${categoryCards.join('')}
                    </div>
                    <div class="text-sm text-textMuted">导出文件会包含所选链接和对应分类信息。</div>
                </div>
            `,
            secondaryText: '取消',
            primaryText: '导出所选',
            onSecondary: () => closeDataModal(document.getElementById('data-modal-overlay'), document.getElementById('data-modal-content')),
            onPrimary: () => {
                const selectedCategoryIds = Array.from(document.querySelectorAll('#data-modal-body input[type="checkbox"]:checked'))
                    .map(input => input.value);

                if (selectedCategoryIds.length === 0) {
                    ui.showToast('请至少选择一个分类');
                    return;
                }

                handlers.onExport(selectedCategoryIds);
                closeDataModal(document.getElementById('data-modal-overlay'), document.getElementById('data-modal-content'));
            }
        }
    );
}

async function prepareImportFile(file, { store, ui, importFileInput, openModal, refresh }) {
    pendingImportPayload = null;
    pendingImportFileName = '';

    try {
        const text = await file.text();
        pendingImportPayload = JSON.parse(text);
        pendingImportFileName = file.name || 'import.json';

        openModal({
            title: '导入数据',
            description: `已读取 ${pendingImportFileName}，请选择覆盖现有数据还是追加到现有数据。`,
            bodyHTML: `
                <div class="rounded-2xl border border-border bg-surface/60 px-4 py-4 text-sm text-textMuted">
                    覆盖导入会替换当前全部链接和分类。
                    追加导入会保留现有数据，并把文件中的内容合并进来。
                </div>
            `,
            secondaryText: '覆盖导入',
            primaryText: '追加导入',
            primaryClassName: 'px-4 py-2 rounded-lg text-sm font-medium bg-textMain text-background hover:opacity-90 transition-opacity shadow-md',
            secondaryClassName: 'px-4 py-2 rounded-lg text-sm font-medium bg-surface border border-border text-textMain hover:bg-surfaceHover transition-colors',
            onSecondary: () => performImport('replace', store, ui, refresh),
            onPrimary: () => performImport('append', store, ui, refresh)
        });
    } catch (error) {
        console.error(error);
        pendingImportPayload = null;
        pendingImportFileName = '';
        ui.showToast(error instanceof SyntaxError ? 'JSON 文件格式不正确' : error.message || '导入失败');
    } finally {
        importFileInput.value = '';
    }
}

function performImport(mode, store, ui, refresh) {
    try {
        if (!pendingImportPayload) {
            ui.showToast('没有可导入的数据');
            return;
        }

        const result = store.importData(pendingImportPayload, { mode });
        pendingImportPayload = null;
        pendingImportFileName = '';
        refresh();
        closeDataModal(document.getElementById('data-modal-overlay'), document.getElementById('data-modal-content'));
        const skippedText = mode === 'append' && result.skippedLinksCount > 0
            ? `，跳过 ${result.skippedLinksCount} 条重复链接`
            : '';
        ui.showToast(mode === 'append'
            ? `已追加 ${result.linksCount} 条链接、${result.categoriesCount} 个分类${skippedText}`
            : `已覆盖导入 ${result.linksCount} 条链接、${result.categoriesCount} 个分类`);
    } catch (error) {
        console.error(error);
        pendingImportPayload = null;
        pendingImportFileName = '';
        closeDataModal(document.getElementById('data-modal-overlay'), document.getElementById('data-modal-content'));
        ui.showToast(error.message || '导入失败');
    }
}

function showDropOverlay(overlay, active) {
    if (active) {
        overlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
        return;
    }

    overlay.classList.remove('active');
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 200);
}

function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function escapeHTML(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// Render category list in management modal
function renderCategoryList(store, ui, editingCategoryId = null) {
    const categoryList = document.getElementById('category-list');
    const categories = store.getCategories();
    
    // Clear the container
    categoryList.innerHTML = '';

    if (categories.length === 0) {
        categoryList.innerHTML = `
            <div class="rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-8 text-center">
                <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background text-textMuted">
                    <i data-lucide="folders" class="w-5 h-5"></i>
                </div>
                <div class="text-sm font-medium text-textMain">暂无分类</div>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    const listContainer = document.createElement('div');
    listContainer.className = 'grid grid-cols-1 gap-3 sm:grid-cols-2';

    categories.forEach(category => {
        const count = store.getLinksByCategory(category.id).length;
        const isEditing = category.id === editingCategoryId;
        const categoryItem = document.createElement('div');
        categoryItem.className = 'flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface/70 px-4 py-3 transition-colors hover:bg-surface';
        
        categoryItem.innerHTML = `
            <div class="flex min-w-0 flex-1 items-center gap-3">
                <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-background text-textMain">
                    <i data-lucide="${sanitizeIconName(category.icon)}" class="w-5 h-5"></i>
                </div>
                ${isEditing ? `
                    <form class="category-rename-form min-w-0 flex-1" data-id="${escapeHTML(category.id)}">
                        <input
                            type="text"
                            class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-textMain outline-none transition-all focus:border-accent focus:ring-1 focus:ring-accent/20"
                            value="${escapeHTML(category.name)}"
                            aria-label="分类名称"
                        >
                        <div class="mt-2 flex flex-wrap items-center gap-2">
                            <button type="submit" class="rounded-lg bg-textMain px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90">保存</button>
                            <button type="button" class="btn-cancel-rename rounded-lg px-3 py-1.5 text-xs font-medium text-textMuted transition-colors hover:bg-surfaceHover hover:text-textMain">取消</button>
                        </div>
                    </form>
                ` : `
                    <div class="min-w-0">
                        <div class="truncate font-medium text-textMain">${escapeHTML(category.name)}</div>
                        <div class="mt-1 text-sm text-textMuted">${count} 个链接</div>
                    </div>
                `}
            </div>
            <div class="flex flex-shrink-0 items-center gap-1">
                ${isEditing ? '' : `
                    <button data-id="${escapeHTML(category.id)}" class="btn-edit-category flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-textMuted transition-colors hover:border-border hover:bg-surfaceHover hover:text-textMain" title="重命名分类" aria-label="重命名分类">
                        <i data-lucide="pencil" class="w-4 h-4"></i>
                    </button>
                `}
                <button data-id="${escapeHTML(category.id)}" class="btn-delete-category flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-textMuted transition-colors hover:border-red-200 hover:bg-red-500/10 hover:text-red-500" title="删除分类" aria-label="删除分类">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        
        listContainer.appendChild(categoryItem);
    });
    
    categoryList.appendChild(listContainer);

    const editingInput = categoryList.querySelector('.category-rename-form input');
    if (editingInput) {
        editingInput.focus();
        editingInput.select();
    }

    categoryList.querySelectorAll('.btn-edit-category').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const categoryId = e.target.closest('.btn-edit-category').dataset.id;
            renderCategoryList(store, ui, categoryId);
        });
    });

    categoryList.querySelectorAll('.btn-cancel-rename').forEach(btn => {
        btn.addEventListener('click', () => {
            renderCategoryList(store, ui);
        });
    });

    categoryList.querySelectorAll('.category-rename-form').forEach(form => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const categoryId = e.target.dataset.id;
            const categoryName = e.target.querySelector('input').value.trim();
            if (!categoryName) {
                ui?.showToast('分类名称不能为空');
                return;
            }

            store.updateCategory(categoryId, { name: categoryName });
            renderCategoryList(store, ui);
            if (ui) {
                refreshView(store, ui);
                ui.showToast('分类已重命名');
            } else {
                renderCategoryNav(store, ui);
                populateCategorySelect(store);
            }
        });

        form.querySelector('input').addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                renderCategoryList(store, ui);
            }
        });
    });
    
    // Add event listeners to delete buttons
    categoryList.querySelectorAll('.btn-delete-category').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const categoryId = e.target.closest('.btn-delete-category').dataset.id;
            const category = store.getCategoryById(categoryId);
            const count = store.getLinksByCategory(categoryId).length;

            openDeleteConfirmModal({
                title: '删除分类',
                description: '删除分类后，该分类下的链接会移到未分类。',
                bodyHTML: `
                    <div class="rounded-2xl border border-red-200 bg-red-500/5 px-4 py-3">
                        <div class="flex min-w-0 items-center gap-3">
                            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-textMain">
                                <i data-lucide="${sanitizeIconName(category.icon)}" class="w-5 h-5"></i>
                            </div>
                            <div class="min-w-0">
                                <div class="truncate font-medium text-textMain">${escapeHTML(category.name)}</div>
                                <div class="mt-1 text-sm text-textMuted">${count} 个链接将移到未分类</div>
                            </div>
                        </div>
                    </div>
                `,
                primaryText: '删除分类',
                onConfirm: () => {
                    store.removeCategory(categoryId);
                    renderCategoryList(store, ui);
                    if (ui) {
                        refreshView(store, ui);
                        ui.showToast('分类已删除');
                    } else {
                        renderCategoryNav(store, ui);
                        populateCategorySelect(store);
                    }
                }
            });
        });
    });
    
    lucide.createIcons();
}
