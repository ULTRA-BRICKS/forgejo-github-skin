import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, reloadRuntime } from '../../integrations/link-preview/runtime.mjs';
const initial = { origin: 'https://links.example', forgejo: 'https://demo.example', port: 3190,
  slack: { teamId: 'T123', appId: 'A123' }, instances: [{ id: 'production', base: 'https://git.example' }] };
test('reload replaces validated source routes and leaves old requests unchanged', () => {
  const old = createRuntime(initial, {});
  const next = structuredClone(initial);
  next.instances.push({ id: 'another', base: 'https://another.example' });
  const ready = reloadRuntime(old, next, {});
  assert.equal(old.sources.byId('another'), null);
  assert.ok(ready.sources.byId('another'));
  assert.equal(ready.slack.forgejo, ready.sources);
  next.instances[1].base = 'https://mutated.example';
  assert.equal(ready.sources.byId('another').base, 'https://another.example');
  const invalid = structuredClone(initial);
  invalid.instances.push({ id: 'duplicate', base: initial.forgejo });
  assert.throws(() => reloadRuntime(ready, invalid, {}), /Invalid\/duplicate/);
  assert.equal(ready.sources.byId('another').base, 'https://another.example');
  assert.throws(() => reloadRuntime(ready, { ...initial, forgejo: 'https://other.example' }, {}), /restart/);
});
