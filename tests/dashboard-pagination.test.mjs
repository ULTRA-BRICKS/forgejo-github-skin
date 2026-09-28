import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPagerChildren} from '../src/dashboard-pagination.mjs';

// Exactly the real DashboardRepoList.vue shape (v16.0.3): First, Previous, current
// (active, non-navigation), Next, Last. Descriptors mirror only the two classes the
// classifier reads (`.navigation`, `.active`) — no DOM required for this pure check.
function shape({first = {}, previous = {}, current = {}, next = {}, last = {}} = {}) {
  return [
    {navigation: true, active: false, ...first},
    {navigation: true, active: false, ...previous},
    {navigation: false, active: true, ...current},
    {navigation: true, active: false, ...next},
    {navigation: true, active: false, ...last},
  ];
}

test('the real 5-anchor DashboardRepoList shape classifies into named roles', () => {
  const children = shape();
  const result = classifyPagerChildren(children);
  assert.ok(result);
  assert.equal(result.first, children[0]);
  assert.equal(result.previous, children[1]);
  assert.equal(result.current, children[2]);
  assert.equal(result.next, children[3]);
  assert.equal(result.last, children[4]);
});

test('fewer than 5 anchors (e.g. a single-page cursor shape) is not this widget\'s shape', () => {
  assert.equal(classifyPagerChildren(shape().slice(0, 2)), null);
});

test('more than 5 anchors (an unexpected future template change) is rejected, never guessed', () => {
  assert.equal(classifyPagerChildren([...shape(), {navigation: true, active: false}]), null);
});

test('a first/previous/next/last edge missing .navigation is rejected', () => {
  assert.equal(classifyPagerChildren(shape({first: {navigation: false}})), null);
  assert.equal(classifyPagerChildren(shape({previous: {navigation: false}})), null);
  assert.equal(classifyPagerChildren(shape({next: {navigation: false}})), null);
  assert.equal(classifyPagerChildren(shape({last: {navigation: false}})), null);
});

test('a current anchor that also carries .navigation is rejected (ambiguous role)', () => {
  assert.equal(classifyPagerChildren(shape({current: {navigation: true}})), null);
});

test('a current anchor missing .active is rejected (nothing marks a current page)', () => {
  assert.equal(classifyPagerChildren(shape({current: {active: false}})), null);
});

test('an edge unexpectedly marked .active is rejected (two "current" positions)', () => {
  assert.equal(classifyPagerChildren(shape({first: {active: true}})), null);
  assert.equal(classifyPagerChildren(shape({last: {active: true}})), null);
});

test('an empty pager (no children at all) is a safe no-op, not a crash', () => {
  assert.equal(classifyPagerChildren([]), null);
});
