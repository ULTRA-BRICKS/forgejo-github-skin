/**
 * @file Storybook fixture for Screens/Organization. Mounts a native-shaped Forgejo org
 * dashboard/profile DOM and runs the *production* `organization.mjs` enhancer against it — this is
 * not a bespoke visual mock, it is the same module `skin.mjs` loads in production.
 *
 * Accessed via: Storybook (`npm run storybook`) and the mobile Playwright suite
 * (`tests/mobile/expanded-pages.spec.mjs`), which opens each exported story by id.
 *
 * Assumptions: `enhanceOrganization` reads `window.fetch`/`window.config`, both installed here
 * before enhancement runs; the mounted node must already be attached to `document` before
 * `enhanceOrganization(document)` runs (it queries the live document, not the returned subtree), so
 * enhancement is deferred one microtask past `render()`.
 */
import {enhanceOrganization} from '../src/organization.mjs';
import '../src/organization.css';
import './organization-page.css';
import {REPOS} from './organization-fixtures.mjs';

// Deterministic, network-free image fixtures: screenshot regressions must not depend on
// picsum.photos/pravatar.cc availability or their (mutable) hosted content.
function avatarDataUri(letter, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="hsl(${hue},55%,55%)"/><text x="32" y="42" font-family="sans-serif" font-size="28" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
function placeholderScreenshotDataUri() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#d0d7de"/><rect x="24" y="24" width="592" height="24" fill="#8c959f"/><rect x="24" y="64" width="420" height="16" fill="#afb8c1"/></svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Fixture text is interpolated into innerHTML, unlike organization.mjs's own el()/textContent
// builder; escape it so a future edit to REPOS (e.g. adding a `&`/`<` to a description) can't
// mis-parse the markup around it.
function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
}
function repoLi(fullName) {
  return `<li class="tw-flex tw-items-center tw-py-2"><a class="repo-list-link muted" href="/${escapeHtml(fullName)}"><svg class="repo-list-icon" viewBox="0 0 16 16" width="16" height="16"></svg><div class="text truncate">${escapeHtml(fullName)}</div></a></li>`;
}

function activityFeedHtml(count) {
  const longComment = 'A very long pasted review comment reproducing exactly what the user flagged: giant, unsummarized text and a full-size pasted screenshot dominating the compact activity feed. '.repeat(3);
  return Array.from({length: count}, (_, i) => `<div class="flex-item"><div class="flex-item-leading"><img class="ui avatar" alt="" width="16" height="16"></div><div class="flex-item-main"><div>alex commented on ${escapeHtml(REPOS[i % REPOS.length][0])}${i === 2 ? '' : ' #' + (i + 12)}</div>${
    i === 2 ? `<div class="markup tw-text-14"><p>${longComment}</p><img src="${placeholderScreenshotDataUri()}" width="640" height="360" alt="screenshot"></div>` : ''
  }</div><div class="flex-item-trailing"><svg viewBox="0 0 16 16" width="32" height="32"><circle cx="8" cy="8" r="6" fill="currentColor"/></svg></div></div>`).join('');
}

// vue3-calendar-heatmap class names (`vch__container`, `vch__day__square`, `vch__legend`), confirmed
// against the published bundle. No Vue runtime here to mount the real widget, so this is a static
// substitute at GitHub's public 10px/3px cell geometry. No real contribution data exists for this
// demo, so every day cell stays at the empty level (no fake activity) — the green ramp is
// demonstrated only in the Less→More legend swatches.
function heatmapSvg() {
  const weeks = 20;
  const cell = 10;
  const gutter = 3;
  const step = cell + gutter;
  const squares = Array.from({length: weeks}, (_, week) => Array.from({length: 7}, (_, day) => {
    return `<rect class="vch__day__square" x="${week * step}" y="${day * step}" width="${cell}" height="${cell}" rx="2" fill="var(--color-secondary-alpha-60)"></rect>`;
  }).join('')).join('');
  const legend = ['--color-secondary-alpha-60', '--color-primary-light-4', '--color-primary-light-2', '--color-primary', '--color-primary-dark-2', '--color-primary-dark-4']
    .map((v, i) => `<rect class="vch__legend" x="${i * step}" y="0" width="${cell}" height="${cell}" rx="2" fill="var(${v})"></rect>`).join('');
  return `<div class="total-contributions">Heatmap cell/legend geometry fixture — no real contribution count in Storybook</div>
    <div class="vch__wrapper"><div class="vch__container">
      <svg class="vch__month__wrapper" viewBox="0 0 ${weeks * step} ${7 * step}" width="${weeks * step}" height="${7 * step}">${squares}</svg>
    </div>
    <div class="vch__external-legend-wrapper"><span>Less</span><svg viewBox="0 0 ${6 * step} ${cell}" width="${6 * step}" height="${cell}">${legend}</svg><span>More</span></div></div>`;
}

