// Responsive category sidebar. On mobile it behaves as a modal drawer.
export function closeSidebar({ restoreFocus = true } = {}) {
    const sidebar = document.getElementById('category-sidebar');
    const wasOpen = sidebar.classList.contains('is-open');
    sidebar.classList.remove('is-open');
    document.getElementById('sidebar-backdrop').classList.remove('active');
    document.getElementById('sidebar-toggle').setAttribute('aria-expanded', 'false');
    document.querySelector('.workspace').inert = false;
    document.querySelector('.appbar').inert = false;
    sidebar.inert = matchMedia('(max-width: 900px)').matches;
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    if (wasOpen && restoreFocus) document.getElementById('sidebar-toggle').focus({ preventScroll: true });
}

export function setupSidebar() {
    const sidebar = document.getElementById('category-sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    const close = document.getElementById('sidebar-close');
    const mobile = matchMedia('(max-width: 900px)');
    const focusables = () => [...sidebar.querySelectorAll('a[href], button, [tabindex="0"]')]
        .filter(el => !el.disabled && el.getClientRects().length);
    const open = () => {
        if (!mobile.matches) return;
        sidebar.inert = false;
        sidebar.classList.add('is-open');
        sidebar.setAttribute('role', 'dialog');
        sidebar.setAttribute('aria-modal', 'true');
        document.getElementById('sidebar-backdrop').classList.add('active');
        toggle.setAttribute('aria-expanded', 'true');
        // Wait for visibility/inert styles before moving focus into the drawer.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!sidebar.classList.contains('is-open')) return;
            close.focus({ preventScroll: true });
            document.querySelector('.workspace').inert = true;
            document.querySelector('.appbar').inert = true;
        }));
    };
    toggle.addEventListener('click', open);
    close.addEventListener('click', () => closeSidebar());
    document.getElementById('sidebar-backdrop').addEventListener('click', () => closeSidebar());
    sidebar.addEventListener('keydown', event => {
        if (!sidebar.classList.contains('is-open')) return;
        if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); closeSidebar();
        } else if (event.key === 'Tab') {
            const items = focusables();
            const first = items[0] || sidebar;
            const last = items.at(-1) || sidebar;
            if (event.shiftKey && (document.activeElement === first || document.activeElement === sidebar)) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first.focus();
            }
        }
    });
    mobile.addEventListener('change', () => closeSidebar({ restoreFocus: false }));
    closeSidebar({ restoreFocus: false });
}
