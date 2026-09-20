import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNativeRoute} from '../scripts/native-route.mjs';
const expected='https://git.example/owner/repo/pulls/31/files';
test('native acceptance rejects login redirects even when the response is HTTP 200',()=>{
  for(const destination of ['https://git.example/user/login','https://git.example/user/oauth2/github','https://other.example/owner/repo/pulls/31/files']) {
    assert.throws(()=>assertNativeRoute(destination,expected),/Native acceptance/);
  }
});
test('native acceptance tolerates harmless query and trailing slash but not another page',()=>{
  assert.doesNotThrow(()=>assertNativeRoute(expected+'/?style=unified#diff-1',expected));
  assert.throws(()=>assertNativeRoute('https://git.example/owner/repo/issues',expected));
});
