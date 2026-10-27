/**
 * @file Reshapes the native Forgejo org dashboard (`/org/<name>/dashboard`) into a GitHub-familiar
 * two-column overview, augments the public org profile, and compacts native dashboard activity.
 *
 * Accessed via: skin.mjs boot()'s enhance()/teardown pass, same as every other enhancer in this
 * repo — called on every DOM mutation and on theme toggle, so both entry points must be idempotent.
 *
 * Assumptions: the dashboard repo list (`#dashboard-repo-list`) is a native Vue component
 * (`DashboardRepoList.vue`) that owns its own fetch/render/pagination/search; this module only
 * repositions that node and decorates rows after Vue renders them — it never re-implements the
 * widget or touches its `.pagination` markup logic. `/repo/search` is a session-aware *web* route
 * (authenticated `/api/v1/*` routes do not accept browser session cookies here) and
 * is the extra data source used to enrich rows with description/language/stars/forks/topics; a
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
const activityFeeds = new Map();
const activityControlOwners = new WeakMap();
const activityInertState = new WeakMap();
const ACTIVITY_ATTACHMENTS = 'img, video, audio, iframe, object, embed, .attachment, .attachments, a[download]';
// The sidebar's Top languages/Topics and the empty-org heuristic are only ever computed from this
// one page of the most-recently-updated repos, never a full paginated crawl: acceptable for the
// common case (the vast majority of orgs), but for an org with more repos than this, the counts are
// a biased sample of the newest repos, not a total — never presented as more complete than that.
const ENRICHMENT_LIMIT = 100;

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
  return `${sub}/repo/search?sort=updated&order=desc&uid=${orgId}&team_id=0&q=&mode=&page=1&limit=${ENRICHMENT_LIMIT}`;
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
  // `/repo/search` answers with a minimal repository object: timestamps are the zero time and forks/open
  // issues are zero-valued defaults, so only a real `updated_at` shows the counts and date are genuine.
  const detailed = Date.parse(repo.updated_at) > 0;
  for (const [iconName, field] of REPO_STATS) {
    if (!Number.isFinite(repo[field]) || (!detailed && field !== 'stars_count')) continue;
    const stat = el(doc, 'span', 'hgh-org-stat');
    stat.append(icon(doc, iconName), doc.createTextNode(String(repo[field])));
    stats.append(stat);
  }
  const when = detailed && relativeTime(repo.updated_at);
  if (when) stats.append(el(doc, 'span', 'hgh-org-stat hgh-org-updated', `Updated ${when}`));
  if (stats.childElementCount) wrap.append(stats);
  if (Array.isArray(repo.topics) && repo.topics.length) {
    const topics = el(doc, 'div', 'hgh-org-repo-topics');
    for (const topic of repo.topics.slice(0, 6)) topics.append(el(doc, 'span', 'hgh-org-topic', topic));
    wrap.append(topics);
  }
  return wrap;
}

function setStatus(state, text) {
  state.status.hidden = !text;
  state.status.textContent = text;
}
function watchRepoEnrichment(state, doc, win) {
  const apply = () => {
    if (state.cancelled) return;
    if (!state.enrichment) return;
    const rows = state.repoHost.querySelectorAll('.repo-owner-name-list > li');
    for (const row of rows) {
      if (row.dataset.hghChecked) continue;
      const name = row.querySelector('.repo-list-link .text.truncate')?.textContent?.trim();
      const repo = name && state.enrichment.byName.get(name);
      row.dataset.hghChecked = 'true';
      if (repo) row.append(buildRepoDecoration(doc, repo));
    }
    // `state.emptyConfirmed` (not the rendered status text) is the source of truth, so this stays
    // correct even if the message wording changes later.
    if (state.emptyConfirmed) {
      const stillEmpty = rows.length === 0;
      setStatus(state, stillEmpty ? 'No repositories match.' : '');
      state.viewAll.hidden = stillEmpty; // a genuinely empty org has nothing for "View all" to reveal
    }
  };
  state.enrichmentObserver = new win.MutationObserver(apply);
  state.enrichmentObserver.observe(state.repoHost, {childList: true, subtree: true});
  setStatus(state, 'Loading repository details…');
  fetchEnrichment(win, state.abort.signal).then((result) => {
    if (state.cancelled) return;
    state.enrichment = result ?? {byName: new Map(), repos: []};
    state.emptyConfirmed = result !== null && result.repos.length === 0;
    setStatus(state, result === null ? 'Repository details are unavailable right now.' : '');
    apply();
    // Independent of whether loadPeople's own sidebar render already ran (or hasn't yet, or there's
    // no home link at all): repo-search enrichment is the only source of Top languages/Topics, so
    // it must refresh the sidebar itself rather than relying on loadPeople's completion to do it.
    renderSidebar(state, doc);
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
    return [...doc.querySelectorAll('.segment.members > a')]
      .map((a) => {
        const rawAvatar = a.querySelector('img')?.getAttribute('src') ?? '';
        return {href: a.getAttribute('href') ? safeHref(a.getAttribute('href'), href) : null, title: a.getAttribute('title') ?? '', avatar: rawAvatar ? (safeHref(rawAvatar, href) ?? '') : ''};
      })
      .filter((person) => person.href);
  } catch {
    return [];
  }
}

function topEntries(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
function topLanguagesAndTopics(enrichment) {
  const languages = new Map();
  const topics = new Map();
  for (const repo of enrichment?.repos ?? []) {
    if (repo.language) languages.set(repo.language, (languages.get(repo.language) ?? 0) + 1);
    for (const topic of repo.topics ?? []) topics.set(topic, (topics.get(topic) ?? 0) + 1);
  }
  return {languages: topEntries(languages, 6), topics: topEntries(topics, 8)};
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
  sidebar.append(...buildLanguageTopicSections(doc, languages, topics));
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
  const query = new URLSearchParams(state.win.location.search);
  const repositoryQuery = ['repo-search-query', 'repo-search-filter', 'repo-search-page', 'repo-search-private', 'repo-search-archived', 'repo-search-tab'].some(name => query.has(name));
  const raw = (state.win.location.hash || (repositoryQuery ? '#repos' : '#overview')).slice(1);
  if (raw === 'prs' || raw === 'issues') {
    const link = nativeAggregateLink(state.root, raw === 'prs' ? '/pulls' : '/issues');
    // location.replace (not assign/hash='') so the `#prs`/`#issues` hash never becomes a
    // separate history entry a later Back/Forward could land on and redirect again.
    const safe = link && safeHref(link.href, state.win.location.href);
    if (safe) { state.win.location.replace(safe); return; }
  }
  const view = VIEWS.has(raw) ? raw : 'overview';
  state.page.dataset.hghOrgView = view;
  state.viewHash = state.win.location.hash;
  state.viewSearch = state.win.location.search;
  for (const tab of state.tabs.querySelectorAll('a[data-hgh-org-tab]')) {
    if (tab.dataset.hghOrgTab === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}

function holdActivityControl(node, blocked) {
  let state = activityInertState.get(node);
  if (!state) {
    state = {nativeInert: node.inert, observer: null};
    state.observer = new node.ownerDocument.defaultView.MutationObserver(records => {
      if (!records.length || !activityControlOwners.has(node)) return;
      state.nativeInert = node.inert;
      // Record native intent but keep a clipped control inaccessible. Disconnect
      // around our own write so it can never be mistaken for a native mutation.
      if (!node.inert) {
        state.observer.disconnect();
        node.inert = true;
        state.observer.observe(node, {attributes: true, attributeFilter: ['inert']});
      }
    });
    activityInertState.set(node, state);
    node.inert = true;
    state.observer.observe(node, {attributes: true, attributeFilter: ['inert']});
  } else if (state.observer.takeRecords().length) {
    state.nativeInert = node.inert;
    if (!node.inert) {
      state.observer.disconnect();
      node.inert = true;
      state.observer.observe(node, {attributes: true, attributeFilter: ['inert']});
    }
  }
  activityControlOwners.get(node)?.delete(node);
  blocked.add(node);
  activityControlOwners.set(node, blocked);
}

function restoreActivityControl(node) {
  const owner = activityControlOwners.get(node);
  if (!owner) return;
  const state = activityInertState.get(node);
  if (state?.observer.takeRecords().length) state.nativeInert = node.inert;
  state?.observer.disconnect();
  owner.delete(node);
  activityControlOwners.delete(node);
  activityInertState.delete(node);
  node.inert = state?.nativeInert ?? false;
}

function prepareActivityBody(item, state) {
  const body = item.querySelector('.flex-item-main .markup');
  if (!body) return null;
  const retained = state.collapsed.get(body);
  if (retained) {
    retained.item = item;
    if (retained.toggle && body.nextElementSibling !== retained.toggle) body.after(retained.toggle);
    return retained;
  }
  if (body.dataset.hghCollapsible) return null;
  body.dataset.hghCollapsible = 'true';
  body.classList.add('hgh-org-clamped');
  const entry = {body, item, toggle: null, onToggle: null, observer: state.bodyObserver, blocked: new Set()};
  state.collapsed.set(body, entry);
  state.bodyObserver.observe(body);
  return entry;
}

function measureActivityBody(entry) {
  const {body} = entry;
  if (!body.classList.contains('hgh-org-clamped')) return {entry, expanded: true};
  if (!body.getClientRects().length) return null;
  const needsToggle = body.scrollHeight > body.clientHeight + 1 || !!body.querySelector(ACTIVITY_ATTACHMENTS);
  const bounds = body.getBoundingClientRect();
  const toBlock = [];
  const toRelease = [];
  for (const node of body.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]')) {
    const rect = node.getBoundingClientRect();
    const attachmentOnly = !node.textContent.trim() && node.querySelector(ACTIVITY_ATTACHMENTS);
    const clipped = !rect.height || rect.bottom > bounds.bottom + 1 || node.matches(ACTIVITY_ATTACHMENTS) || attachmentOnly;
    if (clipped) toBlock.push(node);
    else if (!clipped && activityControlOwners.has(node)) toRelease.push(node);
  }
  return {entry, needsToggle, toBlock, toRelease};
}

function removeActivityToggle(entry) {
  entry.toggle?.removeEventListener('click', entry.onToggle);
  entry.toggle?.remove();
  entry.toggle = null;
  entry.onToggle = null;
}

function applyActivityBody(doc, state, plan) {
  const {entry} = plan;
  const {body, blocked} = entry;
  if (plan.expanded) {
    for (const node of blocked) restoreActivityControl(node);
    return;
  }
  if (plan.needsToggle && !entry.toggle) {
    const toggle = el(doc, 'button', 'hgh-org-toggle', 'Show more');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    entry.onToggle = () => {
      const expanded = !body.classList.toggle('hgh-org-clamped');
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'Show less' : 'Show more';
      state.items.delete(entry.item);
      compactActivity(doc, state.root, state);
    };
    toggle.addEventListener('click', entry.onToggle);
    body.after(toggle);
    entry.toggle = toggle;
  } else if (!plan.needsToggle && entry.toggle) {
    removeActivityToggle(entry);
  }
  for (const node of plan.toRelease) restoreActivityControl(node);
  for (const node of plan.toBlock) holdActivityControl(node, blocked);
}

function compactActivity(doc, feed, state) {
  let work;
  for (const item of feed.querySelectorAll(':scope > .flex-item')) {
    if (state.items.has(item)) continue;
    for (const svg of item.querySelectorAll('.flex-item-trailing > svg')) {
      if (state.iconSizes.has(svg)) continue;
      state.iconSizes.set(svg, {width: svg.getAttribute('width'), height: svg.getAttribute('height')});
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
    }
    const entry = prepareActivityBody(item, state);
    if (entry) (work ??= []).push(entry);
    state.items.add(item);
  }
  if (!work) return;
  for (const {body, blocked} of work) {
    for (const node of blocked) {
      if (!body.contains(node)) restoreActivityControl(node);
    }
  }
  // All rows use the browser's CSS 3lh clamp before reads; disclosures and inert writes follow.
  const plans = work.map(measureActivityBody);
  for (const plan of plans) {
    if (plan) applyActivityBody(doc, state, plan);
  }
}

function restoreDisclosure(entry) {
  const {body, observer, blocked} = entry;
  observer.unobserve(body);
  for (const node of blocked) restoreActivityControl(node);
  removeActivityToggle(entry);
  body.classList.remove('hgh-org-clamped');
  delete body.dataset.hghCollapsible;
}

function restoreActivityIcon(svg, {width, height}) {
  if (width === null) svg.removeAttribute('width'); else svg.setAttribute('width', width);
  if (height === null) svg.removeAttribute('height'); else svg.setAttribute('height', height);
}

function pruneActivityRows(state) {
  for (const [body, entry] of state.collapsed) {
    if (state.root.contains(body)) continue;
    restoreDisclosure(entry);
    state.collapsed.delete(body);
  }
  for (const [svg, size] of state.iconSizes) {
    if (state.root.contains(svg)) continue;
    restoreActivityIcon(svg, size);
    state.iconSizes.delete(svg);
  }
}

function watchActivityAncestors(state) {
  const ancestors = [];
  for (let parent = state.root.parentNode; parent; parent = parent.parentNode) ancestors.push(parent);
  if (ancestors.length === state.ancestors?.length && ancestors.every((node, index) => node === state.ancestors[index])) return;
  state.ancestorObserver.disconnect();
  state.ancestors = ancestors;
  for (const parent of ancestors) state.ancestorObserver.observe(parent, {childList: true});
}

function enhanceActivity(doc, feed) {
  let state = activityFeeds.get(feed);
  if (!state) {
    state = {root: feed, iconSizes: new Map(), collapsed: new Map(), items: new WeakSet(), width: 0};
    activityFeeds.set(feed, state);
    feed.classList.add('hgh-compact-activity');
    state.bodyObserver = new doc.defaultView.ResizeObserver(entries => {
      for (const entry of entries) {
        const body = state.collapsed.get(entry.target);
        if (body) state.items.delete(body.item);
      }
      compactActivity(doc, feed, state);
    });
    state.resizeObserver = new doc.defaultView.ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== state.width) {
        state.width = entry.contentRect.width;
        state.items = new WeakSet();
      }
      compactActivity(doc, feed, state);
    });
    state.resizeObserver.observe(feed);
    state.mutationObserver = new doc.defaultView.MutationObserver(records => {
      if (!feed.isConnected) { restoreActivity(state); return; }
      if (!records.some(record => feed.contains(record.target))) return;
      for (const record of records) {
        if (record.target === feed) {
          for (const node of record.addedNodes) state.items.delete(node);
          for (const node of record.removedNodes) state.items.delete(node);
        }
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (!target || target.closest('.hgh-org-toggle')) continue;
        const item = target.closest('.flex-item');
        if (item?.parentElement === feed) state.items.delete(item);
      }
      pruneActivityRows(state);
      compactActivity(doc, feed, state);
    });
    state.mutationObserver.observe(feed, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['open', 'class', 'style', 'hidden', 'href', 'tabindex', 'contenteditable', 'download', 'type']});
    // Watch only direct children along the current parent chain. This catches a
    // removed ancestor and follows reparenting without observing unrelated subtrees.
    state.ancestorObserver = new doc.defaultView.MutationObserver(() => {
      if (!feed.isConnected) { restoreActivity(state); return; }
      watchActivityAncestors(state);
    });
    watchActivityAncestors(state);
  }
  compactActivity(doc, feed, state);
}

function restoreActivity(state) {
  state.ancestorObserver.disconnect();
  state.resizeObserver.disconnect();
  state.mutationObserver.disconnect();
  state.bodyObserver.disconnect();
  for (const [svg, size] of state.iconSizes) restoreActivityIcon(svg, size);
  for (const entry of state.collapsed.values()) restoreDisclosure(entry);
  state.root.classList.remove('hgh-compact-activity');
  activityFeeds.delete(state.root);
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

  // Compact identity header: clone the presentational avatar/name already rendered by the native
  // context switcher (never its interactive dropdown/visibility controls), and move — not clone —
  // the one real interactive element (the native "View <org>" link) so it stays a single, restorable
  // native node rather than a duplicate access-control surface.
  const identity = root.querySelector('.secondary-nav .truncated-item-container');
  const homeLink = root.querySelector('.secondary-nav .right.menu a.ui.basic.button[href]');
  const homeLinkMarker = homeLink ? marker(doc, homeLink) : null;
  const header = el(doc, 'div', 'hgh-org-header');
  const avatarSource = identity?.querySelector('img, .ui.avatar');
  if (avatarSource) { const avatar = avatarSource.cloneNode(true); avatar.removeAttribute('id'); header.append(avatar); }
  const nameSource = identity?.querySelector('.truncated-item-name');
  if (nameSource) header.append(el(doc, 'span', 'hgh-org-header-name', nameSource.textContent.trim()));
  if (homeLink) header.append(homeLink);

  const page = el(doc, 'div', 'hgh-org-page');
  const state = {
    root, page, flex, heatmapMarker, feedMarker, repoHostMarker, heatmap, heatmapDivider, feed, repoHost, noticeSlots, homeLink, homeLinkMarker,
    win, enrichment: null, people: [], cancelled: false, abort: new win.AbortController(),
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
  state.viewAll = viewAll;
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

  page.append(header, tabs, notices, back, heatmapSlot, columns, activitySection);
  flex.replaceWith(page);

  watchRepoEnrichment(state, doc, win);
  renderSidebar(state, doc);
  if (homeLink) {
    loadPeople(win, homeLink.href, state.abort.signal).then((people) => {
      if (state.cancelled) return;
      state.people = people;
      renderSidebar(state, doc);
    });
  }

  const viewClickListener = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a');
    if (link && (tabs.contains(link) || link === viewAll || link === back) && VIEWS.has(link.hash.slice(1))) {
      state.viewHash = link.hash;
    }
  };
  page.addEventListener('click', viewClickListener);
  state.viewClickListener = viewClickListener;
  const hashListener = (event) => {
    // Vue may clear the URL hash before this queued navigation event is delivered.
    const hash = event.newURL ? new URL(event.newURL).hash : win.location.hash;
    if (win.location.hash !== hash) {
      win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search + hash);
    }
    applyHash(state);
  };
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
  state.page.removeEventListener('click', state.viewClickListener);
  for (const meta of state.repoHost.querySelectorAll('.hgh-org-repo-meta')) meta.remove();
  for (const row of state.repoHost.querySelectorAll('[data-hgh-checked]')) delete row.dataset.hghChecked;
  if (state.heatmap && state.heatmapMarker) {
    restoreSlot(state.heatmapMarker, state.heatmap);
    if (state.heatmapDivider) state.heatmap.after(state.heatmapDivider);
  }
  if (state.feed && state.feedMarker) restoreSlot(state.feedMarker, state.feed);
  if (state.homeLink && state.homeLinkMarker) restoreSlot(state.homeLinkMarker, state.homeLink);
  for (const {marker: m, node} of state.noticeSlots) restoreSlot(m, node);
  restoreSlot(state.repoHostMarker, state.repoHost);
  // parentNode, not isConnected: pruneDetached() calls this for a temporarily detached root
  // (an htmx-style swap can detach `root` — and everything inside it, including our own
  // `state.page` wrapper — before this runs), and isConnected is false there even though
  // `state.page` is still a legitimate child of `root`. Checking it would leave our wrapper
  // in place instead of restoring the native flex-container on reinsertion.
  if (state.page.parentNode) state.page.replaceWith(state.flex);
  dashboards.delete(state.root);
}

/** Derives Top languages/Topics purely from the repo cards Forgejo already rendered on the current
 * page (`.flex-item-trailing a[href*="language="]` + `.repo-topics > a.ui.label`) — no fetch, unlike
 * the dashboard sidebar, since this is already public/permitted HTML sitting on the page. */
