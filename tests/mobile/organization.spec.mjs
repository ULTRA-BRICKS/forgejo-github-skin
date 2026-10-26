import {test, expect} from '@playwright/test';
import fs from 'node:fs/promises';
import http from 'node:http';
import {appearances, applyAppearance, captureProof} from './organization-proof.mjs';

// Same technique as repository-controls.spec.mjs: concatenate the real source files (stripping
// module syntax) into one classic script so the tests exercise the production enhancer, not a
// hand-rolled mock.
const core = (await fs.readFile(new URL('../../src/core.mjs', import.meta.url), 'utf8')).replaceAll('export ', '');
const organization = (await fs.readFile(new URL('../../src/organization.mjs', import.meta.url), 'utf8'))
  .replace(/^import.*$/mg, '')
  .replaceAll('export ', '');
const css = await fs.readFile(new URL('../../src/organization.css', import.meta.url), 'utf8');

test.beforeEach(async ({page}) => {
  await page.route('https://native-ui.test/org/ultrabricks/dashboard', route => route.fulfill({status: 401}));
});

// Real ultrabricks repositories — single source shared with stories/organization-page.mjs, see
// stories/organization-fixtures.mjs for provenance.
const {REPOS} = await import('../../stories/organization-fixtures.mjs');
const VISIBLE_COUNT = 12; // how many <li> the "Vue widget" fixture pre-renders (page 1)

function repoLi(fullName) {
  const safe = String(fullName).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  return `<li class="tw-flex tw-items-center tw-py-2"><a class="repo-list-link muted" href="/${safe}"><svg class="repo-list-icon" viewBox="0 0 16 16" width="16" height="16"></svg><div class="text truncate">${safe}</div></a></li>`;
}

const fixture = `<!doctype html><html lang="en" data-theme="hypergithub-light"><head><meta charset="utf-8">
<style>${css.replace(/^\/\*[\s\S]*?\*\//, '')}
body{margin:0;font:14px/1.4 Arial;--hgh-color-text:#1f2328;--hgh-color-muted:#59636e;--hgh-color-border:#d1d9e0;--hgh-color-link:#0969da;--hgh-color-canvas:#fff;--hgh-color-subtle:#f6f8fa;--hgh-color-success:#1f883d;--hgh-color-successSubtle:#dafbe1}
.markup{max-height:none}
</style></head><body>
<div role="main" class="page-content dashboard feeds">
  <div class="secondary-nav">
    <div class="ui secondary stackable menu">
      <div class="item"><div class="ui floating dropdown jump"><span class="text truncated-item-container"><img class="ui avatar" alt="" src="/avatars/ultrabricks.png" width="20" height="20"><span class="truncated-item-name">ultrabricks</span></span></div></div>
      <div class="item"><div class="ui floating dropdown jump"><span class="text">Teams</span></div></div>
      <div class="right menu">
        <a class="item" href="/org/ultrabricks/dashboard">Activity</a>
        <a class="item" href="/ultrabricks/issues">Issues</a>
        <a class="item" href="/ultrabricks/pulls">Pull requests</a>
        <div class="item"><a class="ui basic button" href="/ultrabricks">View home</a></div>
      </div>
    </div>
  </div>
  <div class="ui container flex-container">
    <div class="flex-container-main">
      <div class="ui message tw-mb-8" id="test-flash-alert">Your repository migration finished.</div>
      <div id="user-heatmap" data-heatmap-data="[]"></div>
      <div class="divider"></div>
      <div id="activity-feed" class="flex-list">
        ${Array.from({length: 7}, (_, i) => `<div class="flex-item"><div class="flex-item-leading"><img class="ui avatar" alt="" width="16" height="16"></div><div class="flex-item-main"><div>user pushed to repo ${i}</div>${i === 2 ? '<div class="markup tw-text-14"><p>' + 'A very long pasted review comment that goes on and on and on and on and on and on and on and on and on and on and on and on. '.repeat(4) + '</p><img src="data:image/png;base64," width="600" height="400" alt="screenshot"></div>' : ''}</div><div class="flex-item-trailing"><svg viewBox="0 0 16 16" width="32" height="32"></svg></div></div>`).join('')}
        <div class="base-paginate"></div>
      </div>
    </div>
    <div id="dashboard-repo-list" class="flex-container-sidebar"><div><div class="ui tab active list dashboard-repos">
      <div class="ui top attached segment repos-search">
        <div class="ui small fluid action left icon input"><input type="search"><div class="ui dropdown icon button" title="Filter"><svg width="16" height="16"></svg></div></div>
        <overflow-menu class="ui secondary pointing tabular borderless menu repos-filter"><div class="overflow-menu-items">
          <a class="item active" tabindex="0">All<div class="ui circular mini grey label">${VISIBLE_COUNT}</div></a>
          <a class="item" tabindex="0">Sources</a>
          <a class="item" tabindex="0">Forks</a>
          <a class="item" tabindex="0">Mirrors</a>
          <a class="item" tabindex="0">Collaborative</a>
        </div></overflow-menu>
      </div>
      <div class="ui attached table segment">
        <ul class="repo-owner-name-list">${REPOS.slice(0, VISIBLE_COUNT).map(([name]) => repoLi(name)).join('')}</ul>
        <div class="tw-text-center"><div class="divider tw-my-0"></div><div class="ui borderless pagination menu narrow tw-my-2"><a class="item navigation disabled tw-py-1" title="First page"><svg width="16" height="16"></svg></a><a class="item navigation disabled tw-py-1" title="Previous page"><svg width="16" height="16"></svg></a><a class="active item tw-py-1">1</a><a class="item navigation tw-py-1" title="Next page"><svg width="16" height="16"></svg></a><a class="item navigation tw-py-1" title="Last page"><svg width="16" height="16"></svg></a></div></div>
      </div>
    </div></div></div>
  </div>
<script>window.config = {appSubUrl:'', pageData:{dashboardRepoList:{organizationId:6, uid:0, teamId:0, searchLimit:${VISIBLE_COUNT}}}};</script>
</body></html>`;

async function mockRoutes(page) {
  await page.route('**/repo/search**', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('count_only') === '1') return route.fulfill({contentType: 'application/json', headers: {'X-Total-Count': String(REPOS.length)}, body: '{}'});
    const data = REPOS.map(([full_name, language, description, topics]) => ({
      repository: {full_name, language, description, topics, stars_count: 3, forks_count: 1, open_issues_count: 2, updated_at: '2026-09-27T12:00:00Z'},
    }));
    return route.fulfill({contentType: 'application/json', headers: {'X-Total-Count': String(REPOS.length)}, body: JSON.stringify({data})});
  });
  await page.route('**/ultrabricks', (route) => {
    if (route.request().url().includes('/ultrabricks/')) return route.continue();
    return route.fulfill({
      contentType: 'text/html',
      body: '<div class="segment members"><a href="/alex" title="Alex"><img alt="" src="/avatars/alex.png"></a><a href="/morgan" title="Morgan"><img alt="" src="/avatars/morgan.png"></a><a href="javascript:alert(1)" title="Evil"><img alt=""></a><a href="https://evil.example/x" title="CrossOrigin"><img alt=""></a><a title="NoHref"><img alt=""></a><a href="/taylor" title="Taylor"><img alt="" src="https://evil.example/tracker.png"></a><a href="/jordan" title="Jordan"><img alt="" src="javascript:alert(2)"></a></div>',
    });
  });
  await page.route('**/ultrabricks/pulls', (route) => route.fulfill({contentType: 'text/html', body: '<h1>Pull requests</h1>'}));
  await page.route('**/ultrabricks/issues', (route) => route.fulfill({contentType: 'text/html', body: '<h1>Issues</h1>'}));
}

