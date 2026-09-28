import {test, expect} from '@playwright/test';
import fs from 'node:fs/promises';
import http from 'node:http';
import {REVEALED_KEY, HABIT_KEY} from '../../src/pagination-model.mjs';
import {pagerHtml, tableSegmentHtml, dashboardHtml} from '../../stories/dashboard-pagination-fixtures.mjs';

const model = await fs.readFile(new URL('../../src/pagination-model.mjs', import.meta.url), 'utf8');
const enhancer = await fs.readFile(new URL('../../src/dashboard-pagination.mjs', import.meta.url), 'utf8');
const css = await fs.readFile(new URL('../../src/dashboard-pagination.css', import.meta.url), 'utf8');

const inlineModule = model.replaceAll('export ', '') + '\n' + enhancer.replace(/^import.*$/mg, '').replaceAll('export ', '');

// Real Forgejo pages ship a standard responsive viewport meta tag; omitting it
// here isn't a neutral simplification: WebKit's mobile emulation renders a page
// with no viewport meta tag at a fixed 980px "desktop" layout width scaled down
// to fit the requested device viewport (confirmed via document.documentElement.
// clientWidth === 980 and window.devicePixelRatio === 0.38 rather than 1 without
// this tag), which puts every geometry-based assertion and simulated touch tap
// in this file in a different, scaled coordinate space than a real device.
function pageHtml(bodyHtml, {lang = 'en', extraCss = ''} = {}) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf8"><meta name="viewport" content="width=device-width, initial-scale=1">${extraCss ? `<style>${extraCss}</style>` : ''}<style>${css}</style></head>` +
    `<body>${bodyHtml}<script>${inlineModule}</script></body></html>`;
}

// A real http origin (not about:blank/setContent's opaque origin) so sessionStorage
// and localStorage behave exactly as they do for a real Forgejo page.
let server, base;
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const body = Buffer.from(url.searchParams.get('b') || '', 'base64').toString('utf8');
    // `ec` (base64) and `lang` are small deltas layered onto the normal single
    // server-side pageHtml() build — never put the large css/inlineModule
    // strings themselves into the URL (a full custom document that way blew
    // past the URL length limit and got silently truncated/rejected).
    const extraCss = Buffer.from(url.searchParams.get('ec') || '', 'base64').toString('utf8');
    const lang = url.searchParams.get('lang') || 'en';
    res.setHeader('Content-Type', 'text/html');
    res.end(pageHtml(body, {lang, extraCss}));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

async function prepare(page, bodyHtml) {
  await prepareWith(page, bodyHtml);
}

async function prepareWith(page, bodyHtml, {lang, extraCss} = {}) {
  const b = Buffer.from(bodyHtml, 'utf8').toString('base64');
  const params = new URLSearchParams({b});
  if (lang) params.set('lang', lang);
  if (extraCss) params.set('ec', Buffer.from(extraCss, 'utf8').toString('base64'));
  await page.goto(base + '/?' + params.toString());
}

async function centerRect(page) {
  return page.evaluate(() => {
    const toBox = (r) => ({x: r.x, y: r.y, width: r.width, height: r.height});
    return {
      prev: toBox(document.querySelector('.hgh-vpg-prev').getBoundingClientRect()),
      next: toBox(document.querySelector('.hgh-vpg-next').getBoundingClientRect()),
      docHeight: document.documentElement.scrollHeight,
    };
  });
}

// Simulates the real component's `changePage()`: it always empties `repos` before
// refetching, which makes `v-if="repos.length"` unmount and remount the whole
// `.ui.attached.table.segment` (pagination included) as a brand-new element — read
// directly from DashboardRepoList.vue's `changePage`/`searchRepos` methods.
async function vueChangePage(page, opts) {
  await page.evaluate((html) => {
    document.querySelector('#dashboard-repo-list .ui.attached.table.segment').outerHTML = html;
  }, tableSegmentHtml(opts));
}

test('a single page (finalPage 1, no pagination block at all) is a safe no-op', async ({page}) => {
  await prepare(page, dashboardHtml({page: 1, finalPage: 1}));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => enhanceDashboardPagination());
  await expect(page.locator('.hgh-vpg')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a pager with an extra non-anchor child (5 correct anchors, plus a future template addition like a badge/wrapper) is left completely untouched, not decorated with a guessed shape', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate(() => {
    // Same 5 anchors, correct classes — but classifyPager must reject the pager
    // outright because it now has a 6th child, exactly the class of future
    // Forgejo template change (a stray badge/wrapper) this guard exists for.
    const pager = document.querySelector('.ui.borderless.pagination.menu');
    pager.appendChild(document.createElement('span'));
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => enhanceDashboardPagination());
  await expect(page.locator('.hgh-vpg')).toHaveCount(0); // never decorated
  await expect(page.locator('.ui.borderless.pagination.menu > a.navigation')).toHaveCount(4); // native anchors untouched
  expect(errors).toEqual([]);
});

