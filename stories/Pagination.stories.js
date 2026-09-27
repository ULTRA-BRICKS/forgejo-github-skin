import '../src/pagination.css';
import {enhancePagination, restorePagination} from '../src/pagination.mjs';
import {REVEALED_KEY, HABIT_KEY} from '../src/pagination-model.mjs';

/** Real base/paginate.tmpl markup — the same shape Forgejo renders, not a
 *  synthetic look-alike — so the production enhancer runs unmodified. */
function nativePagination({current, total, lang = 'en', params = ''}) {
  const q = params ? '?' + params : '';
  const amp = params ? '&' + params : '';
  const link = (page) => `/ultrabricks/forgejo-github-skin/issues?page=${page}${amp}`;
  const isFirst = current === 1, isLast = current === total;
  const hasPrev = current > 1, hasNext = current < total;
  const nums = new Set([1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total));
  const sorted = [...nums].sort((a, b) => a - b);
  const labels = lang === 'ru'
    ? {first: 'Первая', previous: 'Пред.', next: 'След.', last: 'Последняя'}
    : {first: 'First', previous: 'Previous', next: 'Next', last: 'Last'};
  let pagesHtml = '';
  let prevNum = 0;
  for (const n of sorted) {
    if (prevNum && n - prevNum > 1) pagesHtml += `<a class="disabled item">...</a>`;
    pagesHtml += n === current
      ? `<a class="active item">${n}</a>`
      : `<a class="item" href="${link(n)}">${n}</a>`;
    prevNum = n;
  }
  const chevron = (dir) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${dir === 'left' ? 'M10.5 3 5 8l5.5 5' : 'M5.5 3 11 8l-5.5 5'}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  return `<div class="center page buttons"><div class="ui borderless pagination menu">` +
    `<a class="${isFirst ? 'disabled ' : ''}item navigation" ${!isFirst ? `href="/ultrabricks/forgejo-github-skin/issues${q}"` : ''}>${chevron('left')}<span class="navigation_label">${labels.first}</span></a>` +
    `<a class="${!hasPrev ? 'disabled ' : ''}item navigation" ${hasPrev ? `href="${link(current - 1)}"` : ''}>${chevron('left')}<span class="navigation_label">${labels.previous}</span></a>` +
    pagesHtml +
    `<a class="${!hasNext ? 'disabled ' : ''}item navigation" ${hasNext ? `href="${link(current + 1)}"` : ''}><span class="navigation_label">${labels.next}</span>${chevron('right')}</a>` +
    `<a class="${isLast ? 'disabled ' : ''}item navigation" ${!isLast ? `href="${link(total)}"` : ''}><span class="navigation_label">${labels.last}</span>${chevron('right')}</a>` +
    `</div></div>`;
}

function clearPaginationStorage() {
  try { sessionStorage.removeItem(REVEALED_KEY); } catch {}
  try { localStorage.removeItem(HABIT_KEY); } catch {}
}

// Storybook has no global dark-theme token sheet loaded (that comes from the
// generated theme-hypergithub-dark.css at build time); setting these inline on
// the story root gives pagination.css's `var(--hgh-color-*, light-fallback)`
// reads real dark values without touching any shared file, matching the
// palette build.mjs derives from tokens.json for color.dark.*.
const DARK_TOKENS = {
  '--hgh-color-text': '#e6edf3', '--hgh-color-canvas': '#0d1117', '--hgh-color-subtle': '#161b22',
  '--hgh-color-border': '#30363d', '--hgh-color-muted': '#8b949e', '--hgh-color-counter': '#21262d',
  '--hgh-color-link': '#58a6ff', '--hgh-color-primary': '#238636',
};

function shell(bodyHtml, {dark = false, lang = 'en'} = {}) {
  restorePagination(document);
  document.documentElement.lang = lang;
  document.documentElement.dataset.theme = dark ? 'hypergithub-dark' : 'hypergithub-light';
  const root = document.createElement('div');
  root.style.padding = '48px 16px';
  root.style.background = dark ? DARK_TOKENS['--hgh-color-canvas'] : '#fff';
  root.style.minHeight = '160px';
  if (dark) for (const [prop, value] of Object.entries(DARK_TOKENS)) root.style.setProperty(prop, value);
  const inner = document.createElement('div');
  inner.innerHTML = bodyHtml;
  root.append(inner);
  queueMicrotask(() => enhancePagination(document));
  return root;
}

