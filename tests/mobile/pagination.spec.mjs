import {test, expect} from '@playwright/test';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const model = await fs.readFile(new URL('../../src/pagination-model.mjs', import.meta.url), 'utf8');
const enhancer = await fs.readFile(new URL('../../src/pagination.mjs', import.meta.url), 'utf8');
const css = await fs.readFile(new URL('../../src/pagination.css', import.meta.url), 'utf8');

const inlineModule = model.replaceAll('export ', '') + '\n' + enhancer.replace(/^import.*$/mg, '').replaceAll('export ', '');

// Builds native base/paginate.tmpl-shaped markup exactly as Forgejo renders it,
// including the real chevron icons, so child-order assertions are meaningful.
function nativePagination({current, total, params = '', hash = '', lang = 'en'}) {
  const q = params ? (params.startsWith('?') ? params : '?' + params) : '';
  const amp = params ? '&' + params.replace(/^\?/, '') : '';
  const frag = hash ? (hash.startsWith('#') ? hash : '#' + hash) : '';
  const link = (page) => `/repo/issues?page=${page}${amp}${frag}`;
  const isFirst = current === 1, isLast = current === total;
  const hasPrev = current > 1, hasNext = current < total;
  // Matches stories/Pagination.stories.js's Russian fixture exactly, so a
  // long-labels regression reproduced there reproduces identically here.
  const labels = lang === 'ru'
    ? {first: 'Первая', previous: 'Пред.', next: 'След.', last: 'Последняя'}
    : {first: 'First', previous: 'Previous', next: 'Next', last: 'Last'};
  // Windowed like Forgejo's real Paginater: first, ellipsis, a few around current, ellipsis, last.
  const nums = new Set([1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total));
  const sorted = [...nums].sort((a, b) => a - b);
  let pagesHtml = '';
  let prevNum = 0;
  for (const n of sorted) {
    if (prevNum && n - prevNum > 1) pagesHtml += `<a class="disabled item">...</a>`;
    pagesHtml += n === current
      ? `<a class="active item">${n}</a>`
      : `<a class="item" href="${link(n)}">${n}</a>`;
    prevNum = n;
  }
  const chevron = (dir) => `<svg class="octicon-chevron-${dir}" viewBox="0 0 16 16" width="16" height="16"></svg>`;
  return `<div class="center page buttons"><div class="ui borderless pagination menu">` +
    `<a class="${isFirst ? 'disabled ' : ''}item navigation" ${!isFirst ? `href="/repo/issues${q}${frag}"` : ''}>${chevron('left')}<span class="navigation_label">${labels.first}</span></a>` +
    `<a class="${!hasPrev ? 'disabled ' : ''}item navigation" ${hasPrev ? `href="${link(current - 1)}"` : ''}>${chevron('left')}<span class="navigation_label">${labels.previous}</span></a>` +
    pagesHtml +
    `<a class="${!hasNext ? 'disabled ' : ''}item navigation" ${hasNext ? `href="${link(current + 1)}"` : ''}><span class="navigation_label">${labels.next}</span>${chevron('right')}</a>` +
    `<a class="${isLast ? 'disabled ' : ''}item navigation" ${!isLast ? `href="${link(total)}"` : ''}><span class="navigation_label">${labels.last}</span>${chevron('right')}</a>` +
    `</div></div>`;
}

// A genuine cursor-based shape (e.g. an unknown-total listing): only Previous and
// Next are known, no First/Last/numbers exist because there is no total to derive
// them from safely.
function cursorPagination({hasPrev, hasNext, prevHref = '/repo/commits?before=abc', nextHref = '/repo/commits?after=def'}) {
  return `<div class="center page buttons"><div class="ui borderless pagination menu">` +
    `<a class="${!hasPrev ? 'disabled ' : ''}item navigation" ${hasPrev ? `href="${prevHref}"` : ''}><span class="navigation_label">Previous</span></a>` +
    `<a class="${!hasNext ? 'disabled ' : ''}item navigation" ${hasNext ? `href="${nextHref}"` : ''}><span class="navigation_label">Next</span></a>` +
    `</div></div>`;
}

function pageHtml(bodyHtml, {theme, head = ''} = {}) {
  const themeAttr = theme ? ` data-theme="${theme}"` : '';
  return `<!doctype html><html lang="en"${themeAttr}><head><meta charset="utf8">${head}<style>${css}</style></head>` +
    `<body>${bodyHtml}<script>${inlineModule}</script></body></html>`;
}

// A real http origin (not about:blank/setContent's opaque origin) so sessionStorage
// and localStorage behave exactly as they do for a real Forgejo page.
let server, base;
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const body = Buffer.from(url.searchParams.get('b') || '', 'base64').toString('utf8');
    const theme = url.searchParams.get('t') || undefined;
    const head = Buffer.from(url.searchParams.get('h') || '', 'base64').toString('utf8');
    res.setHeader('Content-Type', 'text/html');
    res.end(pageHtml(body, {theme, head}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

async function prepare(page, bodyHtml, {theme, head} = {}) {
  const b = Buffer.from(bodyHtml, 'utf8').toString('base64');
  let url = base + '/?b=' + encodeURIComponent(b);
  if (theme) url += '&t=' + encodeURIComponent(theme);
  if (head) url += '&h=' + encodeURIComponent(Buffer.from(head, 'utf8').toString('base64'));
  await page.goto(url);
}

async function centerRect(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('.hgh-pagination').getBoundingClientRect();
    const center = document.querySelector('.hgh-pg-center').getBoundingClientRect();
    const prev = document.querySelector('.hgh-pg-prev').getBoundingClientRect();
    const next = document.querySelector('.hgh-pg-next').getBoundingClientRect();
    const toBox = (r) => ({x: r.x, y: r.y, width: r.width, height: r.height});
    return {
      nav: toBox(nav), center: toBox(center), prev: toBox(prev), next: toBox(next),
      docHeight: document.documentElement.scrollHeight,
    };
  });
}

