import test from 'node:test';
import assert from 'node:assert/strict';
import {SlackIntegration} from '../../integrations/link-preview/slack.mjs';
const config={slack:{botToken:'synthetic-token'}};
test('channel metadata uses Slack GET query arguments, not an ignored JSON body',async t=>{
 const requests=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{requests.push({url:String(url),options});return new Response(JSON.stringify({ok:true,channel:{id:'C123'}}));});
 const slack=new SlackIntegration(config,{}, {},{});
 const response=await slack.call('conversations.info',{channel:'C123',include_num_members:true});
 const {url,options}=requests[0],parsed=new URL(url);
 assert.equal(options.method,'GET');assert.equal(options.body,undefined);
 assert.equal(parsed.origin,'https://slack.com');assert.equal(parsed.pathname,'/api/conversations.info');
 assert.equal(parsed.searchParams.get('channel'),'C123');assert.equal(parsed.searchParams.get('include_num_members'),'true');
 assert.equal(options.headers.Authorization,'Bearer synthetic-token');assert.equal(response.channel.id,'C123');
});
test('Slack view writes retain JSON and entity metadata retains encoded form',async t=>{
 const requests=[];t.mock.method(globalThis,'fetch',async(url,options)=>{requests.push(options);return new Response(JSON.stringify({ok:true}));});
 const slack=new SlackIntegration(config,{}, {},{});
 await slack.call('views.open',{trigger_id:'fixture',view:{type:'modal'}});
 assert.equal(requests[0].method,'POST');assert.equal(JSON.parse(requests[0].body).trigger_id,'fixture');
 await slack.call('entity.presentDetails',{trigger_id:'fixture',metadata:{url:'https://forge.example/repo'}});
 assert.equal(requests[1].method,'POST');assert.ok(requests[1].body instanceof URLSearchParams);
 assert.equal(JSON.parse(requests[1].body.get('metadata')).url,'https://forge.example/repo');
});
