/** #88: the revealed First/Last links must keep their accessible names in the narrow wrap layout.
 *  Reads Chromium's real computed accessibility tree over CDP (Accessibility.getPartialAXTree) from the
 *  production enhancer + production pagination.css; textContent/innerText prove nothing here because
 *  display:none text is still in textContent but absent from the accessibility tree. */
import {test, expect} from '@playwright/test';
import fs from 'node:fs/promises';
import http from 'node:http';
import {applyAppearance} from './organization-proof.mjs';

const model = await fs.readFile(new URL('../../src/pagination-model.mjs', import.meta.url), 'utf8');
const enhancer = await fs.readFile(new URL('../../src/pagination.mjs', import.meta.url), 'utf8');
const css = await fs.readFile(new URL('../../src/pagination.css', import.meta.url), 'utf8');
const inlineModule = model.replaceAll('export ', '') + '\n' + enhancer.replace(/^import.*$/mg, '').replaceAll('export ', '');

const LABELS = {
  en: {first: 'First', previous: 'Previous', next: 'Next', last: 'Last'},
  ru: {first: 'Первая', previous: 'Пред.', next: 'След.', last: 'Последняя'},
};

// Forgejo's base/paginate.tmpl shape: the chevrons are aria-hidden, the only text is .navigation_label.
function nativePagination({current, total, lang = 'en', edgeAriaLabels = {}, mergeable = true}) {
  const l = LABELS[lang];
  const link = (n) => `/repo/issues?page=${n}`;
  const chevron = (dir) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${dir === 'left' ? 'M10.5 3 5 8l5.5 5' : 'M5.5 3 11 8l-5.5 5'}"/></svg>`;
  const aria = (key) => (edgeAriaLabels[key] ? ` aria-label="${edgeAriaLabels[key]}"` : '');
  const nums = [...new Set([1, total, current - 2, current - 1, current, current + 1, current + 2].filter((n) => n >= 1 && n <= total))].sort((a, b) => a - b);
  let pages = '', prevNum = 0;
  for (const n of nums) {
    if (prevNum && n - prevNum > 1) pages += '<a class="disabled item">...</a>';
    pages += n === current ? `<a class="active item">${n}</a>` : `<a class="item" href="${link(n)}${!mergeable && (n === 1 || n === total) ? '&x=1' : ''}">${n}</a>`;
    prevNum = n;
  }
  return `<div class="center page buttons"><div class="ui borderless pagination menu">` +
    `<a class="item navigation" href="/repo/issues"${aria('first')}>${chevron('left')}<span class="navigation_label">${l.first}</span></a>` +
    `<a class="item navigation" href="${link(current - 1)}">${chevron('left')}<span class="navigation_label">${l.previous}</span></a>` +
    pages +
    `<a class="item navigation" href="${link(current + 1)}"><span class="navigation_label">${l.next}</span>${chevron('right')}</a>` +
    `<a class="item navigation" href="${link(total)}"${aria('last')}><span class="navigation_label">${l.last}</span>${chevron('right')}</a>` +
    `</div></div>`;
}

let server, base;
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const body = Buffer.from(new URL(req.url, 'http://x').searchParams.get('b') || '', 'base64').toString('utf8');
    const lang = new URL(req.url, 'http://x').searchParams.get('l') || 'en';
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html lang="${lang}"><head><meta charset="utf8"><style>${css}</style></head><body>${body}<script>${inlineModule}</script></body></html>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

async function open(page, html, lang = 'en') {
  await page.goto(`${base}/?l=${lang}&b=${encodeURIComponent(Buffer.from(html, 'utf8').toString('base64'))}`);
}

/** Chromium's computed accessibility node (role, name, ignored) for the element matching `selector`. */
async function axNode(cdp, selector) {
  const {root} = await cdp.send('DOM.getDocument', {depth: 0});
  const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector});
  const {nodes} = await cdp.send('Accessibility.getPartialAXTree', {nodeId, fetchRelatives: false});
  const node = nodes[0];
  return {role: node.role?.value ?? null, name: node.name?.value ?? '', ignored: Boolean(node.ignored)};
}

