// Shared dialog plumbing: open/close animation plus focus containment.
export function openDialog(overlay, content) {
    overlay.hidden = false;
    requestAnimationFrame(() => {
        overlay.classList.add('open');
        content.classList.add('open');
    });
}

export function closeDialog(overlay, content) {
    overlay.classList.remove('open');
    content.classList.remove('open');
    setTimeout(() => {
        if (!overlay.classList.contains('open')) overlay.hidden = true;
    }, 210);
}

export function setupDialogs() {
    const entries = ['modal', 'category-modal', 'data-modal'].map(id => ({
        overlay: document.getElementById(`${id}-overlay`),
        content: document.getElementById(`${id}-content`),
        close: document.getElementById(`${id}-close`)
    }));
    const backgrounds = [document.querySelector('.shell')];
    let previous = null;
    let lastOutsideFocus = document.activeElement;
    const returnFocus = new Map();
    const focusable = content => [...content.querySelectorAll('a[href], button, input, select, textarea, [tabindex="0"]')]
        .filter(el => !el.disabled && el.getClientRects().length);
    entries.forEach(({ overlay, content, close }) => {
        content.setAttribute('role', 'dialog');
        content.setAttribute('aria-modal', 'true');
        content.setAttribute('aria-labelledby', content.id.replace('content', 'title'));
        content.tabIndex = -1;
        close.setAttribute('aria-label', '关闭对话框');
        // Only the backdrop closes. Comparing geometry breaks when a row is
        // re-rendered mid-click (the detached target is no longer "inside").
        overlay.addEventListener('click', event => {
            if (event.target === overlay || event.target.classList.contains('dialog-wrap')) close.click();
        });
        content.addEventListener('keydown', event => {
            if (event.key !== 'Tab') return;
            const elements = focusable(content);
            const first = elements[0] || content;
            const last = elements.at(-1) || content;
            if (event.shiftKey && (document.activeElement === first || document.activeElement === content)) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === content)) {
                event.preventDefault(); first.focus();
            }
        });
    });
    document.addEventListener('focusin', event => {
        if (!entries.some(entry => entry.content.contains(event.target))) lastOutsideFocus = event.target;
    });
    const update = () => {
        const open = entries.filter(entry => entry.overlay.classList.contains('open'));
        const top = open.at(-1);
        backgrounds.forEach(el => { if (el) el.inert = !!top; });
        entries.forEach(entry => { entry.content.inert = !!top && entry !== top; });
        if (top === previous) return;
        if (top) {
            if (!returnFocus.has(top)) returnFocus.set(top, previous ? document.activeElement : lastOutsideFocus);
            if (!top.content.contains(document.activeElement)) {
                (top.content.querySelector('input:not([type="hidden"])') || focusable(top.content)[0] || top.content).focus({ preventScroll: true });
            }
        }
        if (previous && !open.includes(previous)) {
            const target = returnFocus.get(previous);
            if (target?.isConnected && !target.closest('[inert]')) target.focus({ preventScroll: true });
            returnFocus.delete(previous);
        }
        previous = top;
    };
    const observer = new MutationObserver(update);
    entries.forEach(({ overlay }) => observer.observe(overlay, { attributes: true, attributeFilter: ['class', 'hidden'] }));
}
