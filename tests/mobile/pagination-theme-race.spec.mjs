import {test, expect} from '@playwright/test';
import fs from 'node:fs/promises';

/**
 * FJ-53: skin.mjs's enhance() swaps the release theme <link> href (the same
 * stylesheet pagination.css/dashboard-pagination.css are bundled inside, via
 * skin.css's @import chain) and, on the very same synchronous pass, calls
 * enhancePagination()/enhanceDashboardPagination(). applyResponsiveLayout()
 * (src/pagination.mjs) measures real computed CSS to pick row-vs-wrap layout;
 * if that stylesheet is still being fetched (a version rollout, a cold cache,
 * a slow network), the very first measurement runs against whatever CSS
 * happens to already be in effect at that instant — here, no CSS at all yet,
 * so bare unstyled text, which this fixture's content measures wide enough
 * to wrongly call for the two-row wrap layout even in a comfortably wide
 * 900px container. Before the fix, nothing ever re-measures once the
 * stylesheet actually loads, so that wrong verdict is permanent until an
 * unrelated resize happens to fire the ResizeObserver.
 *
 * The fixed-height rule on the pager's real DOM parent (`.center.page.buttons`)
 * matches production: Forgejo's own base Fomantic UI stylesheet — always
 * loaded synchronously, never part of the swapped release theme link — already
 * gives that container a stable height before our own CSS ever arrives. Without
 * it, this test's from-scratch page (no base stylesheet at all) would let the
 * stylesheet's real load event change the parent's height by itself, which
 * would fire the same ResizeObserver as a side effect and mask the bug this
 * test exists to catch — proving the fix's own explicit re-measurement, not an
 * incidental height change, produces the correction.
 *
 * These tests drive the real skin.mjs boot() through Playwright route
 * interception (real source files, a real <link rel=stylesheet>, a real
 * deferred network response) — never the model/enhancer imported in isolation
 * the way tests/mobile/pagination.spec.mjs and
 * tests/mobile/dashboard-pagination.spec.mjs do, which never exercises
 * skin.mjs's own href-swap-then-measure sequencing at all.
 */
const base = 'https://theme-ready.test/git';
const MODULE_FILES = ['skin.mjs', 'core.mjs', 'mobile-chrome.mjs', 'list-options.mjs', 'repository-controls.mjs', 'universal-search.mjs', 'pagination.mjs', 'pagination-model.mjs', 'organization.mjs', 'dashboard-pagination.mjs'];
const paginationCss = await fs.readFile(new URL('../../src/pagination.css', import.meta.url), 'utf8');

// Real base/paginate.tmpl shape (First/Previous/windowed numbers/Next/Last),
// copied verbatim from tests/mobile/pagination.spec.mjs's own nativePagination()
// fixture (current page 6 of 90) so this exercises the identical real-world
// content shape already proven elsewhere in the suite to enhance and
// container-wrap correctly once CSS is genuinely in effect.
function nativePagination({current, total}) {
  const link = (page) => `/repo/issues?page=${page}`;
  const isFirst = current === 1, isLast = current === total;
  const hasPrev = current > 1, hasNext = current < total;
  const labels = {first: 'First', previous: 'Previous', next: 'Next', last: 'Last'};
  const nums = new Set([1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total));
  const sorted = [...nums].sort((a, b) => a - b);
  let pagesHtml = '';
  let prevNum = 0;
  for (const n of sorted) {
    if (prevNum && n - prevNum > 1) pagesHtml += `<a class="disabled item">...</a>`;
    pagesHtml += n === current ? `<a class="active item">${n}</a>` : `<a class="item" href="${link(n)}">${n}</a>`;
    prevNum = n;
  }
  return `<div class="center page buttons"><div class="ui borderless pagination menu">` +
    `<a class="${isFirst ? 'disabled ' : ''}item navigation" ${!isFirst ? `href="/repo/issues"` : ''}><span class="navigation_label">${labels.first}</span></a>` +
    `<a class="${!hasPrev ? 'disabled ' : ''}item navigation" ${hasPrev ? `href="${link(current - 1)}"` : ''}><span class="navigation_label">${labels.previous}</span></a>` +
    pagesHtml +
    `<a class="${!hasNext ? 'disabled ' : ''}item navigation" ${hasNext ? `href="${link(current + 1)}"` : ''}><span class="navigation_label">${labels.next}</span></a>` +
    `<a class="${isLast ? 'disabled ' : ''}item navigation" ${!isLast ? `href="${link(total)}"` : ''}><span class="navigation_label">${labels.last}</span></a>` +
    `</div></div>`;
}

// Real DashboardRepoList.vue shape (dashboard-pagination.mjs's own documented
// contract): exactly five anchors, no href, no CSS-geometry measurement at all —
// included alongside the classic pager to prove the fix's releaseCssBroken guard
// never regresses the Vue-owned pager, which settles independently of the
// stylesheet race this bug is actually about.
function vuePagination() {
  return `<div id="dashboard-repo-list"><div class="ui attached table segment">` +
    `<div class="ui borderless pagination menu narrow tw-my-2">` +
    `<a class="item navigation">First</a><a class="item navigation">Previous</a>` +
    `<a class="active item">3</a>` +
    `<a class="item navigation">Next</a><a class="item navigation">Last</a>` +
    `</div></div></div>`;
}

