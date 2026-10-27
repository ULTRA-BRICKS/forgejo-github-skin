/**
 * Bounded decoration adapter for the Vue-owned dashboard/org repo-list pager
 * (`web_src/js/components/DashboardRepoList.vue`, read at pinned Forgejo v16.0.3:
 * https://codeberg.org/forgejo/forgejo/raw/tag/v16.0.3/web_src/js/components/DashboardRepoList.vue —
 * this pagination section is byte-identical at v16.0.5, the skin's other tested
 * version per skin.manifest.json's `testedForgejo`, confirmed by direct comparison).
 *
 * That component always renders exactly this shape when more than one page exists
 * (`v-if="showMoreReposLink"`, inside `#dashboard-repo-list .ui.attached.table.segment`):
 *   <div class="ui borderless pagination menu narrow tw-my-2">
 *     <a class="item navigation" @click="changePage(1)">First</a>
 *     <a class="item navigation" @click="changePage(page-1)">Previous</a>
 *     <a class="active item">{{ page }}</a>
 *     <a class="item navigation" @click="changePage(page+1)">Next</a>
 *     <a class="item navigation" @click="changePage(finalPage)">Last</a>
 *   </div>
 * Unlike base/paginate.tmpl (src/pagination.mjs's target), Vue never renders a
 * numbered page list or real hrefs. Only native filtered counts plus the native
 * search limit can prove Last duplicates Next; unavailable totals are not guessed.
 * First/Previous duplicates are identifiable on page two. The only wings are
 * the fixed First/Last edges, and their native callbacks remain authoritative.
 *
 * `changePage()` unconditionally does `this.repos = []` before refetching, which
 * makes `v-if="repos.length"` — and therefore this whole pagination div — unmount
 * and remount as a brand-new element on every single page change (confirmed by
 * reading the component's `changePage`/`searchRepos` methods). This module never
 * relocates, clones, or reparents any node Vue rendered (no Vue subtree/ownership
 * violation): it only adds classes/attributes/inert to the five native anchors in
 * place, plus a non-Vue status span. Keyboard dwell uses the native Previous/Next
 * controls, not additional hidden buttons. Because the whole div is destroyed
 * every page change, that addition is destroyed right along with it — a bounded
 * MutationObserver on the stable `#dashboard-repo-list` mount root (never itself
 * torn down by Vue) notices the fresh div and re-decorates it once. Re-processing is
 * a no-op: `decorate()` bails immediately whenever a pager already carries
 * `data-hgh-vpg-applied`, so the observer settles after exactly one extra idle pass
 * per real Vue patch and never loops.
 *
 * Anchors are classified by position (First, Previous, current, Next, Last) and by
 * `.navigation`/`.active` class alone, deliberately not by icon or `:title` text —
 * matching src/pagination.mjs's own "classify by position... works in every
 * language Forgejo ships" rationale, applied consistently here.
 *
 * Reveal timing/session/habit-count state, INCLUDING the in-memory fallback
 * mirror used when a real Storage write throws (e.g. private browsing), comes
 * from pagination-model.mjs's shared `createStorageBridge` — the same one
 * src/pagination.mjs uses. Both widgets' bridges resolve the same real
 * `sessionStorage`/`localStorage` object identity within one document, so
 * their fallback mirrors converge on one shared view: whichever pager reveals
 * first is the only one that bumps the habit counter, and the other correctly
 * observes the flag already set, even when the real write throws — verified
 * in tests/pagination-model.test.mjs's storage-bridge tests and
 * tests/dashboard-pagination.test.mjs/tests/mobile/dashboard-pagination.spec.mjs
 * for the normal-storage case. Two different documents (two tabs, two
 * iframes) always resolve two different real Storage objects, so their
 * fallback mirrors stay fully separate — no cross-document leakage.
 * Cross-widget *instant* reveal propagation on an already-rendered page (the way
 * src/pagination.mjs's private `revealAllRegions` syncs multiple classic regions)
 * is out of reach from here without editing that module's unexported `states`; not
 * implemented — see the result report for this limitation.
 */
