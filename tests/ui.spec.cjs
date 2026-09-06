const { test, expect } = require('@playwright/test');
const data = () => ({
    categories: [{ id: 'work', name: '工作', icon: 'briefcase' }, { id: 'learn', name: '灵感与学习', icon: 'sparkles' }, { id: 'empty', name: '稍后阅读', icon: 'book-open' }],
    links: [
        { id: 'a', title: 'Linear — Make work feel effortless', url: 'https://linear.app', categoryId: 'work', createdAt: 4 },
        { id: 'b', title: 'Figma · 设计的无限可能', url: 'https://figma.com', categoryId: 'work', createdAt: 3 },
        { id: 'c', title: 'GitHub', url: 'https://github.com', categoryId: 'work', createdAt: 2 },
        { id: 'd', title: 'Are.na — A place for ideas', url: 'https://are.na', categoryId: 'learn', createdAt: 1 }
    ]
});
async function boot(page, payload = data()) {
    const saves = [];
    await page.addInitScript(() => { window.LINK_API_URL = '/api/data'; });
    await page.route('**/api/data', async route => {
        if (route.request().method() === 'PUT') {
            saves.push(route.request().postDataJSON());
            return route.fulfill({ json: { ok: true } });
        }
        return route.fulfill({ json: payload });
    });
    await page.goto('/');
    await expect(page.locator('#sync-status')).toHaveText('已同步到云端');
    return saves;
}
const cards = page => page.locator('[data-category-id="work"] [data-link-card]');
const ids = locator => locator.evaluateAll(elements => elements.map(el => el.dataset.linkId));
async function drag(page, handle, target, relative = { x: .8, y: .5 }) {
    const start = await handle.boundingBox();
    const targetElement = await target.elementHandle(); // Do not match the cloned preview after pickup.
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 8, start.y + start.height / 2, { steps: 3 });
    await expect(page.locator('.sort-ghost')).toHaveCount(1);
    const end = await targetElement.boundingBox(); // Pickup reserves space for empty destinations.
    await page.mouse.move(end.x + end.width * relative.x, end.y + end.height * relative.y, { steps: 18 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await expect(page.locator('.sort-ghost')).toHaveCount(0);
}

test('compact layout: aligned brand and only links in the main canvas', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#dashboard-panel, .collection-toolbar, #stats-panel')).toHaveCount(0);
    await expect(page.locator('.card-category')).toHaveCount(0);
    const card = await cards(page).first().boundingBox();
    expect(card.height).toBeLessThanOrEqual(90);
    expect(card.y).toBeLessThan(150);
    const icon = await page.locator('.brand-mark').boundingBox();
    const name = await page.locator('.brand-name').boundingBox();
    expect(Math.abs(icon.y + icon.height / 2 - name.y - name.height / 2)).toBeLessThan(1);
    for (const width of [768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: 'test-results/compact-desktop.png', fullPage: true });
});

test('larger favicons and local monograms handle missing site icons in both themes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.route('https://t2.gstatic.com/faviconV2?**', route => {
        const url = new URL(route.request().url());
        expect(url.searchParams.get('fallback_opts')).toBe('TYPE,SIZE');
        if (url.searchParams.get('url') === 'https://github.com') {
            return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#3478f6"/></svg>' });
        }
        return route.fulfill({ status: 404, body: '' });
    });
    await boot(page);
    const icon = page.locator('[data-link-id="a"] .card-icon');
    await expect(icon.locator('img')).toBeHidden();
    await expect(icon.locator('.site-monogram')).toHaveText('L');
    await expect(icon.locator('.site-monogram')).toBeVisible();
    const realIcon = page.locator('[data-link-id="c"] .card-icon');
    await expect(realIcon).toHaveClass(/has-favicon/);
    expect((await realIcon.locator('img').boundingBox()).width).toBe(30);
    expect((await icon.boundingBox()).width).toBe(42);
    await page.screenshot({ path: 'test-results/card-icons-light.png' });
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).not.toHaveClass(/theme-transitioning/);
    await expect(icon.locator('.site-monogram')).toBeVisible();
    await page.screenshot({ path: 'test-results/card-icons-dark.png' });
});

