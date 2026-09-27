import test from 'node:test';
import assert from 'node:assert/strict';
import {createRevealController, buildPaginationPlan, REVEAL_DELAY_MS, HABIT_THRESHOLD, REVEALED_KEY, HABIT_KEY} from '../src/pagination-model.mjs';

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
    _data: data,
  };
}

function throwingStorage() {
  return {
    getItem() { throw new Error('storage disabled'); },
    setItem() { throw new Error('storage disabled'); },
    removeItem() { throw new Error('storage disabled'); },
  };
}

// --- Reveal timing ---

test('hover held for exactly 1999ms does not reveal', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const controller = createRevealController({session: fakeStorage(), local: fakeStorage()});
  let revealed = false;
  controller.arm(() => { revealed = true; });
  t.mock.timers.tick(1999);
  assert.equal(revealed, false);
  assert.equal(controller.isRevealed(), false);
});

test('hover held for 2000ms reveals exactly once', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const controller = createRevealController({session: fakeStorage(), local: fakeStorage()});
  let calls = 0;
  controller.arm(() => { calls++; });
  t.mock.timers.tick(REVEAL_DELAY_MS);
  assert.equal(calls, 1);
  assert.equal(controller.isRevealed(), true);
});

test('pointer leaving before 2s cancels the pending reveal', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const controller = createRevealController({session: fakeStorage(), local: fakeStorage()});
  let revealed = false;
  controller.arm(() => { revealed = true; });
  t.mock.timers.tick(1000);
  controller.cancel();
  t.mock.timers.tick(5000);
  assert.equal(revealed, false);
  assert.equal(controller.isRevealed(), false);
});

// --- Session persistence ---

test('a session already flagged revealed skips the timer entirely', () => {
  const session = fakeStorage({[REVEALED_KEY]: 'true'});
  const controller = createRevealController({session, local: fakeStorage()});
  let calls = 0;
  controller.arm(() => { calls++; });
  assert.equal(calls, 1);
  assert.equal(controller.isRevealed(), true);
});

test('reveal writes the session flag so a fresh controller reading the same store is already revealed', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const session = fakeStorage();
  const first = createRevealController({session, local: fakeStorage()});
  first.arm(() => {});
  t.mock.timers.tick(REVEAL_DELAY_MS);
  const reloaded = createRevealController({session, local: fakeStorage()});
  assert.equal(reloaded.isRevealed(), true);
});

test('a second tab with its own sessionStorage stays compact independently', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const local = fakeStorage();
  const tabOne = createRevealController({session: fakeStorage(), local});
  tabOne.arm(() => {});
  t.mock.timers.tick(REVEAL_DELAY_MS);
  const tabTwo = createRevealController({session: fakeStorage(), local});
  assert.equal(tabTwo.isRevealed(), false);
});

// --- Habit counter ---

test('reveal increments the local habit counter exactly once despite repeated reveal calls', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const local = fakeStorage();
  const controller = createRevealController({session: fakeStorage(), local});
  controller.arm(() => {});
  t.mock.timers.tick(REVEAL_DELAY_MS);
  controller.reveal(() => {});
  controller.reveal(() => {});
  controller.arm(() => {});
  assert.equal(local.getItem(HABIT_KEY), '1');
});

test('re-arming within an already-revealed session never bumps the habit counter again', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const local = fakeStorage();
  const session = fakeStorage();
  createRevealController({session, local}).arm(() => {});
  t.mock.timers.tick(REVEAL_DELAY_MS);
  const nextRender = createRevealController({session, local});
  nextRender.arm(() => {});
  assert.equal(local.getItem(HABIT_KEY), '1');
});

test('two controllers sharing the same session/local storage (two pagination regions on one page) bump the habit counter only once total', () => {
  const session = fakeStorage();
  const local = fakeStorage();
  // Both are constructed while the session is still unrevealed, as would happen
  // when a page enhances a top and a bottom paginator in the same pass.
  const regionA = createRevealController({session, local});
  const regionB = createRevealController({session, local});
  regionA.reveal(() => {}); // e.g. region A's hover timer fires first
  regionB.reveal(() => {}); // region B's independent timer fires shortly after
  assert.equal(local.getItem(HABIT_KEY), '1');
});

test('three prior habit reveals make a brand new session reveal immediately on hover', () => {
  const local = fakeStorage({[HABIT_KEY]: String(HABIT_THRESHOLD)});
  const controller = createRevealController({session: fakeStorage(), local});
  let calls = 0;
  controller.arm(() => { calls++; });
  assert.equal(calls, 1);
  assert.equal(controller.hoverDelay(), 0);
});

