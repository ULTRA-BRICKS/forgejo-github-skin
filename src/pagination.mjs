/**
 * Compact-by-default pagination: only "< Previous  Next >" shows until the pointer
 * or keyboard focus rests on the whole region for 2s (including touch long-press,
 * all through the same reveal controller), at which
 * point real First/number/Last "wings" fade in around the fixed-position center
 * pair with zero layout shift, because both wing columns reserve equal width from
 * first paint.
 *
 * Real native anchors (base/paginate.tmpl: `.page.buttons > .pagination.menu > a`)
 * are physically relocated, never cloned, so any listeners Forgejo (or another
 * script) attached to them stay intact — matching repository-controls.mjs and
 * list-options.mjs. Every mutation (moved position via a comment marker, added
 * class, added attribute, inserted child) is pushed onto an undo stack so
 * restorePagination() reverses them in order and returns the exact native nodes
 * to their exact original state, not a rebuilt copy.
 */
import {buildPaginationPlan, createRevealController, createStorageBridge} from './pagination-model.mjs';

const states = new Map(); // native <div class="pagination menu"> -> state

function stringsFor(doc) {
  const ru = doc.documentElement.lang?.startsWith('ru');
  return ru
    ? {label: 'Постраничная навигация', page: (n) => `Страница ${n}`, pageOf: (n, total) => `Страница ${n} из ${total}`}
    : {label: 'Pagination', page: (n) => `Page ${n}`, pageOf: (n, total) => `Page ${n} of ${total}`};
}

function edgeText(anchorEl) {
  return anchorEl.querySelector('.navigation_label')?.textContent.trim() || anchorEl.textContent.trim();
}

// Forgejo's real paginate.tmpl always renders 4 navigation anchors (First,
// Previous, Next, Last), but the contract also covers cursor-based listings
// that only know Previous/Next (no total, so no First/Last/numbers can exist
// without forging a URL). Classify by position, not by localized label text,
// so this works in every language Forgejo ships.
function parseMenu(menu) {
  const anchors = [...menu.querySelectorAll(':scope > a')];
  const navAnchors = anchors.filter((a) => a.classList.contains('navigation'));
  let firstEl = null, prevEl, nextEl, lastEl = null;
  if (navAnchors.length === 4) [firstEl, prevEl, nextEl, lastEl] = navAnchors;
  else if (navAnchors.length === 2) [prevEl, nextEl] = navAnchors;
  else return null; // Unrecognized shape: do nothing rather than guess at structure.
  const pageEls = anchors.filter((a) => !a.classList.contains('navigation'));
  const toEdge = (el) => (el ? {href: el.getAttribute('href'), disabled: el.classList.contains('disabled'), text: edgeText(el)} : {href: null, disabled: true, text: ''});
  const pages = pageEls.map((el) => ({
    num: el.classList.contains('disabled') ? null : (Number(el.textContent.trim()) || null),
    href: el.getAttribute('href'),
    active: el.classList.contains('active'),
  }));
  return {
    firstEl, prevEl, nextEl, lastEl, pageEls,
    descriptor: {first: toEdge(firstEl), previous: toEdge(prevEl), next: toEdge(nextEl), last: toEdge(lastEl), pages},
  };
}

// Storage-failure fallback (memory mirror on a throwing/disabled real Storage)
// is shared with every other widget in the page via pagination-model.mjs's
// createStorageBridge — see its own comment for why that sharing matters.

// --- Reversible DOM mutation helpers: every call pushes its own exact inverse. ---

function trackClass(el, cls, undo) {
  if (el.classList.contains(cls)) return;
  el.classList.add(cls);
  undo.push(() => el.classList.remove(cls));
}

function trackAttr(el, name, value, undo) {
  const had = el.hasAttribute(name);
  const prev = had ? el.getAttribute(name) : null;
  el.setAttribute(name, value);
  undo.push(() => { if (had) el.setAttribute(name, prev); else el.removeAttribute(name); });
}