async function prepare(page) {
  await mockRoutes(page);
  await page.route('https://native-ui.test/dashboard', (route) => route.fulfill({contentType: 'text/html', body: fixture}));
  await page.goto('https://native-ui.test/dashboard');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => { window.enhanceOrganization(); });
  await page.waitForSelector('.hgh-org-page');
  await expect.poll(() => page.locator('.hgh-org-repo-meta').count()).toBeGreaterThan(0);
}


test('shows a compact identity header reusing the native avatar/name and the real View-home link, restored exactly on teardown', async ({page}) => {
  await prepare(page);
  await expect(page.locator('.hgh-org-header-name')).toHaveText('ultrabricks');
  await expect(page.locator('.hgh-org-header img.ui.avatar')).toBeVisible();
  const homeLink = page.locator('.hgh-org-header a.ui.basic.button');
  await expect(homeLink).toHaveAttribute('href', '/ultrabricks');
  await expect(homeLink).toHaveText('View home');

  await page.evaluate(() => { window.restoreOrganization(); });
  await expect(page.locator('.hgh-org-header')).toHaveCount(0);
  const restoredLink = page.locator('.secondary-nav .right.menu a.ui.basic.button[href="/ultrabricks"]');
  await expect(restoredLink).toHaveCount(1);
  await expect(restoredLink).toHaveText('View home');
});

test('View all reveals the complete list, keeps native pagination, and back/forward round-trip', async ({page}) => {
  await prepare(page);
  await page.locator('.hgh-org-view-all').click();
  await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view', 'repos');
  await expect(page.locator('#dashboard-repo-list .repo-owner-name-list > li:visible')).toHaveCount(REPOS.slice(0, 12).length);
  await expect(page.locator('#dashboard-repo-list .ui.borderless.pagination')).toBeVisible();
  await expect(page.locator('a[data-hgh-org-tab="repos"]')).toHaveAttribute('aria-current', 'page');

  await page.goBack();
  await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view', 'overview');
  await expect(page.locator('#dashboard-repo-list .repo-owner-name-list > li:visible')).toHaveCount(10);

  await page.goForward();
  await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view', 'repos');
});

test('all five hashes are reachable and pull requests/issues route through native links', async ({page}) => {
  await prepare(page);
  const tabs = await page.locator('.hgh-org-tabs a').evaluateAll((as) => as.map((a) => a.dataset.hghOrgTab));
  expect(tabs).toEqual(['overview', 'repos', 'prs', 'issues', 'activity']);

  await page.locator('a[data-hgh-org-tab="activity"]').click();
  await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view', 'activity');
  await expect(page.locator('.hgh-org-columns')).toBeHidden();

  await page.locator('a[data-hgh-org-tab="prs"]').click();
  await expect(page).toHaveURL('https://native-ui.test/ultrabricks/pulls');

  await page.goto('https://native-ui.test/dashboard');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => { window.enhanceOrganization(); });
  await page.locator('a[data-hgh-org-tab="issues"]').click();
  await expect(page).toHaveURL('https://native-ui.test/ultrabricks/issues');
});

test('prs/issues redirects replace the hash entry so Back/Forward never re-triggers the redirect', async ({page}) => {
  await prepare(page);
  await page.locator('a[data-hgh-org-tab="prs"]').click();
  await expect(page).toHaveURL('https://native-ui.test/ultrabricks/pulls');

  await page.goBack();
  await expect(page).not.toHaveURL(/\/pulls$/);
  await expect(page).not.toHaveURL(/#prs$/);

  await page.goForward();
  await expect(page).toHaveURL('https://native-ui.test/ultrabricks/pulls');
});

test('long comments and pasted screenshots collapse behind a keyboard- and tap-operable Show more/less', async ({page}) => {
  await prepare(page);
  const long = page.locator('#activity-feed .flex-item').nth(2).locator('.markup');
  await expect(long).toHaveClass(/hgh-org-clamped/);
  const toggle = page.locator('#activity-feed .flex-item').nth(2).locator('.hgh-org-toggle');
  await expect(toggle).toHaveText('Show more');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(long).not.toHaveClass(/hgh-org-clamped/);
  await expect(toggle).toHaveText('Show less');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await toggle.click();
  await expect(long).toHaveClass(/hgh-org-clamped/);
  await expect(toggle).toHaveText('Show more');

  const short = page.locator('#activity-feed .flex-item').first().locator('.hgh-org-toggle');
  await expect(short).toHaveCount(0); // short rows are never wrapped: nothing to collapse
  expect(await page.locator('.markup').first().evaluate((n) => n.textContent)).not.toBe('');
});

test('activity feed shows 16px icons, compact overview cap, and never introduces Discussions', async ({page}) => {
  await prepare(page);
  await expect(page.locator('#activity-feed .flex-item-trailing svg').first()).toHaveJSProperty('clientWidth', 16);
  await expect(page.locator('.hgh-org-activity .flex-item:visible')).toHaveCount(5);
  await expect(page.getByText('Discussions')).toHaveCount(0);
  expect(await page.locator('.hgh-org-page').evaluate((n) => n.querySelector('.octicon-comment-discussion'))).toBeNull();
});

test('sidebar renders real People and top languages from the org and repo-search fetches, never invented', async ({page}) => {
  await prepare(page);
  await expect(page.locator('.hgh-org-people-list .hgh-avatar')).toHaveCount(4); // javascript:/cross-origin/missing-href members omitted; valid-href members with hostile avatars kept
  await expect(page.locator('.hgh-org-people-list a[title="Alex"]')).toHaveCount(1);
  await expect(page.locator('.hgh-org-people-list a[title="Evil"], .hgh-org-people-list a[title="CrossOrigin"], .hgh-org-people-list a[title="NoHref"]')).toHaveCount(0);
  expect(await page.locator('.hgh-org-people-list a').evaluateAll((as) => as.some((a) => a.getAttribute('href')?.startsWith('javascript:')))).toBe(false);
  // A member's own href is legitimate, but their avatar source is a same-origin-only concern too:
  // a cross-origin or javascript: avatar must never be assigned to a live <img src> (an unconditional
  // third-party request, or worse, fired just by rendering the sidebar) — it's dropped to empty and
  // renderSidebar's `if (person.avatar)` guard then skips the <img> entirely for that member.
  await expect(page.locator('.hgh-org-people-list a[title="Taylor"] img')).toHaveCount(0);
  await expect(page.locator('.hgh-org-people-list a[title="Jordan"] img')).toHaveCount(0);
  await expect(page.locator('.hgh-org-people-list a[title="Taylor"]')).toHaveCount(1);
  await expect(page.locator('.hgh-org-people-list a[title="Jordan"]')).toHaveCount(1);
  const languages = await page.locator('.hgh-org-language-list li').allTextContents();
  expect(languages.some((t) => t.includes('Python'))).toBe(true);
  expect(languages.some((t) => t.includes('TypeScript'))).toBe(true);
});

test('a repo-search response that arrives after the org-home fetch still refreshes Top languages/Topics', async ({page}) => {
  const enrichment = Promise.withResolvers();
  await page.route('**/repo/search**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('count_only') === '1') return route.fulfill({contentType: 'application/json', headers: {'X-Total-Count': String(REPOS.length)}, body: '{}'});
    await enrichment.promise; // Resolve only after People renders, independent of host scheduling.
    const data = REPOS.map(([full_name, language, description, topics]) => ({repository: {full_name, language, description, topics, stars_count: 3, forks_count: 1, open_issues_count: 2, updated_at: '2026-09-27T12:00:00Z'}}));
    return route.fulfill({contentType: 'application/json', headers: {'X-Total-Count': String(REPOS.length)}, body: JSON.stringify({data})});
  });
  await page.route('**/ultrabricks', (route) => {
    if (route.request().url().includes('/ultrabricks/')) return route.continue();
    return route.fulfill({contentType: 'text/html', body: '<div class="segment members"><a href="/alex" title="Alex"><img alt="" src="/avatars/alex.png"></a></div>'});
  });
  await page.route('**/ultrabricks/pulls', (route) => route.fulfill({contentType: 'text/html', body: '<h1>Pull requests</h1>'}));
  await page.route('**/ultrabricks/issues', (route) => route.fulfill({contentType: 'text/html', body: '<h1>Issues</h1>'}));
  await page.route('https://native-ui.test/dashboard', (route) => route.fulfill({contentType: 'text/html', body: fixture}));
  await page.goto('https://native-ui.test/dashboard');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => { window.enhanceOrganization(); });
  await page.waitForSelector('.hgh-org-page');
  await expect(page.locator('.hgh-org-people-list a[title="Alex"]')).toBeVisible();
  await expect(page.locator('.hgh-org-language-list li')).toHaveCount(0);
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/repo/search');
  enrichment.resolve();
  await (await response).finished();
  await expect(page.locator('.hgh-org-language-list')).toContainText('Python');
});