test('fewer than three prior habit reveals still uses the full 2s delay', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const local = fakeStorage({[HABIT_KEY]: String(HABIT_THRESHOLD - 1)});
  const controller = createRevealController({session: fakeStorage(), local});
  let calls = 0;
  controller.arm(() => { calls++; });
  t.mock.timers.tick(REVEAL_DELAY_MS - 1);
  assert.equal(calls, 0);
  t.mock.timers.tick(1);
  assert.equal(calls, 1);
});

// --- Storage failure resilience ---

test('a storage backend that throws on every call never throws out of the controller', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const controller = createRevealController({session: throwingStorage(), local: throwingStorage()});
  let calls = 0;
  assert.doesNotThrow(() => controller.arm(() => { calls++; }));
  t.mock.timers.tick(REVEAL_DELAY_MS);
  assert.equal(calls, 1);
  assert.doesNotThrow(() => controller.reveal(() => {}));
});

test('a corrupt non-numeric habit count is treated as zero, not as the habit threshold', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const local = fakeStorage({[HABIT_KEY]: 'not-a-number'});
  const controller = createRevealController({session: fakeStorage(), local});
  assert.equal(controller.hoverDelay(), REVEAL_DELAY_MS);
});

test('missing storage (null) degrades to a working, non-persistent 2s reveal', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const controller = createRevealController({session: null, local: null});
  let calls = 0;
  controller.arm(() => { calls++; });
  t.mock.timers.tick(REVEAL_DELAY_MS);
  assert.equal(calls, 1);
});

// --- Plan / dedup logic (pure, no DOM) ---

function descriptor({first, previous, next, last, pages}) {
  return {
    first: first ?? {href: null, disabled: true, text: 'First'},
    previous: previous ?? {href: null, disabled: true},
    next: next ?? {href: null, disabled: true},
    last: last ?? {href: null, disabled: true, text: 'Last'},
    pages: pages ?? [],
  };
}

test('a single available page produces no expandable wings and disables both edges', () => {
  const plan = buildPaginationPlan(descriptor({}));
  assert.equal(plan.hasExpandable, false);
  assert.equal(plan.previous.disabled, true);
  assert.equal(plan.next.disabled, true);
  assert.deepEqual(plan.left, []);
  assert.deepEqual(plan.right, []);
});

test('two pages on page 1: Next and Last coincide, so no wing renders a redundant second control to page 2', () => {
  const plan = buildPaginationPlan(descriptor({
    first: {href: null, disabled: true, text: 'First'},
    previous: {href: null, disabled: true},
    next: {href: '/repo/issues?page=2', disabled: false},
    last: {href: '/repo/issues?page=2', disabled: false, text: 'Last'},
    pages: [
      {num: 1, href: null, active: true},
      {num: 2, href: '/repo/issues?page=2', active: false},
    ],
  }));
  assert.equal(plan.currentNum, 1);
  assert.deepEqual(plan.left, []);
  assert.deepEqual(plan.right, []); // Next already covers page 2; no separate "2 Last" needed
  assert.equal(plan.hasExpandable, false);
  assert.equal(plan.next.href, '/repo/issues?page=2');
});

test('on page 2, First and Previous coincide: the left wing is empty since Previous already reaches page 1', () => {
  const plan = buildPaginationPlan(descriptor({
    first: {href: '/repo/issues', disabled: false, text: 'First'},
    previous: {href: '/repo/issues?page=1', disabled: false},
    next: {href: '/repo/issues?page=3', disabled: false},
    last: {href: '/repo/issues?page=90', disabled: false, text: 'Last'},
    pages: [
      {num: 1, href: '/repo/issues?page=1', active: false},
      {num: 2, href: '/repo/issues?page=2', active: true},
      {num: 3, href: '/repo/issues?page=3', active: false},
    ],
  }));
  assert.deepEqual(plan.left, []);
  assert.equal(plan.right.length, 2); // page 3, then a legitimate distinct Last (page 90)
  assert.equal(plan.right[0].num, 3);
  assert.equal(plan.previous.href, '/repo/issues?page=1');
});

test('on the second-to-last page, Last and Next coincide: the right wing drops the redundant Last control', () => {
  const plan = buildPaginationPlan(descriptor({
    first: {href: '/repo/issues', disabled: false, text: 'First'},
    previous: {href: '/repo/issues?page=88', disabled: false},
    next: {href: '/repo/issues?page=90', disabled: false},
    last: {href: '/repo/issues?page=90', disabled: false, text: 'Last'},
    pages: [
      {num: 1, href: '/repo/issues?page=1', active: false},
      {num: 88, href: '/repo/issues?page=88', active: false},
      {num: 89, href: '/repo/issues?page=89', active: true},
      {num: 90, href: '/repo/issues?page=90', active: false},
    ],
  }));
  assert.equal(plan.right.length, 0); // Next already covers page 90
  assert.equal(plan.left.some((item) => item.kind === 'last'), false);
  assert.equal(plan.next.href, '/repo/issues?page=90');
});

