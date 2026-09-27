import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {parseForgejoLink,previewDecision} from '../../ops/handoff/slack/preview-core.mjs';
import {composeSlackCard} from '../../integrations/link-preview/unfurl-layout.mjs';
import {buildPresentation,blockCard,workObject,visualAddsInformation,linkActions} from '../../integrations/link-preview/slack-presentation.mjs';
import {SlackIntegration} from '../../integrations/link-preview/slack.mjs';
import {Store} from '../../integrations/link-preview/store.mjs';
import {validEnvelope,validInteraction} from '../../integrations/link-preview/protocol.mjs';
import {settingsView,saveSettings} from '../../integrations/link-preview/slack-settings.mjs';
const origin='https://forge.example',repo=origin+'/owner/repo',sha='a'.repeat(40),ref='b'.repeat(48);
function metadata(kind='pull',extra={}) {
  const url=kind==='repository'?repo:kind==='pull'?repo+'/pulls/23':kind==='issue'?repo+'/issues/6':kind==='commit'?repo+'/commit/'+sha:repo+'/src/commit/'+sha+'/src/index.js#L2-L6';
  return {link:parseForgejoLink(url,origin),private:false,repositoryId:'42',repository:'owner/repo',title:kind==='pull'?'PR #23: Improve keyboard navigation':'Example '+kind,description:'A concise source description',status:'Open',
    summary:{kind,number:kind==='pull'?23:6,author:'alex',metrics:[{label:'State',value:'Open'},{label:'Files',value:3},{label:'Added',value:24},{label:'Removed',value:6}],...extra}};
}
const publicFacts=m=>({resourceVerified:true,checkIsFresh:true,visibility:'public',anonymousReadable:true,resourceUrl:m.link.resourceUrl});
const config={origin:'https://links.example',forgejo:origin,slack:{teamId:'T123',appId:'A123',workObjectsEnabled:true,summaryOwners:[{workspaceId:'T123',instanceOrigin:origin,owner:'owner'}]}};
const envelope=(url=repo+'/pulls/23',extra={})=>({type:'event_callback',event_id:'Ev123',team_id:'T123',api_app_id:'A123',event:{type:'link_shared',source:'conversations_history',channel:'C123',message_ts:'1789733603.123',user:'U123',links:[{url}],...extra}});
for(const kind of ['repository','pull','issue','commit','file'])test(kind+': native object and fallback preserve validated destinations',()=>{
 const m=metadata(kind),result=composeSlackCard(m,publicFacts(m),{},{postedUrl:m.link.originalUrl,settingsReference:ref,iconOrigin:config.origin});
 assert.equal(result.entity.app_unfurl_url,m.link.originalUrl);assert.equal(result.entity.url,m.link.resourceUrl);assert.equal(result.entity.entity_payload.actions.primary_actions[0].url,m.link.originalUrl);assert.equal(result.entity.external_ref.id.length,64);
 assert.equal(result.entity.entity_type,kind==='file'?'slack#/entities/file':['issue','pull'].includes(kind)?'slack#/entities/task':'slack#/entities/item');
 const actions=result.entity.entity_payload.actions;
 assert.ok(actions.primary_actions.length>=1&&actions.primary_actions.length<=2);assert.ok(actions.overflow_actions.length<=5);
 for(const action of [...actions.primary_actions,...actions.overflow_actions]){if(action.url)assert.equal(new URL(action.url).origin,origin);else {assert.ok(['forgejo_settings','forgejo_account','forgejo_personal'].includes(action.action_id));assert.equal(action.value,ref);};}
 assert.ok(result.card.preview.title.text.length<=150);
 if(['repository','commit'].includes(kind))assert.equal(result.entity.entity_payload.fields,undefined);
});
test('canonical PR action paths do not append files after a fragment or existing subpage',()=>{
 const link=parseForgejoLink(repo+'/pulls/23/files#issuecomment-45',origin),actions=linkActions(link,ref);
 assert.equal(actions.primary_actions[1].url,repo+'/pulls/23/files');assert.equal(actions.overflow_actions.find(a=>a.action_id==='forgejo_open_commits').url,repo+'/pulls/23/commits');
});
test('organization actions are canonical for both posted forms; only app_unfurl_url preserves the exact posted spelling',()=>{
 const orgLink=parseForgejoLink(origin+'/ultrabricks',origin),dashLink=parseForgejoLink(origin+'/org/ultrabricks/dashboard#repos',origin);
 assert.equal(orgLink.dashboardUrl,dashLink.dashboardUrl);assert.equal(orgLink.resourceUrl,dashLink.resourceUrl);
 assert.notEqual(orgLink.originalUrl,dashLink.originalUrl);
 let canonicalActions=null;
 for(const link of [orgLink,dashLink]){
  const meta={link,private:false,repositoryId:null,repository:'ultrabricks',title:'Ultrabricks',description:'A public organization',status:'Public',
    summary:{kind:'organization',number:null,sha:'',metrics:[],labels:[],activity:null,code:null}};
  const facts={resourceVerified:true,checkIsFresh:true,visibility:'public',anonymousReadable:true,resourceUrl:link.resourceUrl};
  const result=composeSlackCard(meta,facts,{},{postedUrl:link.originalUrl,settingsReference:ref,iconOrigin:config.origin});
  // app_unfurl_url alone preserves the exact posted spelling; everything else is canonical.
  assert.equal(result.entity.app_unfurl_url,link.originalUrl);
  assert.equal(result.entity.url,link.resourceUrl);
  assert.equal(result.entity.external_ref.id,composeSlackCard(meta,facts,{},{postedUrl:orgLink.originalUrl,settingsReference:ref,iconOrigin:config.origin}).entity.external_ref.id);
  assert.equal(result.entity.entity_type,'slack#/entities/item');
  const actions=result.entity.entity_payload.actions,all=[...actions.primary_actions,...actions.overflow_actions];
  assert.equal(actions.primary_actions[0].text,'Open organization');
  assert.equal(actions.primary_actions[0].url,link.resourceUrl);
  assert.equal(all.find(a=>a.text==='Repositories').url,link.dashboardUrl+'#repos');
  assert.equal(all.find(a=>a.text==='Pull requests').url,link.dashboardUrl+'#prs');
  assert.equal(all.find(a=>a.text==='Issues').url,link.dashboardUrl+'#issues');
  assert.ok(!all.some(a=>a.action_id==='forgejo_open_repository'));
  assert.equal(result.card.blocks[0].elements[0].image_url,'https://links.example/icons/organization.png');
  assert.equal(result.entity.entity_payload.fields,undefined);
  if(canonicalActions)assert.deepEqual(actions,canonicalActions);else canonicalActions=actions;
 }
});
test('plain source metadata never expands Slack mentions or repeated title prefixes',()=>{
 const m=metadata();m.title='PR #23: <@U123> *boom*';m.description='<!everyone> hostile';
 const result=composeSlackCard(m,publicFacts(m),{},{}),text=JSON.stringify(result.card.blocks.flatMap(block=>[...(block.text?.type==='mrkdwn'?[block.text]:[]),...(block.fields||[])]));
 assert.ok(!text.includes('<@U123>'));assert.ok(text.includes('&lt;@U123&gt;'));assert.ok(!result.model.title.includes('PR #23 · PR #23'));
 assert.equal(result.entity.entity_payload.fields.description.format,undefined);assert.equal(result.card.preview.title.type,'plain_text');
});
test('provenance and private audience checks precede every rich representation',()=>{
 const m=metadata();assert.throws(()=>composeSlackCard(m,{...publicFacts(m),resourceUrl:repo+'/pulls/99'},{}),/Authorization proof/);
 assert.throws(()=>composeSlackCard({...m,link:{...m.link}},publicFacts(m),{}),/freshly validated/);
 assert.throws(()=>composeSlackCard({...m,private:true},{...publicFacts(m),visibility:'private'},{}),/Protected data/);
});
test('private internal summaries require exact owner/workspace and fresh nonshared channel',()=>{
 const m=metadata();m.private=true;m.description='SECRET BODY';m.summary.code=['SECRET CODE'];m.summary.head='SECRET BRANCH';
 const facts={resourceVerified:true,checkIsFresh:true,visibility:'private',postingUserCanRead:true,postingUserMayDisclose:true,source:'conversations_history',workspaceId:'T123',instanceOrigin:origin,owner:'owner',resourceUrl:m.link.resourceUrl,
 channel:{id:'C123',isPrivate:false,isExternalShared:false,isPendingExternalShared:false,isShared:false,isOrgShared:false,metadataFresh:true}};
 const policy={privateMode:'internal-summary',summaryOwners:config.slack.summaryOwners};
 assert.equal(previewDecision(facts,policy),'summary');
 const result=composeSlackCard(m,facts,policy,{density:'detailed'});assert.ok(!JSON.stringify(result).includes('SECRET'));assert.equal(result.model.limited,true);
 for(const field of ['isExternalShared','isPendingExternalShared','isShared','isOrgShared'])assert.equal(previewDecision({...facts,channel:{...facts.channel,[field]:true}},policy),'personal');
 for(const tweak of [{owner:'other'},{workspaceId:'T999'},{postingUserCanRead:false},{source:'composer'}])assert.equal(previewDecision({...facts,...tweak},policy),'personal');
});
test('images add a time series, never repeat a PR metric list',()=>{
 assert.equal(visualAddsInformation(metadata()),false);
 const m=metadata('repository',{activity:{days:[0,1,4,2]}});assert.equal(visualAddsInformation(m),true);
 assert.equal(buildPresentation(m,{imageUrl:'https://links.example/image/s/'+ref}).imageUrl,'https://links.example/image/s/'+ref);
 assert.equal(buildPresentation(m,{imageUrl:'https://links.example/image/s/'+ref,visuals:'off'}).imageUrl,null);
 assert.equal(buildPresentation({...m,private:true},{imageUrl:'https://links.example/image/s/'+ref}).imageUrl,null);
});
test('text output is bounded and survives malformed Unicode',()=>{
 const m=metadata();m.title='x'.repeat(10000)+'\ud800';m.description='y'.repeat(10000);m.summary.metrics=Array.from({length:20},()=>({label:'Files',value:100}));
 const model=buildPresentation(m),card=blockCard(model);assert.ok(model.title.length<=180);assert.ok(model.description.length<=240);assert.ok(model.title.isWellFormed());assert.ok(JSON.stringify(card).length<12000);
});
test('Enterprise history events without composer fields and entity events are accepted only with bounded identities',()=>{
 const e=envelope();delete e.event.source;assert.equal(validEnvelope(e,config),true);
 assert.equal(validEnvelope(envelope(repo,{source:'composer',channel:'COMPOSER',unfurl_id:'fixture.id'}),config),true);
 assert.equal(validEnvelope(envelope(repo,{source:'composer',channel:'COMPOSER',unfurl_id:undefined}),config),false);
 const detail={...envelope(),event:{type:'entity_details_requested',user:'U123',entity_url:repo,trigger_id:'trigger',channel:'C123'}};
 assert.equal(validEnvelope(detail,config),true);assert.equal(validEnvelope({...detail,team_id:'T999'},config),false);
});
test('native API metadata and Block Kit compatibility fallback use the same safe model',async()=>{
 const store=new Store(':memory:',randomBytes(32)),calls=[],m=metadata();
 const slack=new SlackIntegration(config,store,{parse:u=>parseForgejoLink(u,origin),metadata:async()=>m},{access:async()=>null,ticket:()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});if(payload.metadata){const error=new Error('unsupported');error.slackCode='invalid_metadata';throw error;}return {ok:true};};
 try{await slack.unfurl(envelope());assert.equal(calls.length,2);assert.equal(calls[0].payload.metadata.entities[0].entity_payload.attributes.title.text,'PR #23 · Improve keyboard navigation');assert.match(JSON.stringify(calls[1]),/Improve keyboard/);assert.ok(!JSON.stringify(calls).includes('Copy reference'));}finally{store.close();}
});
test('settings save is actor-bound, validated and affects only future shares by that actor',()=>{
 const store=new Store(':memory:',randomBytes(32));try{
 store.put('settings:'+ref,{team:'T123',user:'U123',url:repo},600);
 const state={};for(const [key,value] of [['density','detailed'],['visuals','off'],['format','blocks']])state[key]={[key]:{selected_option:{value}}};
 const request={type:'view_submission',team:{id:'T123'},api_app_id:'A123',user:{id:'U123'},view:{callback_id:'forgejo_preview_preferences',private_metadata:ref,state:{values:state}}};
 assert.equal(validInteraction(request,config),true);assert.equal(saveSettings({...request,user:{id:'U999'}},config,store).response_action,'errors');
 assert.deepEqual(saveSettings(request,config,store),{});assert.deepEqual(store.get('prefs:T123:U123'),{density:'detailed',visuals:'off',format:'blocks'});assert.equal(store.get('prefs:T123:U999'),null);
 }finally{store.close();}
});