import {createRevealController, createStorageBridge} from './pagination-model.mjs';

const HOST_SELECTOR = '#dashboard-repo-list';
const PAGER_SELECTOR = '.ui.borderless.pagination.menu';

const hosts = new Map(); // host element -> {observer, parentObserver}
const pagers = new Map(); // pager element -> {controller, undo}

/**
 * Pure, DOM-free shape check: `children` is the pager's `<a>` children in native
 * DOM order, each described as `{navigation, active}`. Returns the five roles by
 * position or `null` for any unrecognized shape (wrong count, current not exactly
 * one non-navigation active anchor, or an edge missing `.navigation`) — never
 * guessed at, matching the "no fake numbered pages / no invented shape" contract.
 */
export function classifyPagerChildren(children) {
  if (children.length !== 5) return null;
  const [first, previous, current, next, last] = children;
  if (!first.navigation || !previous.navigation || !next.navigation || !last.navigation) return null;
  if (current.navigation || !current.active) return null;
  if (first.active || previous.active || next.active || last.active) return null;
  return {first, previous, current, next, last};
}

function describeAnchor(el) {
  return {navigation: el.classList.contains('navigation'), active: el.classList.contains('active'), el};
}

function classifyPager(pager) {
  if (pager.children.length !== 5) return null; // reject any non-anchor child too, not just a wrong anchor count
  const anchors = [...pager.children].filter((el) => el.tagName === 'A');
  const shape = classifyPagerChildren(anchors.map(describeAnchor));
  if (!shape) return null;
  return {firstEl: shape.first.el, prevEl: shape.previous.el, currentEl: shape.current.el, nextEl: shape.next.el, lastEl: shape.last.el};
}

function stringsFor(doc) {
  const ru = doc.documentElement.lang?.startsWith('ru');
  // Ghost-label text feeds a plain `data-hgh-vpg-label` attribute (see
  // below), not a DOM text node — Vue's real anchors carry no text at all, so
  // there is nothing to localize via a `.navigation_label` span the way
  // src/pagination.mjs does; this is the only path available to keep the visible
  // labels in the page's own language instead of hardcoding English into CSS.
  return ru
    ? {label: 'Постраничная навигация', page: (n) => `Страница ${n}`, prev: '‹ Пред.', next: 'След. ›', first: 'Первая', last: 'Последняя'}
    : {label: 'Pagination', page: (n) => `Page ${n}`, prev: '‹ Previous', next: 'Next ›', first: 'First', last: 'Last'};
}

// --- Reversible decoration helpers: every call pushes its own exact inverse. ---

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