test('heatmap gets GitHub-green level colors instead of the native orange/blue primary', async ({page}) => {
  await prepare(page);
  const primary = await page.locator('.hgh-org-heatmap').evaluate((n) => getComputedStyle(n).getPropertyValue('--color-primary').trim());
  expect(primary).not.toBe('');
  expect(primary).not.toBe('var(--color-primary)');
});

test('restore fully reverts the native DOM and re-enhancing afterward is clean', async ({page}) => {
  await prepare(page);
  await page.evaluate(() => { window.restoreOrganization(); });
  await expect(page.locator('.hgh-org-page')).toHaveCount(0);
  await expect(page.locator('.flex-container-main #user-heatmap')).toHaveCount(1);
  await expect(page.locator('.flex-container-main #activity-feed')).toHaveCount(1);
  await expect(page.locator('.flex-container-sidebar#dashboard-repo-list')).toHaveCount(1);
  await expect(page.locator('.hgh-org-repo-meta')).toHaveCount(0);
  await expect(page.locator('[data-hgh-checked]')).toHaveCount(0);
  await expect(page.locator('.hgh-org-toggle')).toHaveCount(0);
  await expect(page.locator('.markup.hgh-org-clamped')).toHaveCount(0);
  expect(await page.locator('#activity-feed .flex-item-trailing svg').first().getAttribute('width')).toBe('32');

  await page.evaluate(() => { window.enhanceOrganization(); window.enhanceOrganization(); });
  await expect(page.locator('.hgh-org-page')).toHaveCount(1);
  await expect(page.locator('#dashboard-repo-list .repo-owner-name-list > li:visible')).toHaveCount(10);
});

test('a temporarily detached-but-reused dashboard root restores the native flex-container, not a stranded wrapper, on reinsertion', async ({page}) => {
  await prepare(page);
  const result = await page.evaluate(() => {
    const root = document.querySelector('.page-content.dashboard.feeds');
    const parent = root.parentNode, next = root.nextSibling;
    root.remove(); // detach but keep a live reference — a framework reusing the same node
    window.enhanceOrganization(); // sees the detached root and tears down its state via pruneDetached()
    parent.insertBefore(root, next); // reinsert the SAME node
    return {
      wrapperCount: root.querySelectorAll('.hgh-org-page').length,
      flexContainerCount: root.querySelectorAll('.ui.container.flex-container').length,
      heatmapCount: root.querySelectorAll('#user-heatmap').length,
    };
  });
  expect(result.wrapperCount).toBe(0); // our wrapper was torn down, not left stranded
  expect(result.flexContainerCount).toBe(1); // native flex-container restored to its exact original slot
  expect(result.heatmapCount).toBe(1); // heatmap came back with it, not lost

  await page.evaluate(() => { window.enhanceOrganization(); window.enhanceOrganization(); });
  await expect(page.locator('.hgh-org-page')).toHaveCount(1);
  await expect(page.locator('#dashboard-repo-list .repo-owner-name-list > li:visible')).toHaveCount(10);
});

test('shows a genuine empty state only when the org truly has zero repositories, never guessed', async ({page}) => {
  await mockRoutes(page);
  await page.route('**/repo/search**', (route) => {
    if (new URL(route.request().url()).searchParams.get('count_only') === '1') return route.fulfill({contentType: 'application/json', headers: {'X-Total-Count': '0'}, body: '{}'});
    return route.fulfill({contentType: 'application/json', headers: {'X-Total-Count': '0'}, body: JSON.stringify({data: []})});
  });
  await page.route('https://native-ui.test/dashboard', (route) => route.fulfill({contentType: 'text/html', body: fixture}));
  await page.goto('https://native-ui.test/dashboard');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => {
    document.querySelector('.repo-owner-name-list').innerHTML = ''; // simulate Vue also finding nothing
    window.enhanceOrganization();
  });
  await page.waitForSelector('.hgh-org-page');
  await expect(page.locator('.hgh-org-repos-status')).toHaveText('No repositories match.');
  await expect(page.locator('.hgh-org-view-all')).toBeHidden(); // nothing for "View all" to reveal when genuinely empty
  await expect(page.locator('.hgh-org-repo-meta')).toHaveCount(0);
});

test('a flash alert (and any other server-rendered notice) is relocated, never hidden, and restored exactly', async ({page}) => {
  await prepare(page);
  await expect(page.locator('.hgh-org-notices #test-flash-alert')).toHaveText('Your repository migration finished.');
  await expect(page.locator('.hgh-org-notices #test-flash-alert')).toBeVisible();
  // The real template nests pagination inside #activity-feed itself, never as a sibling notice;
  // the generic notices catch-all must not sweep it up and relocate it to the top of the page.
  await expect(page.locator('.hgh-org-notices .base-paginate')).toHaveCount(0);
  await expect(page.locator('.hgh-org-activity #activity-feed > .base-paginate')).toHaveCount(1);

  await page.evaluate(() => { window.restoreOrganization(); });
  const alert = page.locator('#test-flash-alert');
  await expect(alert).toHaveCount(1);
  expect(await alert.evaluate((n) => n.parentElement.className)).toBe('flex-container-main');
  expect(await alert.evaluate((n) => n.nextElementSibling.id)).toBe('user-heatmap');
});

