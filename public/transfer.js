import { escapeHTML, sanitizeIconName } from './utils.js';
import { icon, createIcons } from './icons.js';
import { openDataModal, closeDataModal } from './data-dialog.js';

let pendingPayload = null;

export function openExportModal(store, ui, { onExport }) {
    const rows = [{
        id: 'uncategorized',
        name: '未分类',
        iconName: 'folder',
        count: store.getLinksByCategory('uncategorized').length
    }, ...store.getCategories().map(category => ({
        id: category.id,
        name: category.name,
        iconName: sanitizeIconName(category.icon),
        count: store.getLinksByCategory(category.id).length
    }))];

    openDataModal({
        title: '导出数据',
        description: '默认全选。你可以只带走需要的分类。',
        bodyHTML: `
            <div class="stack">
                <div class="select-grid">
                    ${rows.map(row => `
                        <label class="select-row">
                            <input type="checkbox" value="${escapeHTML(row.id)}" checked>
                            <span class="select-icon" aria-hidden="true">${icon(row.iconName)}</span>
                            <span class="select-row-copy">
                                <span class="select-row-title">${escapeHTML(row.name)}</span>
                                <span class="select-row-meta">${row.count} 条链接</span>
                            </span>
                        </label>
                    `).join('')}
                </div>
                <p class="notice">导出文件包含所选链接与对应分类，可随时再导入。</p>
            </div>
        `,
        secondaryText: '取消',
        primaryText: '导出所选',
        onSecondary: closeDataModal,
        onPrimary: () => {
            const ids = [...document.querySelectorAll('#data-modal-body input[type="checkbox"]:checked')]
                .map(input => input.value);
            if (ids.length === 0) {
                ui.showToast('请至少选择一个分类');
                return;
            }
            onExport(ids);
            closeDataModal();
        }
    });
    createIcons();
}

export async function prepareImportFile(file, { store, ui, refresh }) {
    pendingPayload = null;
    try {
        const payload = JSON.parse(await file.text());
        pendingPayload = payload;
        openDataModal({
            title: '导入数据',
            description: `已读取 ${file.name || 'import.json'}，选择合并方式。`,
            bodyHTML: `
                <div class="stack">
                    <p class="notice"><strong>追加导入</strong>保留现有收藏，合并文件内容并跳过重复网址。</p>
                    <p class="notice notice--danger"><strong>覆盖导入</strong>会替换当前全部链接和分类，请确认已有备份。</p>
                </div>
            `,
            secondaryText: '覆盖导入',
            secondaryClassName: 'button button--ghost',
            primaryText: '追加导入',
            onSecondary: () => performImport('replace', store, ui, refresh),
            onPrimary: () => performImport('append', store, ui, refresh)
        });
    } catch (error) {
        console.error(error);
        pendingPayload = null;
        ui.showToast(error instanceof SyntaxError ? 'JSON 文件格式不正确' : error.message || '导入失败');
    }
}

function performImport(mode, store, ui, refresh) {
    if (!pendingPayload) {
        ui.showToast('没有可导入的数据');
        return;
    }
    try {
        const result = store.importData(pendingPayload, { mode });
        pendingPayload = null;
        refresh();
        closeDataModal();
        const skipped = mode === 'append' && result.skippedLinksCount > 0
            ? `，跳过 ${result.skippedLinksCount} 条重复链接`
            : '';
        ui.showToast(mode === 'append'
            ? `已追加 ${result.linksCount} 条链接、${result.categoriesCount} 个分类${skipped}`
            : `已覆盖导入 ${result.linksCount} 条链接、${result.categoriesCount} 个分类`);
    } catch (error) {
        console.error(error);
        pendingPayload = null;
        closeDataModal();
        ui.showToast(error.message || '导入失败');
    }
}

export function showDropOverlay(overlay, active) {
    if (active) {
        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add('active'));
        return;
    }
    overlay.classList.remove('active');
    setTimeout(() => { overlay.hidden = true; }, 200);
}

export function downloadJson(data, filename) {
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
