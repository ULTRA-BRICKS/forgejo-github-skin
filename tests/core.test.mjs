import test from 'node:test';
import assert from 'node:assert/strict';
import {themeEnabled, acceptKey, safeHref, navigationAction, normalizeLine} from '../src/core.mjs';

test('only explicitly registered themes are enabled', () => {
  assert.equal(themeEnabled('forgejo-light'), false);
  assert.equal(themeEnabled('hypergithub-light-malicious'), false);
  assert.equal(themeEnabled('hypergithub-auto'), true);
});

test('keyboard respects modifiers, composition, handled events, repeat and editors', () => {
  for (const flag of ['defaultPrevented', 'isComposing', 'repeat', 'ctrlKey', 'metaKey', 'altKey']) {
    assert.equal(acceptKey({[flag]: true}), false);
  }
  assert.equal(acceptKey({target: {closest: () => true}}), false);
  assert.equal(acceptKey({target: {closest: () => null}}), true);
});

test('navigation permits only same-origin HTTP(S) while retaining subpaths and escaped refs', () => {
  assert.equal(safeHref('/git/a/b/src/branch/feature%2Fone', 'https://example.org/git/'), 'https://example.org/git/a/b/src/branch/feature%2Fone');
  assert.equal(safeHref('javascript:alert(1)', 'https://example.org'), null);
  assert.equal(safeHref('//evil.invalid', 'https://example.org'), null);
});

test('GitHub g-prefix navigation is a closed non-mutating map', () => {
  assert.equal(navigationAction('g', 'c'), 'code');
  assert.equal(navigationAction('g', 'i'), 'issues');
  assert.equal(navigationAction('g', 'p'), 'pulls');
  assert.equal(navigationAction('g', 'a'), 'actions');
  assert.equal(navigationAction('g', 'n'), 'notifications');
  assert.equal(navigationAction('g', 'f'), 'workflowFile');
  assert.equal(navigationAction('g', 'm'), null);
  assert.equal(navigationAction('', 'p'), null);
  assert.equal(navigationAction('g', '__proto__'), null);
});

test('line input rejects scripts, negatives, zero, floats and giant values', () => {
  for (const value of ['0', '-1', '1.1', '1e2', '2<script>', '99999999']) assert.equal(normalizeLine(value), null);
  assert.equal(normalizeLine('42'), 42);
});