function collectProfileLanguagesTopics(flexList) {
  const languages = new Map();
  const topics = new Map();
  for (const item of flexList.querySelectorAll(':scope > .flex-item')) {
    const name = item.querySelector('.flex-item-trailing a[href*="language="]')?.textContent?.trim();
    if (name) languages.set(name, (languages.get(name) ?? 0) + 1);
    for (const topicLink of item.querySelectorAll('.repo-topics > a.ui.label')) {
      const label = topicLink.textContent.trim();
      if (label) topics.set(label, (topics.get(label) ?? 0) + 1);
    }
  }
  return {languages: topEntries(languages, 6), topics: topEntries(topics, 8)};
}
/** Shared by the dashboard sidebar (fetch-derived) and the profile sidebar (DOM-derived) — builds
 * the section elements only, no DOM-appending side effect, so each caller controls where they land
 * and whether they're tracked for restore. */
function buildLanguageTopicSections(doc, languages, topics) {
  const sections = [];
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
    sections.push(section);
  }
  if (topics.length) {
    const section = el(doc, 'section', 'hgh-org-topics');
    section.append(el(doc, 'h3', '', 'Topics'));
    const list = el(doc, 'div', 'hgh-org-topic-list');
    for (const [name] of topics) list.append(el(doc, 'span', 'hgh-org-topic', name));
    section.append(list);
    sections.push(section);
  }
  return sections;
}
function buildProfileSidebarSections(doc, sidebarColumn, languages, topics) {
  const sections = buildLanguageTopicSections(doc, languages, topics);
  sidebarColumn.append(...sections);
  return sections;
}
/** The native heading reads "Members"; the sidebar naming convention this skin uses everywhere else
 * (dashboard + public profile) is "People" (matching GitHub) — relabel only the heading text node,
 * never the segment itself (access-controlled content stays exactly where the server put it), and
 * restore the exact original text on teardown. */