test('reported missing-logo sites show designed badges rather than globes', async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 800 });
    await page.emulateMedia({ colorScheme: 'light' });
    // Real response: HTTP 404 still carries a decodable PNG and fires img.load.
    await page.route('https://t2.gstatic.com/faviconV2?**', route => route.fulfill({
        status: 404, contentType: 'image/png', path: require('path').join(__dirname, 'fixtures/google-default-favicon.png')
    }));
    const payload = data();
    payload.links = [
        { id: 'cn2', title: '高速CN2服务器', url: 'https://d.m123.org/', categoryId: 'work', createdAt: 3 },
        { id: 'vultr', title: 'VULTR服务器', url: 'https://console.vultr.com/', categoryId: 'work', createdAt: 2 },
        { id: 'hk', title: '香港高速', url: 'https://www.gbjson.cn/nodes', categoryId: 'work', createdAt: 1 }
    ];
    await boot(page, payload);
    await expect(page.locator('.site-monogram')).toHaveText(['高', 'V', '香']);
    await expect(page.locator('.card-icon.has-favicon')).toHaveCount(0);
    for (const image of await page.locator('.site-favicon').all()) await expect(image).toBeHidden();
    await page.locator('.link-container[data-category-id="work"]').screenshot({ path: 'test-results/missing-logo-badges-light.png' });
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('html')).not.toHaveClass(/theme-transitioning/);
    await page.locator('.link-container[data-category-id="work"]').screenshot({ path: 'test-results/missing-logo-badges-dark.png' });
});

test('pending logos never flash a fallback badge, including after refresh', async ({ page }) => {
    let release;
    let gate = new Promise(resolve => { release = resolve; });
    await page.route('https://t2.gstatic.com/faviconV2?**', async route => {
        await gate;
        const site = new URL(route.request().url()).searchParams.get('url');
        if (site === 'https://github.com') {
            return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#3478f6"/></svg>' });
        }
        return route.fulfill({ status: 404, body: '' });
    });
    try {
        await boot(page);
        for (let pass = 0; pass < 2; pass++) {
            if (pass) {
                gate = new Promise(resolve => { release = resolve; });
                await page.reload();
                await expect(page.locator('#sync-status')).toHaveText('已同步到云端');
            }
            const icon = page.locator('[data-link-id="c"] .card-icon');
            await expect(icon).not.toHaveClass(/has-fallback|has-favicon/);
            await expect(icon.locator('.site-monogram')).toBeHidden();
            expect(await icon.evaluate(el => getComputedStyle(el).backgroundImage)).toBe('none');
            const size = await icon.boundingBox();
            release();
            await expect(icon).toHaveClass(/has-favicon/);
            await expect(icon.locator('.site-monogram')).toBeHidden();
            expect(await icon.boundingBox()).toEqual(size);
            await expect(page.locator('[data-link-id="a"] .site-monogram')).toBeVisible();
        }
    } finally {
        release();
    }
});

test('HTTP 200 globe stays hidden while small explicitly uploaded icons remain supported', async ({ page }) => {
    const png = require('fs').readFileSync(require('path').join(__dirname, 'fixtures/google-default-favicon.png'));
    await page.route('https://t2.gstatic.com/faviconV2?**', route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
    const payload = data();
    payload.links[0].iconData = `data:image/png;base64,${png.toString('base64')}`;
    await boot(page, payload);
    const uploaded = page.locator('[data-link-id="a"] .card-icon');
    await expect(uploaded).toHaveClass(/has-favicon/);
    for (const id of ['b', 'c', 'd']) {
        const icon = page.locator(`[data-link-id="${id}"] .card-icon`);
        await expect(icon.locator('img')).toHaveJSProperty('naturalWidth', 16);
        await expect(icon.locator('img')).toBeHidden();
        await expect(icon).not.toHaveClass(/has-favicon/);
        await expect(icon.locator('.site-monogram')).toBeVisible();
    }
});

test('desktop: pointer reorder, cancel and move to an empty category', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const saves = await boot(page);
    await expect(cards(page)).toHaveCount(3);
    await drag(page, cards(page).first().locator('.link-drag-handle'), cards(page).last());
    expect(await ids(cards(page))).toEqual(['b', 'c', 'a']);
    await expect.poll(() => saves.length).toBe(1);
    const before = await ids(cards(page));
    const handle = await cards(page).first().locator('.link-drag-handle').boundingBox();
    await page.mouse.move(handle.x + 8, handle.y + 8);
    await page.mouse.down();
    await page.mouse.move(handle.x + 160, handle.y + 20, { steps: 8 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('.sort-ghost')).toHaveCount(0);
    expect(await ids(cards(page))).toEqual(before);
    expect(saves).toHaveLength(1);
    await drag(page, cards(page).first().locator('.link-drag-handle'), page.locator('.link-container[data-category-id="empty"]'));
    await expect(page.locator('[data-category-id="empty"] [data-link-card]')).toHaveCount(1);
    await expect.poll(() => saves.length).toBe(2);
    expect(saves.at(-1).links.find(link => link.id === 'b').categoryId).toBe('empty');
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/desktop-light.png', fullPage: true });
});

test('list view, keyboard ordering, search and category ordering', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: '列表视图', exact: true }).click();
    await expect(page.locator('#link-grid')).toHaveClass(/list-view/);
    const handle = cards(page).first().locator('.link-drag-handle');
    await handle.focus();
    await page.keyboard.press('Alt+ArrowDown');
    expect(await ids(cards(page))).toEqual(['b', 'a', 'c']);
    await page.waitForTimeout(360); // Wait for the keyboard FLIP to settle before hit testing.
    await drag(page, cards(page).first().locator('.link-drag-handle'), cards(page).last(), { x: .5, y: .8 });
    expect(await ids(cards(page))).toEqual(['a', 'c', 'b']);
    await page.locator('#search-input').fill('GitHub');
    await expect(page.locator('[data-link-card]')).toHaveCount(1);
    await expect(page.locator('.link-drag-handle')).toBeDisabled();
    await page.locator('.category-drag-handle').first().focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.locator('#search-input')).toHaveValue('GitHub');
    await expect(page.locator('[data-link-card]')).toHaveCount(1);
    await page.locator('#clear-search').click();
    await expect(page.locator('[data-link-card]')).toHaveCount(4);
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'test-results/desktop-dark-list.png', fullPage: true });
});

