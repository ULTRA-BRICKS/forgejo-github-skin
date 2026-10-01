import '../src/dashboard-pagination.css';
import {enhanceDashboardPagination, restoreDashboardPagination} from '../src/dashboard-pagination.mjs';
import {REVEALED_KEY, HABIT_KEY} from '../src/pagination-model.mjs';
import {dashboardHtml} from './dashboard-pagination-fixtures.mjs';

/**
 * Mounts the production adapter against a fixture built from the real
 * DashboardRepoList.vue render at pinned Forgejo v16.0.3 (see
 * stories/dashboard-pagination-fixtures.mjs and src/dashboard-pagination.mjs's
 * header for the exact upstream source read, and for the fixture shared with
 * tests/mobile/dashboard-pagination.spec.mjs so the two never diverge).
 * Explicitly labeled as a fixture, not a live authenticated capture: Vue never
 * runs here, only its rendered DOM shape — no real `/repo/search` fetch, no
 * live session. Every anchor has no `href` at all (Vue only wires `@click`),
 * matching the real component precisely.
 */

function clearStorage() {
  try { sessionStorage.removeItem(REVEALED_KEY); } catch {}
  try { localStorage.removeItem(HABIT_KEY); } catch {}
}

// Storybook has no global dark-theme token sheet loaded (that comes from the
// generated theme-hypergithub-dark.css at build time); setting these inline on
// the story root gives the CSS's `var(--hgh-color-*, light-fallback)` reads
// real dark values without touching any shared file.
const DARK_TOKENS = {
  '--hgh-color-text': '#e6edf3', '--hgh-color-canvas': '#0d1117', '--hgh-color-subtle': '#161b22',
  '--hgh-color-border': '#30363d', '--hgh-color-muted': '#8b949e', '--hgh-color-link': '#58a6ff',
};

function shell(bodyHtml, {dark = false, lang = 'en'} = {}) {
  restoreDashboardPagination(document);
  document.documentElement.lang = lang;
  document.documentElement.dataset.theme = dark ? 'hypergithub-dark' : 'hypergithub-light';
  const root = document.createElement('div');
  root.style.padding = '48px 16px';
  root.style.background = dark ? DARK_TOKENS['--hgh-color-canvas'] : '#fff';
  root.style.maxWidth = '360px';
  if (dark) for (const [prop, value] of Object.entries(DARK_TOKENS)) root.style.setProperty(prop, value);
  const label = document.createElement('p');
  label.textContent = 'Fixture: native-shaped Vue DOM (v16.0.3), no live Vue/fetch.';
  label.style.cssText = 'font:12px -apple-system,sans-serif;color:#8b949e;margin:0 0 12px';
  const inner = document.createElement('div');
  inner.innerHTML = bodyHtml;
  root.append(label, inner);
  queueMicrotask(() => enhanceDashboardPagination(document));
  return root;
}

export default {title: 'Screens/DashboardPagination'};

export const Compact = {
  render: () => { clearStorage(); return shell(dashboardHtml({page: 6, finalPage: 90})); },
};

export const KeyboardDwell = {
  name: 'Keyboard focus (2s dwell on native Previous or Next)',
  render: () => {
    clearStorage();
    const root = shell(dashboardHtml({page: 6, finalPage: 90}));
    queueMicrotask(() => root.querySelector('.hgh-vpg-prev')?.focus());
    return root;
  },
};

export const HoverPending = {
  name: 'Hover pending (live: hover 2s to reveal First/Last)',
  render: () => {
    clearStorage();
    const root = shell(dashboardHtml({page: 6, finalPage: 90}));
    // Genuinely arms the real reveal timer on mount so the Storybook canvas
    // demonstrates the actual 2s hover contract when a reviewer hovers by hand.
    queueMicrotask(() => {
      root.querySelector('.hgh-vpg')?.dispatchEvent(new PointerEvent('pointerenter', {bubbles: false}));
    });
    return root;
  },
};

export const Revealed = {
  name: 'Revealed (session already expanded)',
  render: () => {
    clearStorage();
    try { sessionStorage.setItem(REVEALED_KEY, 'true'); } catch {}
    return shell(dashboardHtml({page: 6, finalPage: 90}));
  },
};

export const HabitInstantReveal = {
  name: 'Habit ≥3 (instant reveal on hover, no 2s wait)',
  render: () => {
    clearStorage();
    try { localStorage.setItem(HABIT_KEY, '3'); } catch {}
    const root = shell(dashboardHtml({page: 6, finalPage: 90}));
    queueMicrotask(() => {
      root.querySelector('.hgh-vpg')?.dispatchEvent(new PointerEvent('pointerenter', {bubbles: false}));
    });
    return root;
  },
};

export const EdgesFirstPage = {
  name: 'Edges: first page (First/Previous disabled)',
  render: () => {
    clearStorage();
    try { sessionStorage.setItem(REVEALED_KEY, 'true'); } catch {}
    return shell(dashboardHtml({page: 1, finalPage: 90}));
  },
};

export const EdgesLastPage = {
  name: 'Edges: last page (Next/Last disabled)',
  render: () => {
    clearStorage();
    try { sessionStorage.setItem(REVEALED_KEY, 'true'); } catch {}
    return shell(dashboardHtml({page: 90, finalPage: 90}));
  },
};

export const SinglePage = {
  name: 'Single page (Vue renders no pagination block at all — nothing to enhance)',
  render: () => { clearStorage(); return shell(dashboardHtml({page: 1, finalPage: 1})); },
};

export const Mobile320 = {
  name: 'Mobile 320px (capture at a real 320px viewport)',
  render: () => { clearStorage(); return shell(dashboardHtml({page: 6, finalPage: 90})); },
};

export const Dark = {
  render: () => {
    clearStorage();
    try { sessionStorage.setItem(REVEALED_KEY, 'true'); } catch {}
    return shell(dashboardHtml({page: 6, finalPage: 90}), {dark: true});
  },
};

export const RussianLocale = {
  name: 'Russian locale (localized ghost labels + landmark, not hardcoded English)',
  render: () => {
    clearStorage();
    try { sessionStorage.setItem(REVEALED_KEY, 'true'); } catch {}
    return shell(dashboardHtml({page: 6, finalPage: 90}), {lang: 'ru'});
  },
};
