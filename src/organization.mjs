/**
 * @file Reshapes the native Forgejo org dashboard (`/org/<name>/dashboard`) into a GitHub-familiar
 * two-column overview, and lightly augments the public org profile (`/<name>`).
 *
 * Accessed via: skin.mjs boot()'s enhance()/teardown pass, same as every other enhancer in this
 * repo — called on every DOM mutation and on theme toggle, so both entry points must be idempotent.
 *
 * Assumptions: the dashboard repo list (`#dashboard-repo-list`) is a native Vue component
 * (`DashboardRepoList.vue`) that owns its own fetch/render/pagination/search; this module only
 * repositions that node and decorates rows after Vue renders them — it never re-implements the
 * widget or touches its `.pagination` markup logic. `/repo/search` is a session-aware *web* route
 * (unlike `/api/v1/*`, which requires a token even with a live browser session on this instance) and
 * is the only extra data source used to enrich rows with description/language/stars/forks/topics; a
 * slow or failing fetch must degrade to the native name-only rows, never fabricate data. Real
 * per-repo commit sparklines would need `/api/v1/repos/.../stats/*`, which 401s under cookie auth
 * here, so they are intentionally not implemented (documented limitation, not a bug).
 *
 * Past bugs: the whole `.flex-container` is detached from the document while its heatmap/feed/repo
 * list are on loan inside our wrapper, so restore must key off `comment.parentNode` (works on a
 * detached tree) rather than `comment.isConnected` (always false there) — checking `isConnected`
 * silently no-ops every restore and reattaches an empty native container.
 */
import {safeHref} from './core.mjs';

const dashboards = new Map();
const profiles = new Map();

const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Go: '#00ADD8', Rust: '#dea584',
  CSS: '#563d7c', HTML: '#e34c26', Shell: '#89e051', Java: '#b07219', Ruby: '#701516', C: '#555555',
  'C++': '#f34b7d', 'C#': '#178600', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Vue: '#41b883',
  Dockerfile: '#384d54', Markdown: '#083fa1', Lua: '#000080', Nix: '#7e7eff',
};
const ICON_PATHS = {
  star: '<path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>',
  fork: '<path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/>',
  issue: '<path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>',
};
function icon(doc, name, size = 16) {
  if (!ICON_PATHS[name]) throw new Error(`organization.mjs: unknown icon "${name}" — add it to ICON_PATHS`);
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('hgh-org-icon');
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}
function el(doc, tag, cls, text) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
/** Shared by row decorations and the sidebar language list: color dot + fallback for an unknown
 * or missing language name (LANGUAGE_COLORS only covers common linguist languages). */
function langDot(doc, name) {
  const dot = el(doc, 'span', 'hgh-org-lang-dot');
  dot.style.backgroundColor = LANGUAGE_COLORS[name] ?? 'var(--hgh-color-muted,#59636e)';
  return dot;
}
function relativeTime(iso) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const days = Math.round((Date.now() - then) / 86400000);
  const rtf = new Intl.RelativeTimeFormat('en', {numeric: 'auto'});
  if (Math.abs(days) < 1) return 'today';
  if (Math.abs(days) < 30) return rtf.format(-days, 'day');
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return rtf.format(-months, 'month');
  return rtf.format(-Math.round(months / 12), 'year');
}

function marker(doc, node) {
  const comment = doc.createComment('hgh-org-slot');
  node.before(comment);
  return comment;
}
/** Works whether `comment` currently lives in an attached or a detached tree: restore is
 * structural (parentNode), never relies on `isConnected`, which is always false while the
 * whole native `.flex-container` is on loan inside our wrapper. */
function restoreSlot(comment, node) {
  if (!comment.parentNode) return;
  comment.parentNode.insertBefore(node, comment);
  comment.remove();
}

function nativeAggregateLink(root, suffix) {
  const nav = root.querySelector('.secondary-nav .right.menu');
  if (!nav) return null;
  return [...nav.querySelectorAll('a[href]')].find((a) => {
    try { return new URL(a.href).pathname.replace(/\/+$/, '').endsWith(suffix); } catch { return false; }
  }) ?? null;
}

function repoSearchBase(win) {
  const sub = win.config?.appSubUrl ?? '';
  const orgId = win.config?.pageData?.dashboardRepoList?.organizationId;
  if (orgId === undefined) return null;
  return `${sub}/repo/search?sort=updated&order=desc&uid=${orgId}&team_id=0&q=&mode=&page=1&limit=100`;
}