test('a pager inserted AFTER enhanceDashboardPagination() already ran (the real production order: Vue fetches async, so #dashboard-repo-list starts empty) is still decorated once the observer sees it', async ({page}) => {
  // Host present (Vue mounted) but the repo list hasn't fetched yet, so
  // `v-if="repos.length"` — and therefore the whole table.segment/pager — does
  // not exist in the DOM at enhance() time. This is the actual production
  // sequence; every other test in this file starts with the pager already
  // present, which only exercises the Vue-remount path, not first paint.
  const emptyDashboardHtml = `<div id="dashboard-repo-list" class="flex-container-sidebar"><div><div class="ui tab active list dashboard-repos">` +
    `<div class="ui top attached segment repos-search"></div></div></div></div>`;
  await prepare(page, emptyDashboardHtml);
  await page.evaluate(() => enhanceDashboardPagination());
  await expect(page.locator('.hgh-vpg')).toHaveCount(0);
  await page.evaluate((html) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.querySelector('.dashboard-repos').appendChild(wrapper.firstElementChild);
  }, tableSegmentHtml({page: 6, finalPage: 90}));
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-applied]')).toHaveCount(1);
  const content = await page.evaluate(() => getComputedStyle(document.querySelector('.hgh-vpg-prev'), '::before').content);
  expect(content).toBe('"‹ Previous"');
});

test('the grid layout wins the cascade against Fomantic-shaped `.ui.menu`/`.ui.pagination.menu`/`.ui.menu .item` rules loaded before it (real production risk: those framework rules are compound-class and would otherwise beat a single `.hgh-vpg` class)', async ({page}) => {
  // A minimal, deliberately adversarial stand-in for Fomantic UI's own menu CSS —
  // not the real stylesheet (not vendored here), but shaped exactly like it:
  // real Fomantic ships `.ui.menu{display:flex}` / `.ui.pagination.menu{...}` /
  // `.ui.menu .item{...}` at 2-3-class specificity, loaded before this module's
  // stylesheet in the real page. If dashboard-pagination.css ever regresses to a
  // bare `.hgh-vpg{display:grid}` (1 class), this stub — loaded first, exactly
  // like production — would win the cascade and this test would fail.
  const adversarialCss = '.ui.menu{display:flex;flex-wrap:wrap}.ui.pagination.menu{display:flex}.ui.menu .item{display:inline-block;padding:8px}';
  // Explicit wide viewport: this test is about cascade/specificity, not which
  // breakpoint layout applies — the narrow (<=479px) 2-row fallback legitimately
  // reports 2 columns, and every configured mobile project is <=440px wide.
  await page.setViewportSize({width: 800, height: 600});
  await prepareWith(page, dashboardHtml({page: 6, finalPage: 90}), {extraCss: adversarialCss});
  await page.evaluate(() => enhanceDashboardPagination());
  const layout = await page.evaluate(() => ({
    pagerDisplay: getComputedStyle(document.querySelector('.hgh-vpg')).display,
    columns: getComputedStyle(document.querySelector('.hgh-vpg')).gridTemplateColumns.split(' ').length,
  }));
  expect(layout.pagerDisplay).toBe('grid');
  expect(layout.columns).toBe(4);
});

test('a real Fomantic-shaped `.item` opacity transition never animates the initial hide (only the deliberate reveal fades) — the hidden rule must win the `transition` property itself, not just `opacity`', async ({page}) => {
  // Real Fomantic UI ships an opacity transition on `.item` for hover/disabled
  // fades (e.g. `transition: opacity .1s ease` or similar). CSS resolves the
  // `transition` property independently of `opacity`: our ID-scoped hidden rule
  // winning `opacity` does NOT automatically make it win `transition` too — if
  // our hidden rule didn't declare `transition` at all, this lower-specificity
  // framework rule would be the only one setting it, and the native default
  // opacity:1 -> our opacity:0 change would animate over the framework's
  // duration, flashing the "hidden" edges briefly visible on first paint.
  const adversarialCss = '.ui.menu .item{transition:opacity 300ms ease}';
  await prepareWith(page, dashboardHtml({page: 6, finalPage: 90}), {extraCss: adversarialCss});
  await page.evaluate(() => enhanceDashboardPagination());
  // Sample partway through the framework's 300ms duration — if `transition:none`
  // on our hidden rule were missing or overridden, this would read a fractional,
  // still-interpolating value (as an actual WebKit run against this exact shape
  // once observed: 0.847576) instead of the fully-settled hidden opacity.
  await page.waitForTimeout(80);
  const opacity = await page.evaluate(() => getComputedStyle(document.querySelector('.hgh-vpg-edge')).opacity);
  expect(opacity).toBe('0');
});

test('Russian locale renders localized ghost labels and landmark, not hardcoded English', async ({page}) => {
  await prepareWith(page, dashboardHtml({page: 6, finalPage: 90}), {lang: 'ru'});
  await page.evaluate((key) => sessionStorage.setItem(key, 'true'), REVEALED_KEY);
  await page.evaluate(() => enhanceDashboardPagination());
  const result = await page.evaluate(() => ({
    prev: getComputedStyle(document.querySelector('.hgh-vpg-prev'), '::before').content,
    next: getComputedStyle(document.querySelector('.hgh-vpg-next'), '::after').content,
    first: getComputedStyle(document.querySelector('.hgh-vpg-first'), '::after').content,
    last: getComputedStyle(document.querySelector('.hgh-vpg-last'), '::after').content,
    landmark: document.querySelector('.hgh-vpg').getAttribute('aria-label'),
    status: document.querySelector('[role="status"]').textContent,
  }));
  expect(result.prev).toBe('"‹ Пред."');
  expect(result.next).toBe('"След. ›"');
  expect(result.first).toBe('"Первая"');
  expect(result.last).toBe('"Последняя"');
  expect(result.landmark).toBe('Постраничная навигация');
  expect(result.status).toBe('Страница 6');
});