async function expectNoOverflow(page) {
  const {scrollWidth, clientWidth} = await page.evaluate(() => {
    const nav = document.querySelector('.hgh-pagination');
    return {scrollWidth: nav.scrollWidth, clientWidth: nav.clientWidth};
  });
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

test('compact default shows only Previous/Next text; no numbers, First or Last are visible', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.evaluate(() => enhancePagination());
  const nav = page.locator('.hgh-pagination');
  await expect(nav).toBeVisible();
  await expect(nav.locator('.hgh-pg-prev')).toBeVisible();
  await expect(nav.locator('.hgh-pg-next')).toBeVisible();
  const visibleText = await nav.locator('.hgh-pg-center').evaluate((el) => el.innerText.replace(/\s+/g, ' ').trim());
  expect(visibleText).toBe('Previous Next');
  const wingVisibility = await nav.locator('.hgh-pg-wing-items').evaluateAll((els) => els.map((e) => getComputedStyle(e).visibility));
  expect(wingVisibility).toEqual(['hidden', 'hidden']);
  await expect(nav.locator('.hgh-pg-edge').first()).not.toBeVisible();
  await expect(nav.locator('.hgh-pg-number').first()).not.toBeVisible();
});

test('current page is never rendered as a visible number, only optionally in an sr-only status', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pagination .active')).toHaveCount(0);
  const status = page.locator('.hgh-pg-sr-only');
  await expect(status).toHaveText('Page 6 of 90');
  const box = await status.boundingBox();
  expect(box.width).toBeLessThanOrEqual(1);
  expect(box.height).toBeLessThanOrEqual(1);
});

test('the sr-only status still says "of N" on the second-to-last page, where the Last control is suppressed (coincides with Next)', async ({page}) => {
  await prepare(page, nativePagination({current: 89, total: 90}));
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pg-edge').filter({hasText: 'Last'})).toHaveCount(0); // confirms Last really was suppressed here
  await expect(page.locator('.hgh-pg-sr-only')).toHaveText('Page 89 of 90');
});

test('a sustained 2s hover reveals wings without moving Previous, Next, the center control or the document height by a single pixel', async ({page}) => {
  // The exact 1999ms/2000ms boundary is already proven deterministically with
  // real fake timers at the model layer (pagination-model.test.mjs); asserting
  // it again here via Playwright's clock across a WebKit + parallel-worker CI
  // run is flaky by a few milliseconds of clock/event-loop slack unrelated to
  // production correctness. This test's job is the DOM/geometry contract: the
  // reveal must not move anything.
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  const before = await centerRect(page);
  await page.hover('.hgh-pagination');
  await page.clock.runFor(1000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(0);
  await page.clock.runFor(1000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  await expect(page.locator('.hgh-pg-wing-items').first()).toHaveCSS('visibility', 'visible');
  const after = await centerRect(page);
  expect(after.center).toEqual(before.center);
  expect(after.prev).toEqual(before.prev);
  expect(after.next).toEqual(before.next);
  expect(after.docHeight).toBe(before.docHeight);
});

test('leaving the region cancels a pending reveal; re-entering later still needs the full delay', async ({page}) => {
  // Comfortable margins around the 2s boundary: exact 1999/2000ms timing is
  // already covered deterministically at the model layer (pagination-model.test.mjs).
  // This proves the DOM wiring (pointerenter/pointerleave -> arm/cancel), not the
  // millisecond edge.
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  await page.hover('.hgh-pagination');
  await page.clock.runFor(500);
  await page.mouse.move(5, 5); // leaves the whole region well before 2s
  await page.clock.runFor(3000); // well past 2s of total elapsed time, but canceled
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(0);
  await page.hover('.hgh-pagination');
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
});

test('moving between child controls inside the region never cancels the pending reveal', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  await page.hover('.hgh-pg-prev');
  await page.clock.runFor(900);
  await page.hover('.hgh-pg-next'); // crosses a child boundary, still inside the region
  await page.clock.runFor(1100);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
});

test('a mouse pointerdown mid-hover (e.g. clicking a control) never resets the in-flight reveal countdown', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  await page.hover('.hgh-pagination');
  await page.clock.runFor(1500);
  await page.evaluate(() => {
    const nav = document.querySelector('.hgh-pagination');
    nav.dispatchEvent(new PointerEvent('pointerdown', {pointerType: 'mouse', bubbles: false}));
    nav.dispatchEvent(new PointerEvent('pointerup', {pointerType: 'mouse', bubbles: false}));
  });
  // If pointerdown had re-armed (reset) the timer, this would need a further
  // full 2000ms from the click, not 500ms from the original hover start.
  await page.clock.runFor(500);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
});

test('a touch pointerdown alone (no pointerenter) still arms the reveal, belt-and-suspenders for touch stacks that skip pointerenter', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  await page.evaluate(() => {
    document.querySelector('.hgh-pagination').dispatchEvent(new PointerEvent('pointerdown', {pointerType: 'touch', bubbles: false}));
  });
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
});

test('a touch long-press (contact held 2s without lifting) reveals; lifting before 2s cancels, and reveal never navigates', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  const before = page.url();
  // Playwright has no touch hold primitive; dispatch the same pointer events a
  // real touchscreen contact produces (pointerType: 'touch') to exercise the
  // identical pointerenter/pointerleave/pointerup wiring the mouse path uses.
  await page.evaluate(() => {
    const nav = document.querySelector('.hgh-pagination');
    nav.dispatchEvent(new PointerEvent('pointerenter', {pointerType: 'touch', bubbles: false}));
  });
  await page.clock.runFor(1000);
  await page.evaluate(() => {
    const nav = document.querySelector('.hgh-pagination');
    nav.dispatchEvent(new PointerEvent('pointerup', {pointerType: 'touch', bubbles: false}));
  });
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(0, {message: 'lifting contact before 2s must cancel'});

  await page.evaluate(() => {
    const nav = document.querySelector('.hgh-pagination');
    nav.dispatchEvent(new PointerEvent('pointerenter', {pointerType: 'touch', bubbles: false}));
  });
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1, {message: 'holding contact 2s must reveal'});
  expect(page.url()).toBe(before);
});

test('hidden wing items reject pointer clicks, are absent from the tab order, and never navigate', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.evaluate(() => enhancePagination());
  const numberCount = await page.locator('.hgh-pg-number').count();
  expect(numberCount).toBeGreaterThan(0);
  const before = page.url();
  await page.locator('.hgh-pg-number').first().click({force: true, timeout: 2000}).catch(() => {});
  await page.waitForTimeout(50);
  expect(page.url()).toBe(before);
  const tabbable = await page.evaluate(() => {
    const number = document.querySelector('.hgh-pg-number');
    return number.tabIndex >= 0 && number.closest('[inert]') === null;
  });
  expect(tabbable).toBe(false);
});