function html(theme = 'hypergithub-auto') {
  return `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8">` +
    `<style>.center.page.buttons{height:32px}</style></head>` +
    `<body><div style="width:900px">${nativePagination({current: 6, total: 90})}</div>${vuePagination()}` +
    `<script type="module" src="${base}/assets/hypergithub/9.9.9/skin.mjs"></script></body></html>`;
}

async function routeModulesAndHtml(page, {cssHandler}) {
  await page.route(`${base}/**`, async (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').at(-1);
    if (MODULE_FILES.includes(name)) {
      return route.fulfill({contentType: 'text/javascript', body: await fs.readFile(new URL('../../src/' + name, import.meta.url), 'utf8')});
    }
    if (url.pathname.endsWith('.css')) return cssHandler(route);
    return route.fulfill({contentType: 'text/html', body: html()});
  });
}

test('a release theme stylesheet delayed past the first enhancePagination() pass still settles the classic pager back into the correct unwrapped row layout, with no overflow and no resize', async ({page}) => {
  const cssRequests = [];
  let resolveCss;
  const cssReady = new Promise((resolve) => { resolveCss = resolve; });
  await routeModulesAndHtml(page, {
    cssHandler: async (route) => {
      cssRequests.push(route.request().url());
      await cssReady;
      return route.fulfill({contentType: 'text/css', body: paginationCss});
    },
  });

  // domcontentloaded fires once parsing (and the deferred module script that
  // runs synchronously before it) completes, but before a still-pending
  // dynamically-inserted <link rel=stylesheet> finishes loading — the exact
  // window the race lives in. Never waitUntil:'load', which would block on
  // the very network request this test is deliberately holding open.
  await page.goto(base + '/repo/issues', {waitUntil: 'domcontentloaded'});

  const nav = page.locator('.hgh-pagination');
  await expect(nav).toHaveCount(1, {message: 'enhancePagination() must already have run synchronously, before the stylesheet resolves'});
  expect(cssRequests).toHaveLength(1);

  // Reproduces the race: measured with bare unstyled text (no CSS loaded at
  // all yet), this fixture's content already reads wide enough to wrongly
  // call for the wrap layout even though the container is a comfortable
  // 900px wide — the exact "computing the wrap decision... against stale
  // geometry" failure mode FJ-53 describes.
  await expect(nav).toHaveAttribute('data-hgh-pg-wrap', 'true');

  // The Vue-owned pager doesn't measure CSS at all; it must decorate on this
  // same first pass regardless of the classic pager's stylesheet race.
  await expect(page.locator('#dashboard-repo-list .ui.borderless.pagination.menu[data-hgh-vpg-applied]')).toHaveCount(1);

  resolveCss();
  // The stylesheet's own real 'load' event, never a guessed delay: poll for
  // its rules actually being in effect (a rule pagination.css alone defines).
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.hgh-pg-center')).gap)).toBe('8px');

  // No resize of any kind between goto() and here, and the pager's real DOM
  // parent has a fixed height (see the module doc comment) so the stylesheet
  // load itself can never masquerade as one — this settles purely off the
  // stylesheet's own load event correcting the earlier wrong measurement.
  await expect(nav).not.toHaveAttribute('data-hgh-pg-wrap', 'true');
  const {scrollWidth, clientWidth} = await page.evaluate(() => {
    const el = document.querySelector('.hgh-pagination');
    return {scrollWidth: el.scrollWidth, clientWidth: el.clientWidth};
  });
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  // Settling must correct the existing pager in place, never rebuild it or
  // bounce the Vue pager's already-applied decoration.
  await expect(nav).toHaveCount(1);
  expect(cssRequests).toHaveLength(1);
  await expect(page.locator('#dashboard-repo-list .ui.borderless.pagination.menu[data-hgh-vpg-applied]')).toHaveCount(1);
});

test('a release theme stylesheet that fails to load leaves native pagination visible instead of permanently hiding it behind an unstyled/mismeasured compact pager', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await routeModulesAndHtml(page, {
    cssHandler: (route) => route.fulfill({status: 404, contentType: 'text/plain', body: 'not found'}),
  });

  await page.goto(base + '/repo/issues', {waitUntil: 'domcontentloaded'});

  const nativeMenu = page.locator('.page.buttons > .pagination.menu');
  await expect.poll(() => nativeMenu.evaluate((el) => el.hasAttribute('hidden'))).toBe(false);
  await expect(page.locator('.hgh-pagination')).toHaveCount(0);
  await expect(nativeMenu).toBeVisible();
  expect(pageErrors).toEqual([]);

  // Stays settled — no bounce/rebuild loop from the restore's own DOM mutation
  // re-triggering enhance() a second time.
  await page.waitForTimeout(200);
  await expect(page.locator('.hgh-pagination')).toHaveCount(0);
  await expect(nativeMenu).not.toHaveAttribute('hidden');
});