/** Moves `el` to wherever it's appended next; a comment marker remembers its exact
 * original slot so undo puts it back there, not just "into some parent". Restore keys off
 * `marker.parentNode`, never `marker.isConnected`: an htmx-style swap can detach the whole
 * native `.pagination.menu` (marker included) before teardown runs, and `isConnected` is
 * false there even though the marker's parent still exists — checking it would silently
 * discard every relocated anchor instead of restoring them (same lesson as organization.mjs's
 * restoreSlot). `replaceWith` doesn't require the parent to be attached to the document. */
function relocate(doc, el, undo) {
  const marker = doc.createComment('hgh-pg-slot');
  el.before(marker);
  undo.push(() => { if (marker.parentNode) marker.replaceWith(el); else el.remove(); });
  return el;
}

function applyRevealed(nav, wings) {
  nav.dataset.hghPgRevealed = 'true';
  for (const wing of wings) {
    wing.itemsBox.removeAttribute('inert');
  }
}

/** A reveal anywhere on the page reveals every other already-enhanced pagination
 *  region too: they all read the same shared session flag, so a second (e.g.
 *  top/bottom) paginator staying compact while the session is "revealed" would
 *  be an inconsistent, surprising state. Never touches focus. */
function revealAllRegions(doc) {
  for (const [, state] of states) {
    if (state.nav.ownerDocument !== doc || state.nav.dataset.hghPgRevealed === 'true') continue;
    state.controller.cancel();
    applyRevealed(state.nav, state.wings);
  }
}

function buildSide(doc, items, parsed, pagesByHref, pagesByNum, undo) {
  const frag = doc.createDocumentFragment();
  for (const item of items) {
    if (item.kind === 'ellipsis') {
      const span = doc.createElement('span');
      span.className = 'hgh-pg-ellipsis';
      span.textContent = '…';
      span.setAttribute('aria-hidden', 'true');
      frag.append(span);
      continue;
    }
    if (item.kind === 'page') {
      const el = pagesByHref.get(item.href) ?? pagesByNum.get(item.num);
      if (!el) continue;
      trackClass(el, 'hgh-pg-number', undo);
      frag.append(relocate(doc, el, undo));
      continue;
    }
    const el = item.kind === 'first' ? parsed.firstEl : parsed.lastEl;
    trackClass(el, 'hgh-pg-edge', undo);
    if (item.merged) {
      const numSpan = doc.createElement('span');
      numSpan.className = 'hgh-pg-edge-num';
      numSpan.textContent = String(item.num);
      const label = el.querySelector('.navigation_label');
      if (item.kind === 'first') { if (label) label.after(numSpan); else el.append(numSpan); }
      else el.prepend(numSpan);
      undo.push(() => numSpan.remove());
      // The neighbor page anchor this merged into First/Last (e.g. "1" or "90")
      // is deliberately left untouched at its original position inside the
      // native menu: enhancePagination() sets that whole menu `hidden = true`
      // right after build() returns, which already makes any element still
      // inside it non-rendered, non-hit-testable and absent from the tab order
      // and accessibility tree — a second, per-node hidden/aria-hidden/tabindex
      // dance here would just duplicate that protection.
    }
    frag.append(relocate(doc, el, undo));
  }
  return frag;
}