test('compact default: Previous/Next read as ghost text "‹ Previous" / "Next ›" (Vue\'s own anchors have no text, only an icon); First/Last/current stay invisible', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate(() => enhanceDashboardPagination());
  const content = await page.evaluate(() => ({
    prev: getComputedStyle(document.querySelector('.hgh-vpg-prev'), '::before').content,
    next: getComputedStyle(document.querySelector('.hgh-vpg-next'), '::after').content,
    prevIconDisplay: getComputedStyle(document.querySelector('.hgh-vpg-prev svg')).display,
  }));
  expect(content.prev).toBe('"‹ Previous"');
  expect(content.next).toBe('"Next ›"');
  expect(content.prevIconDisplay).toBe('none');
  const edgeOpacity = await page.locator('.hgh-vpg-edge').first().evaluate((el) => getComputedStyle(el).opacity);
  expect(edgeOpacity).toBe('0');
  await expect(page.locator('a.hgh-vpg-sr-only')).toHaveCount(1);
  await expect(page.locator('[role="status"]')).toHaveText('Page 6');
  const currentBox = await page.locator('a.hgh-vpg-sr-only').boundingBox();
  expect(currentBox.width).toBeLessThanOrEqual(1);
});

test('revealed First/Last read as ghost text "First" / "Last"', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate((key) => sessionStorage.setItem(key, 'true'), REVEALED_KEY);
  await page.evaluate(() => enhanceDashboardPagination());
  const content = await page.evaluate(() => ({
    first: getComputedStyle(document.querySelector('.hgh-vpg-first'), '::after').content,
    last: getComputedStyle(document.querySelector('.hgh-vpg-last'), '::after').content,
  }));
  expect(content.first).toBe('"First"');
  expect(content.last).toBe('"Last"');
});

test('the native anchors are never cloned or moved: identity survives enhancement and Vue\'s own callbacks fire exactly once each', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  // An already-revealed session makes First/Last genuinely clickable without any
  // timer/hover dependency, keeping this test about identity/callback-count only.
  await page.evaluate((key) => sessionStorage.setItem(key, 'true'), REVEALED_KEY);
  await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')];
    window.__anchors = anchors;
    window.__hits = {first: 0, previous: 0, next: 0, last: 0};
    const keys = ['first', 'previous', 'next', 'last'];
    anchors.forEach((a, i) => a.addEventListener('click', () => window.__hits[keys[i]]++));
    enhanceDashboardPagination();
  });
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1);
  await page.evaluate(() => { for (const a of window.__anchors) a.click(); });
  expect(await page.evaluate(() => window.__hits)).toEqual({first: 1, previous: 1, next: 1, last: 1});
  const identical = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')];
    return anchors.every((a, i) => a === window.__anchors[i]);
  });
  expect(identical).toBe(true);
});

test('hidden First/Last are genuinely non-interactive while compact: inert, pointer-events none, tabindex -1 (absent from the tab order)', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate(() => enhanceDashboardPagination());
  const edges = await page.locator('.hgh-vpg-edge').evaluateAll((els) => els.map((el) => ({
    inert: el.hasAttribute('inert'),
    pointerEvents: getComputedStyle(el).pointerEvents,
    tabIndex: el.tabIndex,
  })));
  for (const edge of edges) {
    expect(edge.inert).toBe(true);
    expect(edge.pointerEvents).toBe('none');
    expect(edge.tabIndex).toBe(-1);
  }
});

test('Previous/Next are real keyboard tab stops: Tab reaches Previous, Enter invokes Vue\'s own callback exactly once, no click event synthesized on anything else', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')];
    window.__hits = {first: 0, previous: 0, next: 0, last: 0};
    const keys = ['first', 'previous', 'next', 'last'];
    anchors.forEach((a, i) => a.addEventListener('click', () => window.__hits[keys[i]]++));
    enhanceDashboardPagination();
    document.querySelector('.hgh-vpg-prev').focus();
  });
  await expect(page.locator('.hgh-vpg-prev')).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__hits)).toEqual({first: 0, previous: 1, next: 0, last: 0});
  await page.keyboard.press(' ');
  expect(await page.evaluate(() => window.__hits)).toEqual({first: 0, previous: 2, next: 0, last: 0});
});

test('all four controls get role=button and a real, non-empty computed accessible name — verified against the actual accessibility tree, not just an attribute', async ({page, browserName}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate((key) => sessionStorage.setItem(key, 'true'), REVEALED_KEY);
  await page.evaluate(() => enhanceDashboardPagination());
  const attrs = await page.locator('.ui.borderless.pagination.menu > a.navigation').evaluateAll((els) => els.map((el) => el.getAttribute('role')));
  expect(attrs).toEqual(['button', 'button', 'button', 'button']);
  test.skip(browserName !== 'chromium', 'Accessibility.getFullAXTree is a Chromium DevTools Protocol domain');
  const client = await page.context().newCDPSession(page);
  const tree = await client.send('Accessibility.getFullAXTree');
  const named = tree.nodes.filter((n) => n.role?.value === 'button' && n.name?.value);
  const names = named.map((n) => n.name.value).sort();
  // Chromium includes CSS generated (`::before`/`::after`) content in accessible
  // name computation, so the computed name is the same visible ghost label a
  // sighted user sees ("‹ Previous" etc.) — not the native `:title` attribute,
  // which would only matter as a fallback if the ghost label were ever removed.
  expect(names).toEqual(['First', 'Last', 'Next ›', '‹ Previous']);
});

