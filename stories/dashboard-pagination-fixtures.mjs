/**
 * Shared DOM fixture for the Vue dashboard/org repo-list pager, consumed by both
 * tests/mobile/dashboard-pagination.spec.mjs and DashboardPagination.stories.js so
 * the two never hand-maintain diverging copies of the same upstream-shaped markup
 * (mirrors stories/organization-fixtures.mjs's role for the organization tests).
 *
 * Builds the exact DOM shape templates/user/dashboard/repolist.tmpl + the real
 * DashboardRepoList.vue render, read directly from
 * https://codeberg.org/forgejo/forgejo/raw/tag/v16.0.3/web_src/js/components/DashboardRepoList.vue
 * (pinned Forgejo v16.0.3, the version installed in production): no `href` on any
 * pagination anchor (Vue only ever wires `@click="changePage(...)"`), a lone
 * `<a class="active item">` for the current page with no navigation class and no
 * click handler, and real gitea/octicon chevron icon classes so child-order
 * assertions are meaningful. Fixture only — Vue never runs here, only its
 * rendered DOM shape; no live `/repo/search` fetch, no live session.
 */
import {REPOS} from './organization-fixtures.mjs';

export function pagerHtml({page, finalPage}) {
  if (finalPage <= 1) return ''; // showMoreReposLink is false: Vue renders no pagination block at all
  const isFirst = page === 1, isLast = page === finalPage;
  return `<div class="tw-text-center"><div class="divider tw-my-0"></div>` +
    `<div class="ui borderless pagination menu narrow tw-my-2">` +
    `<a class="item navigation tw-py-1${isFirst ? ' disabled' : ''}" title="First page"><svg class="svg gitea-double-chevron-left-icon" width="16" height="16"></svg></a>` +
    `<a class="item navigation tw-py-1${isFirst ? ' disabled' : ''}" title="Previous page"><svg class="svg octicon-chevron-left-icon" width="16" height="16"></svg></a>` +
    `<a class="active item tw-py-1">${page}</a>` +
    `<a class="item navigation${isLast ? ' disabled' : ''}" title="Next page"><svg class="svg octicon-chevron-right-icon" width="16" height="16"></svg></a>` +
    `<a class="item navigation tw-py-1${isLast ? ' disabled' : ''}" title="Last page"><svg class="svg gitea-double-chevron-right-icon" width="16" height="16"></svg></a>` +
    `</div></div>`;
}

// Repo row filler content is real public data (stories/organization-fixtures.mjs,
// captured read-only from git.hyperide.ai/ultrabricks) — the pager logic itself
// never reads repo names/content, but nothing in this fixture invents a repository.
export function tableSegmentHtml({page, finalPage, rows = 15}) {
  const items = Array.from({length: rows}, (_, i) => {
    const [name] = REPOS[i % REPOS.length];
    return `<li class="tw-flex tw-items-center tw-py-2"><a class="repo-list-link muted" href="/${name}"><div class="text truncate">${name}</div></a></li>`;
  }).join('');
  return `<div class="ui attached table segment"><ul class="repo-owner-name-list">${items}</ul>${pagerHtml({page, finalPage})}</div>`;
}

// `#dashboard-repo-list` IS the mount root Vue never tears down itself (only the
// `.ui.attached.table.segment` inside it unmounts/remounts on `v-if="repos.length"`).
export function dashboardHtml(opts) {
  return `<div id="dashboard-repo-list" class="flex-container-sidebar"><div><div class="ui tab active list dashboard-repos">` +
    `<div class="ui top attached segment repos-search"></div>` +
    tableSegmentHtml(opts) +
    `</div></div></div>`;
}