function relabelMembersHeading(root) {
  const segment = root.querySelector('.segment.members');
  const heading = segment?.previousElementSibling;
  const label = heading && [...heading.childNodes, heading].find((n) => n.textContent?.trim() === 'Members');
  if (!label) return null;
  const original = label.textContent;
  // A bare Text node match may carry trailing/leading whitespace before an adjacent sibling (e.g.
  // a member-count badge element); replace only the "Members" substring so that whitespace
  // survives, rather than overwriting the whole node value and silently concatenating with it.
  if (label.nodeType === label.TEXT_NODE) label.data = label.data.replace('Members', 'People');
  else label.textContent = 'People';
  return {node: label, original};
}

function renderActivityCalendar(doc, summary, counts, note, unit) {
  const chart = el(doc, 'div', 'hgh-org-calendar');
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', note);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let offset = 90; offset >= 0; offset--) {
    const date = new Date(today.getTime() - offset * 86400000).toISOString().slice(0, 10);
    const count = counts.get(date) ?? 0;
    const cell = el(doc, 'span', 'hgh-org-day');
    cell.dataset.count = String(count);
    cell.dataset.level = String(Math.min(count, 4));
    cell.title = `${date}: ${count} ${unit}`;
    chart.append(cell);
  }
  summary.append(chart, el(doc, 'p', 'hgh-org-calendar-note', note));
}

