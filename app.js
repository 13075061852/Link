import { Store } from './store.js';
import { ThemeManager } from './theme.js';
import { UI } from './ui.js';
import { isValidUrl, debounce } from './utils.js';

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
    themeBtn.addEventListener('click', () => {
        themeManager.toggle();
        // Re-render category nav to apply theme changes
        setTimeout(() => renderCategoryNav(store), 100);
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
        <a href="#" class="category-nav-item flex items-center gap-3 p-3 rounded-lg text-textMain mb-1 active" data-category="all">
            <i data-lucide="layout-grid" class="w-5 h-5"></i>
            <span>全部</span>
            <span class="ml-auto text-xs text-textMuted">(${allLinks.length})</span>
        </a>
    `;
    
    // Add each category
    categories.forEach(category => {
        const count = store.getLinksByCategory(category.id).length;
        navHTML += `
            <a href="#" class="category-nav-item flex items-center gap-3 p-3 rounded-lg text-textMain mb-1" data-category="${category.id}">
                <i data-lucide="${category.icon}" class="w-5 h-5"></i>
                <span>${category.name}</span>
                <span class="ml-auto text-xs text-textMuted">(${count})</span>
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

// Render category list in management modal
function renderCategoryList(store) {
    const categoryList = document.getElementById('category-list');
    const categories = store.getCategories();
    
    // Clear the container
    categoryList.innerHTML = '';
    
    // Create a grid container for category items
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-3 gap-3';
    
    categories.forEach(category => {
        const categoryItem = document.createElement('div');
        categoryItem.className = 'flex items-center justify-between p-3 bg-surface rounded-lg border border-border';
        
        categoryItem.innerHTML = `
            <div class="flex items-center gap-2">
                <i data-lucide="${category.icon}" class="w-4 h-4 text-textMuted"></i>
                <span class="text-textMain">${category.name}</span>
            </div>
            <button data-id="${category.id}" class="btn-delete-category p-1 text-textMuted hover:text-red-500 transition-colors" title="删除分类">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        `;
        
        gridContainer.appendChild(categoryItem);
    });
    
    categoryList.appendChild(gridContainer);
    
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