test('Tab reaches wing "More pages" triggers on both sides without hover; activating one reveals immediately without navigating or moving focus away', async ({page, browserName}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.evaluate(() => enhancePagination());
  await page.evaluate(() => { const s = document.createElement('button'); s.id = 'before-nav'; s.textContent = 'sentinel'; document.body.prepend(s); });
  await page.locator('#before-nav').focus();
  const order = [];
  let triggerHits = 0;
  for (let i = 0; i < 8 && triggerHits < 2; i++) {
    await page.keyboard.press('Tab');
    const cls = await page.evaluate(() => document.activeElement.className);
    order.push(cls);
    if (cls.includes('hgh-pg-more')) triggerHits++;
  }
  // Both "More pages" triggers are real <button> elements, tab-reachable in every
  // browser without hovering: the actual accessibility requirement.
  expect(triggerHits).toBe(2);
  if (browserName !== 'webkit') {
    // WebKit's documented default only tabs through form controls, not plain
    // <a> links (Safari's "Full Keyboard Access" off by default) — the exact
    // same native Previous/Next anchors Forgejo already renders would skip
    // identically today, unrelated to this enhancement. Chromium reflects the
    // W3C default (all interactive elements tabbable), asserted precisely here.
    expect(order).toEqual(['hgh-pg-more', 'item navigation hgh-pg-prev', 'item navigation hgh-pg-next', 'hgh-pg-more']);
  }
  // Focus must actually be on the trigger right now (not overshot past it) before
  // activating, or Enter wouldn't be exercising the keyboard-reveal path at all.
  const onTrigger = await page.evaluate(() => document.activeElement.className.includes('hgh-pg-more'));
  expect(onTrigger).toBe(true);
  const before = page.url();
  await page.keyboard.press('Enter');
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  expect(page.url()).toBe(before);
  const stillFocused = await page.evaluate(() => document.activeElement.className.includes('hgh-pg-more'));
  expect(stillFocused).toBe(true);
});

test('an already-revealed session (sessionStorage flag set) renders wings visible immediately, no trigger, no timer', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.evaluate(() => { sessionStorage.setItem(REVEALED_KEY, 'true'); enhancePagination(); });
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  await expect(page.locator('.hgh-pg-more')).toHaveCount(0);
  await expect(page.locator('.hgh-pg-wing-items').first()).toHaveCSS('visibility', 'visible');
});

test('reveal survives reload and stays visible for the rest of the tab session', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  await page.hover('.hgh-pagination');
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  await page.reload();
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  await expect(page.locator('.hgh-pg-more')).toHaveCount(0);
});

test('reveal increments the local habit counter exactly once per session despite repeated hovers', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  for (let i = 0; i < 3; i++) {
    await page.hover('.hgh-pagination');
    await page.clock.runFor(2000);
    await page.mouse.move(5, 5);
  }
  const count = await page.evaluate(() => localStorage.getItem(HABIT_KEY));
  expect(count).toBe('1');
});

test('after three prior habit reveals, a brand new session reveals on first hover with no delay', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  await page.evaluate(() => { localStorage.setItem(HABIT_KEY, '3'); enhancePagination(); });
  await page.hover('.hgh-pagination');
  await page.clock.runFor(0);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
});

test('a storage backend that throws on every call never breaks navigation or the reveal timer', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => {
    const boom = () => { throw new Error('storage disabled'); };
    Object.defineProperty(window, 'sessionStorage', {get: boom});
    Object.defineProperty(window, 'localStorage', {get: boom});
    enhancePagination();
  });
  await page.hover('.hgh-pagination');
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('with storage disabled, "already revealed" still survives a restore/enhance cycle within the same page (in-memory fallback), reavealing instantly with no trigger', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => {
    const boom = () => { throw new Error('storage disabled'); };
    Object.defineProperty(window, 'sessionStorage', {get: boom});
    Object.defineProperty(window, 'localStorage', {get: boom});
    enhancePagination();
  });
  await page.hover('.hgh-pagination');
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  // Simulate an htmx-style re-render of the same pagination within the same page load.
  await page.evaluate(() => { restorePagination(); enhancePagination(); });
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  await expect(page.locator('.hgh-pg-more')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('setItem-only failures (reads still work) never leave a stale real value shadowing a successful bump', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  await page.evaluate(() => {
    localStorage.setItem(HABIT_KEY, '2'); // one below the habit threshold, readable
    const realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === HABIT_KEY) throw new Error('quota exceeded');
      return realSetItem.call(this, key, value);
    };
    enhancePagination();
  });
  await page.hover('.hgh-pagination'); // this reveal's bump (2 -> 3) fails to persist to real storage
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem(HABIT_KEY))).toBe('2'); // real value is stale
  // A fresh session (new sessionStorage) must still see the effective count as 3,
  // not the stale readable "2", and reveal instantly with no delay.
  await page.evaluate(() => { sessionStorage.clear(); restorePagination(); enhancePagination(); });
  await page.hover('.hgh-pagination');
  await page.clock.runFor(0);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
});

test('a single page (no pagination block at all) is a safe no-op', async ({page}) => {
  await prepare(page, '<p>No pagination on a single page.</p>');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pagination')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('two pages on page 1: Next already reaches page 2, so no wing renders a redundant "2 Last" control', async ({page}) => {
  await prepare(page, nativePagination({current: 1, total: 2}));
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pg-prev')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.hgh-pg-next')).toHaveAttribute('href', '/repo/issues?page=2');
  await expect(page.locator('.hgh-pg-wing')).toHaveCount(0); // nothing left to ever reveal
  await expect(page.locator('.hgh-pg-more')).toHaveCount(0);
  const visibleText = await page.locator('.hgh-pg-center').evaluate((el) => el.innerText.replace(/\s+/g, ' ').trim());
  expect(visibleText).toBe('Previous Next');
});

test('merged edge labels read "First 1" and "46 Last", matching the spec examples exactly, with icons intact', async ({page}) => {
  // current=44 of 46: First/Previous and Last/Next stay distinct (unlike the
  // penultimate-page case), so both merges render for real without triggering
  // the separate Previous/Next-coincidence suppression.
  await prepare(page, nativePagination({current: 44, total: 46}));
  await page.evaluate(() => enhancePagination());
  const first = page.locator('.hgh-pg-edge').filter({hasText: 'First'});
  await expect(first).toHaveText('First1');
  const firstOrder = await first.evaluate((el) => [...el.children].map((c) => c.getAttribute('class') || c.tagName.toLowerCase()));
  expect(firstOrder).toEqual(['octicon-chevron-left', 'navigation_label', 'hgh-pg-edge-num']);
  const last = page.locator('.hgh-pg-edge').filter({hasText: 'Last'});
  await expect(last).toHaveText('46Last');
  const lastOrder = await last.evaluate((el) => [...el.children].map((c) => c.getAttribute('class') || c.tagName.toLowerCase()));
  expect(lastOrder).toEqual(['hgh-pg-edge-num', 'navigation_label', 'octicon-chevron-right']);
});