test('a disabled Previous (page 1) is excluded from the tab order and marked aria-disabled; Enter never invokes it', async ({page}) => {
  await prepare(page, dashboardHtml({page: 1, finalPage: 90}));
  await page.evaluate(() => {
    const prev = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')][1];
    window.__hits = 0;
    prev.addEventListener('click', () => window.__hits++);
    enhanceDashboardPagination();
  });
  const prev = page.locator('.hgh-vpg-prev');
  await expect(prev).toHaveAttribute('aria-disabled', 'true');
  expect(await prev.evaluate((el) => el.tabIndex)).toBe(-1);
  await page.evaluate(() => document.querySelector('.hgh-vpg-prev').dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})));
  expect(await page.evaluate(() => window.__hits)).toBe(0);
});

test('once revealed, First/Last become real keyboard tab stops (tabindex 0) and Enter invokes Vue\'s own callback exactly once', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate((key) => sessionStorage.setItem(key, 'true'), REVEALED_KEY);
  await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')];
    window.__hits = {first: 0, previous: 0, next: 0, last: 0};
    const keys = ['first', 'previous', 'next', 'last'];
    anchors.forEach((a, i) => a.addEventListener('click', () => window.__hits[keys[i]]++));
    enhanceDashboardPagination();
  });
  await expect(page.locator('.hgh-vpg-first')).toHaveJSProperty('tabIndex', 0);
  await expect(page.locator('.hgh-vpg-last')).toHaveJSProperty('tabIndex', 0);
  await page.evaluate(() => document.querySelector('.hgh-vpg-first').focus());
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__hits)).toEqual({first: 1, previous: 0, next: 0, last: 0});
});

test('a native pre-existing inert on Previous is honored: keyboard operability never overrides it, and restore returns the exact original attribute', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate(() => {
    const prev = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')][1];
    prev.setAttribute('inert', ''); // simulates some unrelated pre-existing reason
  });
  await page.evaluate((key) => sessionStorage.setItem(key, 'true'), REVEALED_KEY);
  await page.evaluate(() => enhanceDashboardPagination());
  const prevState = await page.evaluate(() => {
    const prev = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')][1];
    return {inert: prev.hasAttribute('inert'), tabIndex: prev.tabIndex};
  });
  expect(prevState.inert).toBe(true);
  expect(prevState.tabIndex).toBe(-1); // never upgraded to a real tab stop despite being visible/enabled
  await page.evaluate(() => restoreDashboardPagination());
  const restoredInert = await page.evaluate(() => [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')][1].hasAttribute('inert'));
  expect(restoredInert).toBe(true);
});

test('a sustained hover reveals First/Last without moving Previous, Next or the document height by a single pixel', async ({page}) => {
  // Comfortable margin, not the exact 2000ms boundary: the precise timing
  // contract (1999ms doesn't reveal, 2000ms does) is already proven
  // deterministically with real fake timers at the model layer
  // (pagination-model.test.mjs). Asserting the exact millisecond again here via
  // Playwright's page.clock (which keeps ticking in real time between explicit
  // runFor() calls) is flaky by ordinary CDP round-trip latency, unrelated to
  // production correctness — matching src/pagination.mjs's own spec convention.
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.clock.install();
  await page.evaluate(() => enhanceDashboardPagination());
  const before = await centerRect(page);
  await page.hover('.hgh-vpg');
  await page.clock.runFor(1000);
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(0);
  await page.clock.runFor(1000);
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1);
  const after = await centerRect(page);
  expect(after.prev).toEqual(before.prev);
  expect(after.next).toEqual(before.next);
  expect(after.docHeight).toBe(before.docHeight);
  const edgesInert = await page.locator('.hgh-vpg-edge').evaluateAll((els) => els.map((el) => el.hasAttribute('inert')));
  expect(edgesInert).toEqual([false, false]);
});

test('leaving the region cancels a pending reveal; re-entering later still needs the full delay', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.clock.install();
  await page.evaluate(() => enhanceDashboardPagination());
  await page.hover('.hgh-vpg');
  await page.clock.runFor(500);
  await page.mouse.move(0, 0); // leaves the whole region well before the delay
  await page.clock.runFor(3000); // well past the delay in total elapsed time, but canceled
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(0);
  await page.hover('.hgh-vpg');
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1);
});

test('reveal increments the local habit counter exactly once', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.clock.install();
  await page.evaluate(() => enhanceDashboardPagination());
  await page.hover('.hgh-vpg');
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem(HABIT_KEY))).toBe('1');
  expect(await page.evaluate(() => sessionStorage.getItem(REVEALED_KEY))).toBe('true');
});

test('after three prior habit reveals, a brand new session reveals on first hover with no delay and no trigger left active', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate((key) => localStorage.setItem(key, '3'), HABIT_KEY);
  await page.clock.install();
  await page.evaluate(() => enhanceDashboardPagination());
  await expect(page.locator('.hgh-vpg-more')).toHaveCount(2); // still built compact (session itself not yet revealed)
  await page.hover('.hgh-vpg');
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1); // no clock advance needed
});

test('an already-revealed session renders First/Last visible immediately with no trigger and no inert edges', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate((key) => sessionStorage.setItem(key, 'true'), REVEALED_KEY);
  await page.evaluate(() => enhanceDashboardPagination());
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1);
  await expect(page.locator('.hgh-vpg-more')).toHaveCount(0);
  const edgesInert = await page.locator('.hgh-vpg-edge').evaluateAll((els) => els.map((el) => el.hasAttribute('inert')));
  expect(edgesInert).toEqual([false, false]);
});