function dashboardHtml({repoCount, activityCount, alert}) {
  return `<div role="main" class="page-content dashboard feeds">
    <div class="secondary-nav"><div class="ui secondary stackable menu">
      <div class="item"><div class="ui floating dropdown jump"><span class="text">ultrabricks</span></div></div>
      <div class="item"><div class="ui floating dropdown jump"><span class="text">Teams</span></div></div>
      <div class="right menu">
        <a class="item" href="/org/ultrabricks/dashboard">Activity</a>
        <a class="item" href="/ultrabricks/issues">Issues</a>
        <a class="item" href="/ultrabricks/pulls">Pull requests</a>
        <div class="item"><a class="ui basic button" href="/ultrabricks">View home</a></div>
      </div>
    </div></div>
    <div class="ui container flex-container">
      <div class="flex-container-main">
        ${alert ? '<div class="ui message tw-mb-8">Your export finished. <a href="/ultrabricks/settings/export">Download</a></div>' : ''}
        ${activityCount ? `<div id="user-heatmap">${heatmapSvg()}</div><div class="divider"></div>` : ''}
        <div id="activity-feed" class="flex-list">${activityCount ? activityFeedHtml(activityCount) : ''}<div class="base-paginate"></div></div>
      </div>
      <div id="dashboard-repo-list" class="flex-container-sidebar"><div><div class="ui tab active list dashboard-repos">
        <div class="ui top attached segment repos-search"><div class="ui small fluid action left icon input"><input type="search" placeholder="Find a repository…"></div></div>
        <div class="ui attached table segment">
          <ul class="repo-owner-name-list">${REPOS.slice(0, repoCount).map(([name]) => repoLi(name)).join('')}</ul>
          ${repoCount ? '<div class="tw-text-center"><div class="divider tw-my-0"></div><div class="ui borderless pagination menu narrow tw-my-2"><a class="active item">1</a></div></div>' : ''}
        </div>
      </div></div></div>
    </div>
  </div>`;
}

function jsonResponse(body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {status: 200, headers: {'content-type': 'application/json', ...extraHeaders}});
}

/** Replaces `window.fetch` with a stub covering `/repo/search` and the org home page (both real
 * session-aware routes the production module calls); anything else passes through unmocked.
 * Captures the true original `fetch` once under a fixed key so re-invoking a story's render
 * (Storybook Controls/HMR can do this without a full iframe reload) never wraps its own mock. */
function installFetchMock({empty, errorState, loading}) {
  window.__hghOrgNativeFetch ??= window.fetch?.bind(window);
  const native = window.__hghOrgNativeFetch;
  window.fetch = (input) => {
    const href = typeof input === 'string' ? input : input.url;
    if (href.includes('/repo/search')) {
      if (href.includes('count_only=1')) return Promise.resolve(jsonResponse({}, {'X-Total-Count': String(empty ? 0 : REPOS.length)}));
      if (errorState) return Promise.resolve(new Response('', {status: 500}));
      if (loading) return new Promise(() => {}); // never resolves: demonstrates the loading status text
      const list = empty ? [] : REPOS;
      const data = list.map(([full_name, language, description, topics], i) => ({
        repository: {full_name, language, description, topics, stars_count: (i * 7) % 40, forks_count: (i * 3) % 10, open_issues_count: i % 6, updated_at: new Date(Date.now() - i * 86400000).toISOString()},
      }));
      return Promise.resolve(jsonResponse({data}, {'X-Total-Count': String(list.length)}));
    }
    if (/\/ultrabricks\/?$/.test(href) && !href.includes('repo/search')) {
      if (empty) return Promise.resolve(new Response('<div></div>', {status: 200, headers: {'content-type': 'text/html'}}));
      return Promise.resolve(new Response(
        `<div class="segment members"><a href="/alex" title="Alex"><img alt="" src="${avatarDataUri('A', 210)}"></a><a href="/morgan" title="Morgan"><img alt="" src="${avatarDataUri('M', 30)}"></a><a href="/casey" title="Casey"><img alt="" src="${avatarDataUri('C', 130)}"></a></div>`,
        {status: 200, headers: {'content-type': 'text/html'}},
      ));
    }
    return native ? native(input) : Promise.reject(new Error('fetch not mocked for ' + href));
  };
}