test('native href and extra filter query params survive unchanged after enhancement', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90, params: 'type=all&state=open'}));
  await page.evaluate(() => enhancePagination());
  const nextHref = await page.locator('.hgh-pg-next').getAttribute('href');
  expect(nextHref).toBe('/repo/issues?page=7&type=all&state=open');
  const prevHref = await page.locator('.hgh-pg-prev').getAttribute('href');
  expect(prevHref).toBe('/repo/issues?page=5&type=all&state=open');
});

test('a URL hash fragment on native hrefs survives enhancement unchanged, including on merged First/Last edges', async ({page}) => {
  // current=44 of 46 exercises the merged-edge path (First/1 and 46/Last),
  // not just the always-untouched center Previous/Next anchors.
  await prepare(page, nativePagination({current: 44, total: 46, params: 'type=all', hash: 'comments'}));
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pg-next')).toHaveAttribute('href', '/repo/issues?page=45&type=all#comments');
  await expect(page.locator('.hgh-pg-prev')).toHaveAttribute('href', '/repo/issues?page=43&type=all#comments');
  const first = page.locator('.hgh-pg-edge').filter({hasText: 'First'});
  await expect(first).toHaveAttribute('href', '/repo/issues?type=all#comments');
  const last = page.locator('.hgh-pg-edge').filter({hasText: 'Last'});
  await expect(last).toHaveAttribute('href', '/repo/issues?page=46&type=all#comments');
});

test('restore returns the exact original DOM node (identity) with a preattached listener still firing, and matches the pristine markup', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  const original = await page.evaluate(() => document.querySelector('.pagination.menu').outerHTML);
  await page.evaluate(() => {
    const nextAnchor = [...document.querySelectorAll('.pagination.menu a.navigation')].find((a) => a.textContent.includes('Next'));
    window.__hits = 0;
    window.__nextAnchor = nextAnchor;
    nextAnchor.addEventListener('click', (e) => { e.preventDefault(); window.__hits++; });
    enhancePagination();
    restorePagination();
  });
  const restored = await page.evaluate(() => document.querySelector('.pagination.menu').outerHTML);
  expect(restored).toBe(original);
  await page.locator('.pagination.menu a.navigation').filter({hasText: 'Next'}).click();
  const hits = await page.evaluate(() => window.__hits);
  expect(hits).toBe(1);
  const identical = await page.evaluate(() => {
    const nextAnchor = [...document.querySelectorAll('.pagination.menu a.navigation')].find((a) => a.textContent.includes('Next'));
    return nextAnchor === window.__nextAnchor;
  });
  expect(identical).toBe(true);
});

test('calling enhancePagination twice does not double-wrap; a restore/enhance cycle stays a clean single instance', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.evaluate(() => { enhancePagination(); enhancePagination(); });
  await expect(page.locator('.hgh-pagination')).toHaveCount(1);
  await page.evaluate(() => { restorePagination(); enhancePagination(); });
  await expect(page.locator('.hgh-pagination')).toHaveCount(1);
  await expect(page.locator('.pagination.menu')).toHaveCount(1);
});

test('reduced motion removes the wing fade transition', async ({browser}) => {
  const reducedContext = await browser.newContext({reducedMotion: 'reduce'});
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(base + '/?b=' + encodeURIComponent(Buffer.from(nativePagination({current: 6, total: 90}), 'utf8').toString('base64')));
  await reducedPage.evaluate(() => enhancePagination());
  const duration = await reducedPage.locator('.hgh-pg-wing-items').first().evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(duration).toBe('0s');
  await reducedContext.close();
});

for (const width of [320, 440]) {
  test(`mobile ${width}px: zero horizontal overflow and identical centered Previous/Next before and after reveal`, async ({page}) => {
    await page.setViewportSize({width, height: 800});
    await prepare(page, nativePagination({current: 6, total: 90}));
    await page.clock.install();
    await page.evaluate(() => enhancePagination());
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    const before = await centerRect(page);
    await page.hover('.hgh-pagination');
    await page.clock.runFor(2000);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    const after = await centerRect(page);
    expect(after.center).toEqual(before.center);
    expect(after.prev).toEqual(before.prev);
    expect(after.next).toEqual(before.next);
    expect(after.docHeight).toBe(before.docHeight); // reserved two-row grid: no vertical jump on reveal
  });
}

test('left and right wing columns end up the same pixel width even with asymmetric content', async ({page}) => {
  // The measured wrap layout (applyResponsiveLayout in pagination.mjs)
  // intentionally resets equalization once the row no longer fits, to avoid
  // overflow; this is the comfortably-wide-fits desktop behavior, covered
  // separately by the 320/440 overflow/center tests below.
  await page.setViewportSize({width: 1024, height: 800});
  await prepare(page, nativePagination({current: 2, total: 90}));
  const widths = await page.evaluate(() => {
    enhancePagination();
    const leftItems = document.querySelector('.hgh-pg-wing-left .hgh-pg-wing-items').getBoundingClientRect().width;
    const rightItems = document.querySelector('.hgh-pg-wing-right .hgh-pg-wing-items').getBoundingClientRect().width;
    const left = document.querySelector('.hgh-pg-wing-left').getBoundingClientRect().width;
    const right = document.querySelector('.hgh-pg-wing-right').getBoundingClientRect().width;
    return {left, right, leftItems, rightItems};
  });
  expect(widths.leftItems).toBeLessThan(widths.rightItems - 10); // fixture is genuinely asymmetric
  expect(Math.abs(widths.left - widths.right)).toBeLessThanOrEqual(1); // reserved columns match anyway
});

test('a genuine cursor-based Previous/Next-only shape still enhances to the compact centered pair, never a no-op', async ({page}) => {
  await prepare(page, cursorPagination({hasPrev: true, hasNext: true}));
  await page.evaluate(() => enhancePagination());
  const nav = page.locator('.hgh-pagination');
  await expect(nav).toHaveCount(1);
  await expect(page.locator('.hgh-pg-prev')).toHaveAttribute('href', '/repo/commits?before=abc');
  await expect(page.locator('.hgh-pg-next')).toHaveAttribute('href', '/repo/commits?after=def');
  // No total is knowable, so nothing forges First/Last/number destinations.
  await expect(page.locator('.hgh-pg-wing')).toHaveCount(0);
  await expect(page.locator('.hgh-pg-edge')).toHaveCount(0);
  await expect(page.locator('.hgh-pg-number')).toHaveCount(0);
});

