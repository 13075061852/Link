import { Store } from './store.js';
import { ThemeManager } from './theme.js';
import { UI } from './ui.js';
import { isValidUrl, debounce } from './utils.js';

let pendingImportPayload = null;
let pendingImportFileName = '';

document.addEventListener('DOMContentLoaded', () => {
    const store = new Store();
    const themeManager = new ThemeManager();
    const ui = new UI(store);
    

    ui.init();
    populateCategorySelect(store);
    renderCategoryNav(store);

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
            onThemeChanged: () => renderCategoryNav(store)
        });
    });

    const addBtn = document.getElementById('add-btn');
    addBtn.addEventListener('click', () => {
        populateCategorySelect(store);
        ui.openModal('add');
    });

    // Category management
    const manageCategoriesBtn = document.getElementById('manage-categories-btn');
    manageCategoriesBtn.addEventListener('click', () => {
        openCategoryModal(store);
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

    importBtn.addEventListener('click', () => {
        importFileInput.value = '';
        importFileInput.click();
    });

    exportBtn.addEventListener('click', () => {
        openExportModal(store, {
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
        const isGroupedByCategory = document.querySelector('.category-nav-item.active')?.dataset.category === 'all';
        ui.render(store.search(document.getElementById('search-input').value), isGroupedByCategory);
        renderCategoryNav(store);
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
            renderCategoryList(store);
            renderCategoryNav(store);
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
            document.getElementById('link-icon').value = icon;
            
            // Update UI
            document.querySelectorAll('.link-icon-option').forEach(btn => {
                btn.classList.remove('bg-accent', 'text-white', 'border-accent');
                btn.classList.add('border-border');
            });
            
            selectedBtn.classList.add('bg-accent', 'text-white', 'border-accent');
        }
    });


    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', debounce((e) => {
        ui.handleSearch(e);
    }, 200));


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
            if (confirm('确定要删除这个链接吗？')) {
                store.remove(id);
                // 保持当前的显示模式
                const isGroupedByCategory = document.querySelector('.category-nav-item.active')?.dataset.category === 'all';
                ui.render(store.search(searchInput.value), isGroupedByCategory);
                renderCategoryNav(store);
                ui.showToast('链接已删除');
            }
        }
    });
    

    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && !document.querySelector('.open')) {
            e.preventDefault();
            searchInput.focus();
        }
        if (e.key === 'Escape') {
            ui.closeModal();
            closeCategoryModal();
            closeDataModal(dataModalOverlay, dataModalContent);
            searchInput.blur();
        }
    });
});