/** Shared by both exported mount functions: activates the opt-in skin gate (`data-theme`), the
 * demo-only dark override (`data-surface`, see organization-page.css), and the fetch stub. */
function setupOrgFixture(container, {dark, empty, loading, errorState} = {}) {
  document.documentElement.dataset.theme = 'hypergithub-light';
  installFetchMock({empty, errorState, loading});
  container.className = 'hgh-org-story';
  container.dataset.surface = dark ? 'dark' : 'light';
}

export function organizationDashboard({dark = false, view = 'overview', empty = false, loading = false, errorState = false, alert = false} = {}) {
  const container = document.createElement('div');
  setupOrgFixture(container, {dark, empty, loading, errorState});
  window.config = {appSubUrl: '', pageData: {dashboardRepoList: {organizationId: 6, uid: 0, teamId: 0, searchLimit: 12}}};
  container.innerHTML = dashboardHtml({repoCount: empty ? 0 : 12, activityCount: empty ? 0 : 7, alert});
  queueMicrotask(() => {
    enhanceOrganization(document);
    if (view !== 'overview') location.hash = view;
  });
  return container;
}

export function organizationProfile({dark = false} = {}) {
  const container = document.createElement('div');
  setupOrgFixture(container, {dark});
  const [rig, skin, ...rest] = REPOS;
  const card = ([name, language, description, topics]) => `<div class="flex-item"><div class="flex-item-leading"><svg class="octicon-repo" width="24" height="24"></svg></div><div class="flex-item-main"><div class="flex-item-header"><div class="flex-item-title"><a class="text primary name" href="/${escapeHtml(name)}">${escapeHtml(name.split('/')[1])}</a></div><div class="flex-item-trailing muted-links"><a href="?language=${escapeHtml(language)}"><i class="color-icon" style="background-color:#3572A5"></i>${escapeHtml(language)}</a><a href="/${escapeHtml(name)}/stars">${(name.length * 3) % 60} stars</a></div></div><div class="flex-item-body">${escapeHtml(description)}</div>${topics.length ? `<div class="repo-topics">${topics.map((t) => `<a class="ui label" href="/explore/repos?q=${escapeHtml(t)}&topic=1">${escapeHtml(t)}</a>`).join('')}</div>` : ''}<div class="flex-item-body">Updated <relative-time datetime="2026-09-27T12:00:00Z">2026-09-27</relative-time></div></div></div>`;
  container.innerHTML = `<div role="main" aria-label="ULTRA BRICKS" class="page-content organization profile">
    <div class="ui container tw-flex tw-gap-x-4"><img class="ui avatar org-avatar" alt="" src="${avatarDataUri('U', 260)}" width="100" height="100"><div id="org-info"><div class="org-header"><div class="org-title"><h1>ULTRA BRICKS</h1></div></div><div class="render-content markup"><p>Beta products and tools beyond HyperIDE.ai</p></div></div></div>
    <div class="ui container"><div class="ui mobile reversed stackable grid">
      <div class="ui eleven wide column"><div class="flex-list">${[rig, skin, ...rest].map(card).join('')}</div></div>
      <div class="ui five wide column">
        <h4 class="ui top attached header"><strong>Members</strong></h4>
        <div class="ui attached segment members"><a href="/alex" title="Alex"><img class="ui avatar" alt="" src="${avatarDataUri('A', 210)}"></a><a href="/morgan" title="Morgan"><img class="ui avatar" alt="" src="${avatarDataUri('M', 30)}"></a></div>
      </div>
    </div></div>
  </div>`;
  queueMicrotask(() => enhanceOrganization(document));
  return container;
}
