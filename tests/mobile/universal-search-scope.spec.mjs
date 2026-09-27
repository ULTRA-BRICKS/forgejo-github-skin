import {test, expect} from '@playwright/test';
import fs from 'node:fs/promises';

// Same technique as organization.spec.mjs/repository-controls.spec.mjs: concatenate the real
// source files (stripping module syntax) into one classic script so these tests exercise the
// production parser/enhancer, not a hand-rolled model of it.
const core = (await fs.readFile(new URL('../../src/core.mjs', import.meta.url), 'utf8')).replaceAll('export ', '');
const universalSearch = (await fs.readFile(new URL('../../src/universal-search.mjs', import.meta.url), 'utf8'))
  .replace(/^import.*$/mg, '')
  .replaceAll('export ', '');

const htmlDoc = (body) => `<!doctype html><html><body>${body}</body></html>`;
const REPO_FIXTURE = '<div class="repo-header"><div class="flex-item-title"><a href="/acme">acme</a> / <a href="/acme/project">project</a></div></div>';
const PROFILE_FIXTURE = '<div role="main" class="page-content organization profile"></div>';
// A user profile page is the org profile marker's closest cousin — same bare `/<name>` shape,
// no "organization" in the class list. Must never be scoped as an owner.
const USER_PROFILE_FIXTURE = '<div role="main" class="page-content user profile"></div>';
// The org context switcher: shared by the dashboard AND the bare `/<org>/issues`,`/<org>/pulls`
// cross-repo aggregate hand-off pages. `login` drives the `.right.menu` "View home" href (the
// value parseSearchContext must read); `displayName` (defaults to `login`) is the possibly-a-
// FullName `.truncated-item-name` text that must NEVER be read as the owner.
const orgNav = (login, displayName = login) => '<div class="secondary-nav"><div class="ui secondary stackable menu"><div class="item"><span class="text truncated-item-container"><span class="truncated-item-name">' + displayName + '</span></span></div><div class="right menu"><a class="item" href="/org/' + login + '/dashboard">Activity</a><div class="item"><a class="ui basic button" href="/' + login + '">View home</a></div></div></div></div>';
const DASHBOARD_FIXTURE = orgNav('acme');
// Same context-switcher shape but with no `.right.menu` — the personal (non-organization)
// dashboard, which must never be scoped as an owner.
const PERSONAL_DASHBOARD_FIXTURE = '<div class="secondary-nav"><div class="ui secondary stackable menu"><div class="item"><span class="text truncated-item-container"><span class="truncated-item-name">acme</span></span></div></div></div>';

// bfcache can restore a prior same-origin document (with its globals intact) instead of
// re-running scripts on goBack/goForward; guard re-injection so it never depends on that.
async function ensureInjected(page) {
  const ready = await page.evaluate(() => typeof window.parseSearchContext === 'function');
  if (!ready) await page.addScriptTag({content: core + '\n' + universalSearch});
}
async function mount(page, url, body) {
  await page.route(url, (route) => route.fulfill({contentType: 'text/html', body: htmlDoc(body)}));
  await page.goto(url);
  await ensureInjected(page);
}

function setConfig(page, config) {
  return page.evaluate((cfg) => { window.config = cfg; }, config);
}

function parseCtx(page) {
  return page.evaluate(() => window.parseSearchContext(document));
}

function openSearch(page, seed = '') {
  return page.evaluate((seedValue) => {
    window.enhanceUniversalSearch(document, {
      fetchImpl: (url) => {
        document.body.dataset.lastSearchUrl = String(url);
        return Promise.resolve(new Response(JSON.stringify({results: []}), {status: 200, headers: {'Content-Type': 'application/json'}}));
      },
    });
    window.openUniversalSearch(document, {seed: seedValue});
  }, seed);
}

function scopeRadios(page) {
  return page.locator('#hgh-universal-search [role="radio"]').evaluateAll(
    (nodes) => nodes.map((n) => ({scope: n.dataset.scope, label: n.textContent, checked: n.getAttribute('aria-checked')})),
  );
}