test('a cursor-based one-edge variant (no earlier page) disables Previous but still exposes Next', async ({page}) => {
  await prepare(page, cursorPagination({hasPrev: false, hasNext: true}));
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pg-prev')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.hgh-pg-prev')).not.toHaveAttribute('href', /.+/);
  await expect(page.locator('.hgh-pg-next')).toHaveAttribute('href', '/repo/commits?after=def');
});

test('a cursor-based one-edge variant (no later page, end of results) disables Next but still exposes Previous, unchanged', async ({page}) => {
  await prepare(page, cursorPagination({hasPrev: true, hasNext: false, prevHref: '/repo/commits?before=xyz&type=all#top'}));
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pg-next')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.hgh-pg-next')).not.toHaveAttribute('href', /.+/);
  await expect(page.locator('.hgh-pg-prev')).toHaveAttribute('href', '/repo/commits?before=xyz&type=all#top');
});

test('a pending hover timer never fires after an htmx-style swap replaces the pagination region; the fresh region enhances cleanly with no habit bump', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => enhancePagination());
  await page.hover('.hgh-pagination');
  await page.clock.runFor(1000); // timer armed, not yet fired
  await page.evaluate((freshHtml) => {
    // Simulates htmx:afterSwap replacing the whole region with fresh native markup.
    document.querySelector('.center.page.buttons').outerHTML = freshHtml;
    enhancePagination(); // the real boot() loop re-runs this on every DOM mutation
  }, nativePagination({current: 6, total: 90}));
  await page.clock.runFor(2000); // well past the original 2s from the old, now-detached region
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(0);
  await expect(page.locator('.hgh-pagination')).toHaveCount(1); // exactly one clean new wrapper
  expect(await page.evaluate(() => localStorage.getItem(HABIT_KEY))).toBeNull();
  expect(errors).toEqual([]);
});


test('a temporarily detached-but-reused pagination region restores its exact original anchors and visibility on reinsertion', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pagination')).toHaveCount(1);

  const result = await page.evaluate(() => {
    const container = document.querySelector('.center.page.buttons');
    const parent = container.parentNode;
    const next = container.nextSibling;
    // Detach but keep a live reference — simulates a framework that temporarily removes a
    // node from the document during reconciliation rather than discarding it outright.
    container.remove();
    enhancePagination(); // the real boot() loop's mutation-driven re-run sees the now-detached
                         // menu/nav and tears down its state via cleanupDisconnected()
    parent.insertBefore(container, next); // reinsert the SAME node, as a reused-node framework would
    const menu = container.querySelector('.ui.borderless.pagination.menu');
    return {
      hidden: menu.hidden,
      prevPresent: !!menu.querySelector('a[href="/repo/issues?page=5"]'),
      nextPresent: !!menu.querySelector('a[href="/repo/issues?page=7"]'),
      wrapperCount: document.querySelectorAll('.hgh-pagination').length,
    };
  });
  expect(result.hidden).toBe(false); // native pager visible again, not stuck hidden forever
  expect(result.prevPresent).toBe(true); // original Previous anchor restored to its exact slot, not removed
  expect(result.nextPresent).toBe(true); // original Next anchor restored to its exact slot, not removed
  expect(result.wrapperCount).toBe(0); // our own wrapper was torn down (state cleaned up), not duplicated or leaked

  // Re-enhancing the reinserted, now-native-again markup works cleanly (idempotent).
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pagination')).toHaveCount(1);
  await expect(page.locator('.hgh-pg-prev')).toHaveAttribute('href', '/repo/issues?page=5');
  await expect(page.locator('.hgh-pg-next')).toHaveAttribute('href', '/repo/issues?page=7');
});

test('teardown restores a pre-existing hidden attribute on the native menu instead of unconditionally clearing it', async ({page}) => {
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.evaluate(() => { document.querySelector('.ui.borderless.pagination.menu').hidden = true; }); // some other script already hid it
  await page.evaluate(() => enhancePagination());
  await page.evaluate(() => restorePagination());
  const hidden = await page.locator('.ui.borderless.pagination.menu').evaluate((menu) => menu.hidden);
  expect(hidden).toBe(true); // restore returns the exact prior state, not a hardcoded false
});

test('a pager enhanced while its container was hidden equalizes wing widths before the user could ever see it, with zero visible shift on reveal', async ({page}) => {
  await page.setViewportSize({width: 1024, height: 800});
  // Genuinely asymmetric wings (same fixture as "left and right wing columns end up the same
  // pixel width even with asymmetric content" above): narrow "First 1" left wing, wide "3...90
  // Last" right wing — equalizing them is what keeps the center pair centered.
  await prepare(page, `<div id="wrapper" hidden>${nativePagination({current: 2, total: 90})}</div>`);
  await page.evaluate(() => enhancePagination()); // enhanced while #wrapper is display:none — wings measure 0-width here, so equalization is skipped
  await page.evaluate(() => { document.getElementById('wrapper').hidden = false; }); // now genuinely visible, still compact
  const measureOffset = () => page.evaluate(() => {
    const nav = document.querySelector('.hgh-pagination').getBoundingClientRect();
    const center = document.querySelector('.hgh-pg-center').getBoundingClientRect();
    return Math.abs((center.x + center.width / 2) - (nav.x + nav.width / 2));
  });
  // The decisive claim: correctly centered already, before any reveal interaction at all — a
  // visible corrective snap at reveal time (equalizing only then) would be its own regression,
  // not a fix. The ResizeObserver runs asynchronously off a layout pass, so poll for it briefly.
  await expect.poll(measureOffset, {timeout: 2000}).toBeLessThan(1);

  const before = await centerRect(page);
  await page.locator('.hgh-pg-more').first().focus(); // pointer-events:none by design; keyboard is the trigger's real activation path
  await page.keyboard.press('Enter');
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  const after = await centerRect(page);
  expect(after.center).toEqual(before.center); // zero movement through reveal, not just "close enough"
  expect(after.prev).toEqual(before.prev);
  expect(after.next).toEqual(before.next);
  expect(await measureOffset()).toBeLessThan(1); // still centered after reveal
});

