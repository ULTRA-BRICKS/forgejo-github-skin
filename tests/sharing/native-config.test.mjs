import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeConfiguration} from '../../scripts/sharing/configure-native.mjs';
const current={forgejo:'https://forge.example',origin:'https://links.example',slack:{teamId:'T123',appId:'A123',botToken:'synthetic-token'},oauth:{clientId:'synthetic-client',clientSecret:'synthetic-secret'}};
test('native rollout keeps credentials unchanged and scopes summaries to explicit owners',()=>{
 const next=nativeConfiguration(current,{team:'T123',app:'A123',reader:'U123',owners:['owner','owner']});
 assert.equal(next.slack.workObjectsEnabled,true);assert.equal(current.slack.workObjectsEnabled,undefined);
 assert.equal(next.slack.botToken,current.slack.botToken);assert.deepEqual(next.oauth,current.oauth);
 assert.deepEqual(next.slack.summaryOwners,[{workspaceId:'T123',instanceOrigin:'https://forge.example',owner:'owner'}]);
 assert.throws(()=>nativeConfiguration(current,{team:'T999',app:'A123',reader:'U123'}),/identity/);
 assert.throws(()=>nativeConfiguration(current,{team:'T123',app:'A123',reader:'not-a-slack-user'}),/identities/);
 assert.throws(()=>nativeConfiguration(current,{team:'T123',app:'A123',reader:'U123',owners:['../other']}),/owner/);
 assert.deepEqual(nativeConfiguration(current,{team:'T123',app:'A123',reader:'U123'}).slack.summaryOwners,[]);
});
