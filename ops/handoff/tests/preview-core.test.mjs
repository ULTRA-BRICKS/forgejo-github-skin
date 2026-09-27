import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifySlackRequest, parseForgejoLink, previewDecision, protectedCard, richCard} from '../slack/preview-core.mjs';
const base = 'https://git.example.com/git/';
const link = parseForgejoLink(base + 'lab/repo/pulls/42', base);
const now = 1800000000, secret = 'synthetic-test-secret-not-a-real-credential';
const rawBody = Buffer.from('{"event_id":"EvTEST"}');
const timestamp = String(now);
const signature = 'v0=' + createHmac('sha256',secret).update(`v0:${timestamp}:`).update(rawBody).digest('hex');
const signed = {rawBody, timestamp, signature, signingSecret: secret, nowSeconds: now};
for (const [name, changes, expected] of [
  ['valid raw-body signature', {}, true], ['tampered raw body', {rawBody: Buffer.from('{}')}, false],
  ['expired signature', {nowSeconds: now+301}, false], ['future signature', {nowSeconds: now-301}, false],
  ['invalid signature length', {signature:'v0=00'}, false], ['missing secret', {signingSecret:''}, false],
  ['oversized body', {rawBody: Buffer.alloc(262145)}, false], ['parsed body not accepted', {rawBody:{}}, false],
]) test(name, () => assert.equal(verifySlackRequest({...signed,...changes}),expected));

test('repository path supports a configured subpath', () => assert.equal(link.repositoryUrl,base+'lab/repo'));
test('immutable code link keeps bounded line range', () => {
  const result = parseForgejoLink(base+'lab/repo/src/commit/'+'a'.repeat(40)+'/src/main.py#L2-L5',base);
  assert.deepEqual(result.lines,{start:2,end:5});
  assert.equal(result.path,'src/main.py');
});
for (const [name, raw] of [
  ['external origin','https://evil.example.com/git/lab/repo'],
  ['suffix-trick domain','https://git.example.com.evil.test/git/lab/repo'],
  ['userinfo','https://user:token@git.example.com/git/lab/repo'],
  ['query token',base+'lab/repo?token=secret'], ['wrong base path','https://git.example.com/lab/repo'],
  ['encoded slash',base+'lab/repo%2fother'], ['encoded traversal',base+'lab/repo/%2e%2e/issues/1'],
  ['double encoding',base+'lab/repo%252fother'], ['negative issue',base+'lab/repo/issues/-1'],
  ['mutable branch code',base+'lab/repo/src/branch/main/x.py'],
  ['overlong line range',base+'lab/repo/src/commit/'+'a'.repeat(40)+'/x.py#L1-L51'],
  ['reverse line range',base+'lab/repo/src/commit/'+'a'.repeat(40)+'/x.py#L5-L2'],
  ['reserved API path',base+'api/v1'], ['HTTP downgrade',base.replace('https:','http:')+'lab/repo'],
]) test('reject '+name,()=>assert.equal(parseForgejoLink(raw,base),null));

const privateFacts = {resourceVerified:true,checkIsFresh:true,visibility:'private',
  postingUserMayDisclose:true,postingUserCanRead:true,source:'conversations_history',
  workspaceId:'TTEST',repositoryId:'42',instanceOrigin:'https://git.example.com',resourceUrl:link.resourceUrl,
  channel:{id:'CTEST',isPrivate:true,isExternalShared:false,isPendingExternalShared:false,
    isOrgShared:false,isShared:false,metadataFresh:true}};
const policy = {privateMode:'explicit-channel-disclosure',destinations:[{
  workspaceId:'TTEST',channelId:'CTEST',repositoryId:'42',instanceOrigin:'https://git.example.com',approvedToCopy:true}]};
