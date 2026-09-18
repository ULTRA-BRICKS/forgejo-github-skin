import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Store } from '../../integrations/link-preview/store.mjs';
import { Sources } from '../../integrations/link-preview/sources.mjs';
import { OAuth } from '../../integrations/link-preview/oauth.mjs';
import { Forgejo } from '../../integrations/link-preview/forgejo.mjs';
import { protectedCard, parseForgejoLink } from '../../ops/handoff/slack/preview-core.mjs';
const config = { origin: 'https://links.example', forgejo: 'https://forge.example',
  oauth: { clientId: 'fixture-client', clientSecret: 'fixture-secret' } };
test('HTTP links upgrade only the configured origin; metadata and navigation use HTTPS', async () => {
  const store = new Store(':memory:', randomBytes(32));
  const calls = [];
  const sources = new Sources(config, store, base => new Forgejo(base, async url => {
    calls.push(url); return { id: 1, private: false, full_name: 'owner/repo' };
  }));
  try {
    assert.equal(sources.parse('http://forge.example/owner/repo').originalUrl, 'https://forge.example/owner/repo');
    const meta = await sources.metadata('http://forge.example/owner/repo');
    assert.equal(meta.link.originalUrl, 'https://forge.example/owner/repo');
    assert.ok(calls.every(url => url.startsWith('https://forge.example/')));
    for (const raw of ['http://forge.example.evil/owner/repo', 'http://forge.example:3000/owner/repo',
      'http://u:p@forge.example/owner/repo', 'http://forge.example/owner/x/../repo']) {
      assert.equal(sources.parse(raw), null, raw);
    }
  } finally { store.close(); }
});
test('a neutral card has a durable validated original link without private metadata', () => {
  const link = parseForgejoLink('https://forge.example/owner/repo/issues/1', config.forgejo);
  const card = protectedCard('a'.repeat(48), link);
  const buttons = card.blocks.flatMap(block => block.elements || []);
  assert.equal(buttons.find(button => button.action_id === 'forgejo_open_original')?.url, link.originalUrl);
  assert.throws(() => protectedCard('a'.repeat(48), { originalUrl: 'https://evil.example' }));
});
test('OAuth records cannot be reused after changing origin or client in the same namespace', async () => {
  const store = new Store(':memory:', randomBytes(32));
  try {
    const original = new OAuth(config, store, {});
    store.put(original.key('account', 'T1:U1'), { accessToken: 'synthetic-original', expires: Date.now() + 600000 });
    assert.equal(await original.access('T1', 'U1'), 'synthetic-original');
    const moved = new OAuth({ ...config, forgejo: 'https://different.example' }, store, {});
    const changed = new OAuth({ ...config, oauth: { ...config.oauth, clientId: 'other-client' } }, store, {});
    assert.equal(await moved.access('T1', 'U1'), null);
    assert.equal(await changed.access('T1', 'U1'), null);
    const rotated = new OAuth({ ...config, oauth: { ...config.oauth, clientSecret: 'rotated-secret' } }, store, {});
    assert.equal(await rotated.access('T1', 'U1'), 'synthetic-original');
  } finally { store.close(); }
});