function build(doc, menu) {
  const parsed = parseMenu(menu);
  if (!parsed) return null;
  const plan = buildPaginationPlan(parsed.descriptor);
  const strings = stringsFor(doc);
  const undo = [];

  const pagesByNum = new Map();
  const pagesByHref = new Map();
  for (const el of parsed.pageEls) {
    if (el.classList.contains('disabled')) continue;
    const num = Number(el.textContent.trim()) || null;
    if (num === null) continue;
    pagesByNum.set(num, el);
    if (el.hasAttribute('href')) pagesByHref.set(el.getAttribute('href'), el);
  }

  const nav = doc.createElement('nav');
  nav.className = 'hgh-pagination';
  nav.setAttribute('aria-label', strings.label);

  const controller = createRevealController({session: createStorageBridge(doc, 'sessionStorage'), local: createStorageBridge(doc, 'localStorage')});
  const alreadyRevealed = controller.isRevealed();
  const wings = [];

  function makeWing(side, items) {
    const wing = doc.createElement('div');
    wing.className = 'hgh-pg-wing hgh-pg-wing-' + side;
    const itemsBox = doc.createElement('span');
    itemsBox.className = 'hgh-pg-wing-items';
    itemsBox.append(buildSide(doc, items, parsed, pagesByHref, pagesByNum, undo));
    if (!alreadyRevealed) itemsBox.setAttribute('inert', '');
    wing.append(itemsBox);
    const record = {wing, itemsBox};
    wings.push(record);
    return record;
  }

  // Both wing columns are always built together (even an empty one) so they can
  // reserve equal width and keep Previous/Next at the region's true center.
  let leftWing = null, rightWing = null;
  if (plan.hasExpandable) {
    leftWing = makeWing('left', plan.left);
    nav.append(leftWing.wing);
  }

  const center = doc.createElement('div');
  center.className = 'hgh-pg-center';
  trackClass(parsed.prevEl, 'hgh-pg-prev', undo);
  trackClass(parsed.nextEl, 'hgh-pg-next', undo);
  if (parsed.prevEl.classList.contains('disabled')) trackAttr(parsed.prevEl, 'aria-disabled', 'true', undo);
  if (parsed.nextEl.classList.contains('disabled')) trackAttr(parsed.nextEl, 'aria-disabled', 'true', undo);
  center.append(relocate(doc, parsed.prevEl, undo), relocate(doc, parsed.nextEl, undo));
  nav.append(center);

  if (plan.hasExpandable) {
    rightWing = makeWing('right', plan.right);
    nav.append(rightWing.wing);
  }

  const total = plan.total;
  if (plan.currentNum !== null) {
    const status = doc.createElement('span');
    status.className = 'hgh-pg-sr-only';
    status.setAttribute('role', 'status');
    status.textContent = total !== null ? strings.pageOf(plan.currentNum, total) : strings.page(plan.currentNum);
    nav.append(status);
  }

  if (alreadyRevealed) nav.dataset.hghPgRevealed = 'true';

  const onEnter = () => controller.arm(() => revealAllRegions(doc), 'pointer');
  const onLeave = () => controller.cancel('pointer');
  const onFocusIn = (event) => { if (!nav.contains(event.relatedTarget)) controller.arm(() => revealAllRegions(doc), 'focus'); };
  const onFocusOut = (event) => { if (!nav.contains(event.relatedTarget)) controller.cancel('focus'); };
  // pointerdown/up/cancel are guarded to non-mouse pointer types: mouse already
  // gets a correct arm/cancel lifecycle from pointerenter/pointerleave alone.
  // Without the guard, clicking (mousedown+mouseup) on e.g. Previous mid-hover
  // would reset then immediately cancel an in-flight countdown, even though
  // the mouse never left the region. Touch/pen use these as a belt-and-
  // suspenders path since some stacks are inconsistent about pointerenter/leave.
  const nonMouseOnly = (handler) => (event) => { if (event.pointerType !== 'mouse') handler(); };
  const onNonMousePress = nonMouseOnly(onEnter);
  const onNonMouseRelease = nonMouseOnly(onLeave);
  nav.addEventListener('pointerenter', onEnter);
  nav.addEventListener('pointerdown', onNonMousePress);
  nav.addEventListener('pointerleave', onLeave);
  nav.addEventListener('pointerup', onNonMouseRelease);
  nav.addEventListener('pointercancel', onNonMouseRelease);
  nav.addEventListener('focusin', onFocusIn);
  nav.addEventListener('focusout', onFocusOut);

  return {nav, center, controller, wings, undo, leftWing, rightWing, resizeObserver: null, listeners: {onEnter, onNonMousePress, onLeave, onNonMouseRelease, onFocusIn, onFocusOut}};
}

/** Sums each child's own rendered width (plus the flex gap between them), never
 *  the parent box's own rendered width. Only valid in the canonical unwrapped
 *  state (see the force-unwrap in applyResponsiveLayout): the wrap layout's
 *  own CSS shrinks item padding and hides edge labels, so a child's own box
 *  DOES reflow between modes — this must never be called while still wrapped.
 *  Assumes children have no horizontal margins (true for pagination.css's
 *  margin-free `a.item`) — a margin would be real spacing this never counts. */