test('org dashboard and its overview/prs/issues/activity hash views default to owner scope with no repo radio', async ({page}) => {
  const url = 'https://native-ui.test/org/acme/dashboard';
  await mount(page, url, DASHBOARD_FIXTURE);
  for (const hash of ['', '#overview', '#prs', '#issues', '#activity']) {
    if (hash) await page.goto(url + hash); // same-document hash navigation; script/context survive
    const ctx = await parseCtx(page);
    expect(ctx, 'hash ' + hash).toEqual({repo: null, owner: 'acme'});
    await openSearch(page);
    const radios = await scopeRadios(page);
    expect(radios.map((r) => r.scope), 'hash ' + hash).toEqual(['owner', 'global']);
    expect(radios[0]).toMatchObject({label: 'acme', checked: 'true'});
  }
});

test('public org profile page (/acme) scopes to the org, never to a bogus repo', async ({page}) => {
  await mount(page, 'https://native-ui.test/acme', PROFILE_FIXTURE);
  expect(await parseCtx(page)).toEqual({repo: null, owner: 'acme'});
  await openSearch(page);
  expect((await scopeRadios(page)).map((r) => r.scope)).toEqual(['owner', 'global']);
});

test('nested repository routes still resolve repo scope from the native repo header, unaffected by the org-scope fix', async ({page}) => {
  await mount(page, 'https://native-ui.test/acme/project/issues/17', REPO_FIXTURE);
  expect(await parseCtx(page)).toEqual({repo: 'acme/project', owner: 'acme'});
  await openSearch(page);
  const radios = await scopeRadios(page);
  expect(radios.map((r) => r.scope)).toEqual(['repo', 'owner', 'global']);
  expect(radios[0]).toMatchObject({label: 'This repository', checked: 'true'});
});

test('bare /<org>/issues and /<org>/pulls aggregate hand-off pages resolve owner scope from the org nav switcher, not the pathname shape', async ({page}) => {
  for (const path of ['/acme/issues', '/acme/pulls']) {
    await mount(page, 'https://native-ui.test' + path, DASHBOARD_FIXTURE);
    expect(await parseCtx(page), path).toEqual({repo: null, owner: 'acme'});
    await openSearch(page);
    expect((await scopeRadios(page)).map((r) => r.scope), path).toEqual(['owner', 'global']);
  }
});

test('an org display name (FullName) is never read as the owner — only the canonical View-home login', async ({page}) => {
  await mount(page, 'https://native-ui.test/org/acme/dashboard', orgNav('acme', 'Acme Corporation'));
  expect(await parseCtx(page)).toEqual({repo: null, owner: 'acme'});
  await openSearch(page);
  expect((await scopeRadios(page))[0]).toMatchObject({scope: 'owner', label: 'acme', checked: 'true'});
});

test('the personal (non-organization) dashboard nav is never scoped as an owner', async ({page}) => {
  await mount(page, 'https://native-ui.test/', PERSONAL_DASHBOARD_FIXTURE);
  expect(await parseCtx(page)).toEqual({repo: null, owner: null});
  await openSearch(page);
  expect((await scopeRadios(page)).map((r) => r.scope)).toEqual(['global']);
});

test('a user profile page (closest cousin of the org profile marker) is never scoped as an owner', async ({page}) => {
  await mount(page, 'https://native-ui.test/alex', USER_PROFILE_FIXTURE);
  expect(await parseCtx(page)).toEqual({repo: null, owner: null});
});

for (const path of ['/explore/repos', '/user/login', '/notifications', '/admin', '/org/create']) {
  test('global route ' + path + ' never inherits a bogus owner or repo scope', async ({page}) => {
    await mount(page, 'https://native-ui.test' + path, '');
    expect(await parseCtx(page)).toEqual({repo: null, owner: null});
    await openSearch(page);
    const radios = await scopeRadios(page);
    expect(radios.map((r) => r.scope)).toEqual(['global']);
    expect(radios[0]).toMatchObject({checked: 'true'});
  });
}

test('a hostile encoded /org/ path segment never becomes an owner scope or query qualifier', async ({page}) => {
  // Decodes to " owner:evil" — whitespace + colon would otherwise inject a second `owner:`
  // qualifier into the backend query string.
  // No org-nav DOM marker here on purpose — otherwise orgNavName() would resolve 'acme' from
  // the DOM before this hostile path segment is even reached, hiding the case under test.
  await mount(page, 'https://native-ui.test/org/%20owner%3Aevil/dashboard', '');
  expect(await parseCtx(page)).toEqual({repo: null, owner: null});
  await openSearch(page, 'term');
  const radios = await scopeRadios(page);
  expect(radios.map((r) => r.scope)).toEqual(['global']);
  await expect.poll(() => page.locator('body').getAttribute('data-last-search-url')).toContain('term');
  const url = await page.locator('body').getAttribute('data-last-search-url');
  expect(url).not.toContain('owner%3Aevil');
  expect(url).not.toContain('owner%3A');
});

