// File-range refresh and code permissions across the real Forgejo/Slack serializers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Forgejo} from '../../integrations/link-preview/forgejo.mjs';
import {SlackIntegration} from '../../integrations/link-preview/slack.mjs';
import {Store} from '../../integrations/link-preview/store.mjs';
import {composeSlackCard,externalReference} from '../../integrations/link-preview/unfurl-layout.mjs';

const origin='https://forge.example',repo=origin+'/owner/repo',sha='a'.repeat(40);
const file=repo+'/src/commit/'+sha+'/src/example.js';
const config={origin:'https://links.example',forgejo:origin,slack:{teamId:'T123',appId:'A123',workObjectsEnabled:true}};
const contents={size:100,encoding:'base64',content:Buffer.from('const first = 1;\nconst selected = 2;\nreturn selected;\nconst last = 4;').toString('base64')};
const repository={id:42,full_name:'owner/repo',private:false};

test('file detail event retains the posted line range when entity_url is canonical',async()=>{
 const store=new Store(':memory:',randomBytes(32)),calls=[];
 const forgejo=new Forgejo(origin,async url=>url.includes('/contents/')?contents:repository);
 const slack=new SlackIntegration(config,store,forgejo,{access:async()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 try {
  const meta=await forgejo.metadata(file+'#L2-L3');
  const {entity}=composeSlackCard(meta,{resourceVerified:true,checkIsFresh:true,visibility:'public',anonymousReadable:true,resourceUrl:meta.link.resourceUrl},{});
  const event={type:'entity_details_requested',user:'UALICE',trigger_id:'fixture',entity_url:entity.url,app_unfurl_url:entity.app_unfurl_url,external_ref:entity.external_ref};
  await slack.presentDetails({team_id:'T123',api_app_id:'A123',event});
  const detail=calls[0].payload;
  assert.equal(detail.error,undefined);
  assert.deepEqual(detail.metadata.external_ref,entity.external_ref);
  assert.equal(detail.metadata.entity_payload.custom_fields.find(f=>f.key==='lines').value,'2–3');
  const image=detail.metadata.entity_payload.custom_fields.find(f=>f.key==='code_preview');
  assert.equal(store.get('image:'+image.image_url.split('/').at(-1)).sourceUrl,file+'#L2-L3');
 } finally {store.close();}
});

test('file detail event rejects a posted URL for a different resource before source reads',async()=>{
 const store=new Store(':memory:',randomBytes(32)),calls=[];
 let reads=0;
 const forgejo=new Forgejo(origin,async url=>{reads++;return url.includes('/contents/')?contents:repository;});
 const slack=new SlackIntegration(config,store,forgejo,{access:async()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 try {
  await slack.presentDetails({team_id:'T123',api_app_id:'A123',event:{type:'entity_details_requested',user:'UALICE',trigger_id:'fixture',entity_url:file,app_unfurl_url:file.replace('example.js','other.js')+'#L2-L3'}});
  assert.equal(calls[0].payload.error?.status,'not_found');
  assert.equal(reads,0);
 } finally {store.close();}
});

test('private code requires this viewer code access even when repository metadata is readable',async()=>{
 const store=new Store(':memory:',randomBytes(32)),calls=[],reads=[];
 let codeAllowed=true;
 const forgejo=new Forgejo(origin,async(url,{token})=>{
  reads.push({url,token});
  if(!url.includes('/contents/'))return {...repository,private:true};
  if(token!=='alice-token'||!codeAllowed)throw Object.assign(new Error('Code denied'),{status:403});
  return contents;
 });
 const cfg={...config,slack:{...config.slack,publicReaderUser:'UREADER'}};
 const oauth={access:async(team,user)=>({'UALICE':'alice-token','UBOB':'bob-token','UREADER':'reader-token'})[user]};
 const slack=new SlackIntegration(cfg,store,forgejo,oauth);
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true,view:{id:'viewer-modal'}};};
 try {
  const {publicImageMetadata}=await import('../../integrations/link-preview/public-metadata.mjs');
  assert.equal(await publicImageMetadata({config:cfg,forgejo,oauth},{sourceUrl:file+'#L2-L3',version:3,view:'code'}),null);
  assert.equal(reads.some(r=>r.url.includes('/contents/')),false,'public image must stop at private repository metadata');
  const reference=slack.reference('T123',file+'#L2-L3');
  await slack.openPersonal({team:{id:'T123'},user:{id:'UALICE'},trigger_id:'fixture'},reference);
  const personal=calls.find(c=>c.method==='views.update').payload.view.blocks;
  assert.equal(personal.find(b=>b.type==='rich_text').elements[0].elements[0].text,'const selected = 2;\nreturn selected;');
  assert.equal(slack.imageSnapshot(await forgejo.metadata(file,'alice-token')),null);
  for(const user of ['UBOB','UALICE']){
   calls.length=0;codeAllowed=false;
   await slack.openPersonal({team:{id:'T123'},user:{id:user},trigger_id:'fixture'},reference);
   assert.match(JSON.stringify(calls),/not available to your Forgejo account/);
   assert.ok(!JSON.stringify(calls).includes('const selected'));
   assert.ok(calls.every(c=>c.method==='views.open'||c.method==='views.update'));
  }
  assert.ok(reads.filter(r=>r.url.includes('/contents/')).every(r=>['alice-token','bob-token'].includes(r.token)));
 } finally {store.close();}
});

test('file range refresh fails closed without a complete matching external identity',async()=>{
 const store=new Store(':memory:',randomBytes(32)),calls=[];
 let reads=0;
 const forgejo=new Forgejo(origin,async url=>{reads++;return url.includes('/contents/')?contents:repository;});
 const slack=new SlackIntegration(config,store,forgejo,{access:async()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 const posted=file+'#L3-L4',expected=externalReference(forgejo.parse(posted));
 const other=externalReference(forgejo.parse(file+'#L2-L3'));
 try {
  for(const external_ref of [undefined,{}, {id:'',type:''}, {id:expected.id}, {type:expected.type}, {id:expected.id,type:''},other]){
   calls.length=0;reads=0;
   await slack.presentDetails({team_id:'T123',api_app_id:'A123',event:{type:'entity_details_requested',user:'UALICE',trigger_id:'fixture',entity_url:file,app_unfurl_url:posted,external_ref}});
   assert.equal(calls[0].payload.error?.status,'not_found',JSON.stringify(external_ref)??'absent external_ref');
   assert.equal(reads,0);
  }
 } finally {store.close();}
});