test('a personal (non-organization) dashboard is left completely untouched', async ({page}) => {
  await mockRoutes(page);
  const personal = fixture.replace('<div class="right menu">', '<div class="right-menu-disabled">').replace(/<a class="item" href="\/ultrabricks\/(issues|pulls)">.*?<\/a>/gs, '');
  await page.route('https://native-ui.test/personal', (route) => route.fulfill({contentType: 'text/html', body: personal}));
  await page.goto('https://native-ui.test/personal');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => { window.enhanceOrganization(); });
  await expect(page.locator('.hgh-org-page')).toHaveCount(0);
  await expect(page.locator('.flex-container')).toHaveCount(1);
});

// Verbatim structure (trimmed) captured read-only from the real public org profile page,
// git.hyperide.ai/ultrabricks, 2026-09-27 — `templates/org/home.tmpl` + `templates/explore/repo_list.tmpl`.
const profileFixture = `<!doctype html><html lang="en" data-theme="hypergithub-light"><head><meta charset="utf-8">
<style>${css.replace(/^\/\*[\s\S]*?\*\//, '')}
body{margin:0;font:14px/1.4 Arial;--hgh-color-text:#1f2328;--hgh-color-muted:#59636e;--hgh-color-border:#d1d9e0;--hgh-color-link:#0969da;--hgh-color-canvas:#fff;--hgh-color-subtle:#f6f8fa;--hgh-color-success:#1f883d;--hgh-color-successSubtle:#dafbe1}
</style></head><body>
<div role="main" aria-label="ULTRA BRICKS" class="page-content organization profile">
  <div class="ui container tw-flex tw-gap-x-4">
    <img class="ui avatar org-avatar" alt="" src="/avatars/ultrabricks.png" width="100" height="100">
    <div id="org-info"><div class="org-header"><div class="org-title"><h1>ULTRA BRICKS</h1></div></div></div>
  </div>
  <div class="ui container"><div class="ui mobile reversed stackable grid">
    <div class="ui eleven wide column">
      <div class="flex-list">
        <div class="flex-item"><div class="flex-item-leading"><svg class="octicon-repo" width="24" height="24"></svg></div><div class="flex-item-main"><div class="flex-item-header"><div class="flex-item-title"><a class="text primary name" href="/ultrabricks/rig-cli">rig-cli</a></div><div class="flex-item-trailing muted-links"><a href="?language=Python"><i class="color-icon" style="background-color:#3572A5"></i>Python</a><a href="/ultrabricks/rig-cli/stars">3 stars</a></div></div><div class="flex-item-body">Dev-environment umbrella driver: set up a repo from a committed rig.yaml</div><div class="repo-topics"><a class="ui label" href="/explore/repos?q=agents&amp;topic=1">agents</a></div><div class="flex-item-body">Updated <relative-time datetime="2026-09-27T12:24:44Z">2026-09-27</relative-time></div></div></div>
      </div>
    </div>
    <div class="ui five wide column">
      <h4 class="ui top attached header"><strong>Members</strong></h4>
      <div class="ui attached segment members">
        <a href="/alex" title="Alex"><img class="ui avatar" alt="" src="/avatars/alex.png"></a>
        <a href="/morgan" title="Morgan"><img class="ui avatar" alt="" src="/avatars/morgan.png"></a>
      </div>
    </div>
  </div></div>
</div>
</body></html>`;

test('public org profile gets consistent presentation without moving native nodes or hiding access-controlled sections', async ({page}) => {
  await page.route('https://native-ui.test/ultrabricks', (route) => route.fulfill({contentType: 'text/html', body: profileFixture}));
  await page.goto('https://native-ui.test/ultrabricks');
  await page.addScriptTag({content: core + '\n' + organization});

  const repoLink = page.locator('a.text.primary.name[href="/ultrabricks/rig-cli"]');
  const membersSegment = page.locator('.segment.members');
  await expect(repoLink).toHaveAttribute('href', '/ultrabricks/rig-cli'); // native link untouched before enhancement

  await page.evaluate(() => { window.enhanceOrganization(); });
  await expect(page.locator('.page-content.organization.profile')).toHaveClass(/hgh-org-profile/);
  await expect(repoLink).toHaveAttribute('href', '/ultrabricks/rig-cli'); // access/navigation target never rewritten
  await expect(membersSegment).toBeVisible(); // access-controlled members segment never hidden
  await expect(page.locator('h4.ui.top.attached.header')).toHaveText('People'); // relabeled to match the sidebar naming used elsewhere
  await expect(page.locator('.hgh-org-language-list li').first()).toContainText('Python');
  await expect(page.locator('.hgh-org-topic-list .hgh-org-topic')).toHaveText('agents');

  await page.evaluate(() => { window.restoreOrganization(); });
  await expect(page.locator('.page-content.organization.profile')).not.toHaveClass(/hgh-org-profile/);
  await expect(repoLink).toHaveAttribute('href', '/ultrabricks/rig-cli');
  await expect(page.locator('h4.ui.top.attached.header')).toHaveText('Members'); // restored exactly
});

test('relabeling the Members heading preserves whitespace when a count badge sits right after the text', async ({page}) => {
  const countBadgeFixture = profileFixture.replace(
    '<h4 class="ui top attached header"><strong>Members</strong></h4>',
    '<h4 class="ui top attached header">Members <span class="ui mini circular label">2</span></h4>',
  );
  await page.route('https://native-ui.test/ultrabricks', (route) => route.fulfill({contentType: 'text/html', body: countBadgeFixture}));
  await page.goto('https://native-ui.test/ultrabricks');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => { window.enhanceOrganization(); });
  // A whole-textContent overwrite would silently drop the space before the badge ("People2");
  // only the "Members" substring may be replaced.
  const headingText = await page.locator('h4.ui.top.attached.header').evaluate((n) => n.textContent);
  expect(headingText.replace(/\s+/g, ' ').trim()).toBe('People 2');
  await page.evaluate(() => { window.restoreOrganization(); });
  const restoredText = await page.locator('h4.ui.top.attached.header').evaluate((n) => n.textContent);
  expect(restoredText.replace(/\s+/g, ' ').trim()).toBe('Members 2'); // restored exactly
});

test('enhanceProfile creates a fresh sidebar column rather than guessing among several other columns', async ({page}) => {
  const multiColumnFixture = profileFixture.replace(
    '<div class="ui five wide column">',
    '<div class="ui three wide column" id="extra-column"><p>Unrelated native content</p></div><div class="ui five wide column">',
  );
  await page.route('https://native-ui.test/ultrabricks', (route) => route.fulfill({contentType: 'text/html', body: multiColumnFixture}));
  await page.goto('https://native-ui.test/ultrabricks');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => { window.enhanceOrganization(); });
  await expect(page.locator('.page-content.organization.profile')).toHaveClass(/hgh-org-profile/);
  // Two candidate "other" columns exist (the extra one and the Members one) — neither may be
  // guessed as the sidebar; a fresh column must be created instead.
  await expect(page.locator('#extra-column')).not.toHaveClass(/hgh-org-sidebar/);
  await expect(page.locator('.ui.five.wide.column')).not.toHaveClass(/hgh-org-sidebar/);
  await expect(page.locator('.hgh-org-sidebar')).toHaveCount(1);
  await expect(page.locator('#extra-column p')).toHaveText('Unrelated native content'); // untouched
  await expect(page.locator('.segment.members')).toBeVisible(); // untouched
  await expect(page.locator('.hgh-org-sidebar .hgh-org-language-list li').first()).toContainText('Python');
});

