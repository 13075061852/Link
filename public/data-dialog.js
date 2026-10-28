import { openDialog, closeDialog } from './dialogs.js';
import { createIcons } from './icons.js';

const el = id => document.getElementById(id);

export function openDataModal(config) {
    const overlay = el('data-modal-overlay');
    const content = el('data-modal-content');
    const secondary = el('data-modal-secondary');
    const primary = el('data-modal-primary');

    el('data-modal-title').textContent = config.title || '';
    el('data-modal-description').textContent = config.description || '';
    el('data-modal-body').innerHTML = config.bodyHTML || '';

    secondary.textContent = config.secondaryText || '取消';
    primary.textContent = config.primaryText || '确认';
    secondary.hidden = config.secondaryHidden === true;
    primary.className = config.primaryClassName || 'button button--primary';
    secondary.className = config.secondaryClassName || 'button button--ghost';

    secondary.onclick = () => {
        if (typeof config.onSecondary === 'function') return config.onSecondary();
        closeDataModal();
    };
    primary.onclick = () => {
        if (typeof config.onPrimary === 'function') config.onPrimary();
    };

    openDialog(overlay, content);
    createIcons();
}

export function closeDataModal() {
    closeDialog(el('data-modal-overlay'), el('data-modal-content'));
}

export function openDeleteConfirmModal({ title, description, bodyHTML, primaryText = '删除', onConfirm }) {
    openDataModal({
        title,
        description,
        bodyHTML,
        secondaryText: '取消',
        primaryText,
        primaryClassName: 'button button--danger',
        onPrimary: () => {
            onConfirm();
            closeDataModal();
        },
        onSecondary: closeDataModal
    });
}