/** Browser sessions use the native dashboard, not token-only authenticated APIs.
 * Anonymous viewers receive explicitly labelled, bounded public activity instead. */
async function loadProfileActivity(state, doc, grid) {
  const {root, win} = state;
  const sub = win.config?.appSubUrl ?? '';
  const name = win.location.pathname.slice(sub.length).split('/').filter(Boolean)[0];
  if (!name) return;
  const summary = el(doc, 'section', 'hgh-org-heatmap');
  summary.setAttribute('aria-label', 'Recent organization activity');
  const statistics = el(doc, 'p', 'hgh-org-statistics', 'Loading recent activity…');
  summary.append(statistics);
  grid.before(summary);
  const activity = el(doc, 'section', 'hgh-org-activity');
  activity.append(el(doc, 'h2', '', 'Recent activity'));
  const feed = el(doc, 'div', 'flex-list');
  activity.append(feed);
  grid.after(activity);
  state.summary = summary;
  state.activity = activity;
  try {
    const orgName = encodeURIComponent(decodeURIComponent(name));
    const dashboardURL = new URL(`${sub}/org/${orgName}/dashboard`, win.location.href);
    const nativeResponse = await win.fetch(dashboardURL.href, {
      credentials: 'same-origin', headers: {Accept: 'text/html'}, signal: state.abort.signal,
    });
    if (state.cancelled) return;
    const nativeURL = new URL(nativeResponse.url || dashboardURL.href, win.location.href);
    if (nativeResponse.ok && nativeURL.origin === dashboardURL.origin && nativeURL.pathname === dashboardURL.pathname) {
      const nativeDoc = new win.DOMParser().parseFromString(await nativeResponse.text(), 'text/html');
      if (state.cancelled) return;
      const nativeRoot = nativeDoc.querySelector('.page-content.dashboard.feeds');
      if (!nativeRoot) throw new Error('Unrecognized organization dashboard');
      const nativeRows = nativeRoot.querySelectorAll('#activity-feed > .flex-item');
      const heatmap = nativeRoot.querySelector('#user-heatmap[data-heatmap-data]');
      statistics.textContent = heatmap?.dataset.localeTotalContributions || `${nativeRows.length} recent events on the first native page`;
      if (heatmap) {
        try {
          const data = JSON.parse(heatmap.dataset.heatmapData);
          if (!Array.isArray(data)) throw new Error('Invalid native heatmap');
          const counts = new Map();
          for (const entry of data) {
            if (!Number.isFinite(entry.timestamp) || !Number.isSafeInteger(entry.contributions) || entry.contributions < 0) throw new Error('Invalid native heatmap entry');
            const date = new Date(entry.timestamp * 1000).toISOString().slice(0, 10);
            counts.set(date, entry.contributions);
          }
          renderActivityCalendar(doc, summary, counts, 'Last 91 days · native viewer-visible contributions', 'contributions');
        } catch {
          summary.append(el(doc, 'p', 'hgh-org-calendar-note', 'Contribution calendar is unavailable.'));
        }
      }
      for (const row of [...nativeRows].slice(0, 10)) {
        for (const image of row.querySelectorAll('.markup img')) image.loading = 'lazy';
        feed.append(doc.importNode(row, true));
      }
      if (!nativeRows.length) feed.append(el(doc, 'p', '', 'No recent activity is visible.'));
      enhanceActivity(doc, feed);
      return;
    }
    if (nativeResponse.status >= 500) throw new Error('Organization dashboard unavailable');
    activity.querySelector('h2').textContent = 'Public activity';
    const response = await win.fetch(`${sub}/api/v1/orgs/${orgName}/activities/feeds?limit=100&page=1`, {
      credentials: 'omit', headers: {Accept: 'application/json'}, signal: state.abort.signal,
    });
    if (!response.ok) throw new Error('Activity unavailable');
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error('Invalid activity');
    if (state.cancelled) return;
    const events = records.filter(event => Number.isFinite(Date.parse(event.created))).sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
    const repoCount = root.querySelector('[test-name="repository-count"]')?.textContent.trim();
    statistics.textContent = `${repoCount && /^\d+$/.test(repoCount) ? `${repoCount} repositories · ` : ''}${events.length} recent events (public)`;
    const counts = new Map();
    for (const event of events) {
      const date = new Date(event.created).toISOString().slice(0, 10);
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    renderActivityCalendar(doc, summary, counts, 'Last 91 days · latest 100 public events', 'public events');
    if (!events.length) feed.append(el(doc, 'p', '', 'No recent activity is visible.'));
    for (const event of events.slice(0, 10)) {
      const row = el(doc, 'div', 'flex-item');
      const main = el(doc, 'div', 'flex-item-main');
      const heading = el(doc, 'div', 'flex-item-header');
      heading.append(`${event.act_user?.login ?? 'User'} · ${String(event.op_type ?? 'activity').replaceAll('_', ' ')} · `);
      const href = safeHref(event.comment?.html_url || event.repo?.html_url, win.location.href);
      const link = el(doc, href ? 'a' : 'span', '', event.repo?.full_name ?? '');
      if (href) link.href = href;
      heading.append(link);
      const time = el(doc, 'relative-time', '', relativeTime(event.created));
      time.setAttribute('datetime', event.created);
      main.append(heading, time);
      if (event.comment?.body) main.append(el(doc, 'div', 'markup', event.comment.body));
      row.append(main);
      feed.append(row);
    }
    enhanceActivity(doc, feed);
  } catch {
    if (!state.cancelled) statistics.textContent = 'Recent activity is unavailable.';
  }
}

/** Public profile keeps the server-rendered repository set and permission boundary.
 * Hash views change presentation only; native query/filter/page navigation stays native. */
function enhanceProfile(root, doc, win) {
  root.classList.add('hgh-org-profile');
  const state = {root, win, hashListener: null, viewAll: null, sidebarColumn: null, createdSidebar: false, sections: [], navigation: [], cancelled: false, abort: new win.AbortController(), membersLabel: relabelMembersHeading(root)};
  const grid = root.querySelector('.ui.mobile.reversed.stackable.grid');
  const flexList = grid?.querySelector('.flex-list');
  if (!grid || !flexList) return state; // unrecognized page shape: cosmetic class only, never guess

  const {languages, topics} = collectProfileLanguagesTopics(flexList);
  const reposColumn = flexList.closest('.column');
  if ((languages.length || topics.length) && reposColumn) {
    const otherColumns = [...grid.children].filter((child) => child.classList.contains('column') && child !== reposColumn);
    let sidebarColumn = otherColumns.length === 1 ? otherColumns[0] : null;
    if (!sidebarColumn) {
      sidebarColumn = el(doc, 'div', 'ui column');
      grid.append(sidebarColumn);
      state.createdSidebar = true;
    }
    sidebarColumn.classList.add('hgh-org-sidebar');
    state.sidebarColumn = sidebarColumn;
    state.sections = buildProfileSidebarSections(doc, sidebarColumn, languages, topics);
  } // else: can't tell the repos column from any other, or nothing to show — never guess, leave untouched

  const tabs = el(doc, 'nav', 'hgh-org-tabs');
  tabs.setAttribute('aria-label', 'Organization views');
  for (const [id, label] of TABS.slice(0, 2)) {
    const link = el(doc, 'a', '', label);
    link.href = `#${id}`;
    link.dataset.hghOrgTab = id;
    tabs.append(link);
  }
  grid.before(tabs);
  state.tabs = tabs;
  const viewAll = el(doc, 'div', 'hgh-org-view-all-bottom');
  const link = el(doc, 'a', 'hgh-org-view-all', 'View all repositories');
  link.href = '#repos';
  viewAll.append(link);
  flexList.after(viewAll);
  state.viewAll = viewAll;
  for (const anchor of root.querySelectorAll('.pagination a[href], .hgh-pagination a[href], #repo-search-form a[href], .flex-item-trailing a[href*="?"]')) {
    const href = anchor.getAttribute('href');
    const url = new URL(href, win.location.href);
    if (url.origin !== win.location.origin || url.pathname !== win.location.pathname) continue;
    state.navigation.push({node: anchor, attr: 'href', value: href});
    url.hash = 'repos';
    anchor.setAttribute('href', url.pathname + url.search + url.hash);
  }
  const form = root.querySelector('#repo-search-form');
  if (form) {
    state.navigation.push({node: form, attr: 'action', value: form.getAttribute('action')});
    const url = new URL(form.getAttribute('action') || win.location.href, win.location.href);
    url.hash = 'repos';
    form.setAttribute('action', url.pathname + url.search + url.hash);
  }
  const listener = () => {
    const query = new URLSearchParams(win.location.search);
    const repositoryQuery = ['q', 'page', 'sort', 'language', 'archived', 'fork', 'mirror', 'template', 'private'].some(name => query.has(name));
    const view = win.location.hash === '#repos' || (!win.location.hash && repositoryQuery) ? 'repos' : 'overview';
    root.dataset.hghOrgView = view;
    for (const tab of tabs.children) {
      if (tab.dataset.hghOrgTab === view) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
    if (view === 'overview' && !state.activityStarted) {
      state.activityStarted = true;
      loadProfileActivity(state, doc, grid);
    }
  };
  win.addEventListener('hashchange', listener);
  state.hashListener = listener;
  listener();
  return state;
}
function restoreProfile(state) {
  state.cancelled = true;
  state.abort.abort();
  state.summary?.remove();
  state.activity?.remove();
  state.root.classList.remove('hgh-org-profile');
  delete state.root.dataset.hghOrgView;
  if (state.hashListener) state.win.removeEventListener('hashchange', state.hashListener);
  if (state.membersLabel) state.membersLabel.node.textContent = state.membersLabel.original;
  state.viewAll?.remove();
  state.tabs?.remove();
  for (const {node, attr, value} of state.navigation) {
    if (value === null) node.removeAttribute(attr);
    else node.setAttribute(attr, value);
  }
  if (state.sidebarColumn) {
    if (state.createdSidebar) state.sidebarColumn.remove();
    else {
      for (const section of state.sections) section.remove();
      state.sidebarColumn.classList.remove('hgh-org-sidebar');
    }
  }
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
    const existing = dashboards.get(root);
    if (existing) {
      // Vue's updateHistory replaces the query and drops the hash on every fetch.
      // Restore only our selected view in that entry; native query state stays authoritative.
      if (!win.location.hash && existing.viewHash) {
        win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search + existing.viewHash);
      } else if (!win.location.hash && existing.viewSearch !== win.location.search) applyHash(existing);
      continue;
    }
    const nav = root.querySelector('.secondary-nav');
    if (!nav?.querySelector('.right.menu')) continue; // personal dashboard, not an organization: leave untouched
    const state = buildDashboardPage(root, doc, win);
    if (state) dashboards.set(root, state);
  }
  pruneDetached(profiles, doc, restoreProfile);
  for (const root of doc.querySelectorAll('.page-content.organization.profile')) {
    if (profiles.has(root)) continue;
    profiles.set(root, enhanceProfile(root, doc, win));
  }
  pruneDetached(activityFeeds, doc, restoreActivity);
  for (const feed of doc.querySelectorAll('.page-content:is(.dashboard.feeds, .user.profile) #activity-feed')) {
    enhanceActivity(doc, feed);
  }
}

export function restoreOrganization(doc = document) {
  restoreAll(activityFeeds, doc, restoreActivity);
  restoreAll(dashboards, doc, restoreDashboard);
  restoreAll(profiles, doc, restoreProfile);
}