test('two pagination regions on one page (e.g. top and bottom) reveal together and bump the habit counter only once total', async ({page}) => {
  const top = nativePagination({current: 6, total: 90});
  const bottom = nativePagination({current: 6, total: 90});
  await prepare(page, `<div id="top">${top}</div><div id="bottom">${bottom}</div>`);
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pagination')).toHaveCount(2);
  const regions = page.locator('.hgh-pagination');
  await regions.nth(0).hover();
  await page.clock.runFor(2000);
  // Both regions become revealed from a single hover on the first one, with no
  // focus change and without a second 2s wait for the other.
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(2);
  const triggerHidden = await page.locator('.hgh-pg-more').evaluateAll((els) => els.map((el) => el.hidden));
  expect(triggerHidden.every(Boolean)).toBe(true); // triggers remain in the DOM (restore fidelity) but are all hidden
  expect(await page.evaluate(() => localStorage.getItem(HABIT_KEY))).toBe('1');
});

test('long Russian labels and a six-digit page count fit at a real 320px viewport with zero overflow', async ({page}) => {
  await page.setViewportSize({width: 320, height: 400});
  await prepare(page, nativePagination({current: 500000, total: 999999, lang: 'ru'}));
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await page.hover('.hgh-pagination');
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
});

test('two regions sharing localStorage bump the habit counter only once even when sessionStorage is entirely unavailable for both', async ({page}) => {
  const top = nativePagination({current: 6, total: 90});
  const bottom = nativePagination({current: 6, total: 90});
  await prepare(page, `<div id="top">${top}</div><div id="bottom">${bottom}</div>`);
  await page.clock.install();
  await page.evaluate(() => {
    Object.defineProperty(window, 'sessionStorage', {get() { throw new Error('sessionStorage disabled'); }});
    enhancePagination();
  });
  const regions = page.locator('.hgh-pagination');
  await expect(regions).toHaveCount(2);
  await regions.nth(0).hover();
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem(HABIT_KEY))).toBe('1');
});

test('a cursor-based one-edge variant preserves the exact available href including extra query params and a fragment, and keeps the unavailable edge disabled with no href', async ({page}) => {
  await prepare(page, cursorPagination({
    hasPrev: false, hasNext: true,
    nextHref: '/repo/commits?before=abc&path=src%2Ffile.js#history',
  }));
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pg-prev')).toHaveAttribute('aria-disabled', 'true');
  const prevHref = await page.locator('.hgh-pg-prev').getAttribute('href');
  expect(prevHref).toBeNull();
  await expect(page.locator('.hgh-pg-next')).toHaveAttribute('href', '/repo/commits?before=abc&path=src%2Ffile.js#history');
});

for (const width of [640, 600]) {
  test(`${width}px viewport (the reported regression width) with long Russian labels and a six-digit page count never overflows before or after reveal, with the center pair and page height identical across the reveal`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await prepare(page, nativePagination({current: 500000, total: 999999, lang: 'ru'}));
    await page.clock.install();
    await page.evaluate(() => enhancePagination());
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    const before = await centerRect(page);
    await page.hover('.hgh-pagination');
    await page.clock.runFor(2000);
    await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    const after = await centerRect(page);
    expect(after.center).toEqual(before.center);
    expect(after.prev).toEqual(before.prev);
    expect(after.next).toEqual(before.next);
    expect(after.docHeight).toBe(before.docHeight);
  });
}

test('a 320px-wide embedded container inside a genuinely wide 1280px viewport never overflows, before or after reveal — proves this is container-width-aware, not just a bigger viewport breakpoint', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await prepare(page, `<div style="width:320px">${nativePagination({current: 500000, total: 999999, lang: 'ru'})}</div>`);
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  // The viewport here is 1280px — well past the old 479px media-query
  // breakpoint — and overflow contained inside the narrow div never reaches
  // document-level scrollWidth (it stays well within the wide viewport), so
  // only measuring the pagination region's own scrollWidth against its own
  // clientWidth (not window.innerWidth or the document) can catch it.
  await expect(page.locator('.hgh-pagination[data-hgh-pg-wrap]')).toHaveCount(1);
  await expectNoOverflow(page);
  const before = await centerRect(page);
  await page.hover('.hgh-pagination');
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  await expectNoOverflow(page);
  const after = await centerRect(page);
  expect(after.center).toEqual(before.center);
  expect(after.prev).toEqual(before.prev);
  expect(after.next).toEqual(before.next);
  expect(after.docHeight).toBe(before.docHeight);
});

test('a padded embedding container is measured by its content width, not its clientWidth (which includes padding) — a container that only looks wide enough never gets falsely treated as available', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  // Styles nav's real DOM parent (.center.page.buttons, the div native
  // paginate.tmpl markup wraps around .pagination.menu — nav is inserted as
  // its sibling, so this is the actual measured parent, not a wrapping div
  // one level up). clientWidth is 700px, but 150px of padding on each side
  // leaves only 400px of real room — just under the ~465px this fixture's
  // row layout needs. Using clientWidth alone would wrongly read 700px as
  // available and stay in the overflowing row layout.
  await prepare(page, `<style>.center.page.buttons{width:700px;padding:0 150px;box-sizing:border-box}</style>${nativePagination({current: 6, total: 90})}`);
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pagination[data-hgh-pg-wrap]')).toHaveCount(1);
  await expectNoOverflow(page);
});

