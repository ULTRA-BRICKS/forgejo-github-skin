import {test, expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {openNativeFixture, exposeModules} from './native-module-fixture.mjs';

// Forgejo 16.0.6's own mounted Vue repository list on the organization dashboard, with its exact native
// rules (tests/fixtures/forgejo-16.0.6/provenance.json). `/repo/search` is answered with the unmodified
// response of the same server build: a minimal repository object whose timestamps are the zero time and
// whose counts are zero-valued Go defaults. Only the document shell is synthetic.
const dir = new URL('../fixtures/forgejo-16.0.6/', import.meta.url);
const read = name => fs.readFile(new URL(name, dir), 'utf8');
const [nativeCss, main, search, config] = await Promise.all([read('org-dashboard.css'), read('org-dashboard.html'), read('repo-search.json'), read('dashboard-repo-list-config.json')]);
const skinCss = (await Promise.all(['organization.css', 'dashboard-pagination.css'].map(name => fs.readFile(new URL('../../src/' + name, import.meta.url), 'utf8')))).join('\n');
const shell = `<!doctype html><html lang="en" data-theme="hypergithub-light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>${nativeCss}</style><style>${skinCss}</style><style>body{margin:0;font:14px/20px Arial}</style></head><body>${main}</body></html>`;

async function open(page, hash) {
  await page.route('**/avatars/**', route => route.fulfill({status: 204}));
  await openNativeFixture(page, shell);
  await page.evaluate(({config, search, hash}) => {
    window.config = {appSubUrl: '', pageData: {dashboardRepoList: config}};
    history.replaceState(null, '', '/' + hash);
    window.fetch = async url => /\/repo\/search\?/.test(String(url))
      ? new Response(search, {status: 200, headers: {'Content-Type': 'application/json'}})
      : new Response('', {status: 404});
  }, {config: JSON.parse(config), search, hash});
  await exposeModules(page, 'organization.mjs', 'dashboard-pagination.mjs');
  await page.evaluate(() => { window.enhanceOrganization(document); window.enhanceDashboardPagination(document); });
  await expect(page.locator('.hgh-org-repo-meta').first()).toBeAttached();
}

test('native Vue repository rows keep their names visible beside the enrichment block', async ({page}) => {
  await open(page, '');
  const rows = page.locator('#dashboard-repo-list .repo-owner-name-list > li').filter({has: page.locator('.hgh-org-repo-meta')});
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  const boxes = await rows.evaluateAll(items => items.map(li => {
    const link = li.querySelector('.repo-list-link');
    const name = link.querySelector('.text.truncate');
    return {name: name.textContent.trim(), link: Math.round(link.getBoundingClientRect().width), text: Math.round(name.getBoundingClientRect().width), clipped: name.scrollWidth > name.clientWidth + 1};
  }));
  for (const box of boxes) {
    expect(box.link, box.name).toBeGreaterThan(60);
    expect(box.text, box.name).toBeGreaterThan(40);
    expect(box.clipped, box.name).toBe(false);
  }
});

test('repository enrichment never invents counts or dates the search endpoint did not provide', async ({page}) => {
  await open(page, '');
  const meta = page.locator('.hgh-org-repo-meta').first();
  await expect(meta.locator('.hgh-org-updated')).toHaveCount(0);
  // Only `stars_count` is populated by the server; forks and open issues are zero-valued defaults.
  await expect(meta.locator('.hgh-org-stat')).toHaveCount(1);
  await expect(meta.locator('.hgh-org-stat svg path').first()).toBeAttached();
});

test('focused repositories pager keeps Previous and Next as separate, sized controls', async ({page}) => {
  await open(page, '#repos');
  const pager = page.locator('#dashboard-repo-list .hgh-vpg');
  await expect(pager).toBeVisible();
  const box = name => pager.locator('.hgh-vpg-' + name).evaluate(node => {
    const rect = node.getBoundingClientRect();
    return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height};
  });
  const [prev, next] = [await box('prev'), await box('next')];
  expect(prev.width).toBeGreaterThan(60);
  expect(next.width).toBeGreaterThan(40);
  expect(prev.height).toBeGreaterThan(20);
  expect(prev.right).toBeLessThanOrEqual(next.left + 1);
  expect(Math.abs((prev.top + prev.bottom) / 2 - (next.top + next.bottom) / 2)).toBeLessThanOrEqual(2);
});

test('a repository name longer than the row truncates beside Vue\'s trailing status icon instead of wrapping it', async ({page}) => {
  await open(page, '');
  const row = page.locator('#dashboard-repo-list .repo-owner-name-list > li').filter({has: page.locator('.hgh-org-repo-meta')}).first();
  const geometry = await row.evaluate(li => {
    const link = li.querySelector('.repo-list-link');
    const name = link.querySelector('.text.truncate');
    name.textContent = 'demo-bricks/' + 'a-very-long-repository-name-'.repeat(6);
    // Vue renders the latest commit status as a sibling link after the repository link.
    const status = document.createElement('a');
    status.className = 'commit-status';
    status.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"></svg>';
    link.after(status);
    const box = node => node.getBoundingClientRect();
    return {linkTop: box(link).top, linkBottom: box(link).bottom, statusTop: box(status).top, statusBottom: box(status).bottom,
      linkWidth: box(link).width, nameWidth: box(name).width, rowWidth: box(li).width, ellipsized: name.scrollWidth > name.clientWidth};
  });
  expect(geometry.statusTop, 'status icon stays on the name line').toBeLessThan(geometry.linkBottom);
  expect(geometry.statusBottom).toBeGreaterThan(geometry.linkTop);
  expect(geometry.nameWidth, 'name keeps readable room').toBeGreaterThan(60);
  expect(geometry.ellipsized, 'the long name is truncated, not overflowing').toBe(true);
  expect(geometry.linkWidth).toBeLessThanOrEqual(geometry.rowWidth);
});