const rects = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.hgh-pagination, .hgh-pagination a')].map((el, i) => {
  const r = el.getBoundingClientRect();
  return [`${i}:${el.className}`, {x: r.x, y: r.y, width: r.width, height: r.height}];
})));

const FIRST = '.hgh-pg-wing-left a.hgh-pg-edge';
const LAST = '.hgh-pg-wing-right a.hgh-pg-edge';

/** Opens the production enhancer on `html` at `width` with a paused fake clock, so dwell time advances only through runFor. */
async function enhanced(page, {width, html, lang = 'en', scheme = 'light'}) {
  await page.setViewportSize({width, height: 900});
  await open(page, html, lang);
  await applyAppearance(page, {scheme, motion: 'no-preference'});
  await page.clock.install({time: 0});
  await page.clock.pauseAt(100);
  await page.evaluate(() => enhancePagination());
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Accessibility.enable');
  await cdp.send('DOM.enable');
  return cdp;
}

async function dwell(page) {
  await page.hover('.hgh-pagination');
  await page.clock.runFor(1999);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
}

const scenarios = [
  {title: 'merged (page 1 / last page folded into the edge link)', markup: {current: 6, total: 90}},
  {title: 'unmerged (edge link carries only its native label)', markup: {current: 6, total: 90, mergeable: false}},
];

for (const {title, markup} of scenarios) {
  for (const width of [320, 360, 390, 440]) {
    for (const scheme of ['light', 'dark']) {
      test(`${title} ${width}px ${scheme}: revealed First/Last expose computed accessible names, hidden ones stay inert, nothing moves`, async ({page, browserName}) => {
        test.skip(browserName !== 'chromium', 'computed accessibility tree is read over the Chromium DevTools protocol');
        const cdp = await enhanced(page, {width, html: nativePagination(markup), scheme});
        await expect(page.locator('.hgh-pagination[data-hgh-pg-wrap]')).toHaveCount(1);

        // Before the reveal the edge links are not in the accessibility tree, not focusable, not hit-testable.
        for (const selector of [FIRST, LAST]) {
          expect((await axNode(cdp, selector)).ignored, `${selector} hidden before reveal`).toBe(true);
          await page.locator(selector).evaluate((el) => el.focus());
          expect(await page.evaluate(() => document.activeElement?.className ?? '')).not.toContain('hgh-pg-edge');
          const hit = await page.locator(selector).evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2).includes(el); });
          expect(hit, `${selector} hit-testable before reveal`).toBe(false);
        }
        await expect(page.locator('.hgh-pg-wing-items').first()).toHaveAttribute('inert', '');
        const before = await rects(page);

        await dwell(page);

        const first = await axNode(cdp, FIRST), last = await axNode(cdp, LAST);
        expect({role: first.role, ignored: first.ignored}).toEqual({role: 'link', ignored: false});
        expect({role: last.role, ignored: last.ignored}).toEqual({role: 'link', ignored: false});
        if (markup.mergeable === false) {
          expect(first.name).toBe('First');
          expect(last.name).toBe('Last');
        } else {
          // The folded page number stays part of the name exactly as in the unwrapped desktop layout; it must not replace the label.
          expect(first.name).toMatch(/\bFirst\b/);
          expect(last.name).toMatch(/\bLast\b/);
        }
        const snapshot = await page.locator('.hgh-pagination').ariaSnapshot();
        expect(snapshot).toContain(`- link "${first.name}"`);
        expect(snapshot).toContain(`- link "${last.name}"`);

        expect(await rects(page)).toEqual(before); // revealing and naming moved no link or the nav by a single pixel
        const {scrollWidth, clientWidth} = await page.evaluate(() => ({scrollWidth: document.querySelector('.hgh-pagination').scrollWidth, clientWidth: document.querySelector('.hgh-pagination').clientWidth}));
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
        // The name comes from visually hidden native text: it must paint nothing and take no space.
        const label = await page.locator(`${FIRST} .navigation_label`).evaluate((el) => { const r = el.getBoundingClientRect(); return {w: r.width, h: r.height, display: getComputedStyle(el).display}; });
        expect(label.display).not.toBe('none');
        expect(label.w).toBeLessThanOrEqual(1);
        expect(label.h).toBeLessThanOrEqual(1);
      });
    }
  }
}