// Populate category select dropdown
function populateCategorySelect(store, selectedId = null) {
    const categoryOptionsContainer = document.getElementById('link-category-options');
    const hiddenInput = document.getElementById('link-category');
    
    // Clear existing options
    categoryOptionsContainer.innerHTML = '';
    
    // Add "未分类" option
    const uncategorizedBtn = document.createElement('button');
    uncategorizedBtn.type = 'button';
    uncategorizedBtn.className = 'category-option px-3 py-2 rounded-lg border text-sm transition-all ' + 
        (selectedId === null || selectedId === 'uncategorized' ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-textMain hover:bg-surfaceHover');
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
    const categories = store.getCategories();
    categories.forEach(category => {
        const categoryBtn = document.createElement('button');
        categoryBtn.type = 'button';
        categoryBtn.className = 'category-option px-3 py-2 rounded-lg border text-sm transition-all flex items-center gap-2 ' + 
            (selectedId && selectedId === category.id ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-textMain hover:bg-surfaceHover');
        categoryBtn.innerHTML = `<i data-lucide="${category.icon}" class="w-4 h-4"></i><span>${category.name}</span>`;
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
    
    // Set initial value if no category is selected
    if (!selectedId) {
        hiddenInput.value = 'uncategorized';
    }
    
    lucide.createIcons();
}

// Render category navigation
function renderCategoryNav(store) {
    const categoryNav = document.getElementById('category-nav');
    const categories = store.getCategories();
    const allLinks = store.getAll();
    
    // Add "全部" category
    let navHTML = `
        <a href="#" class="category-nav-item flex items-center gap-3 p-3 rounded-lg text-textMain mb-1 active" data-category="all" aria-label="全部" title="全部">
            <i data-lucide="layout-grid" class="w-5 h-5"></i>
            <span class="category-nav-label">全部</span>
            <span class="category-nav-count ml-auto text-xs text-textMuted">(${allLinks.length})</span>
        </a>
    `;
    
    // Add each category
    categories.forEach(category => {
        const count = store.getLinksByCategory(category.id).length;
        navHTML += `
            <a href="#" class="category-nav-item flex items-center gap-3 p-3 rounded-lg text-textMain mb-1" data-category="${category.id}" aria-label="${category.name}" title="${category.name}">
                <i data-lucide="${category.icon}" class="w-5 h-5"></i>
                <span class="category-nav-label">${category.name}</span>
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
            const ui = new UI(store); // We need to access the UI to render
            if (categoryId === 'all') {
                ui.render(store.getAll(), true); // 第二个参数为true表示按分类分组显示
            } else {
                // 对于具体分类，也按分组结构渲染，但只显示当前分类
                ui.render(store.getLinksByCategory(categoryId), true);
            }
        });
    });
    
    lucide.createIcons();
}

// Open category management modal
function openCategoryModal(store) {
    const categoryModalOverlay = document.getElementById('category-modal-overlay');
    const categoryModalContent = document.getElementById('category-modal-content');
    
    categoryModalOverlay.classList.remove('hidden');
    
    requestAnimationFrame(() => {
        categoryModalOverlay.classList.add('open');
        categoryModalContent.classList.add('open');
    });

    renderCategoryList(store);
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

    const startTransition = document.startViewTransition?.bind(document);
    if (!startTransition) {
        themeManager.toggle();
        if (typeof onThemeChanged === 'function') {
            onThemeChanged();
        }
        root.style.removeProperty('--theme-reveal-x');
        root.style.removeProperty('--theme-reveal-y');
        root.style.removeProperty('--theme-reveal-radius');
        return;
    }

    const transition = startTransition(() => {
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
    const isGroupedByCategory = document.querySelector('.category-nav-item.active')?.dataset.category === 'all';
    ui.render(store.search(document.getElementById('search-input').value), isGroupedByCategory);
    renderCategoryNav(store);
    populateCategorySelect(store);
}

function openExportModal(store, handlers) {
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
                <input type="checkbox" value="${category.id}" class="h-4 w-4 accent-[var(--accent-color)]" checked>
                <div class="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-textMain">
                    <i data-lucide="${category.icon}" class="w-4 h-4"></i>
                </div>
                <div class="min-w-0">
                    <div class="truncate font-medium text-textMain">${category.name}</div>
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
                    const ui = new UI(store);
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

// Render category list in management modal
function renderCategoryList(store) {
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
        const categoryItem = document.createElement('div');
        categoryItem.className = 'flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface/70 px-4 py-3 transition-colors hover:bg-surface';
        
        categoryItem.innerHTML = `
            <div class="flex min-w-0 items-center gap-3">
                <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-background text-textMain">
                    <i data-lucide="${category.icon}" class="w-5 h-5"></i>
                </div>
                <div class="min-w-0">
                    <div class="truncate font-medium text-textMain">${category.name}</div>
                    <div class="mt-1 text-sm text-textMuted">${count} 个链接</div>
                </div>
            </div>
            <button data-id="${category.id}" class="btn-delete-category flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-transparent text-textMuted transition-colors hover:border-red-200 hover:bg-red-500/10 hover:text-red-500" title="删除分类">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        `;
        
        listContainer.appendChild(categoryItem);
    });
    
    categoryList.appendChild(listContainer);
    
    // Add event listeners to delete buttons
    document.querySelectorAll('.btn-delete-category').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const categoryId = e.target.closest('.btn-delete-category').dataset.id;
            if (confirm('确定要删除这个分类吗？属于该分类的链接将被标记为未分类。')) {
                store.removeCategory(categoryId);
                renderCategoryList(store);
                renderCategoryNav(store);
                populateCategorySelect(store); // Update category select in link form
            }
        });
    });
    
    lucide.createIcons();
}
