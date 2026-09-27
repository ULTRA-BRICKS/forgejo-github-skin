/**
 * Pure pagination logic: no DOM. Two independent concerns share this module:
 *
 *  - createRevealController: the hover/focus timing + storage state machine that
 *    decides when the First/Last/number "wings" around Previous/Next may appear.
 *  - buildPaginationPlan: turns a plain description of the native Forgejo
 *    pagination anchors (base/paginate.tmpl) into left/right wing groups, deduping
 *    any numeric page whose href duplicates First/Last so we never render two tab
 *    stops to the same destination.
 *
 * Kept dependency-free (storage and timers are injected) so both pieces are
 * testable under plain `node --test` with fake timers, no browser required.
 */

export const REVEAL_DELAY_MS = 2000;
export const HABIT_THRESHOLD = 3;
const NAMESPACE = 'hgh.pagination.v1.';
export const REVEALED_KEY = NAMESPACE + 'revealed';
export const HABIT_KEY = NAMESPACE + 'reveals';

function readRevealed(storage) {
  if (!storage) return false;
  try { return storage.getItem(REVEALED_KEY) === 'true'; } catch { return false; }
}

function writeRevealed(storage) {
  if (!storage) return;
  try { storage.setItem(REVEALED_KEY, 'true'); } catch {}
}

function readHabitCount(storage) {
  if (!storage) return 0;
  try {
    const value = Number(storage.getItem(HABIT_KEY));
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  } catch { return 0; }
}

function bumpHabitCount(storage) {
  if (!storage) return;
  try { storage.setItem(HABIT_KEY, String(readHabitCount(storage) + 1)); } catch {}
}

/**
 * @param {{session?: Storage|null, local?: Storage|null, delayMs?: number, habitThreshold?: number}} options
 */
export function createRevealController({session = null, local = null, delayMs = REVEAL_DELAY_MS, habitThreshold = HABIT_THRESHOLD} = {}) {
  let revealed = readRevealed(session);
  let timer = null;

  // Once true, stays true (no more reads needed). While false, re-checks storage
  // each time: a sibling controller for another pagination region on the same
  // page may have written the shared session flag after this one was built.
  function currentlyRevealed() {
    if (!revealed) revealed = readRevealed(session);
    return revealed;
  }

  function hoverDelay() {
    return readHabitCount(local) >= habitThreshold ? 0 : delayMs;
  }

  function cancel() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  }

  function reveal(onReveal) {
    cancel();
    const firstRevealThisSession = !currentlyRevealed();
    revealed = true;
    writeRevealed(session);
    if (firstRevealThisSession) bumpHabitCount(local);
    onReveal?.();
  }

  function arm(onReveal) {
    cancel();
    if (currentlyRevealed()) { onReveal?.(); return; }
    const delay = hoverDelay();
    if (delay <= 0) { reveal(onReveal); return; }
    timer = setTimeout(() => { timer = null; reveal(onReveal); }, delay);
  }

  return {isRevealed: currentlyRevealed, hoverDelay, arm, cancel, reveal, destroy: cancel};
}

function parseHref(href) {
  try { return new URL(href, 'https://pagination.invalid/'); } catch { return null; }
}

function pageNumberFromHref(href) {
  const url = parseHref(href);
  const raw = url?.searchParams.get('page');
  const num = raw !== null && raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(num) && num > 0 ? num : null;
}

/** Same navigation target regardless of query-param ordering; optionally treats an
 *  absent `page` param as `page=1` since Forgejo's First link omits it entirely. */
function sameDestination(a, b, {missingPageMeansOne = false} = {}) {
  if (!a || !b) return false;
  if (a === b) return true;
  const ua = parseHref(a), ub = parseHref(b);
  if (!ua || !ub) return false;
  if (ua.pathname !== ub.pathname || ua.hash !== ub.hash) return false;
  const pa = new URLSearchParams(ua.search), pb = new URLSearchParams(ub.search);
  if (missingPageMeansOne) {
    if (!pa.has('page')) pa.set('page', '1');
    if (!pb.has('page')) pb.set('page', '1');
  }
  const normalize = (params) => [...params.entries()].sort(([ka], [kb]) => ka.localeCompare(kb));
  return JSON.stringify(normalize(pa)) === JSON.stringify(normalize(pb));
}

/**
 * @typedef {{href: string|null, disabled: boolean, text?: string}} EdgeLink
 * @typedef {{num: number|null, href: string|null, active: boolean}} PageLink
 * @param {{first: EdgeLink, previous: EdgeLink, next: EdgeLink, last: EdgeLink, pages: PageLink[]}} native
 */
export function buildPaginationPlan(native) {
  const {first, previous, next, last, pages} = native;
  const active = pages.find((page) => page.active) ?? null;
  const currentNum = active ? active.num : null;

  const toItem = (page) => (page.num === null
    ? {kind: 'ellipsis'}
    : {kind: 'page', num: page.num, href: page.href});

  const activeIndex = pages.findIndex((page) => page.active);
  let leftSource = activeIndex === -1 ? [] : pages.slice(0, activeIndex);
  let rightSource = activeIndex === -1 ? pages.filter((page) => !page.active) : pages.slice(activeIndex + 1);

  // Merge the nearest real (non-ellipsis) edge page into First/Last when their
  // hrefs already point at the same destination, so we never duplicate a tab stop.
  const leftNumeric = leftSource.filter((page) => page.num !== null);
  const firstNeighbor = leftNumeric[0] ?? null;
  const mergeFirst = !!firstNeighbor && sameDestination(firstNeighbor.href, first.href, {missingPageMeansOne: true}) && !first.disabled;

  const rightNumeric = rightSource.filter((page) => page.num !== null);
  const lastNeighbor = rightNumeric.at(-1) ?? null;
  const mergeLast = !!lastNeighbor && sameDestination(lastNeighbor.href, last.href) && !last.disabled;

  if (mergeFirst) leftSource = leftSource.filter((page) => page !== firstNeighbor);
  if (mergeLast) rightSource = rightSource.filter((page) => page !== lastNeighbor);

  const suppressFirst = !first.disabled && sameDestination(first.href, previous.href, {missingPageMeansOne: true});
  const suppressLast = !last.disabled && sameDestination(last.href, next.href);

  const left = [];
  if (!first.disabled && !suppressFirst) {
    left.push(mergeFirst
      ? {kind: 'first', merged: true, num: firstNeighbor.num, href: first.href, text: first.text}
      : {kind: 'first', merged: false, num: null, href: first.href, text: first.text});
  }
  for (const page of leftSource) left.push(toItem(page));

  const right = [];
  for (const page of rightSource) right.push(toItem(page));
  if (!last.disabled && !suppressLast) {
    right.push(mergeLast
      ? {kind: 'last', merged: true, num: lastNeighbor.num, href: last.href, text: last.text}
      : {kind: 'last', merged: false, num: null, href: last.href, text: last.text});
  }
  // The total is knowable directly from Last's own href whenever Last is
  // enabled (Forgejo always encodes `page={TotalPages}` there), independent of
  // whether a Last *control* ends up rendered (it may be suppressed above for
  // coinciding with Next, e.g. on the second-to-last page) or merged into a
  // numeric neighbor. On the last page itself Last is disabled, but the
  // current page number *is* the total. Never guessed for cursor pagination.
  const total = last.disabled ? currentNum : pageNumberFromHref(last.href);

  return {
    left,
    right,
    previous: {href: previous.href, disabled: previous.disabled},
    next: {href: next.href, disabled: next.disabled},
    currentNum,
    total,
    hasExpandable: left.length > 0 || right.length > 0,
  };
}