test('the narrow accessible names equal the unwrapped desktop names for the same markup', async ({page, browser, browserName}) => {
  test.skip(browserName !== 'chromium', 'computed accessibility tree is read over the Chromium DevTools protocol');
  const names = async (width) => {
    const context = await browser.newContext();
    const tab = await context.newPage();
    const cdp = await enhanced(tab, {width, html: nativePagination({current: 6, total: 90})});
    await dwell(tab);
    const wrapped = await tab.locator('.hgh-pagination[data-hgh-pg-wrap]').count();
    const result = {wrapped, first: (await axNode(cdp, FIRST)).name, last: (await axNode(cdp, LAST)).name};
    await context.close();
    return result;
  };
  const wide = await names(1280), narrow = await names(320);
  expect([wide.wrapped, narrow.wrapped]).toEqual([0, 1]);
  expect(wide.first).toMatch(/\bFirst\b/);
  expect(narrow).toEqual({...wide, wrapped: 1});
});

test('native localized labels name the links (Russian) and a pre-existing aria-label keeps ownership', async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'computed accessibility tree is read over the Chromium DevTools protocol');
  const cdp = await enhanced(page, {width: 320, html: nativePagination({current: 500000, total: 999999, lang: 'ru', mergeable: false, edgeAriaLabels: {last: 'К последней странице'}}), lang: 'ru'});
  await expect(page.locator('.hgh-pagination[data-hgh-pg-wrap]')).toHaveCount(1);
  await dwell(page);
  expect((await axNode(cdp, FIRST)).name).toBe('Первая');
  expect((await axNode(cdp, LAST)).name).toBe('К последней странице');
  await expect(page.locator(LAST)).toHaveAttribute('aria-label', 'К последней странице');
  await expect(page.locator(FIRST)).not.toHaveAttribute('aria-label', /.*/);
});

test('restorePagination returns the native First/Last anchors byte-for-byte, labels included', async ({page}) => {
  await page.setViewportSize({width: 320, height: 900});
  await open(page, nativePagination({current: 6, total: 90}));
  const original = await page.locator('.pagination.menu').evaluate((el) => el.outerHTML);
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  await page.hover('.hgh-pagination');
  await page.clock.runFor(2000);
  await page.evaluate(() => restorePagination());
  await expect(page.locator('.hgh-pagination')).toHaveCount(0);
  expect(await page.locator('.pagination.menu').evaluate((el) => el.outerHTML)).toBe(original);
  expect(await page.locator('.pagination.menu').evaluate((el) => el.hidden)).toBe(false);
});

test('Storybook narrow revealed story exposes First/Last in the computed accessibility tree', async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'computed accessibility tree is read over the Chromium DevTools protocol');
  await page.setViewportSize({width: 320, height: 900});
  await page.goto('/iframe.html?id=screens-pagination--mobile-320-revealed-names&viewMode=story');
  await expect(page.locator('.hgh-pagination[data-hgh-pg-wrap][data-hgh-pg-revealed]')).toHaveCount(1);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Accessibility.enable');
  await cdp.send('DOM.enable');
  const first = await axNode(cdp, FIRST), last = await axNode(cdp, LAST);
  expect(first.ignored || last.ignored).toBe(false);
  expect(first.name).toMatch(/\bFirst\b/);
  expect(last.name).toMatch(/\bLast\b/);
});