/** Fetches enrichment data once; resolves to `{byName, repos}` — `byName` is looked up by both
 * `full_name` and the bare repo name (defensive fallback for row matching), `repos` is the unique
 * list for aggregation — or null on failure/abort. Never throws. */
async function fetchEnrichment(win, signal) {
  const url = repoSearchBase(win);
  if (!url) return null;
  try {
    const response = await win.fetch(url, {credentials: 'same-origin', headers: {Accept: 'application/json'}, signal});
    if (!response.ok) return null;
    const json = await response.json();
    const byName = new Map();
    const repos = [];
    for (const item of json.data ?? []) {
      const repo = item.repository ?? item;
      if (!repo?.full_name) continue;
      byName.set(repo.full_name, repo);
      const shortName = repo.full_name.split('/').at(-1);
      if (shortName && !byName.has(shortName)) byName.set(shortName, repo);
      repos.push(repo);
    }
    return {byName, repos};
  } catch {
    return null;
  }
}

const REPO_STATS = [['star', 'stars_count'], ['fork', 'forks_count'], ['issue', 'open_issues_count']];
function buildRepoDecoration(doc, repo) {
  const wrap = el(doc, 'div', 'hgh-org-repo-meta');
  if (repo.description) wrap.append(el(doc, 'p', 'hgh-org-repo-desc', repo.description));
  const stats = el(doc, 'div', 'hgh-org-repo-stats');
  if (repo.language) {
    const lang = el(doc, 'span', 'hgh-org-lang');
    lang.append(langDot(doc, repo.language), doc.createTextNode(repo.language));
    stats.append(lang);
  }
  for (const [iconName, field] of REPO_STATS) {
    if (!Number.isFinite(repo[field])) continue;
    const stat = el(doc, 'span', 'hgh-org-stat');
    stat.append(icon(doc, iconName), doc.createTextNode(String(repo[field])));
    stats.append(stat);
  }
  const when = repo.updated_at && relativeTime(repo.updated_at);
  if (when) stats.append(el(doc, 'span', 'hgh-org-stat hgh-org-updated', `Updated ${when}`));
  if (stats.childElementCount) wrap.append(stats);
  if (Array.isArray(repo.topics) && repo.topics.length) {
    const topics = el(doc, 'div', 'hgh-org-repo-topics');
    for (const topic of repo.topics.slice(0, 6)) topics.append(el(doc, 'span', 'hgh-org-topic', topic));
    wrap.append(topics);
  }
  return wrap;
}

function watchRepoEnrichment(state, doc, win) {
  const apply = () => {
    if (state.cancelled || !state.enrichment) return;
    for (const row of state.repoHost.querySelectorAll('.repo-owner-name-list > li:not([data-hgh-checked])')) {
      const name = row.querySelector('.repo-list-link .text.truncate')?.textContent?.trim();
      const repo = name && state.enrichment.byName.get(name);
      row.dataset.hghChecked = 'true';
      if (repo) row.append(buildRepoDecoration(doc, repo));
    }
  };
  state.enrichmentObserver = new win.MutationObserver(apply);
  state.enrichmentObserver.observe(state.repoHost, {childList: true, subtree: true});
  state.status.hidden = false;
  state.status.textContent = 'Loading repository details…';
  fetchEnrichment(win, state.abort.signal).then((result) => {
    if (state.cancelled) return;
    state.enrichment = result ?? {byName: new Map(), repos: []};
    state.status.hidden = result !== null;
    state.status.textContent = result === null ? 'Repository details are unavailable right now.' : '';
    apply();
  });
}

/** Fetches the public org profile page and lifts its already-rendered `.segment.members` avatars;
 * omitted entirely (no invented members) if the page has no visible members segment. */
async function loadPeople(win, homeHref, signal) {
  const href = safeHref(homeHref, win.location.href);
  if (!href) return [];
  try {
    const response = await win.fetch(href, {credentials: 'same-origin', signal});
    if (!response.ok) return [];
    const html = await response.text();
    const doc = new win.DOMParser().parseFromString(html, 'text/html');
    return [...doc.querySelectorAll('.segment.members > a')].map((a) => ({
      href: a.getAttribute('href'), title: a.getAttribute('title') ?? '', avatar: a.querySelector('img')?.getAttribute('src') ?? '',
    }));
  } catch {
    return [];
  }
}