test('unlinked posters may use the configured public-only reader, never borrow private access',async()=>{
 for(const privateValue of [false,true]){
  const store=new Store(':memory:',randomBytes(32)),m=metadata(),calls=[],reads=[];m.private=privateValue;
  const cfg={...config,slack:{...config.slack,publicReaderUser:'U777'}};
  const client={parse:url=>parseForgejoLink(url,origin),metadata:async(url,token,options)=>{reads.push({token,options});if(!token){const error=new Error('Login required');error.status=403;throw error;}return m;}};
  const slack=new SlackIntegration(cfg,store,client,{access:async(team,user)=>user==='U777'?'synthetic-public-reader':null,ticket:()=>null});
  slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
  try{await slack.unfurl(envelope());assert.ok(reads.some(read=>read.options?.publicOnly===true));assert.equal(calls.some(call=>!!call.payload.metadata),!privateValue);if(privateValue)assert.ok(!JSON.stringify(calls).includes('Improve keyboard navigation'));}finally{store.close();}
 }
});

test('entity details are refreshed from source and never turn private descriptions into channel content',async()=>{
 const store=new Store(':memory:',randomBytes(32)),m=metadata(),calls=[];
 const slack=new SlackIntegration(config,store,{parse:u=>parseForgejoLink(u,origin),metadata:async()=>m},{access:async()=>null,ticket:()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 try{
  const expected=composeSlackCard(m,publicFacts(m),{},{}).entity.external_ref;
  await slack.presentDetails({...envelope(),event:{type:'entity_details_requested',entity_url:m.link.originalUrl,user:'U123',channel:'C123',trigger_id:'fixture',external_ref:expected}});
  assert.equal(calls[0].method,'entity.presentDetails');assert.equal(calls[0].payload.metadata.entity_payload.attributes.title.text,'PR #23 · Improve keyboard navigation');
  assert.equal(calls[0].payload.metadata.entity_payload.fields.created_by,undefined);
  calls.length=0;await slack.presentDetails({...envelope(),event:{type:'entity_details_requested',entity_url:m.link.originalUrl,user:'U123',trigger_id:'fixture',external_ref:{id:'wrong'}}});
  assert.equal(calls[0].payload.error.status,'not_found');
 }finally{store.close();}
});
test('organization link_shared never consults the posting user\'s OAuth token for a non-public org',async()=>{
 const store=new Store(':memory:',randomBytes(32)),orgUrl=origin+'/ultrabricks';
 const metadataCalls=[];let oauthCalls=0;
 const forgejo={parse:u=>parseForgejoLink(u,origin),metadata:async(url,token,options)=>{
   metadataCalls.push({token:!!token,options});
   return {link:parseForgejoLink(url,origin),private:true,repository:'ultrabricks',title:'ORG SECRET',description:'ORG BODY',status:'Private'};
 }};
 const slack=new SlackIntegration(config,store,forgejo,{access:async()=>{oauthCalls++;return 'synthetic-token';},ticket:()=>null});
 try{
  const resolved=await slack.resolveShared({team_id:'T123',event:{user:'U123',channel:'C123',source:'conversations_history',message_ts:'1.1'}},orgUrl);
  assert.deepEqual(Object.keys(resolved),['link']);
  assert.equal(oauthCalls,0);
  assert.equal(metadataCalls.length,1);
  assert.equal(metadataCalls[0].token,false);
  assert.equal(metadataCalls[0].options.publicOnly,true);
 }finally{store.close();}
});
test('a freshly public organization becomes a public card without ever consulting OAuth',async()=>{
 const store=new Store(':memory:',randomBytes(32)),orgUrl=origin+'/ultrabricks';
 let oauthCalls=0;
 const forgejo={parse:u=>parseForgejoLink(u,origin),metadata:async(url)=>({link:parseForgejoLink(url,origin),private:false,repository:'ultrabricks',title:'Ultrabricks',description:'A public organization',status:'Public'})};
 const slack=new SlackIntegration(config,store,forgejo,{access:async()=>{oauthCalls++;return 'synthetic-token';},ticket:()=>null});
 try{
  const resolved=await slack.resolveShared({team_id:'T123',event:{user:'U123',channel:'C123',source:'conversations_history',message_ts:'1.1'}},orgUrl);
  assert.equal(resolved.facts.visibility,'public');
  assert.equal(resolved.meta.title,'Ultrabricks');
  assert.equal(oauthCalls,0);
 }finally{store.close();}
});
test('a non-public organization is only ever revealed through the viewer\'s own personal access, never the channel card',async()=>{
 const store=new Store(':memory:',randomBytes(32)),orgUrl=origin+'/ultrabricks',calls=[];
 const forgejo={parse:u=>parseForgejoLink(u,origin),metadata:async(url,token)=>{
   if(!token){const e=new Error('Unavailable');e.status=404;throw e;}
   return {link:parseForgejoLink(url,origin),private:true,repository:'ultrabricks',title:'Ultrabricks',description:'ORG SECRET BODY',status:'Private'};
 }};
 const slack=new SlackIntegration(config,store,forgejo,{access:async()=>'synthetic-token',ticket:()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 try{
  await slack.presentDetails({...envelope(),event:{type:'entity_details_requested',entity_url:orgUrl,user:'U123',channel:'C123',trigger_id:'fixture'}});
  assert.equal(calls[0].payload.error.status,'custom_partial_view');
  assert.ok(!JSON.stringify(calls).includes('ORG SECRET BODY'));
  assert.ok(calls[0].payload.error.actions.some(a=>a.action_id==='forgejo_personal'));
 }finally{store.close();}
});
test('unknown Work Object validation warnings degrade to the checked text card',async()=>{
 const store=new Store(':memory:',randomBytes(32)),m=metadata(),calls=[];
 const slack=new SlackIntegration(config,store,{parse:u=>parseForgejoLink(u,origin),metadata:async()=>m},{access:async()=>null,ticket:()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});return payload.metadata?{ok:true,warning:'The field status will be omitted due to an invalid type'}:{ok:true};};
 try{await slack.unfurl(envelope());assert.equal(calls.length,2);assert.ok(calls[1].payload.unfurls);}finally{store.close();}
});
test('distinct immutable line ranges have distinct external identities',()=>{
 const m=metadata('file'),other={...m,link:parseForgejoLink(m.link.resourceUrl+'#L12-L16',origin)};
 assert.notEqual(composeSlackCard(m,publicFacts(m),{},{}).entity.external_ref.id,composeSlackCard(other,publicFacts(other),{},{}).entity.external_ref.id);
});

test('commit references are not repeated in the title and long excerpts announce truncation',()=>{
 const m=metadata('commit');m.title='Commit '+sha.slice(0,8);m.description='Improve focus restoration';
 const model=buildPresentation(m);
 assert.equal(model.title,'Commit '+sha.slice(0,8));
 m.description='word '.repeat(200);const short=buildPresentation(m);
 assert.ok(short.description.endsWith('…'));assert.ok([...short.description].length<=140);
});
test('metadata requests are form-encoded, and API warnings remain visible to the caller',async(t)=>{
 const store=new Store(':memory:',randomBytes(32));
 const cfg={...config,slack:{...config.slack,botToken:'synthetic-token'}};
 const slack=new SlackIntegration(cfg,store,{},{});let request;
 t.mock.method(globalThis,'fetch',async(url,options)=>{request={url,...options};return new Response(JSON.stringify({ok:true,warning:'missing_charset'}),{status:200});});
 try{
  const payload={channel:'C123',ts:'1789733603.123',metadata:{entities:[]}};
  const result=await slack.call('chat.unfurl',payload);
  assert.equal(result.warning,'missing_charset');assert.equal(request.url,'https://slack.com/api/chat.unfurl');
  assert.match(request.headers['Content-Type'],/^application\/x-www-form-urlencoded/);
  assert.deepEqual(JSON.parse(request.body.get('metadata')),payload.metadata);
  assert.equal(request.headers.Authorization,'Bearer synthetic-token');
 }finally{store.close();}
});

test('one failing link does not hide successful cards in the same event',async()=>{
 const store=new Store(':memory:',randomBytes(32)),m=metadata(),calls=[];
 const error=new Error('Upstream HTTP 503');error.status=503;
 const slack=new SlackIntegration(config,store,{parse:u=>parseForgejoLink(u,origin),metadata:async u=>{if(u.endsWith('/24'))throw error;return m;}},{access:async()=>null,ticket:()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 try{
  await assert.rejects(slack.unfurl(envelope(m.link.originalUrl,{links:[{url:repo+'/pulls/24'},{url:m.link.originalUrl}]})),/Upstream HTTP 503/);
  const native=calls.find(call=>call.payload.metadata);
  assert.equal(native.payload.metadata.entities[0].app_unfurl_url,m.link.originalUrl);
  const unavailable=calls.find(call=>call.payload.unfurls)?.payload.unfurls[repo+'/pulls/24'];
  assert.ok(unavailable);assert.ok(!JSON.stringify(unavailable).includes('Improve keyboard navigation'));
 }finally{store.close();}
});
test('Work Object identity checks validate its type as well as its id',async()=>{
 const store=new Store(':memory:',randomBytes(32)),m=metadata(),calls=[];
 const slack=new SlackIntegration(config,store,{parse:u=>parseForgejoLink(u,origin),metadata:async()=>m},{access:async()=>null,ticket:()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 try{
  const expected=composeSlackCard(m,publicFacts(m),{},{}).entity.external_ref;
  await slack.presentDetails({...envelope(),event:{type:'entity_details_requested',entity_url:m.link.originalUrl,user:'U123',channel:'C123',trigger_id:'fixture',external_ref:{...expected,type:'file'}}});
  assert.equal(calls[0].payload.error.status,'not_found');
 }finally{store.close();}
});

test('supplemental images store only a revalidated source locator, never a metadata copy',()=>{
 const store=new Store(':memory:',randomBytes(32)),m=metadata('repository',{activity:{days:[1,2,0]}});
 const slack=new SlackIntegration(config,store,{parse:u=>parseForgejoLink(u,origin)},{});
 try {
  const url=slack.imageSnapshot(m);assert.match(url,/\/image\/s\/[a-f0-9]{48}$/);
  const saved=store.get('image:'+url.split('/').at(-1));
  assert.deepEqual(saved,{sourceUrl:m.link.originalUrl,version:3,view:'activity'});
  assert.equal(slack.imageSnapshot({...m,private:true}),null);
 }finally{store.close();}
});

test('a linked but unauthorized viewer gets access denied rather than a repeated login prompt',async()=>{
 const store=new Store(':memory:',randomBytes(32)),calls=[],denied=Object.assign(new Error('Not found'),{status:404});
 const slack=new SlackIntegration(config,store,{parse:u=>parseForgejoLink(u,origin),metadata:async()=>{throw denied;}},{access:async()=>({origin,accessToken:'synthetic-linked'}),ticket:()=> 'https://links.example/connect/fixture'});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 try{
  await slack.presentDetails({...envelope(),event:{type:'entity_details_requested',entity_url:repo,user:'U123',channel:'C123',trigger_id:'fixture'}});
  assert.equal(calls[0].payload.error.status,'restricted');assert.equal(calls[0].payload.user_auth_required,undefined);
 }finally{store.close();}
});
test('text compatibility fallback preserves public code when rich_text is rejected',async()=>{
 const store=new Store(':memory:',randomBytes(32)),m=metadata('file',{code:['const publicExample = 1;']}),calls=[];
 const slack=new SlackIntegration({...config,slack:{...config.slack,workObjectsEnabled:false}},store,{parse:u=>parseForgejoLink(u,origin),metadata:async()=>m},{access:async()=>null,ticket:()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});if(calls.length===1){const error=new Error('invalid blocks');error.slackCode='invalid_blocks';throw error;}return {ok:true};};
 try{await slack.unfurl(envelope(m.link.originalUrl));assert.equal(calls.length,2);const reduced=calls[1].payload.unfurls[m.link.originalUrl];assert.ok(reduced.blocks.some(b=>b.text?.type==='plain_text'&&b.text.text.includes('const publicExample = 1;')));assert.equal(reduced.blocks.some(b=>b.type==='rich_text'),false);}finally{store.close();}
});

test('new unavailable cards open the original directly and reserve the modal for settings',async()=>{
 const store=new Store(':memory:',randomBytes(32)),calls=[];
 const slack=new SlackIntegration(config,store,{parse:u=>parseForgejoLink(u,origin),metadata:async()=>null},{access:async()=>null,ticket:()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 try{await slack.unfurl(envelope());const card=calls[0].payload.unfurls[repo+'/pulls/23'];const actions=card.blocks.flatMap(b=>b.elements||[]);
 assert.equal(actions[0].action_id,'forgejo_open_original');assert.equal(actions[0].url,repo+'/pulls/23');
 assert.equal(actions[1].action_id,'forgejo_settings');assert.equal(actions[1].text.text,'Preview settings');
 }finally{store.close();}
});

test('a source-declared public repo behind instance login is not mislabeled anonymously readable',()=>{
 const m=metadata(),facts={...publicFacts(m),anonymousReadable:false,sourceDeclaredPublic:true};
 assert.equal(previewDecision(facts,{}),'public');assert.equal(composeSlackCard(m,facts,{}).decision,'public');
 assert.throws(()=>composeSlackCard({...m,private:true},facts,{}),/visibility/);
 assert.equal(previewDecision({...facts,sourceDeclaredPublic:false},{}),'personal');
});

test('private summary serialization contains identity and status, not counts or development activity',()=>{
 const m=metadata('pull',{checks:{total:19,passed:3,state:'failure'},reviewers:['sensitive-reviewer'],created:'2026-09-01',metrics:[{label:'State',value:'Open'},{label:'Files',value:891},{label:'Added',value:9821},{label:'Removed',value:1837}]});m.private=true;m.updatedAt='2026-09-19T11:11:11Z';
 const model=buildPresentation(m,{density:'detailed'});
 assert.ok(model.fields.every(field=>['status','repository','visibility'].includes(field.key)));
 assert.equal(model.updated,null);assert.equal(model.created,null);
 const text=JSON.stringify(workObject(model,{externalId:'safe-summary',postedUrl:m.link.originalUrl}));
 for(const secret of ['891','9821','1837','sensitive-reviewer','failure','2026-09-19'])assert.ok(!text.includes(secret),secret);
});
test('five links resolve concurrently within a cap rather than serially blocking the worker',async()=>{
 const store=new Store(':memory:',randomBytes(32));let active=0,peak=0,reads=0;const calls=[];
 const client={parse:u=>parseForgejoLink(u,origin),metadata:async u=>{active++;peak=Math.max(peak,active);reads++;await new Promise(r=>setTimeout(r,15));active--;const m=metadata();m.link=parseForgejoLink(u,origin);m.summary.number=m.link.number;return m;}};
 const slack=new SlackIntegration(config,store,client,{access:async()=>null,ticket:()=>null});slack.call=async(method,payload)=>{calls.push(payload);return {ok:true};};
 try{await slack.unfurl(envelope(repo+'/pulls/1',{links:Array.from({length:5},(_,i)=>({url:repo+'/pulls/'+(i+1)}))}));assert.equal(reads,5);assert.ok(peak>1&&peak<=3,'bounded source concurrency: '+peak);assert.equal(calls[0].metadata.entities.length,5);}finally{store.close();}
});
