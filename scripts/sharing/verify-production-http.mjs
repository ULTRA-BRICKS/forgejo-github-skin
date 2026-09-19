import assert from 'node:assert/strict';
import https from 'node:https';
import fs from 'node:fs/promises';

// Public-only acceptance: no credentials, browser storage or private content.
const origin = 'https://forgejo-links.hyperide.ai';
const source = 'http://git.hyperide.ai/ultrabricks/forgejo-github-skin';
const canonical = source.replace('http:', 'https:');
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15000;
function request(route, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(origin + route, { method, headers, timeout: TIMEOUT_MS }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          reject(new Error('Response exceeds acceptance limit'));
          response.destroy();
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error('HTTP acceptance timeout')));
    req.on('error', reject);
    req.end(body);
  });
}
const proof = { checkedAt: new Date().toISOString(), origin, expectedChecks: 5, results: [] };
try {
  const health = await request('/health');
  assert.equal(health.status, 200);
  proof.health = JSON.parse(health.body.toString('utf8'));
  assert.equal(proof.health.service, 'forgejo-link-preview');
  assert.equal(proof.health.slackConfigured, true);
  assert.equal(proof.health.oauthConfigured, true);
  assert.equal(proof.health.configurationReloadRejected, false);
  proof.results.push({ check: 'Live release and production configuration', pass: true });
  const share = await request('/share?url=' + encodeURIComponent(source), {
    headers: { 'Sec-Fetch-Mode': 'navigate', Accept: 'text/html' },
  });
  assert.equal(share.status, 302);
  assert.equal(share.headers.location, canonical);
  proof.results.push({ check: 'HTTP source navigation upgrades to the exact HTTPS original', pass: true });
  const unsigned = await request('/slack/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(unsigned.status, 401);
  proof.results.push({ check: 'Unsigned Slack requests are rejected', pass: true });
  const invalid = await request('/share?url=' + encodeURIComponent('https://example.invalid/owner/repo'));
  assert.equal(invalid.status, 200);
  assert.equal(invalid.headers.location, undefined);
  assert.ok(!invalid.body.toString('utf8').includes('example.invalid'));
  assert.match(invalid.body.toString('utf8'), /Protected link/);
  proof.results.push({ check: 'Unconfigured origins receive a neutral page without external navigation', pass: true });
  const image = await request('/image?url=' + encodeURIComponent('https://unconfigured.invalid/a/b'));
  assert.equal(image.status, 204);
  assert.equal(image.body.length, 0);
  proof.results.push({ check: 'Unavailable resource emits no placeholder image', pass: true });
} catch (error) {
  proof.results.push({ check: 'Public HTTP acceptance', pass: false, error: error.message });
  process.exitCode = 1;
} finally {
  proof.allPassed = proof.results.length === proof.expectedChecks && proof.results.every(check => check.pass);
  proof.notRun = proof.expectedChecks - proof.results.length;
  const result = JSON.stringify(proof, null, 2) + '\n';
  if (process.argv[2]) {
    const output = await fs.open(process.argv[2], 'w', 0o600);
    try { await output.chmod(0o600); await output.writeFile(result); }
    finally { await output.close(); }
  }
  console.log(result);
}