test('Tab reaches a "More pages" trigger; activating it reveals immediately without invoking Vue\'s changePage or moving focus away', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate(() => {
    const first = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')][0];
    window.__firstHits = 0;
    first.addEventListener('click', () => window.__firstHits++);
    enhanceDashboardPagination();
  });
  // Real Tab presses (not a programmatic `.focus()` call), so the browser's own
  // `:focus-visible` heuristic — which `makeTrigger`'s click handler now reads
  // to decide whether to blur — genuinely sees this as keyboard navigation,
  // not a scripted focus with no real input history behind it. Programmatically
  // focus the last repo link first (real repo-list `<a href>`s precede the
  // pager in DOM order, so a single Tab from the page start would land there,
  // not the trigger) — only the FINAL Tab that actually reaches the trigger
  // needs to be a genuine keypress, which it is here.
  await page.locator('.repo-owner-name-list a').last().focus();
  await page.keyboard.press('Tab');
  const trigger = page.locator('.hgh-vpg-more-start');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1);
  expect(await page.evaluate(() => window.__firstHits)).toBe(0);
  // The key accessibility boundary `:focus-visible` exists to preserve: a real
  // keyboard user's focus must never be yanked out from under them on
  // activation, unlike the touch/mouse path which deliberately blurs.
  await expect(trigger).toBeFocused();
});

test('a trigger retired mid-reveal (hover path, not already-revealed) becomes genuinely display:none and drops out of the tab order', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.clock.install();
  await page.evaluate(() => enhanceDashboardPagination());
  await page.hover('.hgh-vpg');
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1);
  const triggers = await page.locator('.hgh-vpg-more').evaluateAll((els) => els.map((el) => ({
    hidden: el.hasAttribute('hidden'),
    display: getComputedStyle(el).display,
  })));
  for (const t of triggers) {
    expect(t.hidden).toBe(true);
    expect(t.display).toBe('none'); // the real regression: display:flex was beating [hidden] before the CSS fix
  }
});

test('calling enhanceDashboardPagination twice does not double-wrap or double-listen; a restore/enhance cycle stays a clean single instance', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate(() => { enhanceDashboardPagination(); enhanceDashboardPagination(); });
  await expect(page.locator('.hgh-vpg-more')).toHaveCount(2);
  await page.clock.install();
  await page.hover('.hgh-vpg');
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => localStorage.getItem(HABIT_KEY))).toBe('1'); // not bumped twice by a duplicate listener
  await page.evaluate(() => { restoreDashboardPagination(); enhanceDashboardPagination(); });
  await expect(page.locator('.hgh-vpg')).toHaveCount(1);
  await expect(page.locator('.hgh-vpg-more')).toHaveCount(0); // fresh instance: already-revealed session, no trigger needed
});

test('restore returns the exact original DOM (identity + markup), and Vue\'s own attached listener still fires', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  const original = await page.evaluate(() => document.getElementById('dashboard-repo-list').outerHTML);
  await page.evaluate(() => {
    const next = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')][2];
    window.__hits = 0;
    window.__nextAnchor = next;
    next.addEventListener('click', () => window.__hits++);
    enhanceDashboardPagination();
    restoreDashboardPagination();
  });
  const restored = await page.evaluate(() => document.getElementById('dashboard-repo-list').outerHTML);
  expect(restored).toBe(original);
  await page.evaluate(() => window.__nextAnchor.click());
  expect(await page.evaluate(() => window.__hits)).toBe(1);
  const identical = await page.evaluate(() => {
    const next = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')][2];
    return next === window.__nextAnchor;
  });
  expect(identical).toBe(true);
});

test('a retained reference to a torn-down trigger button is inert after restore: its click listener was removed, not just the node', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  const before = await page.evaluate(() => {
    enhanceDashboardPagination();
    window.__staleTrigger = document.querySelector('.hgh-vpg-more-start');
    return window.__staleTrigger != null;
  });
  expect(before).toBe(true);
  await page.evaluate(() => restoreDashboardPagination());
  const originalAfterRestore = await page.evaluate(() => document.getElementById('dashboard-repo-list').outerHTML);
  // Retained reference outlives its removal from the DOM; clicking it must not
  // reveal/mutate the now-pristine restored native pager.
  await page.evaluate(() => window.__staleTrigger.click());
  const afterStaleClick = await page.evaluate(() => document.getElementById('dashboard-repo-list').outerHTML);
  expect(afterStaleClick).toBe(originalAfterRestore);
  await expect(page.locator('.hgh-vpg')).toHaveCount(0);
});