test('First and Previous NOT coinciding (current far from page 2) keeps both distinct, matching the worked example', () => {
  const plan = buildPaginationPlan(descriptor({
    first: {href: '/repo/issues', disabled: false, text: 'First'},
    previous: {href: '/repo/issues?page=5', disabled: false},
    next: {href: '/repo/issues?page=7', disabled: false},
    last: {href: '/repo/issues?page=90', disabled: false, text: 'Last'},
    pages: [
      {num: 1, href: '/repo/issues?page=1', active: false},
      {num: 4, href: '/repo/issues?page=4', active: false},
      {num: 5, href: '/repo/issues?page=5', active: false},
      {num: 6, href: '/repo/issues?page=6', active: true},
    ],
  }));
  assert.equal(plan.left.some((item) => item.kind === 'first'), true);
  assert.equal(plan.left.some((item) => item.num === 5), true); // "5" stays, right next to Previous
});

test('46 total pages on the last page merges 46 into the Last control, not a duplicate href', () => {
  const plan = buildPaginationPlan(descriptor({
    first: {href: '/repo/issues', disabled: false, text: 'First'},
    previous: {href: '/repo/issues?page=45', disabled: false},
    next: {href: null, disabled: true},
    last: {href: '/repo/issues?page=46', disabled: true, text: 'Last'},
    pages: [
      {num: 1, href: '/repo/issues', active: false},
      {num: null, href: null, active: false},
      {num: 44, href: '/repo/issues?page=44', active: false},
      {num: 45, href: '/repo/issues?page=45', active: false},
      {num: 46, href: '/repo/issues?page=46', active: true},
    ],
  }));
  assert.equal(plan.currentNum, 46);
  const hrefs = plan.left.filter((item) => item.href).map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  const lastEntries = plan.left.filter((item) => item.kind === 'last' || (item.kind === 'first' && item.href === '/repo/issues?page=46'));
  assert.equal(lastEntries.length, 0);
  const numeric46 = plan.left.filter((item) => item.num === 46);
  assert.equal(numeric46.length, 0);
});

test('First merges with a real template-shaped page-1 neighbor, preserving First\'s own href and other filters', () => {
  // Mirrors base/paginate.tmpl exactly: First omits the page param entirely,
  // while the numeric page-1 anchor spells out page=1 plus the same filters.
  const plan = buildPaginationPlan(descriptor({
    first: {href: '/repo/issues?type=all', disabled: false, text: 'First'},
    previous: {href: '/repo/issues?page=5&type=all', disabled: false},
    next: {href: '/repo/issues?page=7&type=all', disabled: false},
    last: {href: '/repo/issues?page=90&type=all', disabled: false, text: 'Last'},
    pages: [
      {num: 1, href: '/repo/issues?page=1&type=all', active: false},
      {num: 5, href: '/repo/issues?page=5&type=all', active: false},
      {num: 6, href: '/repo/issues?page=6&type=all', active: true},
    ],
  }));
  const merged = plan.left.find((item) => item.kind === 'first');
  assert.equal(merged.merged, true);
  assert.equal(merged.num, 1);
  assert.equal(merged.href, '/repo/issues?type=all');
  const duplicate = plan.left.find((item) => item.num === 1 && item.kind !== 'first');
  assert.equal(duplicate, undefined);
  assert.deepEqual(plan.left.map((item) => item.kind), ['first', 'page']);
  assert.deepEqual(plan.left.map((item) => item.num), [1, 5]);
});

test('a first anchor without a matching page-1 entry never merges, even with matching pathname', () => {
  const plan = buildPaginationPlan(descriptor({
    first: {href: '/repo/issues?type=all', disabled: false, text: 'First'},
    previous: {href: '/repo/issues?page=3&type=all', disabled: false},
    next: {href: '/repo/issues?page=5&type=all', disabled: false},
    last: {href: '/repo/issues?page=90&type=all', disabled: false, text: 'Last'},
    pages: [
      {num: 3, href: '/repo/issues?page=3&type=all', active: false},
      {num: 4, href: '/repo/issues?page=4&type=all', active: true},
    ],
  }));
  const first = plan.left.find((item) => item.kind === 'first');
  assert.equal(first.merged, false);
  assert.deepEqual(plan.left.map((item) => item.num), [null, 3]);
});