test('resizing a wrapping container (not the browser viewport) recomputes wing widths fresh each cycle, never leaves a stale min-width from a wider pass, and disconnects its ResizeObserver on teardown', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await prepare(page, `<div id="box" style="width:900px">${nativePagination({current: 6, total: 90})}</div>`);
  await page.evaluate(() => {
    window.__disconnects = 0;
    const RealRO = window.ResizeObserver;
    window.ResizeObserver = class extends RealRO {
      disconnect() { window.__disconnects++; super.disconnect(); }
    };
    enhancePagination();
  });
  await expect(page.locator('.hgh-pagination[data-hgh-pg-wrap]')).toHaveCount(0);
  const wide = await page.evaluate(() => ({
    left: document.querySelector('.hgh-pg-wing-left').style.minWidth,
    right: document.querySelector('.hgh-pg-wing-right').style.minWidth,
  }));
  expect(wide.left).not.toBe('');
  expect(wide.left).toBe(wide.right);

  await page.evaluate(() => { document.getElementById('box').style.width = '160px'; });
  await page.waitForFunction(() => document.querySelector('.hgh-pagination').dataset.hghPgWrap === 'true');
  await expectNoOverflow(page);
  const narrow = await page.evaluate(() => ({
    left: document.querySelector('.hgh-pg-wing-left').style.minWidth,
    right: document.querySelector('.hgh-pg-wing-right').style.minWidth,
  }));
  expect(narrow.left).toBe('');
  expect(narrow.right).toBe('');
  // wing content was never revealed by hover/focus, so it must stay locked
  // out of interaction and the tab order through every layout change.
  await expect(page.locator('.hgh-pg-wing-items').first()).toHaveAttribute('inert', '');

  await page.evaluate(() => { document.getElementById('box').style.width = '900px'; });
  await page.waitForFunction(() => document.querySelector('.hgh-pagination').dataset.hghPgWrap === undefined);
  const restored = await page.evaluate(() => ({
    left: document.querySelector('.hgh-pg-wing-left').style.minWidth,
    right: document.querySelector('.hgh-pg-wing-right').style.minWidth,
  }));
  // Freshly recomputed, not just whatever the first wide pass happened to
  // leave behind — equal to each other and (for this unchanged content) equal
  // to the original wide measurement.
  expect(restored.left).toBe(restored.right);
  expect(restored.left).toBe(wide.left);

  await page.evaluate(() => restorePagination());
  expect(await page.evaluate(() => window.__disconnects)).toBe(1);
});

test('once revealed, shrinking the container past the wrap boundary keeps the wings visible (reveal never gets un-done by a layout-mode change) and never overflows', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await prepare(page, `<div id="box" style="width:900px">${nativePagination({current: 500000, total: 999999, lang: 'ru'})}</div>`);
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  await page.hover('.hgh-pagination');
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  await expectNoOverflow(page);

  await page.evaluate(() => { document.getElementById('box').style.width = '160px'; });
  await page.waitForFunction(() => document.querySelector('.hgh-pagination').dataset.hghPgWrap === 'true');
  // Reveal is a one-way session flag, independent of layout mode: shrinking
  // into the wrap boundary must never re-hide already-revealed wing content.
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  await expect(page.locator('.hgh-pg-wing-items').first()).toHaveCSS('visibility', 'visible');
  await expectNoOverflow(page);

  await page.evaluate(() => { document.getElementById('box').style.width = '900px'; });
  await page.waitForFunction(() => document.querySelector('.hgh-pagination').dataset.hghPgWrap === undefined);
  await expectNoOverflow(page);
});

test('with prefers-reduced-motion, resizing a container across the wrap boundary never reveals wings or lifts their inert lock', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.setViewportSize({width: 1280, height: 800});
  await prepare(page, `<div id="box" style="width:900px">${nativePagination({current: 6, total: 90})}</div>`);
  await page.evaluate(() => enhancePagination());
  await expect(page.locator('.hgh-pg-wing-items').first()).toHaveAttribute('inert', '');
  await page.evaluate(() => { document.getElementById('box').style.width = '150px'; });
  await page.waitForFunction(() => document.querySelector('.hgh-pagination').dataset.hghPgWrap === 'true');
  await expect(page.locator('.hgh-pg-wing-items').first()).toHaveAttribute('inert', '');
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(0);
  await expectNoOverflow(page);
});

test('proof: measures exact before/after geometry and captures screenshots as test attachments', async ({page}, testInfo) => {
  // Side-effect-free by default: screenshots + JSON go under Playwright's own
  // per-test outputPath() (test-results/, already gitignored) and are attached
  // to the report — routine `npm test`/`npm run test:mobile` runs never touch
  // the tracked source tree. Regenerating the canonical, committed evidence
  // under research/screenshots/pagination/ is a deliberate, explicit opt-in
  // (see the PAGINATION_PROOF_CAPTURE branch below), not automatic.
  await prepare(page, nativePagination({current: 6, total: 90}));
  await page.clock.install();
  await page.evaluate(() => enhancePagination());
  const beforePath = testInfo.outputPath('proof-before.png');
  await page.screenshot({path: beforePath});
  await testInfo.attach('proof-before', {path: beforePath, contentType: 'image/png'});
  const before = await centerRect(page);
  await page.hover('.hgh-pagination');
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-pagination[data-hgh-pg-revealed]')).toHaveCount(1);
  // page.clock only fakes JS-visible time (setTimeout/Date); the CSS opacity
  // transition on the wings is driven by the real compositor clock and needs
  // actual wall-clock time to finish, or the "after" screenshot would capture
  // it mid-fade instead of the settled revealed state.
  await page.waitForTimeout(250);
  const afterPath = testInfo.outputPath('proof-after.png');
  await page.screenshot({path: afterPath});
  await testInfo.attach('proof-after', {path: afterPath, contentType: 'image/png'});
  const after = await centerRect(page);
  expect(after.center).toEqual(before.center);
  expect(after.prev).toEqual(before.prev);
  expect(after.next).toEqual(before.next);
  expect(after.docHeight).toBe(before.docHeight);
  const proof = {
    capturedAt: new Date().toISOString(),
    project: testInfo.project.name,
    measured: {before, after},
    assertions: {
      centerUnchanged: JSON.stringify(after.center) === JSON.stringify(before.center),
      prevUnchanged: JSON.stringify(after.prev) === JSON.stringify(before.prev),
      nextUnchanged: JSON.stringify(after.next) === JSON.stringify(before.next),
      docHeightUnchanged: after.docHeight === before.docHeight,
    },
  };
  await testInfo.attach('proof.json', {body: JSON.stringify(proof, null, 2), contentType: 'application/json'});
  expect(proof.assertions.centerUnchanged).toBe(true);
  expect(proof.assertions.prevUnchanged).toBe(true);
  expect(proof.assertions.nextUnchanged).toBe(true);
  expect(proof.assertions.docHeightUnchanged).toBe(true);

  // Explicit opt-in only: regenerates the canonical, committed evidence under
  // research/screenshots/pagination/. Not part of routine test runs. Silently
  // skips on non-canonical projects (guarded below) to avoid parallel workers
  // racing to write the same file when the env var is set across all 4.
  if (process.env.PAGINATION_PROOF_CAPTURE === '1' && testInfo.project.name === 'chromium-440') {
    const relSegments = ['research', 'screenshots', 'pagination'];
    const outDir = path.join(process.cwd(), ...relSegments);
    await fs.mkdir(outDir, {recursive: true});
    await fs.copyFile(beforePath, path.join(outDir, 'proof-before.png'));
    await fs.copyFile(afterPath, path.join(outDir, 'proof-after.png'));
    // path.posix.join here (not path.join): the recorded path is a portable,
    // repo-relative identifier embedded in committed JSON, not a filesystem
    // path for this OS, so it must use forward slashes on every platform.
    await fs.writeFile(
      path.join(outDir, 'proof.json'),
      JSON.stringify({...proof, screenshots: {before: path.posix.join(...relSegments, 'proof-before.png'), after: path.posix.join(...relSegments, 'proof-after.png')}}, null, 2) + '\n',
    );
  }
});