function trackInert(el, undo) {
  const had = el.hasAttribute('inert');
  el.setAttribute('inert', '');
  // Explicit restore, not a conditional no-op: reveal (in decorate()) only clears
  // `inert` on edges the caller's own pre-captured native-inert check says we
  // added ourselves; restore here still puts the exact original state back
  // regardless of anything reveal did.
  undo.push(() => { if (had) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
}

// Storage-failure fallback (memory mirror on a throwing/disabled real Storage)
// is shared with every other widget in the page via pagination-model.mjs's
// createStorageBridge — see its own comment for why that sharing matters,
// and why it never leaks across two different documents.


/** Forgejo/Vue's real anchors have no `href` and no `tabindex` at all — a bare
 *  `<a>` without `href` is outside the tab order, gets no browser-default
 *  Enter/Space activation, AND (verified via Chromium's accessibility tree)
 *  exposes role "generic" rather than "link" or "button" — so even once
 *  focusable, screen-reader users navigating by control type (e.g. NVDA/JAWS
 *  "next button") would never land on it. `role="button"` is the accurate
 *  semantic here (clicking changes in-page state via `changePage()`, not
 *  navigation to a new resource — there is no `href` at all to make "link"
 *  correct). The accessible NAME needs no extra work either: Chromium includes
 *  CSS generated (`::before`/`::after`) content in accessible-name computation,
 *  so the computed name is the same visible ghost label a sighted user sees
 *  ("‹ Previous" etc., from stringsFor()'s localized `data-hgh-vpg-label`
 *  attribute) — confirmed via a real Chromium `Accessibility.getFullAXTree`
 *  read, not assumed. The native `:title` Vue already sets (e.g. "First page")
 *  only matters as a fallback should the ghost label ever be removed.
 *
 *  Decorating `tabindex` + a keydown handler that calls `el.click()` on the
 *  exact same native anchor (never a clone, never a synthesized navigation)
 *  makes them real tab stops that invoke Vue's own bound `@click` handler
 *  exactly once per activation.
 *
 *  `inert` (used separately for the hidden First/Last edges) blocks actual focus
 *  and the browser's sequential focus order, but it does NOT change the `tabIndex`
 *  IDL property's reflected value — an element can still report `tabIndex === 0`
 *  while inert. `startHidden` makes the *attribute* itself `-1` while compact, so
 *  both the real focus behavior (via `inert`) and the reflected property agree;
 *  `reveal()` upgrades it to `0` once the edge is genuinely reachable, but only
 *  when the control isn't natively `.disabled` (which always stays `-1`). */
function makeKeyboardOperable(el, undo, {startHidden = false} = {}) {
  const disabled = el.classList.contains('disabled');
  trackAttr(el, 'role', 'button', undo);
  trackAttr(el, 'tabindex', startHidden ? '-1' : (disabled ? '-1' : '0'), undo);
  if (disabled) trackAttr(el, 'aria-disabled', 'true', undo);
  // Reads `.disabled` live (not the snapshot above) at activation time: this
  // module's whole design rests on Vue fully remounting the pager on every
  // page/disabled-state change (see the file header), so the snapshot should
  // never actually go stale — but checking live here is a zero-cost guard
  // against a click-through or a wrongly-withheld tab stop if some future
  // Forgejo patch ever reuses the anchor in place instead.
  const onKeydown = (event) => {
    if (el.classList.contains('disabled') || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault(); // Space must not scroll the page.
    el.click();
  };
  el.addEventListener('keydown', onKeydown);
  undo.push(() => el.removeEventListener('keydown', onKeydown));
  return {
    reveal() {
      if (el.classList.contains('disabled') || el.getAttribute('tabindex') === '0') return;
      trackAttr(el, 'tabindex', '0', undo);
    },
  };
}


function decorate(doc, pager) {
  if (pager.dataset.hghVpgApplied === 'true') return;
  const shape = classifyPager(pager);
  if (!shape) return; // Unrecognized shape (future template change): leave native alone.
  const {firstEl, prevEl, currentEl, nextEl, lastEl} = shape;
  const undo = [];
  const strings = stringsFor(doc);

  trackAttr(pager, 'data-hgh-vpg-applied', 'true', undo);
  trackClass(pager, 'hgh-vpg', undo);
  trackAttr(pager, 'role', 'navigation', undo);
  trackAttr(pager, 'aria-label', strings.label, undo);

  trackClass(firstEl, 'hgh-vpg-edge', undo);
  trackClass(firstEl, 'hgh-vpg-first', undo);
  trackClass(lastEl, 'hgh-vpg-edge', undo);
  trackClass(lastEl, 'hgh-vpg-last', undo);
  trackClass(prevEl, 'hgh-vpg-prev', undo);
  trackClass(nextEl, 'hgh-vpg-next', undo);
  trackAttr(prevEl, 'data-hgh-vpg-label', strings.prev, undo);
  trackAttr(nextEl, 'data-hgh-vpg-label', strings.next, undo);
  trackAttr(firstEl, 'data-hgh-vpg-label', strings.first, undo);
  trackAttr(lastEl, 'data-hgh-vpg-label', strings.last, undo);
  trackClass(currentEl, 'hgh-vpg-sr-only', undo);
  trackAttr(currentEl, 'aria-current', 'page', undo);
  trackAttr(currentEl, 'tabindex', '-1', undo);
  trackInert(currentEl, undo);
  // Read BEFORE anything below mutates `inert`: whether these were already inert
  // for some unrelated native reason, independent of our own reveal gating. Used
  // to keep keyboard operability honest (a natively inert control must start
  // `tabindex="-1"` and, for First/Last, never gets upgraded on reveal either —
  // see applyRevealed() below) even in an already-revealed session.
  const firstNativeInert = firstEl.hasAttribute('inert');
  const lastNativeInert = lastEl.hasAttribute('inert');
  const prevNativeInert = prevEl.hasAttribute('inert');
  const nextNativeInert = nextEl.hasAttribute('inert');
  const currentPage = Number(currentEl.textContent.trim());
  const shouldOmitLast = () => {
    const countText = pager.closest(HOST_SELECTOR)?.querySelector('.repos-filter .active .label')?.textContent.trim();
    const pageSize = Number(doc.defaultView.config?.pageData?.dashboardRepoList?.searchLimit);
    const totalPages = /^\d+$/.test(countText ?? '') && pageSize > 0 ? Math.ceil(Number(countText) / pageSize) : null;
    return lastEl.classList.contains('disabled') || (totalPages !== null && currentPage + 1 === totalPages);
  };
  const omitFirst = firstEl.classList.contains('disabled') || currentPage === 2;
  let omitLast = shouldOmitLast();
  const lastNativeOmitted = lastEl.classList.contains('hgh-vpg-omitted');
  undo.push(() => {
    lastEl.classList.toggle('hgh-vpg-omitted', lastNativeOmitted);
    lastEl.toggleAttribute('inert', lastNativeInert);
  });
  for (const edge of [omitFirst && firstEl, omitLast && lastEl]) {
    if (!edge) continue;
    trackClass(edge, 'hgh-vpg-omitted', undo);
    trackInert(edge, undo);
  }


  const controller = createRevealController({session: createStorageBridge(doc, 'sessionStorage'), local: createStorageBridge(doc, 'localStorage')});
  const alreadyRevealed = controller.isRevealed();

  const firstKbd = makeKeyboardOperable(firstEl, undo, {startHidden: !alreadyRevealed || firstNativeInert || omitFirst});
  makeKeyboardOperable(prevEl, undo, {startHidden: prevNativeInert});
  makeKeyboardOperable(nextEl, undo, {startHidden: nextNativeInert});
  const lastKbd = makeKeyboardOperable(lastEl, undo, {startHidden: !alreadyRevealed || lastNativeInert || omitLast});

  // May run once at decorate time (already-revealed session) or later, asynchronously,
  // from a hover/focus reveal — and, once revealed, `arm()`'s already-revealed
  // short-circuit can call this again on a later hover (including when the session
  // was ALREADY revealed at decorate time and no reveal-gating inert was set up
  // here at all — this still runs on that path's first real hover). The
  // `hasAttribute` guard keeps the attribute-undo push (and the redundant DOM
  // writes below) idempotent across repeat calls, exactly like decorate()'s own
  // top-of-function guard. Never clears/upgrades an edge that was natively inert
  // for an unrelated reason before we ever touched it; restore still puts that
  // exact native state back regardless of anything reveal did.
  //
  // `pager.isConnected` guards the DOM mutations below (never touch a detached
  // pager's `inert`/attributes). It does NOT, by itself, prevent the
  // shared session/habit storage writes: `createRevealController.reveal()`
  // (pagination-model.mjs) writes `REVEALED_KEY`/bumps `HABIT_KEY` BEFORE
  // invoking this callback, so a guard placed only here runs too late to stop
  // that. Preventing the armed timer from reaching `reveal()` at all — for a
  // host detached with no further internal mutation to trip the subtree
  // observer below — is handled by the separate parent-level observer in
  // `enhanceDashboardPagination()`, which cancels the controller before any
  // pending timer can fire.
  function applyRevealed() {
    if (!pager.isConnected) return;
    if (!pager.hasAttribute('data-hgh-vpg-revealed')) {
      pager.setAttribute('data-hgh-vpg-revealed', 'true');
      undo.push(() => pager.removeAttribute('data-hgh-vpg-revealed'));
    }
    if (!firstNativeInert && !omitFirst) { firstEl.removeAttribute('inert'); firstKbd.reveal(); }
    if (!lastNativeInert && !omitLast) { lastEl.removeAttribute('inert'); lastKbd.reveal(); }
  }

  if (alreadyRevealed) {
    trackAttr(pager, 'data-hgh-vpg-revealed', 'true', undo);
  } else {
    trackInert(firstEl, undo);
    trackInert(lastEl, undo);
  }

  const status = doc.createElement('span');
  status.className = 'hgh-vpg-sr-only';
  status.setAttribute('role', 'status');
  status.textContent = strings.page(currentEl.textContent.trim());
  pager.append(status);
  undo.push(() => status.remove());

  const onEnter = () => controller.arm(applyRevealed, 'pointer');
  const onLeave = () => controller.cancel('pointer');
  const onFocusIn = (event) => { if (!pager.contains(event.relatedTarget)) controller.arm(applyRevealed, 'focus'); };
  const onFocusOut = (event) => { if (!pager.contains(event.relatedTarget)) controller.cancel('focus'); };
  // Mirrors src/pagination.mjs's non-mouse guard: mouse gets a correct arm/cancel
  // lifecycle from pointerenter/pointerleave alone; without the guard, clicking
  // (mousedown+mouseup) on Previous/Next mid-hover would reset then immediately
  // cancel an in-flight countdown even though the mouse never left the region.
  const nonMouseOnly = (handler) => (event) => { if (event.pointerType !== 'mouse') handler(); };
  const onNonMousePress = nonMouseOnly(onEnter);
  const onNonMouseRelease = nonMouseOnly(onLeave);
  pager.addEventListener('pointerenter', onEnter);
  pager.addEventListener('pointerdown', onNonMousePress);
  pager.addEventListener('pointerleave', onLeave);
  pager.addEventListener('pointerup', onNonMouseRelease);
  pager.addEventListener('pointercancel', onNonMouseRelease);
  pager.addEventListener('focusin', onFocusIn);
  pager.addEventListener('focusout', onFocusOut);
  undo.push(() => {
    pager.removeEventListener('pointerenter', onEnter);
    pager.removeEventListener('pointerdown', onNonMousePress);
    pager.removeEventListener('pointerleave', onLeave);
    pager.removeEventListener('pointerup', onNonMouseRelease);
    pager.removeEventListener('pointercancel', onNonMouseRelease);
    pager.removeEventListener('focusin', onFocusIn);
    pager.removeEventListener('focusout', onFocusOut);
  });

  const refreshCount = () => {
    const omitted = shouldOmitLast();
    if (omitted === omitLast) return;
    omitLast = omitted;
    lastEl.classList.toggle('hgh-vpg-omitted', omitLast);
    const hidden = lastNativeInert || omitLast || pager.dataset.hghVpgRevealed !== 'true';
    lastEl.inert = hidden;
    lastEl.tabIndex = hidden ? -1 : 0;
  };
  pagers.set(pager, {controller, undo, refreshCount});
}

/** Full inverse of decorate(): destroys the controller (cancels any pending
 *  reveal timer), runs every pushed undo in reverse (classes/attrs/inert/
 *  keydown/pointer/focus listeners and injected status), and drops the
 *  tracking entry. Used identically whether the pager is still connected
 *  (explicit restoreDashboardPagination()) or was silently detached by a Vue
 *  remount (cleanupDisconnected()) — a detached pager must never keep live
 *  listeners/attributes, only a disconnected DOM subtree pinned in memory by
 *  those closures. */
function teardownPager(pager, state) {
  state.controller.destroy();
  for (let i = state.undo.length - 1; i >= 0; i--) state.undo[i]();
  pagers.delete(pager);
}

function cleanupDisconnected(doc) {
  for (const [pager, state] of pagers) {
    if (pager.ownerDocument === doc && !pager.isConnected) teardownPager(pager, state);
  }
}

function sweep(doc, host) {
  cleanupDisconnected(doc);
  for (const pager of host.querySelectorAll(PAGER_SELECTOR)) {
    const state = pagers.get(pager);
    if (state) state.refreshCount();
    else decorate(doc, pager);
  }
}

/** Decorates the Vue-rendered pager in place; safe to call repeatedly (idempotent
 *  per host and per pager instance) and safe when no pager/host is present yet. */
export function enhanceDashboardPagination(doc = document) {
  for (const host of doc.querySelectorAll(HOST_SELECTOR)) {
    if (hosts.has(host)) continue;
    sweep(doc, host);
    // If the host itself is ever detached (some future Forgejo change remounts
    // the Vue root, an htmx-style region swap, etc. — the module's whole design
    // otherwise assumes only the pager inside it unmounts, never the host),
    // self-disconnect instead of continuing to sweep: without this check,
    // teardownPager()'s own mutations inside a detached-but-still-observed
    // subtree would re-queue this same callback forever (a real hang, not
    // just a leak — mutations on a detached subtree still fire an observer
    // that's still `observe()`-ing it). `cleanupDisconnected(doc)` here also
    // tears down any pager(s) that were tracked under this host — otherwise
    // their keydown/pointer listeners and a still-armed reveal timer would
    // pin the detached subtree in memory and could still fire minutes later.
    const onHostDetached = () => {
      cleanupDisconnected(doc);
      observer.disconnect();
      parentObserver?.disconnect();
      hosts.delete(host);
    };
    const observer = new MutationObserver(() => {
      if (!host.isConnected) { onHostDetached(); return; }
      sweep(doc, host);
    });
    observer.observe(host, {childList: true, subtree: true, characterData: true});
    // The subtree observer above only fires on a mutation INSIDE host — a host
    // detached with no further mutation inside it (the exact shape a bare
    // `host.remove()` produces) would otherwise go unnoticed until something
    // eventually mutates inside the dead subtree. In the meantime, an already-
    // armed reveal timer (`createRevealController`'s internal `setTimeout`)
    // fires unconditionally and writes the shared session/habit storage BEFORE
    // this module's own callback ever runs (see applyRevealed()'s comment) —
    // `cleanupDisconnected`'s `controller.destroy()` must run *before* that
    // timer fires, which requires noticing the detachment itself, not a
    // mutation inside its now-irrelevant subtree. A second, still-bounded
    // (one level, `childList`-only, not document-wide) observer on host's own
    // parent catches exactly that removal as a microtask — which always runs
    // before the next timer macrotask, even one whose delay just elapsed.
    // This does not catch an ancestor several levels up being removed instead
    // of `host` directly; the module's stated assumption (a stable, server-
    // rendered mount point) makes that a materially narrower residual risk
    // than the direct-removal shape this closes.
    let parentObserver = null;
    if (host.parentElement) {
      parentObserver = new MutationObserver(() => { if (!host.isConnected) onHostDetached(); });
      parentObserver.observe(host.parentElement, {childList: true});
    }
    hosts.set(host, {observer, parentObserver});
  }
}

export function restoreDashboardPagination(doc = document) {
  for (const [host, {observer, parentObserver}] of hosts) {
    if (host.ownerDocument !== doc) continue;
    observer.disconnect();
    parentObserver?.disconnect();
    hosts.delete(host);
  }
  for (const [pager, state] of pagers) {
    if (pager.ownerDocument !== doc) continue;
    teardownPager(pager, state);
  }
}