test('theme reveal animates only the snapshot, preserves DOM and handles repeat clicks', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await boot(page);
    const result = await page.evaluate(async () => {
        const root = document.documentElement;
        const nav = document.querySelector('.category-nav-item');
        const card = document.querySelector('.link-card');
        const button = document.getElementById('theme-toggle');
        const start = document.startViewTransition.bind(document);
        let transition;
        let captures = 0;
        document.startViewTransition = callback => {
            captures++;
            transition = start(callback);
            return transition;
        };
        button.click();
        button.click();
        await transition.ready;
        const reveal = document.getAnimations().find(animation =>
            animation.effect?.pseudoElement === '::view-transition-new(root)');
        const during = {
            dark: root.classList.contains('dark'),
            cardTransition: getComputedStyle(card).transitionDuration,
            navTransition: getComputedStyle(nav).transitionDuration,
            revealDuration: reveal?.effect.getTiming().duration,
            // Color and shadow transitions are the expensive live-snapshot work.
            liveTransitions: document.getAnimations().filter(animation => animation instanceof CSSTransition).length
        };
        await transition.finished;
        await new Promise(resolve => requestAnimationFrame(resolve));
        const cleaned = !root.classList.contains('theme-transitioning');
        const restored = getComputedStyle(card).transitionDuration;
        button.click();
        await transition.finished;
        return { during, cleaned, restored, captures, sameNav: nav === document.querySelector('.category-nav-item'),
            sameCard: card === document.querySelector('.link-card'), darkAfterReturn: root.classList.contains('dark') };
    });
    expect(result.during).toEqual({ dark: true, cardTransition: '0s', navTransition: '0s', revealDuration: 620, liveTransitions: 0 });
    expect(result.cleaned).toBe(true);
    expect(result.restored).not.toBe('0s');
    expect(result.captures).toBe(2);
    expect(result.sameNav && result.sameCard).toBe(true);
    expect(result.darkAfterReturn).toBe(false);
    expect(errors).toEqual([]);
});

