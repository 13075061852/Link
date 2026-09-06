const { test, expect } = require('@playwright/test');

async function fixture(page) {
    // Local, deterministic fixture; no Tailwind/Lucide CDN dependency.
    await page.route('**/sort-fixture', route => route.fulfill({ contentType: 'text/html', body: `
        <style>
            #grid { position: relative; display: grid; grid-template-columns: repeat(3, 180px); gap: 12px; }
            .card, .sort-placeholder { height: 80px; background: #ddd; }
        </style>
        <div id="grid"><div class="card" id="a"></div><div class="card" id="b"></div><div class="card" id="c"></div></div>
    ` }));
    await page.goto('/sort-fixture');
    await page.evaluate(async () => {
        const { DragSort } = await import('/drag-sort.js');
        window.grid = document.getElementById('grid');
        window.sorter = new DragSort(grid, { item: '.card', handle: '.handle', containers: () => [grid], onDrop() {} });
    });
}

test('FLIP keeps unchanged destinations running instead of restarting them', async ({ page }) => {
    await fixture(page);
    const result = await page.evaluate(async () => {
        const a = document.getElementById('a');
        const b = document.getElementById('b');
        sorter.flip(() => grid.append(a));
        const animation = sorter.animations.get(b);
        await new Promise(resolve => requestAnimationFrame(resolve));
        sorter.flip(() => {});
        return { same: animation === sorter.animations.get(b), playState: animation.playState,
            duration: animation.effect.getTiming().duration, easing: animation.effect.getTiming().easing };
    });
    expect(result.same).toBe(true);
    expect(result.playState).toBe('running');
    expect(result.duration).toBe(220);
    expect(result.easing).toBe('cubic-bezier(0.2, 0.8, 0.2, 1)');
});

test('midpoint jitter does not reorder; deliberate movement still works in both directions', async ({ page }) => {
    await fixture(page);
    const result = await page.evaluate(() => {
        const a = document.getElementById('a');
        const b = document.getElementById('b');
        const placeholder = document.createElement('div');
        placeholder.className = 'sort-placeholder';
        a.replaceWith(placeholder);
        const r = b.getBoundingClientRect();
        sorter.state = { placeholder, x: r.left + r.width / 2, y: r.top + r.height / 2 };
        const locate = x => { sorter.state.x = x; sorter.locate(); };
        const initial = [...grid.children];
        for (const jitter of [-3, 1, -1, 4, -4, 2]) locate(r.left + r.width / 2 + jitter);
        const stable = initial.every((el, i) => el === grid.children[i]);
        locate(r.left + r.width / 2 + 20);
        const forward = grid.children[1] === placeholder;
        // Even with an in-flight FLIP, decisions use slots, not visual transforms.
        const slotLeft = grid.getBoundingClientRect().left;
        locate(slotLeft + 50);
        const backward = grid.firstElementChild === placeholder;
        return { stable, forward, backward };
    });
    expect(result).toEqual({ stable: true, forward: true, backward: true });
});

test('retargeting an in-flight FLIP preserves the current visual position', async ({ page }) => {
    await fixture(page);
    const result = await page.evaluate(async () => {
        const a = document.getElementById('a');
        const b = document.getElementById('b');
        sorter.flip(() => grid.append(a));
        await new Promise(resolve => setTimeout(resolve, 70));
        const before = b.getBoundingClientRect();
        sorter.flip(() => grid.prepend(a));
        const after = b.getBoundingClientRect();
        return Math.hypot(after.left - before.left, after.top - before.top);
    });
    expect(result).toBeLessThan(1);
});
