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
 * numbered page list or real hrefs (no total is ever derivable from the DOM, only
 * from `finalPage` in Vue's private data) — so there is nothing to dedupe/merge and
 * nothing to infer a destination URL for; the only "wings" that can ever exist here
 * are the fixed First/Last edges.
 *
 * `changePage()` unconditionally does `this.repos = []` before refetching, which
 * makes `v-if="repos.length"` — and therefore this whole pagination div — unmount
 * and remount as a brand-new element on every single page change (confirmed by
 * reading the component's `changePage`/`searchRepos` methods). This module never
 * relocates, clones, or reparents any node Vue rendered (no Vue subtree/ownership
 * violation): it only adds classes/attributes/inert to the five native anchors in
 * place, plus two small non-Vue sibling `<button>` triggers appended as extra
 * children of the pager div for keyboard access. Because the whole div is destroyed
 * every page change, those additions are destroyed right along with it — a bounded
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
 * Reveal timing/session/habit-count state comes from pagination-model.mjs's
 * `createRevealController`, reading/writing the *same* real sessionStorage/
 * localStorage keys src/pagination.mjs uses (same module constants, same real
 * browser Storage — nothing new to keep in sync under normal, non-throwing
 * Storage). `arm()`'s existing already-revealed short-circuit means whichever
 * pager (classic or this one) reveals first writes the flag and bumps the habit
 * counter exactly once; the other simply observes the flag already set and
 * skips its own bump — verified in tests/dashboard-pagination.test.mjs and
 * tests/mobile/dashboard-pagination.spec.mjs for the normal-storage case.
 * KNOWN LIMITATION (a real Storage.setItem failure, e.g. private browsing):
 * each widget module keeps its own private in-memory fallback mirror (this
 * module's `memoryStore`/`failedRealWrites` below is a separate instance from
 * src/pagination.mjs's equivalent shim), so if both a classic pager and this
 * one are mounted in the same page load AND a real write throws, each can
 * independently re-reveal/re-bump instead of observing the other's flag. Not
 * fixable from here without moving the shim into the shared, not-owned-by-
 * this-branch pagination-model.mjs — reported to the file owner rather than
 * duplicated further; see integrations/dashboard-pagination/skin-integration.
 * patch and the result report for detail.
 * Cross-widget *instant* reveal propagation on an already-rendered page (the way
 * src/pagination.mjs's private `revealAllRegions` syncs multiple classic regions)
 * is out of reach from here without editing that module's unexported `states`; not
 * implemented — see the result report for this limitation.
 */
import {createRevealController} from './pagination-model.mjs';

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
    ? {label: 'Постраничная навигация', more: 'Ещё страницы', page: (n) => `Страница ${n}`, prev: '‹ Пред.', next: 'След. ›', first: 'Первая', last: 'Последняя'}
    : {label: 'Pagination', more: 'More pages', page: (n) => `Page ${n}`, prev: '‹ Previous', next: 'Next ›', first: 'First', last: 'Last'};
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

// The Vue pager remounts on every page change (see the file header), so
// "revealed once per session" must survive real Storage write failures across
// those remounts within one page load, not just a single decorate() call. This
// mirrors src/pagination.mjs's own `storageOf`/`memoryStore` resilience layer
// (that module is not in this branch's owned scope to import from — it exposes
// no public API for it — so this is a small, deliberate, bounded duplicate of
// an already-proven ~20-line pattern, not new logic).
const memoryStore = new Map();
function memoryGet(prefix, key) {
  const full = prefix + key;
  return memoryStore.has(full) ? memoryStore.get(full) : null;
}
function memorySet(prefix, key, value) {
  memoryStore.set(prefix + key, String(value));
}
const failedRealWrites = new Set();
function safeStorage(doc, name) {
  const prefix = name + ':';
  return {
    getItem(key) {
      const full = prefix + key;
      if (!failedRealWrites.has(full)) {
        try {
          const value = doc.defaultView?.[name]?.getItem(key);
          if (value !== null && value !== undefined) return value;
        } catch {}
      }
      return memoryGet(prefix, key);
    },
    setItem(key, value) {
      const full = prefix + key;
      memorySet(prefix, key, value);
      try { doc.defaultView?.[name]?.setItem(key, value); failedRealWrites.delete(full); }
      catch { failedRealWrites.add(full); }
    },
  };
}

function retireTrigger(doc, trigger) {
  if (!trigger || trigger.hidden) return;
  if (doc.activeElement === trigger) trigger.addEventListener('blur', () => { trigger.hidden = true; }, {once: true});
  else trigger.hidden = true;
}

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

/** Returns `{btn, dispose}`: `dispose()` removes the click listener itself, not
 *  just the node from the DOM. `.remove()` alone detaches a node but leaves its
 *  listeners bound — if any stale code retained a reference to a torn-down
 *  trigger, calling `.click()` on it would still fire `onActivate()` (which
 *  mutates the pager via `applyRevealed`/`controller.reveal`) even after restore
 *  already put the native pager back to pristine. `dispose()` closes that hole. */
function makeTrigger(doc, strings, side, onActivate) {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'hgh-vpg-more hgh-vpg-more-' + side;
  btn.setAttribute('aria-label', strings.more);
  btn.textContent = '…';
  const onClick = (event) => {
    event.preventDefault();
    onActivate();
    // `retireTrigger` (called synchronously inside `onActivate` -> `reveal` ->
    // `applyRevealed`) defers hiding a still-focused trigger until it blurs —
    // correct for keyboard (never yank focus out from under an active user),
    // but on a coarse pointer this trigger is a real, always-visible 44px
    // overlay (see the coarse-pointer CSS) sitting ON TOP of the just-revealed
    // First control (positioned descendants paint over in-flow siblings
    // regardless of DOM order). A pointer-driven activation (touch or mouse)
    // DOES focus the button in Chromium (confirmed empirically; WebKit does
    // not), so without this, the deferred hide never runs until some
    // unrelated later blur — stranding the overlay over First indefinitely
    // and silently absorbing every further tap there.
    // `:focus-visible` — not `event.pointerType` — is the correct signal here:
    // Firefox's `click` event carries no `pointerType` at all for either a
    // real touch tap OR genuine keyboard Enter/Space, so `pointerType` alone
    // can't tell them apart there and would silently miss the Firefox-touch
    // case. `:focus-visible` is the platform's own already-correct heuristic
    // for "was this focus keyboard-style" (matching the CSS `:focus-visible`
    // rule above) — never true for touch/mouse, true for real keyboard
    // navigation — so blurring on `!focus-visible` fixes every pointer
    // modality uniformly without guessing from event properties.
    if (!btn.matches(':focus-visible')) btn.blur();
  };
  btn.addEventListener('click', onClick);
  return {btn, dispose: () => btn.removeEventListener('click', onClick)};
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

  // Read BEFORE anything below mutates `inert`: whether these were already inert
  // for some unrelated native reason, independent of our own reveal gating. Used
  // to keep keyboard operability honest (a natively inert control must start
  // `tabindex="-1"` and, for First/Last, never gets upgraded on reveal either —
  // see applyRevealed() below) even in an already-revealed session.
  const firstNativeInert = firstEl.hasAttribute('inert');
  const lastNativeInert = lastEl.hasAttribute('inert');
  const prevNativeInert = prevEl.hasAttribute('inert');
  const nextNativeInert = nextEl.hasAttribute('inert');

  const controller = createRevealController({session: safeStorage(doc, 'sessionStorage'), local: safeStorage(doc, 'localStorage')});
  const alreadyRevealed = controller.isRevealed();

  const firstKbd = makeKeyboardOperable(firstEl, undo, {startHidden: !alreadyRevealed || firstNativeInert});
  makeKeyboardOperable(prevEl, undo, {startHidden: prevNativeInert});
  makeKeyboardOperable(nextEl, undo, {startHidden: nextNativeInert});
  const lastKbd = makeKeyboardOperable(lastEl, undo, {startHidden: !alreadyRevealed || lastNativeInert});

  let triggerStart = null, triggerEnd = null;
  // May run once at decorate time (already-revealed session) or later, asynchronously,
  // from a hover/focus reveal — and, once revealed, `arm()`'s already-revealed
  // short-circuit can call this again on a later hover (including when the session
  // was ALREADY revealed at decorate time and no trigger/inert was ever set up
  // here at all — this still runs on that path's first real hover). The
  // `hasAttribute` guard keeps the attribute-undo push (and the redundant DOM
  // writes below) idempotent across repeat calls, exactly like decorate()'s own
  // top-of-function guard. Never clears/upgrades an edge that was natively inert
  // for an unrelated reason before we ever touched it; restore still puts that
  // exact native state back regardless of anything reveal did.
  //
  // `pager.isConnected` guards the DOM mutations below (never touch a detached
  // pager's `inert`/attributes/triggers). It does NOT, by itself, prevent the
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
    if (!firstNativeInert) { firstEl.removeAttribute('inert'); firstKbd.reveal(); }
    if (!lastNativeInert) { lastEl.removeAttribute('inert'); lastKbd.reveal(); }
    retireTrigger(doc, triggerStart);
    retireTrigger(doc, triggerEnd);
  }

  if (alreadyRevealed) {
    trackAttr(pager, 'data-hgh-vpg-revealed', 'true', undo);
  } else {
    trackInert(firstEl, undo);
    trackInert(lastEl, undo);
    const startTrigger = makeTrigger(doc, strings, 'start', () => controller.reveal(applyRevealed));
    const endTrigger = makeTrigger(doc, strings, 'end', () => controller.reveal(applyRevealed));
    triggerStart = startTrigger.btn;
    triggerEnd = endTrigger.btn;
    pager.prepend(triggerStart);
    pager.append(triggerEnd);
    undo.push(() => { startTrigger.dispose(); endTrigger.dispose(); triggerStart.remove(); triggerEnd.remove(); });
  }

  const status = doc.createElement('span');
  status.className = 'hgh-vpg-sr-only';
  status.setAttribute('role', 'status');
  status.textContent = strings.page(currentEl.textContent.trim());
  pager.append(status);
  undo.push(() => status.remove());

  const onEnter = () => controller.arm(applyRevealed);
  const onLeave = () => controller.cancel();
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
  undo.push(() => {
    pager.removeEventListener('pointerenter', onEnter);
    pager.removeEventListener('pointerdown', onNonMousePress);
    pager.removeEventListener('pointerleave', onLeave);
    pager.removeEventListener('pointerup', onNonMouseRelease);
    pager.removeEventListener('pointercancel', onNonMouseRelease);
  });

  pagers.set(pager, {controller, undo});
}

/** Full inverse of decorate(): destroys the controller (cancels any pending
 *  reveal timer), runs every pushed undo in reverse (classes/attrs/inert/
 *  keydown+pointer listeners/injected trigger+status nodes), and drops the
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
    if (!pagers.has(pager)) decorate(doc, pager);
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
    observer.observe(host, {childList: true, subtree: true});
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