function naturalWidth(el, gap) {
  const children = el.children;
  let width = 0;
  for (const child of children) width += child.getBoundingClientRect().width;
  return children.length > 1 ? width + (children.length - 1) * gap : width;
}

// Reads the real column-gap CSS value instead of a hardcoded constant, so a
// future pagination.css gap tweak can never silently desync the fit math.
function columnGap(el) {
  return parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).columnGap) || 0;
}

// clientWidth includes the element's own padding, which is reserved space
// around its content, not room available to its children — a padded parent
// would otherwise make this measurement overstate the room nav actually has.
function contentWidth(el) {
  const cs = el.ownerDocument.defaultView.getComputedStyle(el);
  const padding = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  return Math.max(0, el.clientWidth - padding);
}

// Both wing columns always move together — equalized to the same width in
// row mode, cleared together in wrap mode — so this stays the single place
// that pairing is expressed instead of three separate call sites drifting.
function setWingsMinWidth(leftWing, rightWing, value) {
  leftWing.wing.style.minWidth = value;
  rightWing.wing.style.minWidth = value;
}

/** Container-size-aware layout, re-run on every resize (see the ResizeObserver
 *  in enhancePagination()): measures the real available width — the DOM
 *  parent's content box, which shrinks for a narrow viewport and a narrow
 *  embedding container alike — against the row layout's true natural width.
 *  Wide enough: both wing columns are set to the same pixel width (the wider
 *  side's natural content width) so Previous/Next sits at the row's true
 *  center regardless of which side has more entries. Too narrow: switches to
 *  the two-row wrap layout in pagination.css (which itself lets wing content
 *  wrap onto further lines, so it comfortably handles ordinary narrow widths);
 *  the pixel min-width is cleared so a value computed for a wider pass never
 *  survives into this narrower one.
 *
 *  Assumes nav's real DOM parent establishes its own width independently of
 *  nav's content (true for Forgejo's block-level `.page.buttons` container,
 *  and for every fixture in the test suite) — a shrink-to-fit parent sized
 *  entirely by nav's own content is not a supported configuration, the same
 *  assumption the original fixed-viewport design made implicitly. */
function applyResponsiveLayout(state) {
  const {nav, center, leftWing, rightWing} = state;
  if (!leftWing || !rightWing) return;
  const wasWrapped = nav.dataset.hghPgWrap === 'true';
  const prevMinWidth = leftWing.wing.style.minWidth;
  let wrap, max;
  try {
    if (wasWrapped) {
      // Force the canonical unwrapped state before measuring: the wrap
      // layout's own CSS shortens item padding and hides edge labels, so
      // measuring while still wrapped would underestimate the row layout's
      // true natural width — and could wrongly declare "fits" on a later
      // pass with no way to self-correct, since this only re-runs when the
      // parent's own size changes, not when this function's own writes do.
      delete nav.dataset.hghPgWrap;
      setWingsMinWidth(leftWing, rightWing, '');
    }
    const wingGap = columnGap(leftWing.itemsBox);
    const leftNatural = naturalWidth(leftWing.itemsBox, wingGap);
    const rightNatural = naturalWidth(rightWing.itemsBox, wingGap);
    const centerWidth = center.getBoundingClientRect().width;
    // Row mode equalizes both wings to the wider side's width (below), so the
    // actual rendered row needs 2 * max(left, right), not left + right.
    max = Math.max(leftNatural, rightNatural);
    const naturalRowWidth = centerWidth + max * 2 + columnGap(nav) * 2;
    const parent = nav.parentElement;
    const available = parent ? contentWidth(parent) : nav.ownerDocument.documentElement.clientWidth;
    wrap = available > 0 && naturalRowWidth > available;
  } catch {
    // Measurement failed partway through: restore exactly what was there
    // before this pass touched anything, rather than leaving the nav stuck
    // unwrapped-with-cleared-widths until an unrelated resize happens to
    // paper over it.
    if (wasWrapped) {
      nav.dataset.hghPgWrap = 'true';
      setWingsMinWidth(leftWing, rightWing, prevMinWidth);
    }
    return;
  }
  const nextMinWidth = max > 0 ? max + 'px' : '';
  // Wrap mode's canonical min-width is always '' (setWingsMinWidth clears it
  // whenever wrap is entered below), so only row mode needs the value
  // compared — a min-width mismatch in wrap mode can't happen without also
  // changing setWingsMinWidth's own pairing contract.
  const minWidthSettled = wrap || prevMinWidth === nextMinWidth;
  if (wrap === wasWrapped && minWidthSettled) {
    // Nothing actually changed (e.g. a height-only resize): restore exactly
    // what was there before the forced clear above instead of rewriting it,
    // so an unrelated tick never touches the DOM for a decision that didn't
    // move.
    if (wasWrapped) nav.dataset.hghPgWrap = 'true';
    return;
  }
  if (wrap) {
    nav.dataset.hghPgWrap = 'true';
    setWingsMinWidth(leftWing, rightWing, '');
  } else if (max > 0) {
    setWingsMinWidth(leftWing, rightWing, max + 'px');
  }
}

