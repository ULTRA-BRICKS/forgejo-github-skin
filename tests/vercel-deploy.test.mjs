import assert from 'node:assert/strict';
import test from 'node:test';
import {vercelDeployArgs} from '../scripts/vercel-deploy.mjs';

test('linked Vercel project deploy is the default', () => {
  assert.deepEqual(vercelDeployArgs(), [
    'deploy',
    '--prebuilt',
    '--prod',
    '--yes',
  ]);
});

test('an explicit scope can be requested deliberately', () => {
  assert.deepEqual(vercelDeployArgs('inventorems-projects'), [
    'deploy',
    '--prebuilt',
    '--prod',
    '--yes',
    '--scope',
    'inventorems-projects',
  ]);
});

test('blank scope values never add a scope argument', () => {
  assert.deepEqual(vercelDeployArgs('   '), vercelDeployArgs());
});

test('argument building is deterministic even when the shell exports VERCEL_SCOPE', () => {
  const previous=process.env.VERCEL_SCOPE;
  process.env.VERCEL_SCOPE='ambient-team';
  try {
    assert.deepEqual(vercelDeployArgs(), ['deploy','--prebuilt','--prod','--yes']);
  } finally {
    if(previous===undefined)delete process.env.VERCEL_SCOPE;
    else process.env.VERCEL_SCOPE=previous;
  }
});

test('both publishers use the shared linked-project deploy path', async () => {
  const fs=await import('node:fs/promises');
  for(const file of ['scripts/publish-gallery.mjs','scripts/sharing/publish-evidence.mjs']){
    const source=await fs.readFile(new URL('../'+file,import.meta.url),'utf8');
    assert.match(source,/deployPrebuilt/);
    assert.doesNotMatch(source,/inventorems-projects|["']--scope["']/);
  }
});
