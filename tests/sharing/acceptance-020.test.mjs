import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../../integrations/link-preview/store.mjs';
import {SlackIntegration} from '../../integrations/link-preview/slack.mjs';
import {parseForgejoLink} from '../../ops/handoff/slack/preview-core.mjs';
import {buildPresentation,blockCard,workObject} from '../../integrations/link-preview/slack-presentation.mjs';
const origin='https://forge.example',repo=origin+'/owner/repo',sha='a'.repeat(40),reference='b'.repeat(48);
const config={origin:'https://links.example',forgejo:origin,slack:{teamId:'T123',appId:'A123',workObjectsEnabled:true}};
const meta=(kind='file',privateRepo=false)=>({link:parseForgejoLink(kind==='file'?repo+'/src/commit/'+sha+'/src/focus.js#L12-L16':repo+'/pulls/23',origin),private:privateRepo,repository:'owner/repo',repositoryId:'42',title:'Restore keyboard focus',description:'PRIVATE BODY SENTINEL',summary:{kind,number:23,metrics:[{label:'State',value:'Open'},{label:'Bytes',value:30}],code:['function restoreFocus() {','  return true;','}'],lineStart:12,sha}});
const event=(user='UALICE')=>({team_id:'T123',api_app_id:'A123',event:{type:'entity_details_requested',user,entity_url:repo+'/pulls/23',trigger_id:'trigger'}});
test('native file uses a highlighted code visual; Block Kit uses its language-aware code block',()=>{
 const model=buildPresentation(meta(),{settingsReference:reference,imageUrl:config.origin+'/image/s/'+reference});
 assert.equal(model.codeLanguage,'javascript');
 const entity=workObject(model,{postedUrl:model.url,externalId:'e'});
 const image=entity.entity_payload.custom_fields.find(f=>f.key==='code_preview');
 assert.equal(image?.type,'slack#/types/image');
 assert.ok(entity.entity_payload.display_order.includes('code_preview'));
 assert.ok(!entity.entity_payload.custom_fields.some(f=>f.key==='code_excerpt'));
 const block=blockCard(model).blocks.find(b=>b.type==='rich_text');
 assert.equal(block.elements[0].language,'javascript');
 assert.deepEqual(block.elements[0].elements,[{type:'text',text:model.code.join('\n')}]);
});
test('private shared card removes shared-summary badge and offers actor-bound access actions',()=>{
 const model=buildPresentation(meta('file',true),{settingsReference:reference,imageUrl:'https://links.example/image/s/'+reference});
 assert.equal(model.fields.find(f=>f.key==='visibility').value,'Private');
 assert.equal(model.fields.find(f=>f.key==='visibility').tag_color,undefined);
 assert.equal(model.code.length,0);assert.equal(model.imageUrl,null);
 const actions=model.actions.overflow_actions;
 assert.ok(actions.some(a=>a.action_id==='forgejo_account'&&a.value===reference));
 assert.ok(actions.some(a=>a.action_id==='forgejo_personal'&&a.value===reference));
 assert.ok(actions.length<=5);
 assert.ok(!JSON.stringify(model).includes('PRIVATE BODY SENTINEL'));
});
test('personal entity details use the acting user without posting private data to the channel',async()=>{
 const store=new Store(':memory:',randomBytes(32)),calls=[],actors=[];
 const m=meta('pull',true);
 const slack=new SlackIntegration(config,store,{parse:u=>parseForgejoLink(u,origin),metadata:async(u,token)=>{if(token==='alice-token')return m;throw Object.assign(new Error('denied'),{status:403});}},{access:async(team,user)=>{actors.push(user);return user==='UALICE'?'alice-token':null;},ticket:(team,user)=>'https://links.example/connect?fixture='+user});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 try{
  await slack.presentDetails(event());
  assert.equal(calls[0].method,'entity.presentDetails');
  assert.equal(calls[0].payload.error.status,'custom_partial_view');
  assert.ok(!JSON.stringify(calls).includes('PRIVATE BODY SENTINEL'));
  const personalRef=calls[0].payload.error.actions[0].value;calls.length=0;
  slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true,view:{id:'personal-view'}};};
  await slack.openPersonal({team:{id:'T123'},user:{id:'UALICE'},trigger_id:'click'},personalRef);
  assert.ok(JSON.stringify(calls.find(c=>c.method==='views.update')).includes('PRIVATE BODY SENTINEL'));
  assert.ok(calls.every(c=>c.method.startsWith('views.')));
  assert.ok(actors.includes('UALICE'));assert.ok(calls.every(c=>c.method!=='chat.unfurl'));
  calls.length=0;await slack.presentDetails(event('UBOB'));
  assert.equal(calls[0].payload.user_auth_required,true);
  assert.ok(calls[0].payload.user_auth_url.endsWith('UBOB'));
  assert.ok(!JSON.stringify(calls).includes('PRIVATE BODY SENTINEL'));
 }finally{store.close();}
});
test('connect action creates the OAuth ticket for the clicking viewer, not the posting viewer',async()=>{
 const store=new Store(':memory:',randomBytes(32)),calls=[],tickets=[];
 const slack=new SlackIntegration(config,store,{parse:u=>parseForgejoLink(u,origin)},{access:async()=>null,ticket:(team,user,url)=>{tickets.push({team,user,url});return 'https://links.example/connect?fixture='+user;}});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true,view:{id:'view'}};};
 try{
  store.put('ref:'+reference,{team:'T123',url:repo+'/pulls/23'},86400);
  const payload={team:{id:'T123'},api_app_id:'A123',user:{id:'UBOB'},trigger_id:'trigger',actions:[{action_id:'forgejo_account',value:reference}]};
  await slack.interact(payload);
  assert.equal(calls[0].method,'views.open');
  assert.deepEqual(tickets,[{team:'T123',user:'UBOB',url:repo+'/pulls/23'}]);
  assert.match(JSON.stringify(calls),/Connect my account/);
  tickets.length=0;calls.length=0;
  await slack.interact({...payload,team:{id:'T999'}});
  assert.equal(tickets.length,0);assert.equal(calls.length,0);
 }finally{store.close();}
});
test('code-only image locator survives public revalidation and is isolated in the raster cache',async()=>{
 const {publicImageMetadata}=await import('../../integrations/link-preview/public-metadata.mjs');
 const {RenderCache}=await import('../../integrations/link-preview/render-cache.mjs');
 const store=new Store(':memory:',randomBytes(32));const sample=meta();
 const forgejo={parse:u=>parseForgejoLink(u,origin),metadata:async()=>sample};
 const slack=new SlackIntegration(config,store,forgejo,{access:async()=>null});
 try{
  const url=slack.imageSnapshot(sample),locator=store.get('image:'+url.split('/').at(-1));
  assert.equal(locator.view,'code');assert.ok(!JSON.stringify(locator).includes('PRIVATE BODY'));
  const safe=await publicImageMetadata({config,forgejo,oauth:{}},locator);assert.equal(safe.previewVariant,'code');
  let calls=0;const cache=new RenderCache(async payload=>{calls++;return Buffer.from(payload.previewVariant||'full');});
  assert.equal((await cache.get(sample)).toString(),'full');assert.equal((await cache.get(safe)).toString(),'code');assert.equal(calls,2);
  forgejo.metadata=async()=>({...sample,private:true});
  assert.equal(await publicImageMetadata({config,forgejo,oauth:{}},locator),null);
 }finally{store.close();}
});
test('revoked viewer receives no private contents and no shared metadata update',async()=>{
 const store=new Store(':memory:',randomBytes(32)),calls=[];
 const slack=new SlackIntegration(config,store,{parse:u=>parseForgejoLink(u,origin),metadata:async()=>{throw Object.assign(new Error('no longer allowed'),{status:403});}},{access:async()=> 'revoked-token'});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true,view:{id:'v'}};};
 try{store.put('ref:'+reference,{team:'T123',url:repo+'/pulls/23'},86400);await slack.openPersonal({team:{id:'T123'},user:{id:'UALICE'},trigger_id:'t'},reference);assert.match(JSON.stringify(calls),/not available to your Forgejo account/);assert.ok(calls.every(x=>x.method.startsWith('views.')));assert.ok(!JSON.stringify(calls).includes('PRIVATE BODY'));}finally{store.close();}
});
test('unusual source filenames cannot supply prototype objects as Slack language names',async()=>{
 const {codeLanguage,fencedCode}=await import('../../integrations/link-preview/code-language.mjs');
 for(const name of ['__proto__','constructor','toString','valueOf','focus.unknown'])assert.equal(codeLanguage(name),'text');
 assert.equal(codeLanguage('Dockerfile'),'dockerfile');assert.match(fencedCode(['RUN echo hi'],codeLanguage('Dockerfile')),/^```dockerfile/);
 assert.match(fencedCode(['```'], 'javascript'),/^````javascript/);
});
test('public detail refresh validates the registered external reference and honors visuals off',async()=>{
 const {externalReference}=await import('../../integrations/link-preview/unfurl-layout.mjs');
 const store=new Store(':memory:',randomBytes(32)),sample=meta(),calls=[];
 const slack=new SlackIntegration(config,store,{parse:u=>parseForgejoLink(u,origin),metadata:async()=>sample},{access:async()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 try{
  const ext=externalReference(sample.link),envelope={...event(),event:{...event().event,entity_url:sample.link.originalUrl,external_ref:ext}};
  await slack.presentDetails(envelope);assert.equal(calls[0].method,'entity.presentDetails');assert.deepEqual(calls[0].payload.metadata.external_ref,ext);
  assert.ok(calls[0].payload.metadata.entity_payload.custom_fields.some(f=>f.key==='code_preview'));
  calls.length=0;store.put('prefs:T123:UALICE',{visuals:'off'},86400);
  slack.imageSnapshot=()=>{throw new Error('Do not mint image URLs when visuals are disabled');};
  await slack.presentDetails(envelope);assert.ok(calls[0].payload.metadata);assert.ok(calls[0].payload.metadata.entity_payload.custom_fields.some(f=>f.key==='code_excerpt'));
  calls.length=0;await slack.presentDetails({...envelope,event:{...envelope.event,external_ref:{id:'forged',type:ext.type}}});assert.equal(calls[0].payload.error.status,'not_found');
 }finally{store.close();}
});

test('public entity refresh preserves its registered reference and highlighted-code image',async()=>{
 const {externalReference,composeSlackCard}=await import('../../integrations/link-preview/unfurl-layout.mjs');
 const sample=meta(),store=new Store(':memory:',randomBytes(32)),calls=[];
 const slack=new SlackIntegration(config,store,{parse:u=>parseForgejoLink(u,origin),metadata:async()=>sample},{access:async()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 try {
  const expected=externalReference(sample.link);
  const posted=composeSlackCard(sample,{resourceVerified:true,checkIsFresh:true,visibility:'public',sourceDeclaredPublic:true,resourceUrl:sample.link.resourceUrl},{},{});
  assert.deepEqual(posted.entity.external_ref,expected);
  await slack.presentDetails({...event(),event:{...event().event,entity_url:sample.link.originalUrl,external_ref:expected}});
  assert.equal(calls[0].method,'entity.presentDetails');
  assert.deepEqual(calls[0].payload.metadata.external_ref,expected);
  const image=calls[0].payload.metadata.entity_payload.custom_fields.find(f=>f.key==='code_preview');
  assert.match(image.image_url,/\/image\/s\/[a-f0-9]{48}$/);
  assert.equal(store.get('image:'+image.image_url.split('/').at(-1)).view,'code');
  for(const bad of [{...expected,id:'other'},{...expected,type:'issue'}]){
   calls.length=0;await slack.presentDetails({...event(),event:{...event().event,entity_url:sample.link.originalUrl,external_ref:bad}});
   assert.equal(calls[0].payload.error.status,'not_found');assert.equal(calls[0].payload.metadata,undefined);
  }
  assert.equal(slack.imageSnapshot({...sample,summary:undefined}),null);
 }finally{store.close();}
});

test('private connection guidance is sent in real Work Object metadata, not only drawn by Storybook',()=>{
 const model=buildPresentation(meta('file',true),{settingsReference:reference});
 const entity=workObject(model,{postedUrl:model.url,externalId:'e'});
 const field=entity.entity_payload.custom_fields.find(f=>f.key==='personal_access');
 assert.match(field?.value||'',/Connect my account/);
 assert.equal(field.long,true);
 assert.ok(entity.entity_payload.display_order.includes('personal_access'));
 const personal=buildPresentation(meta('file',true),{audience:'viewer'});
 assert.ok(!workObject(personal,{postedUrl:personal.url,externalId:'e'}).entity_payload.custom_fields.some(f=>f.key==='personal_access'));
});
