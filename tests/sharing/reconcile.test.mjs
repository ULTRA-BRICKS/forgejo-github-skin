import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePrimary } from '../../scripts/sharing/reconcile-primary.mjs';
const origin = 'https://git.example', clientId = 'registered-fixture';
const config = { forgejo: origin, origin: 'https://links.example', oauth: { clientId },
  instances: [{ id: 'production', base: origin, oauth: null, brand: { name: 'Example' } }] };
test('verified primary repair preserves its registration and rejects ambiguous changes', () => {
  const fixed = reconcilePrimary(config, { origin, clientId });
  assert.equal(fixed.primaryId, 'production');
  assert.deepEqual(fixed.oauth, config.oauth);
  assert.deepEqual(fixed.instances, []);
  assert.equal(fixed.brand.name, 'Example');
  assert.equal(config.instances.length, 1);
  assert.throws(() => reconcilePrimary(config, { origin, clientId: 'wrong' }), /registration/);
});