function teardown(menu, state) {
  state.controller.destroy();
  state.resizeObserver?.disconnect();
  state.nav.removeEventListener('pointerenter', state.listeners.onEnter);
  state.nav.removeEventListener('pointerdown', state.listeners.onNonMousePress);
  state.nav.removeEventListener('pointerleave', state.listeners.onLeave);
  state.nav.removeEventListener('pointerup', state.listeners.onNonMouseRelease);
  state.nav.removeEventListener('pointercancel', state.listeners.onNonMouseRelease);
  state.nav.removeEventListener('focusin', state.listeners.onFocusIn);
  state.nav.removeEventListener('focusout', state.listeners.onFocusOut);
  for (let i = state.undo.length - 1; i >= 0; i--) state.undo[i]();
  state.nav.remove();
  states.delete(menu);
}

function cleanupDisconnected(doc) {
  for (const [menu, state] of states) {
    if (menu.ownerDocument === doc && (!menu.isConnected || !state.nav.isConnected)) teardown(menu, state);
  }
}

/** Re-measures every already-built pager against doc's current CSS. Called from
 *  skin.mjs's release-theme `<link>` `load` handler, never a guessed timer: the
 *  very first applyResponsiveLayout() pass inside enhancePagination() can run
 *  while that same stylesheet (pagination.css itself is bundled inside it via
 *  skin.mjs's syncReleaseStyles()) is still being fetched, so the wrap decision
 *  gets measured against whatever CSS happens to already be in effect at that
 *  instant. Re-running here once the stylesheet's own load event actually fires
 *  settles every existing pager onto the real geometry with no unrelated resize
 *  needed to self-correct it. */
export function refreshResponsiveLayout(doc = document) {
  cleanupDisconnected(doc);
  for (const [menu, state] of states) {
    if (menu.ownerDocument === doc) applyResponsiveLayout(state);
  }
}

/** Recomputes applyResponsiveLayout() whenever the pagination region's real
 *  DOM parent changes size — a narrow viewport resizing, a narrow embedding
 *  container resizing, or both — so a layout computed for one width never
 *  goes stale in another. */
function setupResponsiveObserver(state) {
  if (!state.leftWing || !state.rightWing || typeof ResizeObserver === 'undefined') return;
  const parent = state.nav.parentElement;
  if (!parent) return;
  try {
    state.resizeObserver = new ResizeObserver(() => applyResponsiveLayout(state));
    state.resizeObserver.observe(parent);
  } catch {}
}

/** Reserve centered Previous/Next and wing geometry; sustained pointer or keyboard focus
 * reveals the native destinations without adding invisible tab stops. */
export function enhancePagination(doc = document) {
  cleanupDisconnected(doc);
  for (const menu of doc.querySelectorAll('.page.buttons > .pagination.menu')) {
    if (states.has(menu)) continue;
    const state = build(doc, menu);
    if (!state) continue;
    trackAttr(menu, 'hidden', '', state.undo);
    menu.after(state.nav);
    applyResponsiveLayout(state);
    setupResponsiveObserver(state);
    states.set(menu, state);
  }
}

export function restorePagination(doc = document) {
  for (const [menu, state] of states) {
    if (menu.ownerDocument === doc) teardown(menu, state);
  }
}