test('default private preview remains personal even for an authorized poster',()=>assert.equal(previewDecision(privateFacts), 'personal'));
test('approved private channel disclosure is explicit',()=>assert.equal(previewDecision(privateFacts,policy),'disclosed'));
test('anonymous resource requires fresh verification',()=>assert.equal(previewDecision({resourceVerified:true,checkIsFresh:false,visibility:'public',anonymousReadable:true}),'personal'));
test('verified anonymous resource can be public',()=>assert.equal(previewDecision({resourceVerified:true,checkIsFresh:true,visibility:'public',anonymousReadable:true}),'public'));
for (const [name, delta] of [
  ['stale facts',{checkIsFresh:false}],['composer without a destination',{source:'composer'}],
  ['wrong workspace',{workspaceId:'TOTHER'}],['wrong repository',{repositoryId:'43'}],
  ['no disclosure authority',{postingUserMayDisclose:false}],['read permission revoked',{postingUserCanRead:false}],
  ['missing repository identity',{repositoryId:undefined}],['unknown visibility',{visibility:undefined}],
]) test('private deny: '+name,()=>assert.equal(previewDecision({...privateFacts,...delta},policy),'personal'));
for (const [name, delta] of [
  ['public conversation',{isPrivate:false}],['Slack Connect',{isExternalShared:true}],
  ['pending external sharing',{isPendingExternalShared:true}],['org shared channel',{isOrgShared:true}],
  ['unknown audience flags',{isExternalShared:undefined}],['stale channel metadata',{metadataFresh:false}],
]) test('private deny: '+name,()=>assert.equal(previewDecision({...privateFacts,channel:{...privateFacts.channel,...delta}},policy),'personal'));
test('protected card contains no repository title, path, or code',()=> {
  const result = JSON.stringify(protectedCard('d'.repeat(32)));
  assert(!result.includes('lab/repo'));
  assert(!result.includes('pulls/42'));
  assert(!result.includes('TOP_SECRET'));
});
test('rich private payload is refused in personal mode',()=>assert.throws(()=>richCard({facts:privateFacts,policy:{},link,title:'TOP_SECRET'})));
test('authorization cannot be reused for another resource',()=>assert.throws(()=>richCard({facts:{...privateFacts,resourceUrl:base+'lab/repo/pulls/43'},policy,link,title:'TOP_SECRET'})));
test('forged parsed link cannot inject an external button',()=>assert.throws(()=>richCard({facts:privateFacts,policy,link:{...link,originalUrl:'https://evil.invalid'},title:'test'})));
test('private disclosure label is visible and mentions are plain text',()=> {
  const result = richCard({facts:privateFacts,policy,link,title:'<!channel> investigate',description:'<script>not executable</script>'});
  assert.equal(result.blocks[0].text.type,'plain_text');
  assert.equal(result.blocks[0].text.text,'<!channel> investigate');
  assert(JSON.stringify(result).includes('Shared copy'));
});
test('link parse results are immutable',()=>assert.throws(()=>{link.originalUrl='https://evil.invalid';}));

test('organization root parses to a canonical dashboard-linked identity', () => {
  const org = parseForgejoLink(base+'ultrabricks', base);
  assert.equal(org.kind, 'organization');
  assert.equal(org.owner, 'ultrabricks');
  assert.equal(org.repo, null);
  assert.equal(org.resourceUrl, base+'ultrabricks');
  assert.equal(org.dashboardUrl, base+'org/ultrabricks/dashboard');
});
test('organization dashboard route resolves to the same canonical identity as the public root', () => {
  const dash = parseForgejoLink(base+'org/ultrabricks/dashboard', base);
  assert.equal(dash.kind, 'organization');
  assert.equal(dash.originalUrl, base+'org/ultrabricks/dashboard');
  assert.equal(dash.resourceUrl, base+'ultrabricks');
  assert.equal(dash.dashboardUrl, base+'org/ultrabricks/dashboard');
});
for (const hash of ['#overview', '#repos', '#prs', '#issues', '#activity'])
  test('organization dashboard accepts coordinated hash tab '+hash, () =>
    assert.ok(parseForgejoLink(base+'org/ultrabricks/dashboard'+hash, base)));
test('organization dashboard rejects an arbitrary hash tab', () =>
  assert.equal(parseForgejoLink(base+'org/ultrabricks/dashboard#danger', base), null));
test('organization root never accepts a hash fragment', () =>
  assert.equal(parseForgejoLink(base+'ultrabricks#repos', base), null));
for (const [name, raw] of [
  ['login', base+'login'], ['issues', base+'issues'], ['pulls', base+'pulls'],
  ['milestones', base+'milestones'], ['repo', base+'repo'], ['well-known', base+'.well-known'],
  ['org itself', base+'org'], ['org non-dashboard subpath', base+'org/ultrabricks/settings'],
  ['org dashboard for a reserved name', base+'org/login/dashboard'],
  ['public keys suffix', base+'someuser.keys'], ['gpg suffix', base+'someuser.gpg'],
  ['single dash', base+'-'], ['report_abuse', base+'report_abuse'], ['forgejo-actions', base+'forgejo-actions'],
  ['actor', base+'actor'],
  ['org dashboard with a suffix-pattern name', base+'org/someuser.keys/dashboard'],
]) test('reject organization for reserved path: '+name, () => assert.equal(parseForgejoLink(raw, base), null));
test('organization traversal/query bypass is rejected like every other kind', () => {
  assert.equal(parseForgejoLink(base+'ultrabricks?x=1', base), null);
  assert.equal(parseForgejoLink(base+'org/../admin', base), null);
  assert.equal(parseForgejoLink(base+'org/%2e%2e/dashboard', base), null);
});
test('richCard summarizes an organization by name alone, never "owner/undefined"', () => {
  const org = parseForgejoLink(base+'ultrabricks', base);
  const facts = {resourceVerified:true, checkIsFresh:true, visibility:'public', anonymousReadable:true, resourceUrl:org.resourceUrl};
  const result = richCard({facts, policy:{}, link:org, title:'Ultrabricks', status:'Public'});
  const text = JSON.stringify(result);
  assert.ok(text.includes('ultrabricks'));
  assert.ok(!text.includes('undefined'));
});