for (const mode of ['reduced-motion', 'unsupported']) {
    test(`theme fallback: ${mode}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'light', reducedMotion: mode === 'reduced-motion' ? 'reduce' : 'no-preference' });
        await boot(page);
        await page.evaluate(mode => {
            document.startViewTransition = mode === 'unsupported' ? undefined : () => { throw new Error('Should not capture'); };
        }, mode);
        await page.locator('#theme-toggle').click();
        await expect(page.locator('html')).toHaveClass(/dark/);
        await expect(page.locator('html')).not.toHaveClass(/theme-transitioning/);
    });
}

test('category pointer ordering preserves fixed navigation entries', async ({ page }) => {
    const saves = await boot(page);
    await drag(page, page.locator('.category-drag-handle').first(), page.locator('.category-nav-sortable').last(), { x: .5, y: .85 });
    expect(await page.locator('.category-nav-item').evaluateAll(items => items.map(item => item.dataset.category))).toEqual(['all', 'uncategorized', 'learn', 'empty', 'work']);
    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0].categories.map(category => category.id)).toEqual(['learn', 'empty', 'work']);
});

test('empty cloud data stays empty; dialogs contain focus; URL prefix is optional', async ({ page }) => {
    const saves = await boot(page, { links: [], categories: [] });
    expect(saves).toHaveLength(0);
    await expect(page.locator('#empty-state')).toBeVisible();
    await page.locator('#add-btn').click();
    await expect(page.locator('#link-title')).toBeFocused();
    await page.locator('#link-title').fill('Example');
    await page.locator('#link-url').fill('example.com');
    await page.locator('#link-form button[type="submit"]').click();
    await expect(page.locator('[data-link-card]')).toHaveCount(1);
    await expect(page.locator('#add-btn')).toBeFocused();
    expect(saves.at(-1).links[0].url).toBe('https://example.com');
    await page.locator('#search-input').fill('missing');
    await expect(page.locator('#empty-state h3')).toHaveText('没有找到匹配的链接');
});

test('mobile: touch handle, normal scrolling, overlay sidebar and no horizontal overflow', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const payload = data();
    payload.links.push(...Array.from({ length: 6 }, (_, i) => ({ id: `extra-${i}`, title: `参考资料 ${i + 1}`, url: `https://example.com/${i}`, categoryId: 'learn', createdAt: -i })));
    await boot(page, payload);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
    const scrollSession = await context.newCDPSession(page);
    await scrollSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 690 }] });
    await scrollSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: 420 }] });
    await scrollSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.locator('main').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator('.sort-ghost')).toHaveCount(0);
    await page.locator('#mobile-sidebar-toggle').tap();
    await expect(page.locator('.category-sidebar')).toHaveClass(/mobile-open/);
    await page.locator('[data-category="work"]').tap();
    await expect(page.locator('.category-sidebar')).not.toHaveClass(/mobile-open/);
    await page.locator('[data-view="list"]').tap();
    await cards(page).first().scrollIntoViewIfNeeded();
    const start = await cards(page).first().locator('.link-drag-handle').boundingBox();
    const end = await cards(page).nth(1).boundingBox();
    const session = await context.newCDPSession(page);
    const touch = (type, x, y) => session.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', start.x + start.width / 2, start.y + start.height / 2);
    await touch('touchMove', start.x + start.width / 2, start.y + start.height / 2 + 10);
    await expect(page.locator('.sort-ghost')).toHaveCount(1);
    await touch('touchMove', end.x + end.width / 2, end.y + end.height * .8);
    await page.waitForTimeout(100);
    await touch('touchEnd');
    await expect(page.locator('.sort-ghost')).toHaveCount(0);
    expect(await ids(cards(page))).toEqual(['b', 'a', 'c']);
    await context.close();
});

test('edge auto-scroll and pointer cancellation leave the original order intact', async ({ page }) => {
    const payload = data();
    payload.links = Array.from({ length: 80 }, (_, i) => ({ id: String(i), title: `Link ${i}`, url: `https://example.com/${i}`, categoryId: 'work', createdAt: 100 - i }));
    const saves = await boot(page, payload);
    const start = await cards(page).first().locator('.link-drag-handle').boundingBox();
    await page.mouse.move(start.x + 8, start.y + 8);
    await page.mouse.down();
    await page.mouse.move(start.x + 20, start.y + 20, { steps: 3 });
    await page.mouse.move(600, 990, { steps: 12 });
    await expect.poll(() => page.locator('main').evaluate(el => el.scrollTop)).toBeGreaterThan(100);
    await page.locator('#link-grid').dispatchEvent('lostpointercapture');
    await page.mouse.up();
    await expect(page.locator('.sort-ghost')).toHaveCount(0);
    expect(await ids(cards(page))).toEqual(payload.links.map(link => link.id));
    expect(saves).toHaveLength(0);
});

test('reduced motion still supports sorting and a no-op drop does not save', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const saves = await boot(page);
    const handle = cards(page).first().locator('.link-drag-handle');
    const rect = await handle.boundingBox();
    await page.mouse.move(rect.x + 8, rect.y + 8);
    await page.mouse.down();
    await page.mouse.move(rect.x + 16, rect.y + 8);
    await page.mouse.up();
    await expect(page.locator('.sort-ghost')).toHaveCount(0);
    expect(saves).toHaveLength(0);
    await drag(page, cards(page).first().locator('.link-drag-handle'), cards(page).last());
    expect(await ids(cards(page))).toEqual(['b', 'c', 'a']);
    await expect.poll(() => saves.length).toBe(1);
});

test('failed saves can be retried without losing local edits', async ({ page }) => {
    await boot(page);
    let fail = true;
    await page.route('**/api/data', route => route.fulfill({ status: fail ? 503 : 200, json: { ok: !fail } }));
    await cards(page).first().locator('.link-drag-handle').focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.locator('#sync-status')).toHaveText('同步失败 · 点击重试');
    expect(await ids(cards(page))).toEqual(['b', 'a', 'c']);
    fail = false;
    await page.locator('#sync-status').click();
    await expect(page.locator('#sync-status')).toHaveText('已同步到云端');
});