test('restore preserves a genuinely pre-existing native inert attribute instead of always clearing it', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate(() => {
    const first = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')][0];
    first.setAttribute('inert', ''); // simulate some unrelated pre-existing reason
    enhanceDashboardPagination();
    restoreDashboardPagination();
  });
  const stillInert = await page.evaluate(() => [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')][0].hasAttribute('inert'));
  expect(stillInert).toBe(true);
});

test('a pre-existing native `style` attribute on Previous is left completely untouched (the ghost label now lives in a plain `data-hgh-vpg-label` attribute, never `style`)', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate(() => {
    const prev = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')][1];
    prev.setAttribute('style', 'color: red ;');
  });
  await page.evaluate(() => enhanceDashboardPagination());
  const duringStyle = await page.evaluate(() =>
    [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')][1].getAttribute('style'));
  expect(duringStyle).toBe('color: red ;'); // untouched even while enhanced, not just after restore
  await page.evaluate(() => restoreDashboardPagination());
  const afterStyle = await page.evaluate(() =>
    [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')][1].getAttribute('style'));
  expect(afterStyle).toBe('color: red ;');
});

test('a Vue page-change remount (full teardown/rebuild of the table segment) is re-decorated automatically with no manual re-call, a pending timer on the old, now-detached pager never fires or bumps the habit counter, and the old node is fully torn down even though a lingering reference keeps it alive', async ({page}) => {
  // page 6 (not page 1): First/Previous must be enabled here, not `.disabled` —
  // makeKeyboardOperable's keydown handler reads `.disabled` live and returns
  // early before ever calling `el.click()`, so a disabled anchor's listener
  // being fired-and-ignored proves nothing about whether teardownPager actually
  // removed the listener (the disabled guard alone would explain zero hits).
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.clock.install();
  await page.evaluate(() => {
    enhanceDashboardPagination();
    // A lingering external reference (e.g. a test, or some other script) keeps
    // the old pager reachable after Vue detaches it, so teardown must be real
    // DOM cleanup (classes/attrs/listeners), not just "no longer tracked".
    window.__oldPager = document.querySelector('.ui.borderless.pagination.menu');
    window.__oldFirst = document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')[0];
    window.__oldFirstHits = 0;
    window.__oldFirst.addEventListener('click', () => window.__oldFirstHits++);
  });
  await expect(page.locator('.hgh-vpg-edge').first()).toHaveAttribute('inert', ''); // still inert while compact, regardless of page
  await page.hover('.hgh-vpg');
  await page.clock.runFor(1000); // armed, comfortably short of the 2000ms delay
  await vueChangePage(page, {page: 7, finalPage: 90});
  await page.waitForFunction(() => document.querySelector('.hgh-vpg[data-hgh-vpg-applied]') !== null);
  await page.clock.runFor(2000); // well past the original delay from the old, now-detached pager
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem(HABIT_KEY))).toBeNull();
  await expect(page.locator('.ui.borderless.pagination.menu > a.navigation.disabled')).toHaveCount(0);
  await expect(page.locator('.hgh-vpg-more')).toHaveCount(2); // exactly one fresh pair, not accumulated
  // The detached old pager itself: no leftover classes/attrs/inert, and its keydown
  // handler (added by makeKeyboardOperable) was removed by teardownPager's undo.
  const oldState = await page.evaluate(() => ({
    connected: window.__oldPager.isConnected,
    className: window.__oldPager.className,
    applied: window.__oldPager.hasAttribute('data-hgh-vpg-applied'),
    firstInert: window.__oldFirst.hasAttribute('inert'),
    firstClass: window.__oldFirst.className,
  }));
  expect(oldState.connected).toBe(false);
  expect(oldState.applied).toBe(false);
  expect(oldState.className).toBe('ui borderless pagination menu narrow tw-my-2');
  expect(oldState.firstInert).toBe(false);
  expect(oldState.firstClass).toBe('item navigation tw-py-1'); // enabled — not `.disabled` here
  // teardownPager removed the keydown listener too: First is enabled here, so if
  // the listener were still attached this dispatch would reach `el.click()` and
  // fire our own test listener; zero hits genuinely proves removal, not a
  // disabled-guard short-circuit.
  await page.evaluate(() => window.__oldFirst.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})));
  expect(await page.evaluate(() => window.__oldFirstHits)).toBe(0);
});

test('a setItem-throwing sessionStorage (e.g. private-mode policy) still keeps "revealed" across a Vue remount within the same page load, via the in-memory mirror', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.clock.install();
  await page.evaluate(() => {
    const real = window.sessionStorage.setItem.bind(window.sessionStorage);
    let calls = 0;
    window.sessionStorage.setItem = (key, value) => { calls++; if (calls === 1) throw new Error('quota/private-mode'); return real(key, value); };
    enhanceDashboardPagination();
  });
  await page.hover('.hgh-vpg');
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1);
  // The real sessionStorage write failed (first call threw), but the module's
  // own in-memory mirror still knows "revealed" — a fresh pager after a Vue
  // remount must reflect that immediately, not re-compact and demand another hover.
  await vueChangePage(page, {page: 7, finalPage: 90});
  await page.waitForFunction(() => document.querySelector('.hgh-vpg[data-hgh-vpg-applied]') !== null);
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1);
  await expect(page.locator('.hgh-vpg-more')).toHaveCount(0); // already revealed: no trigger needed on the fresh pager
});

test('a disabled-state transition from the last page (Last disabled) to a middle page (Last enabled) redecorates cleanly with no leftover inert/duplicate nodes', async ({page}) => {
  await prepare(page, dashboardHtml({page: 90, finalPage: 90}));
  await page.evaluate(() => enhanceDashboardPagination());
  await expect(page.locator('.ui.borderless.pagination.menu > a.navigation.disabled')).toHaveCount(2); // Next + Last
  await vueChangePage(page, {page: 45, finalPage: 90});
  await page.waitForFunction(() => document.querySelector('.hgh-vpg[data-hgh-vpg-applied]') !== null);
  await expect(page.locator('.ui.borderless.pagination.menu > a.navigation.disabled')).toHaveCount(0);
  await expect(page.locator('.hgh-vpg')).toHaveCount(1);
  await expect(page.locator('[role="status"]')).toHaveText('Page 45');
});