test('appSubUrl is stripped exactly once, even when the mount path echoes the prefix', async ({page}) => {
  // No org-nav/profile DOM markers here on purpose: this isolates the pathname/appSubUrl
  // stripping logic itself (parseSearchContext's last-resort fallback), not the DOM markers.
  await mount(page, 'https://native-ui.test/git/org/acme/dashboard', '');
  await setConfig(page, {appSubUrl: '/git'});
  expect(await parseCtx(page)).toEqual({repo: null, owner: 'acme'});

  // Org literally named the same as the subURL segment: a single correct strip leaves "/acme",
  // matching the org-profile marker; a buggy repeated/global strip would over-strip to "" and
  // silently fall back to global scope.
  await mount(page, 'https://native-ui.test/acme/acme', PROFILE_FIXTURE);
  await setConfig(page, {appSubUrl: '/acme'});
  expect(await parseCtx(page)).toEqual({repo: null, owner: 'acme'});

  // subURL itself literally "/org": a single strip leaves "/org/myorg/dashboard" (still matches
  // the reserved org-route regex); a double-strip would consume the real "org" segment too and
  // wrongly fall back to global.
  await mount(page, 'https://native-ui.test/org/org/myorg/dashboard', '');
  await setConfig(page, {appSubUrl: '/org'});
  expect(await parseCtx(page)).toEqual({repo: null, owner: 'myorg'});
});

test('org dashboard and org profile routes resolve correctly with no window.config present at all', async ({page}) => {
  await mount(page, 'https://native-ui.test/acme', PROFILE_FIXTURE);
  expect(await page.evaluate(() => window.config)).toBeUndefined();
  await expect(parseCtx(page)).resolves.toEqual({repo: null, owner: 'acme'});

  await mount(page, 'https://native-ui.test/org/acme/dashboard', DASHBOARD_FIXTURE);
  expect(await page.evaluate(() => window.config)).toBeUndefined();
  await expect(parseCtx(page)).resolves.toEqual({repo: null, owner: 'acme'});
});

test('an explicit repo:/owner: qualifier is never rewritten by the active scope', async ({page}) => {
  await mount(page, 'https://native-ui.test/org/acme/dashboard', DASHBOARD_FIXTURE);
  await openSearch(page, 'repo:foo/bar term');
  await expect.poll(() => page.locator('body').getAttribute('data-last-search-url')).toContain('q=repo%3Afoo%2Fbar%20term&limit=30');
  let url = await page.locator('body').getAttribute('data-last-search-url');
  expect(url).not.toContain('owner%3Aacme');

  await openSearch(page, 'owner:other-org term');
  await expect.poll(() => page.locator('body').getAttribute('data-last-search-url')).toContain('q=owner%3Aother-org%20term&limit=30');
  url = await page.locator('body').getAttribute('data-last-search-url');
  expect(url).not.toContain('owner%3Aacme');
});

test('browser back/forward and reopen update the search scope to match the current route', async ({page}) => {
  const repoUrl = 'https://native-ui.test/acme/project';
  const orgUrl = 'https://native-ui.test/org/acme/dashboard';
  await page.route(repoUrl, (route) => route.fulfill({contentType: 'text/html', body: htmlDoc(REPO_FIXTURE)}));
  await page.route(orgUrl, (route) => route.fulfill({contentType: 'text/html', body: htmlDoc(DASHBOARD_FIXTURE)}));

  await page.goto(repoUrl);
  await ensureInjected(page);
  expect(await parseCtx(page)).toEqual({repo: 'acme/project', owner: 'acme'});

  await page.goto(orgUrl);
  await ensureInjected(page);
  expect(await parseCtx(page)).toEqual({repo: null, owner: 'acme'});

  await page.goBack();
  await ensureInjected(page);
  expect(await parseCtx(page)).toEqual({repo: 'acme/project', owner: 'acme'});
  await openSearch(page);
  expect((await scopeRadios(page))[0]).toMatchObject({scope: 'repo', checked: 'true'});

  await page.goForward();
  await ensureInjected(page);
  expect(await parseCtx(page)).toEqual({repo: null, owner: 'acme'});
  await openSearch(page);
  expect((await scopeRadios(page))[0]).toMatchObject({scope: 'owner', checked: 'true'});
});