export default {title: 'Screens/Pagination'};

export const Compact = {
  render: () => { clearPaginationStorage(); return shell(nativePagination({current: 6, total: 90})); },
};

export const HoverPending = {
  name: 'Hover pending (live: hover 2s to reveal)',
  render: () => {
    clearPaginationStorage();
    const root = shell(nativePagination({current: 6, total: 90}));
    // Genuinely arms the real reveal timer on mount so the Storybook canvas
    // demonstrates the actual 2s hover contract when a reviewer hovers the
    // control by hand; nothing here fakes the visual state.
    queueMicrotask(() => {
      const nav = root.querySelector('.hgh-pagination');
      nav?.dispatchEvent(new PointerEvent('pointerenter', {bubbles: false}));
    });
    return root;
  },
};

export const Revealed = {
  name: 'Revealed (session already expanded)',
  render: () => {
    clearPaginationStorage();
    try { sessionStorage.setItem(REVEALED_KEY, 'true'); } catch {}
    return shell(nativePagination({current: 6, total: 90}));
  },
};

export const HabitInstantReveal = {
  name: 'Habit ≥3 (instant reveal on hover, no 2s wait)',
  render: () => {
    clearPaginationStorage();
    try { localStorage.setItem(HABIT_KEY, '3'); } catch {}
    const root = shell(nativePagination({current: 6, total: 90}));
    queueMicrotask(() => {
      const nav = root.querySelector('.hgh-pagination');
      nav?.dispatchEvent(new PointerEvent('pointerenter', {bubbles: false})); // delay is 0, reveals synchronously
    });
    return root;
  },
};

export const EdgesFirstPage = {
  name: 'Edges: first page (Previous disabled, First/1 merged away)',
  render: () => { clearPaginationStorage(); return shell(nativePagination({current: 1, total: 90})); },
};

export const EdgesLastPage = {
  name: 'Edges: last page (Next disabled, Last/90 merged away)',
  render: () => { clearPaginationStorage(); return shell(nativePagination({current: 90, total: 90})); },
};

export const EdgesTwoPages = {
  name: 'Edges: only 2 pages (Next already covers page 2, no wings at all)',
  render: () => { clearPaginationStorage(); return shell(nativePagination({current: 1, total: 2})); },
};

export const EdgesSinglePage = {
  name: 'Edges: single page (native block absent — nothing to enhance)',
  render: () => { clearPaginationStorage(); return shell('<p style="color:#59636e">A single page of results renders no pagination block at all.</p>'); },
};

export const LongLabels = {
  name: 'Long labels (Russian locale + a six-digit page count)',
  render: () => { clearPaginationStorage(); return shell(nativePagination({current: 500000, total: 999999, lang: 'ru'}), {lang: 'ru'}); },
};

export const Mobile320 = {
  name: 'Mobile 320px (reserved two-row layout — capture at a real 320px viewport)',
  // The @media(max-width:479px) breakpoint responds to the actual browser
  // viewport, not a container width; a wrapping div can't trigger it. Capture
  // this story with the browser/page resized to 320px (as the Playwright
  // mobile spec and storybook-screenshots.mjs both do) to see the real layout.
  render: () => { clearPaginationStorage(); return shell(nativePagination({current: 6, total: 90})); },
};

export const Mobile440 = {
  name: 'Mobile 440px (capture at a real 440px viewport)',
  render: () => { clearPaginationStorage(); return shell(nativePagination({current: 6, total: 90})); },
};

export const Dark = {
  render: () => {
    clearPaginationStorage();
    try { sessionStorage.setItem(REVEALED_KEY, 'true'); } catch {}
    return shell(nativePagination({current: 6, total: 90}), {dark: true});
  },
};