function topLanguagesAndTopics(enrichment) {
  const languages = new Map();
  const topics = new Map();
  for (const repo of enrichment?.repos ?? []) {
    if (repo.language) languages.set(repo.language, (languages.get(repo.language) ?? 0) + 1);
    for (const topic of repo.topics ?? []) topics.set(topic, (topics.get(topic) ?? 0) + 1);
  }
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {languages: top(languages, 6), topics: top(topics, 8)};
}

function renderSidebar(state, doc) {
  const {sidebar} = state;
  sidebar.replaceChildren();
  if (state.people.length) {
    const section = el(doc, 'section', 'hgh-org-people');
    section.append(el(doc, 'h3', '', 'People'));
    const list = el(doc, 'div', 'hgh-org-people-list');
    for (const person of state.people.slice(0, 12)) {
      const a = el(doc, 'a', 'hgh-avatar');
      a.href = person.href;
      a.title = person.title;
      if (person.avatar) { const img = el(doc, 'img'); img.src = person.avatar; img.alt = ''; img.loading = 'lazy'; a.replaceChildren(img); }
      list.append(a);
    }
    section.append(list);
    sidebar.append(section);
  }
  const {languages, topics} = topLanguagesAndTopics(state.enrichment);
  if (languages.length) {
    const section = el(doc, 'section', 'hgh-org-languages');
    section.append(el(doc, 'h3', '', 'Top languages'));
    const list = el(doc, 'ul', 'hgh-org-language-list');
    for (const [name, count] of languages) {
      const item = el(doc, 'li');
      item.append(langDot(doc, name), doc.createTextNode(`${name} (${count})`));
      list.append(item);
    }
    section.append(list);
    sidebar.append(section);
  }
  if (topics.length) {
    const section = el(doc, 'section', 'hgh-org-topics');
    section.append(el(doc, 'h3', '', 'Topics'));
    const list = el(doc, 'div', 'hgh-org-topic-list');
    for (const [name] of topics) list.append(el(doc, 'span', 'hgh-org-topic', name));
    section.append(list);
    sidebar.append(section);
  }
}

const TABS = [
  ['overview', 'Overview'],
  ['repos', 'Repositories'],
  ['prs', 'Pull requests'],
  ['issues', 'Issues'],
  ['activity', 'Activity'],
];
const VIEWS = new Set(['overview', 'repos', 'activity']);

function buildTabs(doc, root) {
  const nav = el(doc, 'nav', 'hgh-org-tabs');
  nav.setAttribute('aria-label', 'Organization dashboard views');
  for (const [id, label] of TABS) {
    if ((id === 'prs' && !nativeAggregateLink(root, '/pulls')) || (id === 'issues' && !nativeAggregateLink(root, '/issues'))) continue;
    const a = el(doc, 'a', '', label);
    a.href = `#${id}`;
    a.dataset.hghOrgTab = id;
    nav.append(a);
  }
  return nav;
}

function applyHash(state) {
  const raw = (state.win.location.hash || '#overview').slice(1);
  if (raw === 'prs' || raw === 'issues') {
    const link = nativeAggregateLink(state.root, raw === 'prs' ? '/pulls' : '/issues');
    if (link) { state.win.location.hash = ''; state.navigate(link.href); return; }
  }
  const view = VIEWS.has(raw) ? raw : 'overview';
  state.page.dataset.hghOrgView = view;
  for (const tab of state.tabs.querySelectorAll('a[data-hgh-org-tab]')) {
    if (tab.dataset.hghOrgTab === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}

function collapseLongContent(doc, item, collapsed) {
  const body = item.querySelector('.flex-item-main .markup');
  if (!body || body.dataset.hghCollapsible) return;
  const threshold = 96; // ~3 lines of body copy before we offer to collapse it
  if (body.scrollHeight <= threshold + 4 && !body.querySelector('img')) return;
  body.dataset.hghCollapsible = 'true';
  body.classList.add('hgh-org-clamped');
  const toggle = el(doc, 'button', 'hgh-org-toggle', 'Show more');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    const expanded = !body.classList.toggle('hgh-org-clamped');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Show less' : 'Show more';
  });
  body.after(toggle);
  collapsed.push({body, toggle});
}