test('a repos list not wrapped in any recognizable column skips the sidebar entirely, never misrouting it onto another column', async ({page}) => {
  await page.route('https://native-ui.test/ultrabricks', (route) => route.fulfill({contentType: 'text/html', body: profileFixture}));
  await page.goto('https://native-ui.test/ultrabricks');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => {
    // Simulate a drifted template: the flex-list is not inside any `.column` wrapper, so
    // `flexList.closest('.column')` returns null and no column can be told apart as "the repos one".
    const flexList = document.querySelector('.flex-list');
    document.querySelector('.ui.mobile.reversed.stackable.grid').append(flexList);
  });
  await page.evaluate(() => { window.enhanceOrganization(); });
  await expect(page.locator('.page-content.organization.profile')).toHaveClass(/hgh-org-profile/);
  await expect(page.locator('.hgh-org-sidebar')).toHaveCount(0); // never guess which column to repurpose
  await expect(page.locator('.hgh-org-language-list')).toHaveCount(0);
  await expect(page.locator('a.text.primary.name[href="/ultrabricks/rig-cli"]')).toBeVisible(); // repo card itself untouched
});

// Verbatim structure (trimmed) captured read-only from the real public org profile page,
// git.hyperide.ai/ultrabricks, 2026-09-27 (via SSH `curl localhost:3000/ultrabricks`, unauthenticated,
// public data only) — a single full-width column (no members segment: member-list visibility is a
// per-org setting and was off for this capture), a real filter/sort/search toolbar
// (`#repo-search-form`), and real native bottom pagination with a genuine `?page=2` link (20 repos,
// 15 on page 1). This exercises the "create a fresh sidebar column" code path — the *other* profile
// test above exercises the "reuse an existing five-wide-column with Members" path.
function bigProfileCard([name, language, description, topics]) {
  const short = name.split('/')[1];
  const topicsHtml = topics.length ? `<div class="repo-topics">${topics.map((t) => `<a class="ui label" href="/explore/repos?q=${t}&amp;topic=1">${t}</a>`).join('')}</div>` : '';
  return `<div class="flex-item"><div class="flex-item-leading"><svg class="octicon-repo" width="24" height="24"></svg></div><div class="flex-item-main"><div class="flex-item-header"><div class="flex-item-title"><a class="text primary name" href="/${name}">${short}</a></div><div class="flex-item-trailing muted-links"><a href="?q=&amp;sort=recentupdate&amp;language=${language}"><i class="color-icon" style="background-color:#3572A5"></i>${language}</a><a href="/${name}/stars">3 stars</a></div></div><div class="flex-item-body">${description}</div>${topicsHtml}</div></div>`;
}
const bigProfileFixture = `<!doctype html><html lang="en" data-theme="hypergithub-light"><head><meta charset="utf-8">
<style>${css.replace(/^\/\*[\s\S]*?\*\//, '')}
body{margin:0;font:14px/1.4 Arial;--hgh-color-text:#1f2328;--hgh-color-muted:#59636e;--hgh-color-border:#d1d9e0;--hgh-color-link:#0969da;--hgh-color-canvas:#fff;--hgh-color-subtle:#f6f8fa}
</style></head><body>
<div role="main" aria-label="ULTRA BRICKS" class="page-content organization profile">
  <div class="ui container tw-flex tw-gap-x-4">
    <img class="ui avatar org-avatar" alt="" src="/avatars/ultrabricks.png" width="100" height="100">
    <div id="org-info"><div class="org-header"><div class="org-title"><h1>ULTRA BRICKS</h1></div></div></div>
  </div>
  <div class="ui container">
    <div class="ui mobile reversed stackable grid">
      <div class="ui  column">
        <div class="ui small secondary filter menu">
          <form id="repo-search-form" class="ui form"><div class="ui small fluid action input"><input type="search" name="q" placeholder="Search repos…"></div></form>
        </div>
        <div class="divider"></div>
        <div class="flex-list">${REPOS.map(bigProfileCard).join('')}</div>
      </div>
    </div>
    <div class="center page buttons">
      <div class="ui borderless pagination menu">
        <a class="disabled item navigation"><span class="navigation_label">First</span></a>
        <a class="disabled item navigation"><span class="navigation_label">Previous</span></a>
        <a class="active item">1</a>
        <a class="item" href="/ultrabricks?page=2&amp;sort=recentupdate&amp;q=&amp;language=">2</a>
        <a class="item navigation" href="/ultrabricks?page=2&amp;sort=recentupdate&amp;q=&amp;language="><span class="navigation_label">Next</span></a>
        <a class="item navigation" href="/ultrabricks?page=2&amp;sort=recentupdate&amp;q=&amp;language="><span class="navigation_label">Last</span></a>
      </div>
    </div>
  </div>
</div>
</body></html>`;

test('public profile with more than 10 repos: caps to 10, reveals the rest via bottom View all, keeps the real toolbar/pager untouched, and tears down cleanly', async ({page}) => {
  await page.route('https://native-ui.test/ultrabricks-big', (route) => route.fulfill({contentType: 'text/html', body: bigProfileFixture}));
  await page.goto('https://native-ui.test/ultrabricks-big');
  await page.addScriptTag({content: core + '\n' + organization});

  const searchInput = page.locator('#repo-search-form input[type="search"]');
  const pager = page.locator('.center.page.buttons .ui.borderless.pagination.menu');
  const nextPageLink = page.locator('.center.page.buttons a[href*="page=2"]').first();
  await expect(nextPageLink).toHaveAttribute('href', /page=2/); // native pager untouched before enhancement

  await page.evaluate(() => { window.enhanceOrganization(); });
  await expect(page.locator('.page-content.organization.profile')).toHaveClass(/hgh-org-profile/);
  await expect(page.locator('.flex-list > .flex-item:visible')).toHaveCount(10);
  const viewAll = page.locator('.hgh-org-view-all-bottom .hgh-org-view-all');
  await expect(viewAll).toBeVisible();
  await expect(viewAll).toHaveAttribute('href', '#repos');

  await viewAll.click();
  await expect(page.locator('.flex-list > .flex-item:visible')).toHaveCount(REPOS.length);
  await expect(searchInput).toBeVisible(); // native filter/sort/search toolbar never touched or hidden
  await expect(pager).toBeVisible();
  await expect(nextPageLink).toHaveAttribute('href', /page=2/); // native pager href untouched by the cap/reveal

  await page.goBack();
  await expect(page.locator('.flex-list > .flex-item:visible')).toHaveCount(10); // back/forward round-trips the cap
  await page.goForward();
  await expect(page.locator('.flex-list > .flex-item:visible')).toHaveCount(REPOS.length);

  const languages = await page.locator('.hgh-org-language-list li').allTextContents();
  expect(languages.some((t) => t.includes('Python'))).toBe(true);
  await expect(page.locator('.hgh-org-topic-list .hgh-org-topic').first()).toBeHidden();

  await page.evaluate(() => { window.restoreOrganization(); });
  await expect(page.locator('.page-content.organization.profile')).not.toHaveClass(/hgh-org-profile/);
  await expect(page.locator('.hgh-org-view-all-bottom')).toHaveCount(0);
  await expect(page.locator('.hgh-org-sidebar')).toHaveCount(0);
  await expect(page.locator('.flex-list > .flex-item')).toHaveCount(REPOS.length); // every row still present, none dropped
  await expect(nextPageLink).toHaveAttribute('href', /page=2/);
});