test('a pre-existing external session reveal flag (e.g. the classic pagination widget revealing first) is honored: no timer, no double habit bump', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.evaluate((keys) => {
    sessionStorage.setItem(keys.revealed, 'true');
    localStorage.setItem(keys.habit, '1'); // the other widget already bumped it once this browser
  }, {revealed: REVEALED_KEY, habit: HABIT_KEY});
  await page.clock.install();
  await page.evaluate(() => enhanceDashboardPagination());
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1);
  await page.hover('.hgh-vpg'); // arm() sees already-revealed and short-circuits; never re-bumps
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => localStorage.getItem(HABIT_KEY))).toBe('1');
});

test('reduced motion removes the edge fade transition on reveal (normal motion keeps it at 0.15s, proving the assertion has a real failing mode)', async ({browser}) => {
  const bodyHtml = dashboardHtml({page: 6, finalPage: 90});
  const b = Buffer.from(bodyHtml, 'utf8').toString('base64');
  const revealAndMeasure = async (page) => {
    await page.goto(base + '/?b=' + encodeURIComponent(b));
    await page.evaluate((key) => sessionStorage.setItem(key, 'true'), REVEALED_KEY);
    await page.evaluate(() => enhanceDashboardPagination());
    await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1);
    return page.locator('.hgh-vpg-edge').first().evaluate((el) => getComputedStyle(el).transitionDuration);
  };
  const reducedCtx = await browser.newContext({reducedMotion: 'reduce'});
  const reducedPage = await reducedCtx.newPage();
  const reducedDuration = await revealAndMeasure(reducedPage);
  await reducedCtx.close();
  expect(reducedDuration).toBe('0s');

  const normalCtx = await browser.newContext({reducedMotion: 'no-preference'});
  const normalPage = await normalCtx.newPage();
  const normalDuration = await revealAndMeasure(normalPage);
  await normalCtx.close();
  expect(normalDuration).toBe('0.15s'); // proves the reduced-motion rule actually did something
});

test('a coarse-pointer/no-hover (touch) context exposes the "more pages" trigger as a real, visibly discoverable button at rest — tapping it reveals First/Last immediately, without waiting the 2s hover delay and without invoking any Vue navigation anchor', async ({browser}) => {
  const touchCtx = await browser.newContext({hasTouch: true, isMobile: true, viewport: {width: 375, height: 700}});
  const touchPage = await touchCtx.newPage();
  await prepare(touchPage, dashboardHtml({page: 6, finalPage: 90}));
  await touchPage.evaluate(() => {
    enhanceDashboardPagination();
    window.__navHits = 0;
    for (const a of document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')) {
      a.addEventListener('click', () => window.__navHits++);
    }
  });
  // Without the viewport meta tag, WebKit renders at a scaled 980px layout
  // width instead of the real 375px device width, putting every geometry
  // assertion and simulated tap below in the wrong coordinate space.
  expect(await touchPage.evaluate(() => document.documentElement.clientWidth)).toBe(375);
  // Exposed for real (not just hit-testable): opacity/pointer-events at rest,
  // no hover/focus needed — this is what makes it discoverable to a touch user
  // at all, unlike the mouse-only :focus-visible-gated skip-link behavior.
  const trigger = touchPage.locator('.hgh-vpg-more-start');
  await expect.poll(() => trigger.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await expect.poll(() => trigger.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('auto');
  // docs/requirements.md: "Touch targets added by this skin target at least
  // 44x44 CSS px when space allows" — the pager's own row is shorter than
  // that, so height is real, not just a claimed CSS property value.
  // `Math.round` absorbs sub-pixel transform rounding noise (observed in
  // WebKit as 43.99999237060547 from the `translateY(-50%)` centering) — the
  // same real-geometry-tolerance convention this file's overflow assertions
  // already use, not a loosened requirement.
  const box = await trigger.evaluate((el) => el.getBoundingClientRect());
  expect(Math.round(box.width)).toBeGreaterThanOrEqual(44);
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
  await expect(touchPage.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(0);
  await trigger.tap();
  // Immediate — no page.clock/timer advance needed, unlike every hover-driven
  // reveal test in this file, since a tap on the trigger's own click listener
  // (shared with the keyboard path) reveals synchronously.
  await expect(touchPage.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1);
  await expect(touchPage.locator('.hgh-vpg-first[tabindex="0"]')).toHaveCount(1);
  expect(await touchPage.evaluate(() => window.__navHits)).toBe(0); // no Vue anchor was clicked
  // `retireTrigger()` defers hiding a trigger that's still `document.
  // activeElement` until it blurs — correct for keyboard, but a real touch tap
  // DOES focus the button in Chromium (confirmed empirically; WebKit does
  // not), and a still-visible, still-`pointer-events:auto` 44px trigger paints
  // ON TOP of the just-revealed First control (positioned descendants paint
  // over in-flow siblings) regardless of DOM order. Without `makeTrigger`'s
  // own touch-blur fix, this tap would silently land on the stranded trigger
  // again instead of ever reaching First.
  expect(await trigger.evaluate((el) => el.hidden)).toBe(true);
  await touchPage.locator('.hgh-vpg-first').tap();
  expect(await touchPage.evaluate(() => window.__navHits)).toBe(1); // First's own Vue listener fired exactly once
  await touchCtx.close();
});

for (const width of [320, 440, 640, 1280]) {
  test(`viewport ${width}px: zero horizontal overflow before and after reveal`, async ({page}) => {
    await page.setViewportSize({width, height: 800});
    await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
    await page.clock.install();
    await page.evaluate(() => enhanceDashboardPagination());
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.hover('.hgh-vpg');
    await page.clock.runFor(2000);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  });
}

test('a narrow (320px) embedded container inside a wide 1280px viewport never overflows its own box', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await prepare(page, `<div style="width:320px;overflow:hidden" id="narrow">${dashboardHtml({page: 6, finalPage: 90})}</div>`);
  await page.clock.install();
  await page.evaluate(() => enhanceDashboardPagination());
  await page.hover('.hgh-vpg');
  await page.clock.runFor(2000);
  const overflowed = await page.evaluate(() => {
    const box = document.getElementById('narrow');
    return box.scrollWidth > box.clientWidth;
  });
  expect(overflowed).toBe(false);
});

test('native pager works with the adapter never invoked: Vue-style click handlers fire untouched', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  const hits = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')];
    let n = 0;
    for (const a of anchors) a.addEventListener('click', () => n++);
    for (const a of anchors) a.click();
    return n;
  });
  expect(hits).toBe(4);
  await expect(page.locator('.hgh-vpg')).toHaveCount(0);
});