test('pages split around the active entry appear exactly once, in native ascending order, on the correct side', () => {
  const plan = buildPaginationPlan(descriptor({
    first: {href: '/repo/issues?page=1', disabled: false, text: 'First'},
    previous: {href: '/repo/issues?page=5', disabled: false},
    next: {href: '/repo/issues?page=7', disabled: false},
    last: {href: '/repo/issues?page=90', disabled: false, text: 'Last'},
    pages: [
      {num: 1, href: '/repo/issues?page=1', active: false},
      {num: 2, href: '/repo/issues?page=2', active: false},
      {num: 5, href: '/repo/issues?page=5', active: false},
      {num: 6, href: '/repo/issues?page=6', active: true},
      {num: 7, href: '/repo/issues?page=7', active: false},
      {num: 90, href: '/repo/issues?page=90', active: false},
    ],
  }));
  assert.deepEqual(plan.left.map((item) => item.num), [1, 2, 5]);
  assert.deepEqual(plan.right.map((item) => item.num), [7, 90]);
  const allNums = [...plan.left, ...plan.right].filter((item) => item.num !== null).map((item) => item.num);
  assert.equal(new Set(allNums).size, allNums.length, 'no page number appears in both wings');
  assert.equal(allNums.includes(6), false, 'the current page is never rendered');
});

test('ellipsis markers are preserved as inert placeholders between distant page groups', () => {
  const plan = buildPaginationPlan(descriptor({
    first: {href: '/repo/issues', disabled: false, text: 'First'},
    previous: {href: '/repo/issues?page=5', disabled: false},
    next: {href: '/repo/issues?page=7', disabled: false},
    last: {href: '/repo/issues?page=90', disabled: false, text: 'Last'},
    pages: [
      {num: 1, href: '/repo/issues', active: false},
      {num: null, href: null, active: false},
      {num: 5, href: '/repo/issues?page=5', active: false},
      {num: 6, href: '/repo/issues?page=6', active: true},
      {num: 7, href: '/repo/issues?page=7', active: false},
      {num: null, href: null, active: false},
      {num: 90, href: '/repo/issues?page=90', active: false},
    ],
  }));
  assert.equal(plan.left.some((item) => item.kind === 'ellipsis'), true);
  assert.equal(plan.right.some((item) => item.kind === 'ellipsis'), true);
  assert.equal(plan.hasExpandable, true);
});

test('cursor-based pagination without numeric pages exposes only native prev/next/first/last edges', () => {
  const plan = buildPaginationPlan(descriptor({
    first: {href: null, disabled: true, text: 'First'},
    previous: {href: null, disabled: true},
    next: {href: '/repo/commits?before=abc123', disabled: false},
    last: {href: null, disabled: true, text: 'Last'},
    pages: [],
  }));
  assert.deepEqual(plan.left, []);
  assert.deepEqual(plan.right, []);
  assert.equal(plan.hasExpandable, false);
  assert.equal(plan.next.href, '/repo/commits?before=abc123');
});

// --- Known total, independent of whether the Last edge control renders ---

test('total is known from a normal, un-suppressed Last href', () => {
  const plan = buildPaginationPlan(descriptor({
    first: {href: '/repo/issues', disabled: false, text: 'First'},
    previous: {href: '/repo/issues?page=5', disabled: false},
    next: {href: '/repo/issues?page=7', disabled: false},
    last: {href: '/repo/issues?page=90', disabled: false, text: 'Last'},
    pages: [{num: 6, href: null, active: true}],
  }));
  assert.equal(plan.total, 90);
});

test('total stays known even when Last is suppressed for coinciding with Next (the second-to-last page)', () => {
  const plan = buildPaginationPlan(descriptor({
    first: {href: '/repo/issues', disabled: false, text: 'First'},
    previous: {href: '/repo/issues?page=88', disabled: false},
    next: {href: '/repo/issues?page=90', disabled: false},
    last: {href: '/repo/issues?page=90', disabled: false, text: 'Last'},
    pages: [{num: 89, href: null, active: true}],
  }));
  assert.equal(plan.right.length, 0); // Last was suppressed, per the earlier dedup test
  assert.equal(plan.total, 90); // but the total is still recoverable from Last's own href
});

test('total on the last page itself is the current page number (Last is disabled there)', () => {
  const plan = buildPaginationPlan(descriptor({
    first: {href: '/repo/issues', disabled: false, text: 'First'},
    previous: {href: '/repo/issues?page=89', disabled: false},
    next: {href: null, disabled: true},
    last: {href: '/repo/issues?page=90', disabled: true, text: 'Last'},
    pages: [{num: 90, href: null, active: true}],
  }));
  assert.equal(plan.total, 90);
});

test('total is null (never guessed) for cursor-based pagination where Last is unavailable', () => {
  const plan = buildPaginationPlan(descriptor({
    first: {href: null, disabled: true, text: 'First'},
    previous: {href: null, disabled: true},
    next: {href: '/repo/commits?before=abc123', disabled: false},
    last: {href: null, disabled: true, text: 'Last'},
    pages: [],
  }));
  assert.equal(plan.total, null);
});