test('overview owns a ten-row preview, never the dashboard repository pager', async ({page}) => {
  await prepare(page);
  await expect(page.locator('#dashboard-repo-list .repo-owner-name-list > li:visible')).toHaveCount(10);
  await expect(page.locator('#dashboard-repo-list .ui.borderless.pagination')).toBeHidden();
  await expect(page.getByRole('link', {name: 'View all repositories', exact: true})).toHaveCount(1);
  await page.getByRole('link', {name: 'View all repositories', exact: true}).click();
  await expect(page.locator('#dashboard-repo-list .ui.borderless.pagination')).toBeVisible();
  await expect(page.locator('.hgh-org-sidebar')).toBeHidden();
  await expect(page.locator('.hgh-org-heatmap')).toBeHidden();
  await expect(page.locator('.hgh-org-activity')).toBeHidden();
  await page.goBack();
  await expect(page.locator('#dashboard-repo-list .ui.borderless.pagination')).toBeHidden();
});

test('public repository view hides overview context and keeps native pagination in repository history', async ({page}) => {
  await page.route('https://native-ui.test/ultrabricks', (route) => route.fulfill({contentType: 'text/html', body: bigProfileFixture}));
  await page.goto('https://native-ui.test/ultrabricks');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => window.enhanceOrganization());
  await expect(page.locator('.center.page.buttons')).toBeHidden();
  await page.getByRole('link', {name: 'View all repositories', exact: true}).click();
  await expect(page.locator('.hgh-org-sidebar')).toBeHidden();
  await expect(page.locator('.center.page.buttons')).toBeVisible();
  const next = page.locator('.center.page.buttons a.navigation[href]').first();
  await expect(next).toHaveAttribute('href', /page=2.*#repos$/);
  await page.goBack();
  await expect(page.locator('.center.page.buttons')).toBeHidden();
  await expect(page.locator('.hgh-org-sidebar')).toBeVisible();
  await page.goForward();
  await page.evaluate(() => window.enhanceOrganization());
  await expect(page.locator('.hgh-org-view-all')).toHaveCount(1);
});

test('small public organizations still support focused repository and overview views', async ({page}) => {
  await page.route('https://native-ui.test/ultrabricks', (route) => route.fulfill({contentType: 'text/html', body: profileFixture}));
  await page.goto('https://native-ui.test/ultrabricks#repos');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => window.enhanceOrganization());
  await expect(page.locator('.segment.members')).toBeHidden();
  await page.getByRole('link', {name: 'Overview', exact: true}).click();
  await expect(page.locator('.segment.members')).toBeVisible();
  await expect(page.getByRole('link', {name: 'View all repositories', exact: true})).toBeVisible();
});

test('public overview derives statistics, heatmap and chronological activity from viewer-scoped data', async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00Z'));
  await page.route('https://native-ui.test/ultrabricks', (route) => route.fulfill({contentType: 'text/html', body: bigProfileFixture}));
  await page.route('**/api/v1/orgs/ultrabricks/activities/feeds?*', route => route.fulfill({json: [
    {id: 1, created: '2026-10-01T09:00:00Z', op_type: 'create_issue', act_user: {login: 'alex'}, repo: {full_name: 'ultrabricks/rig-cli', html_url: 'https://native-ui.test/ultrabricks/rig-cli'}},
    {id: 2, created: '2026-10-01T10:00:00Z', op_type: 'commit_repo', act_user: {login: 'morgan'}, repo: {full_name: 'ultrabricks/rig-cli', html_url: 'https://native-ui.test/ultrabricks/rig-cli'}},
  ]}));
  await page.goto('https://native-ui.test/ultrabricks');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => window.enhanceOrganization());
  await expect(page.locator('.hgh-org-activity .flex-item')).toHaveCount(2);
  await expect(page.locator('.hgh-org-activity .flex-item').first()).toContainText('morgan');
  await expect(page.locator('.hgh-org-heatmap [data-count="2"]')).toHaveCount(1);
  await expect(page.locator('.hgh-org-statistics')).toContainText('2 recent events');
  const order = await page.evaluate(() => {
    const heatmap = document.querySelector('.hgh-org-heatmap');
    const repos = document.querySelector('.ui.mobile.reversed.stackable.grid');
    const activity = document.querySelector('.hgh-org-activity');
    return [!!(heatmap.compareDocumentPosition(repos) & 4), !!(repos.compareDocumentPosition(activity) & 4)];
  });
  expect(order).toEqual([true, true]);
  await page.getByRole('link', {name: 'View all repositories', exact: true}).click();
  await expect(page.locator('.hgh-org-activity')).toBeHidden();
  await expect(page.locator('.hgh-org-heatmap')).toBeHidden();
  await page.evaluate(() => { window.restoreOrganization(); window.enhanceOrganization(); });
  await expect(page.locator('.hgh-org-heatmap')).toHaveCount(0);
  await page.getByRole('link', {name: 'Overview', exact: true}).click();
  await expect(page.locator('.hgh-org-heatmap')).toHaveCount(1);
});

for (const query of ['utm_source=share', 'id=organization--overview&viewMode=story', 'q=rig', 'page=2', 'sort=recentupdate', 'language=Nix', 'archived=0', 'fork=1', 'mirror=0', 'template=1', 'private=0']) {
  const repositoryQuery = !query.startsWith('utm_') && !query.startsWith('id=');
  test(`${repositoryQuery ? 'native repository' : 'unrelated URL'} parameters select the correct organization view: ${query}`, async ({page}) => {
    await page.route(`https://native-ui.test/ultrabricks?${query}`, route => route.fulfill({contentType: 'text/html', body: profileFixture}));
    await page.goto(`https://native-ui.test/ultrabricks?${query}`);
    await page.addScriptTag({content: core + '\n' + organization});
    await page.evaluate(() => window.enhanceOrganization());
    await expect(page.locator('.page-content.organization.profile')).toHaveAttribute('data-hgh-org-view', repositoryQuery ? 'repos' : 'overview');
    await expect(page.locator('.segment.members')).toBeVisible({visible: !repositoryQuery});
    if (repositoryQuery) {
      await page.getByRole('link', {name: 'Overview', exact: true}).click();
      await expect(page.locator('.segment.members')).toBeVisible();
      expect(new URL(page.url()).search.slice(1)).toBe(query);
      await page.goBack();
      await expect(page.locator('.segment.members')).toBeHidden();
    }
  });
}

test('native dashboard repository queries select the focused view without dropping query state', async ({page}) => {
  await mockRoutes(page);
  const url = 'https://native-ui.test/dashboard?repo-search-query=rig&repo-search-filter=sources&repo-search-page=2';
  await page.route(url, route => route.fulfill({contentType: 'text/html', body: fixture}));
  await page.goto(url);
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => window.enhanceOrganization());
  await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view', 'repos');
  await expect(page.locator('.hgh-org-sidebar')).toBeHidden();
  expect(new URL(page.url()).search).toBe(new URL(url).search);
});