test('if the host itself (not just the pager) is ever detached — with NO follow-up mutation inside it at all — a bounded parent-level observer still notices and tears down any pagers tracked under it before an armed reveal timer can fire and corrupt shared storage', async ({page}) => {
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.clock.install();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => {
    enhanceDashboardPagination();
    const first = [...document.querySelectorAll('.ui.borderless.pagination.menu > a.navigation')][0];
    window.__first = first;
    window.__firstHits = 0;
    first.addEventListener('click', () => window.__firstHits++);
  });
  await page.hover('.hgh-vpg'); // arms the 2s reveal timer before the host is ever detached
  await page.clock.runFor(1000);
  await page.evaluate(() => {
    // Detach the host and do NOTHING else — no mutation follows inside the
    // now-dead subtree. The subtree observer (scoped to the host itself)
    // would never fire in this exact shape; only the separate parent-level
    // observer (watching host's own parent for host's removal) can notice it.
    document.getElementById('dashboard-repo-list').remove();
  });
  await page.clock.runFor(2000); // well past the original 2s delay armed before detachment
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
  const state = await page.evaluate(() => ({
    applied: window.__first.closest('.ui.borderless.pagination.menu').hasAttribute('data-hgh-vpg-applied'),
    firstClass: window.__first.className,
    firstInert: window.__first.hasAttribute('inert'),
  }));
  expect(state.applied).toBe(false); // pager decoration was actually stripped, not just abandoned
  expect(state.firstClass).toBe('item navigation tw-py-1');
  expect(state.firstInert).toBe(false);
  // The keydown listener was removed too: a synthetic Enter on the detached
  // anchor no longer reaches our handler (proves the listener is gone, not
  // just harmlessly inert).
  await page.evaluate(() => window.__first.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})));
  expect(await page.evaluate(() => window.__firstHits)).toBe(0);
  // The critical property: the armed timer must never have reached
  // controller.reveal() at all — not merely "applyRevealed() no-opped" (that
  // guard runs too late, since reveal() writes storage before invoking it).
  expect(await page.evaluate(() => localStorage.getItem(HABIT_KEY))).toBeNull();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), REVEALED_KEY)).toBeNull();
});

test('Russian locale at a real 320px viewport: revealed First/Last/Previous/Next fit with zero horizontal overflow', async ({page}) => {
  await page.setViewportSize({width: 320, height: 400});
  await prepareWith(page, dashboardHtml({page: 6, finalPage: 90}), {lang: 'ru'});
  await page.evaluate((key) => sessionStorage.setItem(key, 'true'), REVEALED_KEY);
  await page.evaluate(() => enhanceDashboardPagination());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('proof: measures exact before/after geometry and captures screenshots as test attachments', async ({page}, testInfo) => {
  // Side-effect-free by default: screenshots go under Playwright's own per-test
  // outputPath() (test-results/, already gitignored) and are attached to the
  // report — routine test runs never touch the tracked source tree.
  await prepare(page, dashboardHtml({page: 6, finalPage: 90}));
  await page.clock.install();
  await page.evaluate(() => enhanceDashboardPagination());
  const beforePath = testInfo.outputPath('proof-before.png');
  await page.screenshot({path: beforePath});
  await testInfo.attach('proof-before', {path: beforePath, contentType: 'image/png'});
  const before = await centerRect(page);
  await page.hover('.hgh-vpg');
  await page.clock.runFor(2000);
  await expect(page.locator('.hgh-vpg[data-hgh-vpg-revealed]')).toHaveCount(1);
  // page.clock only fakes JS-visible time; the CSS opacity transition on the
  // edges is driven by the real compositor clock and needs actual wall-clock
  // time to finish, or the "after" screenshot would capture it mid-fade.
  await page.waitForTimeout(250);
  const afterPath = testInfo.outputPath('proof-after.png');
  await page.screenshot({path: afterPath});
  await testInfo.attach('proof-after', {path: afterPath, contentType: 'image/png'});
  const after = await centerRect(page);
  expect(after.prev).toEqual(before.prev);
  expect(after.next).toEqual(before.next);
  expect(after.docHeight).toBe(before.docHeight);
});
