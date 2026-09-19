import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {homeView} from '../../integrations/link-preview/slack-home.mjs';
import {validEnvelope} from '../../integrations/link-preview/protocol.mjs';
import {SlackIntegration} from '../../integrations/link-preview/slack.mjs';
import {Store} from '../../integrations/link-preview/store.mjs';
const cfg={origin:'https://links.example',forgejo:'https://forge.example',slack:{teamId:'T123',appId:'A123'}};
const event={type:'event_callback',team_id:'T123',api_app_id:'A123',event_id:'EvHome1',event:{type:'app_home_opened',user:'U123',tab:'home',channel:'D123'}};
test('home events require exact installation and a real user, without new scopes',()=>{
 assert.equal(validEnvelope(event,cfg),true);
 for(const patch of [{team_id:'T999'},{api_app_id:'A999'},{event:{...event.event,user:'bad'}}])assert.equal(validEnvelope({...event,...patch},cfg),false);
 assert.equal(validEnvelope({...event,event:{...event.event,tab:'about'}},cfg),true);
});
test('App Home offers a persistent private settings entry and explanatory onboarding',()=>{
 const view=homeView({density:'compact',visuals:'auto',format:'native'},{origin:cfg.forgejo,connected:true,connectUrl:'https://links.example/connect?ticket=fixture'});
 assert.equal(view.type,'home');assert.equal(view.callback_id,'forgejo_home');
 const serialized=JSON.stringify(view);assert.match(serialized,/Edit preview settings/);assert.match(serialized,/Linked/);assert.match(serialized,/Paste/);
 assert.ok(!serialized.includes('accessToken'));assert.ok(view.blocks.length<20);
 assert.ok(view.blocks.flatMap(b=>b.elements||[]).some(a=>a.action_id==='forgejo_home_settings'));
});
test('home publication uses only the interacting user and ignores other surfaces',async()=>{
 const store=new Store(':memory:',randomBytes(32)),calls=[],reads=[];
 const slack=new SlackIntegration(cfg,store,{}, {access:async(team,user,url)=>{reads.push({team,user,url});return 'fixture';},ticket:()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 try{await slack.publishHome(event);assert.equal(calls[0].method,'views.publish');assert.equal(calls[0].payload.user_id,'U123');assert.equal(reads[0].user,'U123');calls.length=0;await slack.publishHome({...event,event:{...event.event,tab:'messages'}});assert.equal(calls.length,0);await slack.publishHome({...event,team_id:'T999'});assert.equal(calls.length,0);}finally{store.close();}
});
test('Home settings action creates a viewer-bound modal session, and message forgery is ignored',async()=>{
 const store=new Store(':memory:',randomBytes(32)),calls=[];
 const slack=new SlackIntegration(cfg,store,{}, {access:async()=>null,ticket:()=>null});
 slack.call=async(method,payload)=>{calls.push({method,payload});return {ok:true};};
 const click={type:'block_actions',team:{id:'T123'},api_app_id:'A123',user:{id:'U123'},trigger_id:'fixture-trigger',view:{type:'home',callback_id:'forgejo_home'},actions:[{action_id:'forgejo_home_settings'}]};
 try{
  await slack.interact({...click,view:{type:'modal',callback_id:'other'}});assert.equal(calls.length,0);
  await slack.interact(click);assert.equal(calls[0].method,'views.open');
  const id=calls[0].payload.view.private_metadata;assert.match(id,/^[a-f0-9]{48}$/);
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM kv WHERE k LIKE 'ref:%'").get().n,0);
  assert.deepEqual(store.get('settings:'+id),{team:'T123',user:'U123',url:'https://forge.example',home:true});
  const state={};for(const [key,value] of [['density','detailed'],['visuals','off'],['format','native']])state[key]={[key]:{selected_option:{value}}};
  assert.deepEqual(slack.submitSettings({...click,type:'view_submission',view:{callback_id:'forgejo_preview_preferences',private_metadata:id,state:{values:state}}}),{});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.at(-1).method,'views.publish');assert.match(JSON.stringify(calls.at(-1)),/Detailed/);
 }finally{store.close();}
});
test('source credential errors become a private connection hint without leaking diagnostics',async()=>{
 const store=new Store(':memory:',randomBytes(32)),calls=[];
 const slack=new SlackIntegration(cfg,store,{}, {access:async()=>{throw new Error('SECRET VALUE');},ticket:()=>null});
 slack.call=async(method,payload)=>{calls.push(payload);return {ok:true};};
 try{await slack.publishHome(event);assert.match(JSON.stringify(calls),/Refresh your connection/);assert.ok(!JSON.stringify(calls).includes('SECRET'));}finally{store.close();}
});
test('repeated interactive Home refreshes share the same bounded publication',async()=>{
 const store=new Store(':memory:',randomBytes(32));let calls=0,active=0,peak=0;const releases=[];
 const slack=new SlackIntegration(cfg,store,{}, {access:async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>releases.push(r));active--;return 'fixture';},ticket:()=>null});
 slack.call=async()=>{calls++;return {ok:true};};
 const click={type:'block_actions',team:{id:'T123'},api_app_id:'A123',user:{id:'U123'},view:{type:'home',callback_id:'forgejo_home'},actions:[{action_id:'forgejo_home_refresh'}]};
 try{
  const tasks=Array.from({length:40},()=>slack.interact(click));await new Promise(resolve=>setImmediate(resolve));assert.equal(peak,1);assert.equal(releases.length,1);releases[0]();await Promise.all(tasks);assert.equal(calls,1);
  const several=Array.from({length:6},(_,i)=>slack.interact({...click,user:{id:'U'+(i+200)}}));
  for(let i=1;i<=6;i++){await new Promise(resolve=>setImmediate(resolve));assert.ok(peak<=2);releases[i]();}await Promise.all(several);assert.equal(calls,7);
 }finally{store.close();}
});