// Regression (issue #6): the browser's implicit `[hidden]{display:none}` rule is a
// user-agent-origin default. Forgejo's own Fomantic `.ui.menu{display:...}` rule is
// author-origin, so it wins regardless of selector specificity the moment pagination.mjs
// sets `hidden` on the native menu — production observed getComputedStyle(display) ==
// 'inline-flex' on a menu with hidden=true. Reproduced here with that real competing
// rule (Fomantic's actual `.ui.menu{display:...}` shape, injected as extra <head> content
// ahead of pagination.css, exactly as production loads it) — not a naked hidden default,
// which would pass trivially either way.
const nativeMenuCascade = '<style>.ui.pagination.menu{display:inline-flex}</style>';

for (const theme of ['hypergithub-light', 'hypergithub-dark', 'hypergithub-auto']) {
  test(`hidden native pagination menu is actually not rendered despite the Fomantic cascade (${theme})`, async ({page}) => {
    await prepare(page, nativePagination({current: 6, total: 90}), {theme, head: nativeMenuCascade});
    await page.evaluate(() => enhancePagination());

    const nativeMenu = page.locator('.center.page.buttons > .ui.borderless.pagination.menu');
    await expect(nativeMenu).toHaveAttribute('hidden', '');
    // The signals that actually matter in production: nothing to paint, nothing to
    // hit-test, nothing exposed to assistive tech.
    expect(await nativeMenu.evaluate((el) => getComputedStyle(el).display)).toBe('none');
    expect(await nativeMenu.boundingBox()).toBeNull();
    expect(await nativeMenu.evaluate((el) => el.checkVisibility())).toBe(false);
    // AX tree directly: the original "First" link — relocated out of the native menu and
    // into the compact bar's now-inert wing (a sibling of the menu, not nested inside it;
    // wing-inert plus visibility:hidden is what removes it from the tree here) — is not
    // exposed by role+name at all.
    await expect(page.getByRole('link', {name: 'First', exact: true})).toHaveCount(0);

    // Exactly one compact Previous/Next pair renders, from the enhancer's own centered bar.
    await expect(page.locator('.hgh-pagination .hgh-pg-prev')).toBeVisible();
    await expect(page.locator('.hgh-pagination .hgh-pg-next')).toBeVisible();

    // The real production teardown path (skin.mjs's boot(), not this test) flips
    // `data-theme` off and only then calls restorePagination() — reproduced here in that
    // exact order, not just an isolated function call, so this proves the fix's scoping
    // survives the real "skin switched off" transition, not merely a JS-level API call.
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await page.evaluate(() => restorePagination());
    await expect(nativeMenu).not.toHaveAttribute('hidden');
    expect(await nativeMenu.evaluate((el) => getComputedStyle(el).display)).toBe('inline-flex');
    await expect(nativeMenu).toBeVisible();
    await expect(page.locator('.hgh-pagination')).toHaveCount(0);
    // The exact original anchor is back, restored to the AX tree by role+name.
    await expect(page.getByRole('link', {name: 'First', exact: true})).toHaveCount(1);
  });
}

test('a native menu without the hidden attribute is left completely alone, even under an active theme with the competing cascade present', async ({page}) => {
  // Pins the selector's `[hidden]` requirement: dropping it (e.g. a future edit widening
  // the rule to `.page.buttons>.pagination.menu{display:none!important}`) would force-hide
  // every classic pager unconditionally. No `enhancePagination()` call here — this is the
  // native menu exactly as Forgejo renders it, before any enhancement ever touches it.
  await prepare(page, nativePagination({current: 6, total: 90}), {theme: 'hypergithub-auto', head: nativeMenuCascade});
  const nativeMenu = page.locator('.center.page.buttons > .ui.borderless.pagination.menu');
  await expect(nativeMenu).not.toHaveAttribute('hidden');
  expect(await nativeMenu.evaluate((el) => getComputedStyle(el).display)).toBe('inline-flex');
  await expect(nativeMenu).toBeVisible();
  await expect(page.getByRole('link', {name: 'First', exact: true})).toHaveCount(1);
});

test('the hidden-source override is scoped to the classic .page.buttons wrapper and never reaches the Vue dashboard pager', async ({page}) => {
  await prepare(
    page,
    '<div id="dashboard-repo-list"><div class="ui borderless pagination menu" hidden><a class="item navigation" href="/x">Previous</a></div></div>',
    {theme: 'hypergithub-auto', head: nativeMenuCascade},
  );
  const vueMenu = page.locator('#dashboard-repo-list > .ui.borderless.pagination.menu');
  await expect(vueMenu).toHaveAttribute('hidden', '');
  // Not nested in `.page.buttons`, so the fix's !important selector never matches here —
  // this menu is exactly as exposed to the Fomantic cascade as it always was, untouched
  // by this change either way (organization.mjs/organization.css own its real behavior).
  expect(await vueMenu.evaluate((el) => getComputedStyle(el).display)).toBe('inline-flex');
});

test('the override is gated on the active skin: with the skin off (no matching data-theme), a hidden classic menu follows the native cascade instead of being force-hidden', async ({page}) => {
  // No `data-theme` at all here — the real "skin off" state. `syncReleaseStyles()` also
  // disables the whole stylesheet `<link>` in that state, so this is defense in depth
  // against a cached/still-enabled stylesheet, not the primary off switch.
  await prepare(page, '<div class="center page buttons"><div class="ui borderless pagination menu" hidden></div></div>', {head: nativeMenuCascade});
  const menu = page.locator('.center.page.buttons > .ui.borderless.pagination.menu');
  await expect(menu).toHaveAttribute('hidden', '');
  // With the skin's `data-theme` absent, our rule never matches; Fomantic's own cascade is
  // exactly what production showed before this fix existed.
  expect(await menu.evaluate((el) => getComputedStyle(el).display)).toBe('inline-flex');
});
