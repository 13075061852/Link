// Shared pointer sorter. Only the floating preview moves every frame; layout changes
// are batched and siblings use compositor-only FLIP animations.
const SPRING = 'cubic-bezier(.22, 1.15, .36, 1)';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let activeSorter = null;

export function layoutRect(element) {
    const parent = element.offsetParent;
    if (!parent) return element.getBoundingClientRect();
    const rect = parent.getBoundingClientRect();
    const left = rect.left + parent.clientLeft + element.offsetLeft - parent.scrollLeft;
    const top = rect.top + parent.clientTop + element.offsetTop - parent.scrollTop;
    return { left, top, width: element.offsetWidth, height: element.offsetHeight,
        right: left + element.offsetWidth, bottom: top + element.offsetHeight };
}

export class DragSort {
    constructor(root, { item, handle, containers, disabled = () => false, onDrop, announce = () => {} }) {
        Object.assign(this, { root, itemSelector: item, handleSelector: handle, containers, disabled, onDrop, announce });
        this.animations = new Map();
        this.abort = new AbortController();
        const options = { signal: this.abort.signal };
        root.addEventListener('pointerdown', event => this.down(event), options);
        root.addEventListener('dragstart', event => {
            if (event.target.closest(item)) event.preventDefault();
        }, options);
        root.addEventListener('keydown', event => this.keyboard(event), options);
        root.addEventListener('click', event => {
            if (performance.now() < (this.suppressClickUntil || 0)) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, { ...options, capture: true });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.state) {
                event.preventDefault();
                event.stopImmediatePropagation();
                this.finish(true);
            }
        }, { ...options, capture: true });
        window.addEventListener('blur', () => this.finish(true), options);
        window.addEventListener('resize', () => this.finish(true), options);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.finish(true);
        }, options);
    }

    items(container = this.root) {
        return [...container.querySelectorAll(this.itemSelector)];
    }

    down(event) {
        if (activeSorter || this.state || this.disabled() || event.button !== 0 || !event.isPrimary) return;
        const item = event.target.closest(this.itemSelector);
        if (!item || !this.root.contains(item)) return;
        const handle = event.target.closest(this.handleSelector);
        if (!handle && (event.pointerType !== 'mouse' || event.target.closest('button, input, select, textarea'))) return;
        this.state = { item, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
            x: event.clientX, y: event.clientY, started: false, source: item.parentElement };
        activeSorter = this;
        this.gesture = new AbortController();
        const options = { signal: this.gesture.signal };
        window.addEventListener('pointermove', e => this.move(e), { ...options, passive: false });
        window.addEventListener('pointerup', e => {
            if (e.pointerId === this.state?.pointerId) this.finish(false);
        }, options);
        window.addEventListener('pointercancel', e => {
            if (e.pointerId === this.state?.pointerId) this.finish(true);
        }, options);
        this.root.addEventListener('lostpointercapture', () => {
            if (this.state && !this.state.settling) this.finish(true);
        }, options);
        if (handle) event.preventDefault();
    }

    move(event) {
        const state = this.state;
        if (!state || state.settling || event.pointerId !== state.pointerId) return;
        state.x = event.clientX;
        state.y = event.clientY;
        if (!state.started && Math.hypot(state.x - state.startX, state.y - state.startY) >= 5) this.start();
        if (state.started) {
            event.preventDefault();
            state.dirty = true;
        }
    }

    start() {
        const state = this.state;
        const rect = state.item.getBoundingClientRect();
        state.started = true;
        state.dirty = true;
        state.offsetX = state.startX - rect.left;
        state.offsetY = state.startY - rect.top;
        state.marker = document.createComment('sort-origin');
        state.item.before(state.marker);
        state.placeholder = document.createElement('div');
        state.placeholder.className = 'sort-placeholder';
        state.placeholder.style.height = `${rect.height}px`;
        state.placeholder.setAttribute('aria-hidden', 'true');
        state.ghost = state.item.cloneNode(true);
        state.ghost.removeAttribute('id');
        state.ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        state.ghost.classList.add('sort-ghost');
        state.ghost.classList.toggle('sort-list-ghost', this.root.classList.contains('list-view'));
        state.ghost.setAttribute('aria-hidden', 'true');
        state.ghost.inert = true;
        Object.assign(state.ghost.style, { width: `${rect.width}px`, height: `${rect.height}px` });
        // Reserve space once on pickup, so traversing an empty destination
        // cannot expand it under the pointer and push the next group away.
        state.sizes = this.containers().map(container => ({ container, minHeight: container.style.minHeight,
            height: Math.max(container.offsetHeight, rect.height) }));
        this.flip(() => {
            state.sizes.forEach(({ container, height }) => { container.style.minHeight = `${height}px`; });
            state.item.replaceWith(state.placeholder);
        });
        document.body.append(state.ghost);
        document.body.classList.add('is-sorting');
        this.root.classList.add('sort-active');
        this.root.setPointerCapture(state.pointerId);
        this.announce('已拾起，拖到目标位置松手；按 Escape 取消');
        this.tick(performance.now());
    }

    tick(time) {
        const state = this.state;
        if (!state?.started || state.settling) return;
        if (!state.placeholder.isConnected) { this.finish(true); return; }
        const dt = Math.min(32, time - (state.lastTime || time));
        state.lastTime = time;
        state.ghost.style.transform = `translate3d(${state.x - state.offsetX}px, ${state.y - state.offsetY}px, 0) scale(${reducedMotion() ? 1 : 1.035})`;
        if (this.autoScroll(dt)) state.dirty = true;
        if (state.dirty) {
            this.locate();
            state.dirty = false;
        }
        this.frame = requestAnimationFrame(t => this.tick(t));
    }

    autoScroll(dt) {
        const state = this.state;
        let element = document.elementFromPoint(state.x, state.y);
        while (element && element !== document.body) {
            if (element.scrollHeight > element.clientHeight && /(auto|scroll)/.test(getComputedStyle(element).overflowY)) {
                const rect = element.getBoundingClientRect();
                const edge = Math.min(72, rect.height / 4);
                const strength = state.y < rect.top + edge ? -(1 - (state.y - rect.top) / edge)
                    : state.y > rect.bottom - edge ? 1 - (rect.bottom - state.y) / edge : 0;
                const before = element.scrollTop;
                element.scrollTop += Math.sign(strength) * Math.min(1, Math.abs(strength)) ** 2 * dt * .8;
                if (before !== element.scrollTop) return true;
            }
            element = element.parentElement;
        }
        return false;
    }

    locate() {
        const state = this.state;
        const containers = this.containers();
        const container = containers.find(el => {
            const r = el.getBoundingClientRect();
            return state.x >= r.left - 8 && state.x <= r.right + 8 && state.y >= r.top - 12 && state.y <= r.bottom + 12;
        });
        this.root.querySelectorAll('.sort-target').forEach(el => el.classList.toggle('sort-target', el === container));
        state.valid = !!container;
        if (!container) return;
        container.classList.add('sort-target');
        const placeholderRect = layoutRect(state.placeholder);
        if (state.placeholder.parentElement === container && state.x >= placeholderRect.left - 4 && state.x <= placeholderRect.right + 4 && state.y >= placeholderRect.top - 4 && state.y <= placeholderRect.bottom + 4) return;
        const candidates = this.items(container).map(element => ({ element, rect: layoutRect(element) }));
        let nearest = null;
        let distance = Infinity;
        for (const candidate of candidates) {
            const r = candidate.rect;
            const d = Math.hypot(state.x - r.left - r.width / 2, (state.y - r.top - r.height / 2) * 1.3);
            if (d < distance) { nearest = candidate; distance = d; }
        }
        let reference = null;
        if (nearest) {
            const r = nearest.rect;
            const isGrid = getComputedStyle(container).gridTemplateColumns.split(' ').length > 1;
            const after = isGrid && state.y >= r.top && state.y <= r.bottom
                ? state.x > r.left + r.width / 2 : state.y > r.top + r.height / 2;
            reference = after ? nearest.element.nextElementSibling : nearest.element;
        }
        if (reference === state.placeholder || (state.placeholder.parentElement === container && state.placeholder.nextElementSibling === reference)) return;
        this.flip(() => container.insertBefore(state.placeholder, reference));
    }

    flip(mutate) {
        const elements = this.items();
        const before = new Map(elements.map(el => [el, el.getBoundingClientRect()]));
        this.animations.forEach(animation => animation.cancel());
        this.animations.clear();
        mutate();
        if (reducedMotion()) return;
        const after = elements.map(el => [el, layoutRect(el)]);
        for (const [el, rect] of after) {
            const old = before.get(el);
            const dx = old.left - rect.left;
            const dy = old.top - rect.top;
            if (Math.abs(dx) + Math.abs(dy) < 1) continue;
            const animation = el.animate([
                { transform: `translate3d(${dx}px, ${dy}px, 0)` },
                { transform: 'translate3d(0, 0, 0)' }
            ], { duration: 340, easing: SPRING });
            this.animations.set(el, animation);
            animation.onfinish = () => { if (this.animations.get(el) === animation) this.animations.delete(el); };
        }
    }

    async finish(cancelled) {
        const state = this.state;
        if (!state || state.settling) return;
        state.settling = true;
        cancelAnimationFrame(this.frame);
        this.gesture?.abort();
        if (this.root.hasPointerCapture(state.pointerId)) this.root.releasePointerCapture(state.pointerId);
        if (!state.started) { this.state = null; activeSorter = null; return; }
        // Re-evaluate the last pointer position even if pointerup preceded the next frame.
        if (!cancelled) this.locate();
        cancelled ||= !state.valid || !state.placeholder.isConnected;
        this.suppressClickUntil = performance.now() + 450;
        if (cancelled && state.marker.isConnected) this.flip(() => state.marker.after(state.placeholder));
        const target = state.placeholder.parentElement;
        this.flip(() => {
            state.sizes.forEach(({ container, minHeight }) => { container.style.minHeight = minHeight; });
        });
        const rect = state.placeholder.getBoundingClientRect();
        if (!reducedMotion() && state.placeholder.isConnected) {
            const animation = state.ghost.animate([
                { transform: state.ghost.style.transform, opacity: 1 },
                { transform: `translate3d(${rect.left}px, ${rect.top}px, 0) scale(1)`, opacity: 1 }
            ], { duration: 260, easing: SPRING, fill: 'forwards' });
            await animation.finished.catch(() => {});
        }
        const originalNext = state.marker.nextElementSibling;
        const changed = target !== state.source || originalNext !== state.placeholder;
        state.placeholder.replaceWith(state.item);
        state.marker.remove();
        state.ghost.remove();
        this.animations.forEach(animation => animation.cancel());
        this.animations.clear();
        this.root.classList.remove('sort-target');
        this.root.querySelectorAll('.sort-target').forEach(el => el.classList.remove('sort-target'));
        this.root.classList.remove('sort-active');
        document.body.classList.remove('is-sorting');
        this.state = null;
        activeSorter = null;
        if (!cancelled && changed) this.onDrop({ item: state.item, source: state.source, target, items: this.items(target) });
        this.announce(cancelled ? '已取消排序' : changed ? '顺序已更新' : '位置未改变');
    }

    keyboard(event) {
        if (!event.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || this.disabled() || activeSorter) return;
        const handle = event.target.closest(this.handleSelector);
        const item = handle?.closest(this.itemSelector);
        if (!item) return;
        event.preventDefault();
        event.stopPropagation();
        const source = item.parentElement;
        const items = this.items(source);
        const index = items.indexOf(item);
        const step = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1;
        const sibling = items[index + step];
        if (!sibling) return;
        this.flip(() => source.insertBefore(item, step < 0 ? sibling : sibling.nextSibling));
        this.onDrop({ item, source, target: source, items: this.items(source) });
        // Rendering may replace the handle; restore focus by stable item key.
        const key = item.dataset.linkId || item.dataset.category;
        const next = this.items().find(el => (el.dataset.linkId || el.dataset.category) === key);
        next?.querySelector(this.handleSelector)?.focus({ preventScroll: true });
        this.announce('顺序已更新');
    }
}