function compactActivity(doc, feed, state) {
  for (const svg of feed.querySelectorAll('.flex-item-trailing > svg')) {
    state.iconSizes.push({svg, width: svg.getAttribute('width'), height: svg.getAttribute('height')});
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
  }
  for (const item of feed.querySelectorAll(':scope > .flex-item')) collapseLongContent(doc, item, state.collapsed);
}

function buildDashboardPage(root, doc, win) {
  const flex = root.querySelector('.ui.container.flex-container, .flex-container');
  const main = flex?.querySelector('.flex-container-main');
  // `#dashboard-repo-list` IS the `.flex-container-sidebar` column (same element, per
  // templates/user/dashboard/repolist.tmpl) — Vue mounts into it without replacing the node.
  const repoHost = flex?.querySelector('#dashboard-repo-list.flex-container-sidebar');
  if (!flex || !main || !repoHost) return null;

  const heatmap = main.querySelector('#user-heatmap');
  const heatmapDivider = heatmap?.nextElementSibling?.classList.contains('divider') ? heatmap.nextElementSibling : null;
  const feed = main.querySelector('#activity-feed');
  const heatmapMarker = heatmap ? marker(doc, heatmap) : null;
  const feedMarker = feed ? marker(doc, feed) : null;
  const repoHostMarker = marker(doc, repoHost);
  heatmapDivider?.remove();
  // Anything else server-rendered into `.flex-container-main` (a flash alert, or the "guide" empty
  // state shown when the org has no feed items) must not silently vanish with the detached `flex`.
  const noticeSlots = [...main.children].filter((node) => node !== heatmap && node !== feed).map((node) => ({marker: marker(doc, node), node}));

  const page = el(doc, 'div', 'hgh-org-page');
  const state = {
    root, page, flex, heatmapMarker, feedMarker, repoHostMarker, heatmap, heatmapDivider, feed, repoHost, noticeSlots,
    win, enrichment: null, people: [], iconSizes: [], collapsed: [], cancelled: false, abort: new win.AbortController(),
    navigate: (href) => { const safe = safeHref(href, win.location.href); if (safe) win.location.assign(safe); },
  };
  const notices = el(doc, 'div', 'hgh-org-notices');
  for (const {node} of noticeSlots) notices.append(node);

  const tabs = buildTabs(doc, root);
  state.tabs = tabs;
  const back = el(doc, 'a', 'hgh-org-back', '\u2190 Back to overview');
  back.href = '#overview';
  const heatmapSlot = el(doc, 'div', 'hgh-org-heatmap');
  if (heatmap) heatmapSlot.append(heatmap);

  const columns = el(doc, 'div', 'hgh-org-columns');
  const reposCol = el(doc, 'section', 'hgh-org-repos');
  reposCol.setAttribute('aria-labelledby', 'hgh-org-repos-heading');
  const head = el(doc, 'div', 'hgh-org-repos-head');
  const reposHeading = el(doc, 'h2', '', 'Repositories');
  reposHeading.id = 'hgh-org-repos-heading';
  const viewAll = el(doc, 'a', 'hgh-org-view-all', 'View all repositories');
  viewAll.href = '#repos';
  head.append(reposHeading, viewAll);
  const status = el(doc, 'p', 'hgh-org-repos-status', '');
  status.setAttribute('role', 'status');
  status.hidden = true;
  reposCol.append(head, status, repoHost);
  state.status = status;

  const sidebarCol = el(doc, 'aside', 'hgh-org-sidebar');
  sidebarCol.setAttribute('aria-label', 'People and languages');
  columns.append(reposCol, sidebarCol);
  state.sidebar = sidebarCol;

  const activitySection = el(doc, 'section', 'hgh-org-activity');
  activitySection.setAttribute('aria-labelledby', 'hgh-org-activity-heading');
  const activityHeading = el(doc, 'h2', '', 'Recent activity');
  activityHeading.id = 'hgh-org-activity-heading';
  activitySection.append(activityHeading);
  if (feed) activitySection.append(feed);

  page.append(tabs, notices, back, heatmapSlot, columns, activitySection);
  flex.replaceWith(page);

  const homeLink = root.querySelector('.secondary-nav .right.menu a.ui.basic.button[href]');
  if (feed) compactActivity(doc, feed, state);
  watchRepoEnrichment(state, doc, win);
  renderSidebar(state, doc);
  if (homeLink) {
    loadPeople(win, homeLink.href, state.abort.signal).then((people) => {
      if (state.cancelled) return;
      state.people = people;
      renderSidebar(state, doc);
    });
  }

  const hashListener = () => applyHash(state);
  win.addEventListener('hashchange', hashListener);
  state.hashListener = hashListener;
  applyHash(state);
  return state;
}