test('Overview selection survives a native query update before its hashchange event', async ({page}) => {
  await prepare(page);
  await page.locator('[data-hgh-org-tab="repos"]').click();
  await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view', 'repos');
  await page.evaluate(() => {
    document.querySelector('[data-hgh-org-tab="overview"]').click();
    history.replaceState({}, '', '?repo-search-query=rig');
  });
  await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view', 'overview');
  await page.evaluate(() => window.enhanceOrganization());
  expect(new URL(page.url()).hash).toBe('#overview');
  expect(new URL(page.url()).search).toBe('?repo-search-query=rig');
});

test('hashless dashboard follows native repository query updates after enhancement', async ({page}) => {
  await prepare(page);
  await page.evaluate(() => {
    history.replaceState({}, '', '?repo-search-query=rig');
    window.enhanceOrganization();
  });
  await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view', 'repos');
  await expect(page.locator('#dashboard-repo-list .pagination')).toBeVisible();
  await expect(page.locator('.hgh-org-sidebar')).toBeHidden();
  expect(new URL(page.url()).search).toBe('?repo-search-query=rig');
});

test('native dashboard replaceState retains the selected hash view through repository remounts', async ({page}) => {
  await prepare(page);
  await page.getByRole('link', {name: 'View all repositories', exact: true}).click();
  await page.evaluate(() => {
    history.replaceState({}, '', '?repo-search-query=rig&repo-search-page=2');
    window.enhanceOrganization();
  });
  await expect(page).toHaveURL(/repo-search-query=rig&repo-search-page=2#repos$/);
  await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view', 'repos');
  await page.getByRole('link', {name: 'Overview', exact: true}).click();
  await page.evaluate(() => {
    history.replaceState({}, '', '?repo-search-query=rig&repo-search-page=2');
    window.enhanceOrganization();
  });
  await expect(page).toHaveURL(/#overview$/);
  await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view', 'overview');
  await page.goBack();
  await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view', 'repos');
  await expect(page.locator('.hgh-org-page')).toHaveCount(1);
});

for (const appearance of appearances) {
  test(`organization surface proof ${appearance.scheme} ${appearance.motion}`, async ({page}, testInfo) => {
    await prepare(page);
    await applyAppearance(page, appearance);
    await expect(page.locator('#dashboard-repo-list .repo-owner-name-list > li:visible')).toHaveCount(10);
    await expect(page.locator('#dashboard-repo-list .pagination')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureProof(page, testInfo, 'overview');
    await page.getByRole('link', {name: 'View all repositories', exact: true}).click();
    await expect(page.locator('.hgh-org-sidebar')).toBeHidden();
    await expect(page.locator('.hgh-org-activity')).toBeHidden();
    await expect(page.locator('.hgh-org-heatmap')).toBeHidden();
    await expect(page.locator('#dashboard-repo-list .pagination')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureProof(page, testInfo, 'repositories');
  });
}

test('compact activity aligns event icons beside content rather than stacking them below comments', async ({page}) => {
  await prepare(page);
  const offset = await page.locator('#activity-feed > .flex-item').first().evaluate(row => {
    const main = row.querySelector('.flex-item-main').getBoundingClientRect();
    const icon = row.querySelector('.flex-item-trailing').getBoundingClientRect();
    return {top: Math.abs(icon.top - main.top), right: icon.left >= main.right};
  });
  expect(offset.top).toBeLessThanOrEqual(1);
  expect(offset.right).toBe(true);
});

test('repository-only public navigation defers activity until Overview is first visited', async ({page}) => {
  let requests = 0;
  await page.route('https://native-ui.test/ultrabricks', route => route.fulfill({contentType: 'text/html', body: bigProfileFixture}));
  await page.route('**/api/v1/orgs/ultrabricks/activities/feeds?*', route => {
    requests++;
    return route.fulfill({json: []});
  });
  await page.goto('https://native-ui.test/ultrabricks#repos');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => window.enhanceOrganization());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(requests).toBe(0);
  await page.getByRole('link', {name: 'Overview', exact: true}).click();
  await expect(page.locator('.hgh-org-statistics')).toContainText('0 recent events');
  expect(requests).toBe(1);
  await page.getByRole('link', {name: 'Repositories', exact: true}).click();
  await page.getByRole('link', {name: 'Overview', exact: true}).click();
  expect(requests).toBe(1);
});

test('public activity arriving while hidden is clamped when Overview becomes visible', async ({page}) => {
  let release;
  const responseGate = new Promise(resolve => { release = resolve; });
  await page.route('https://native-ui.test/ultrabricks', route => route.fulfill({contentType: 'text/html', body: bigProfileFixture}));
  await page.route('**/api/v1/orgs/ultrabricks/activities/feeds?*', async route => {
    await responseGate;
    await route.fulfill({json: [{created: new Date().toISOString(), comment: {body: 'Long comment with visible text. '.repeat(80)}}]});
  });
  await page.goto('https://native-ui.test/ultrabricks');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => window.enhanceOrganization());
  await page.getByRole('link', {name: 'Repositories', exact: true}).click();
  release();
  await expect(page.locator('.hgh-org-activity .markup')).toHaveCount(1);
  await page.getByRole('link', {name: 'Overview', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Show more'})).toBeVisible();
  await expect(page.locator('.hgh-org-activity .markup')).toHaveClass(/hgh-org-clamped/);
});

test('cookie-authenticated public Overview uses native organization activity without API credentials', async ({page}) => {
  const server = http.createServer((request, response) => {
    if (request.url === '/ultrabricks') {
      response.writeHead(200, {'content-type': 'text/html'});
      response.end(bigProfileFixture);
    } else if (request.url === '/org/ultrabricks/dashboard' && request.headers.cookie?.includes('fixture_session=member')) {
      response.writeHead(200, {'content-type': 'text/html'});
      response.end(`<div class="page-content dashboard feeds">
        <div id="user-heatmap" data-heatmap-data='[{"timestamp":${Math.floor(Date.now() / 1000)},"contributions":7}]' data-locale-total-contributions="7 contributions in the last 12 months"></div>
        <div id="activity-feed"><div class="flex-item"><div class="flex-item-main"><a href="/ultrabricks/private/issues/1">Private issue</a><div class="markup">Member-visible comment</div></div></div></div></div>`);
    } else {
      response.writeHead(401);
      response.end('API token required');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.context().addCookies([{name: 'fixture_session', value: 'member', url: origin}]);
    await page.goto(`${origin}/ultrabricks`);
    await page.addScriptTag({content: core + '\n' + organization});
    await page.evaluate(() => window.enhanceOrganization());
    await expect(page.locator('.hgh-org-activity')).toContainText('Member-visible comment');
    await expect(page.getByRole('link', {name: 'Private issue'})).toHaveAttribute('href', '/ultrabricks/private/issues/1');
    await expect(page.locator('.hgh-org-heatmap [data-count="7"]')).toHaveCount(1);
    await expect(page.locator('.hgh-org-statistics')).toContainText('7 contributions');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('native activity links survive malformed optional contribution data', async ({page}) => {
  await page.route('https://native-ui.test/ultrabricks', route => route.fulfill({contentType: 'text/html', body: bigProfileFixture}));
  await page.route('https://native-ui.test/org/ultrabricks/dashboard', route => route.fulfill({contentType: 'text/html', body: `<div class="page-content dashboard feeds">
    <div id="user-heatmap" data-heatmap-data="invalid-json"></div>
    <div id="activity-feed"><div class="flex-item"><div class="flex-item-main"><a href="/ultrabricks/private/issues/1">Original native discussion</a></div></div></div></div>`}));
  await page.goto('https://native-ui.test/ultrabricks');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => window.enhanceOrganization());
  await expect(page.getByRole('link', {name: 'Original native discussion'})).toHaveAttribute('href', '/ultrabricks/private/issues/1');
  await expect(page.locator('.hgh-org-heatmap')).toContainText('Contribution calendar is unavailable.');
  await expect(page.locator('.hgh-org-heatmap [data-count]')).toHaveCount(0);
});

test('relocated native First navigation retains repository view in production enhancer order', async ({page}) => {
  const model = (await fs.readFile(new URL('../../src/pagination-model.mjs', import.meta.url), 'utf8')).replaceAll('export ', '');
  const pagination = (await fs.readFile(new URL('../../src/pagination.mjs', import.meta.url), 'utf8')).replace(/^import.*$/mg, '').replaceAll('export ', '');
  await page.route(/^https:\/\/native-ui.test\/ultrabricks(?:\?.*)?$/, route => route.fulfill({contentType: 'text/html', body: bigProfileFixture}));
  await page.clock.install();
  await page.goto('https://native-ui.test/ultrabricks?page=3#repos');
  await page.addScriptTag({content: core + '\n' + model + '\n' + pagination + '\n' + organization});
  await page.evaluate(() => {
    document.querySelector('.pagination').innerHTML = '<a class="item navigation" href="/ultrabricks"><span class="navigation_label">First</span></a><a class="item navigation" href="/ultrabricks?page=2"><span class="navigation_label">Previous</span></a><a class="active item">3</a><a class="item navigation" href="/ultrabricks?page=4"><span class="navigation_label">Next</span></a><a class="item navigation" href="/ultrabricks?page=5"><span class="navigation_label">Last</span></a>';
    window.enhancePagination();
    window.enhanceOrganization();
  });
  const first = page.locator('.hgh-pagination a').filter({hasText: 'First'});
  await expect(first).toHaveAttribute('href', '/ultrabricks#repos');
  await page.locator('.hgh-pagination').hover();
  await page.clock.runFor(2000);
  await first.click();
  await expect(page).toHaveURL('https://native-ui.test/ultrabricks#repos');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => window.enhanceOrganization());
  await expect(page.locator('.hgh-org-profile')).toHaveAttribute('data-hgh-org-view', 'repos');
});

test('imported screenshot requests wait until the visible comment is expanded', async ({page}) => {
  let imageRequests = 0;
  await page.route('https://native-ui.test/attachment*.svg', route => {
    imageRequests++;
    return route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="red"/></svg>'});
  });
  await page.route('https://native-ui.test/ultrabricks', route => route.fulfill({contentType: 'text/html', body: bigProfileFixture}));
  await page.route('https://native-ui.test/org/ultrabricks/dashboard', route => route.fulfill({contentType: 'text/html', body: `<div class="page-content dashboard feeds">
    <div id="activity-feed"><div class="flex-item"><div class="flex-item-main"><a href="/ultrabricks/private/issues/1">Native discussion</a>
    <div class="markup"><p>Screenshot context</p><img src="/attachment.svg" srcset="/attachment@2x.svg 2x" width="120" height="80" alt="Native screenshot"></div>
    </div></div></div></div>`}));
  await page.goto('https://native-ui.test/ultrabricks');
  await page.addScriptTag({content: core + '\n' + organization});
  await page.evaluate(() => window.enhanceOrganization());
  const toggle = page.getByRole('button', {name: 'Show more'});
  await toggle.scrollIntoViewIfNeeded();
  await page.waitForLoadState('networkidle');
  expect(imageRequests).toBe(0);
  await toggle.click();
  const image = page.getByAltText('Native screenshot');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBe(120);
  expect(imageRequests).toBe(1);
  await expect(image).toHaveAttribute('src', '/attachment.svg');
  await expect(image).toHaveAttribute('srcset', '/attachment@2x.svg 2x');
});

for(const nativeInert of [true,false]){
  test(`native inert changes while collapsed are preserved on disclosure (${nativeInert})`,async({page})=>{
    await prepare(page);
    await page.evaluate(()=>{
      const body=document.querySelector('#activity-feed .markup');
      const button=document.createElement('button');button.id='native-owned-inert';button.textContent='Native action';body.append(button);
    });
    const control=page.locator('#native-owned-inert');
    await expect(control).toHaveJSProperty('inert',true);
    await control.evaluate((node,value)=>{node.inert=true;if(!value)node.inert=false;},nativeInert);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await expect(control).toHaveJSProperty('inert',true);
    await page.getByRole('button',{name:'Show more',exact:true}).click();
    await expect(control).toHaveJSProperty('inert',nativeInert);
    await page.evaluate(()=>window.restoreOrganization(document));
    await expect(control).toHaveJSProperty('inert',nativeInert);
  });
}

test('native important flex utility cannot expose overview rows after the tenth',async({page})=>{
  await prepare(page);
  // Exact public Forgejo16.0.3 utility declaration captured from assets/css/index.css.
  await page.addStyleTag({content:'.tw-flex{display:flex!important}'});
  const rows=page.locator('#dashboard-repo-list .repo-owner-name-list>li:visible');
  await expect(rows).toHaveCount(10);
  await page.locator('.hgh-org-view-all').click();
  await expect(rows).toHaveCount(VISIBLE_COUNT);
  await page.goBack();
  await expect(rows).toHaveCount(10);
});

test('an initially native-inert clipped control stays protected when the widget clears inert',async({page})=>{
  await prepare(page);
  await page.evaluate(()=>{
    const body=document.querySelector('#activity-feed .markup');
    const control=document.createElement('button');control.id='initially-native-inert';control.textContent='Widget action';control.inert=true;body.append(control);
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const control=page.locator('#initially-native-inert');
  await control.evaluate(node=>{node.inert=false;});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(control).toHaveJSProperty('inert',true);
  await page.getByRole('button',{name:'Show more',exact:true}).click();
  await expect(control).toHaveJSProperty('inert',false);
});

test('feed lifecycle observes ancestor child lists without a document-wide subtree observer',async({page})=>{
  await page.addInitScript(()=>{
    const observe=MutationObserver.prototype.observe;
    window.documentSubtreeObservations=0;
    MutationObserver.prototype.observe=function(target,options){
      if((target===document||target===document.documentElement||target===document.body)&&options.subtree)window.documentSubtreeObservations++;
      return observe.call(this,target,options);
    };
  });
  await prepare(page);
  await expect.poll(()=>page.evaluate(()=>window.documentSubtreeObservations)).toBe(0);
  await page.evaluate(()=>{
    window.retainedFeed=document.querySelector('#activity-feed');
    const holder=document.createElement('section');holder.id='moved-feed-parent';document.body.append(holder);holder.append(window.retainedFeed);
  });
  await expect(page.locator('#activity-feed .hgh-org-toggle')).toHaveCount(1);
  await page.evaluate(()=>document.querySelector('#moved-feed-parent').remove());
  await expect.poll(()=>page.evaluate(()=>window.retainedFeed.querySelectorAll('.hgh-org-toggle').length)).toBe(0);
});