function restoreDashboard(state) {
  state.cancelled = true;
  state.abort.abort();
  state.enrichmentObserver?.disconnect();
  state.win.removeEventListener('hashchange', state.hashListener);
  for (const {svg, width, height} of state.iconSizes) {
    if (width === null) svg.removeAttribute('width'); else svg.setAttribute('width', width);
    if (height === null) svg.removeAttribute('height'); else svg.setAttribute('height', height);
  }
  for (const {body, toggle} of state.collapsed) {
    toggle.remove();
    body.classList.remove('hgh-org-clamped');
    delete body.dataset.hghCollapsible;
  }
  for (const meta of state.repoHost.querySelectorAll('.hgh-org-repo-meta')) meta.remove();
  for (const row of state.repoHost.querySelectorAll('[data-hgh-checked]')) delete row.dataset.hghChecked;
  if (state.heatmap && state.heatmapMarker) {
    restoreSlot(state.heatmapMarker, state.heatmap);
    if (state.heatmapDivider) state.heatmap.after(state.heatmapDivider);
  }
  if (state.feed && state.feedMarker) restoreSlot(state.feedMarker, state.feed);
  for (const {marker: m, node} of state.noticeSlots) restoreSlot(m, node);
  restoreSlot(state.repoHostMarker, state.repoHost);
  if (state.page.isConnected) state.page.replaceWith(state.flex);
  dashboards.delete(state.root);
}

/** Public `/<name>` org profile page: repositories, descriptions, stars/forks/topics and the
 * members segment are already fully server-rendered (`templates/org/home.tmpl` +
 * `templates/explore/repo_list.tmpl`), so this only needs consistent presentation, never a DOM
 * restructure — every native link, form and access-controlled section (members/teams only render
 * when the viewer is entitled to see them) is left exactly where the server put it. */
function enhanceProfile(root) {
  root.classList.add('hgh-org-profile');
  return {root};
}
function restoreProfile(state) {
  state.root.classList.remove('hgh-org-profile');
  profiles.delete(state.root);
}

/** Restores every entry belonging to `doc` whose root has been detached (e.g. htmx replaced the
 * page). Called at the start of every `enhanceOrganization` pass so stale state never blocks a
 * re-enhance of a freshly reinserted page. */
function pruneDetached(map, doc, restoreFn) {
  for (const [root, state] of map) if (root.ownerDocument === doc && !root.isConnected) restoreFn(state);
}
/** Restores every entry belonging to `doc` unconditionally, e.g. on a theme toggle. */
function restoreAll(map, doc, restoreFn) {
  for (const [root, state] of map) if (root.ownerDocument === doc) restoreFn(state);
}

/** Idempotent, reversible: repositions native nodes only, never clones/recreates the Vue mount, and
 * every appended decoration lives outside the native subtree so a theme toggle fully restores it. */
export function enhanceOrganization(doc = document) {
  const win = doc.defaultView ?? window;
  pruneDetached(dashboards, doc, restoreDashboard);
  for (const root of doc.querySelectorAll('.page-content.dashboard.feeds')) {
    if (dashboards.has(root)) continue;
    const nav = root.querySelector('.secondary-nav');
    if (!nav?.querySelector('.right.menu')) continue; // personal dashboard, not an organization: leave untouched
    const state = buildDashboardPage(root, doc, win);
    if (state) dashboards.set(root, state);
  }
  pruneDetached(profiles, doc, restoreProfile);
  for (const root of doc.querySelectorAll('.page-content.organization.profile')) {
    if (profiles.has(root)) continue;
    profiles.set(root, enhanceProfile(root));
  }
}

export function restoreOrganization(doc = document) {
  restoreAll(dashboards, doc, restoreDashboard);
  restoreAll(profiles, doc, restoreProfile);
}
