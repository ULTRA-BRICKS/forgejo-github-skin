import test from 'node:test';import assert from 'node:assert/strict';
import {publicMetadata} from '../../integrations/link-preview/public-metadata.mjs';
const config={slack:{teamId:'T123',publicReaderUser:'U777'}};
for(const visibility of [true,false,undefined])test('crawler only receives explicit public metadata: '+visibility,async()=>{
 const calls=[],env={config,forgejo:{parse:()=>({}),metadata:async(url,credential,options)=>{calls.push({credential,options});if(!credential){const e=new Error('Login required');e.status=403;throw e;}return {private:visibility,title:'Fixture'};}},oauth:{access:async()=>({origin:'https://forge.example',accessToken:'synthetic'})}};
 const result=await publicMetadata(env,'https://forge.example/o/r');assert.equal(!!result,visibility===false);assert.ok(calls.every(call=>call.options.publicOnly===true));
});
test('an unconfigured origin cannot cause reader lookup or network access',async()=>{
 const env={config,forgejo:{parse:()=>null,metadata:()=>assert.fail('Unexpected metadata request')},oauth:{access:()=>assert.fail('Unexpected identity lookup')}};
 assert.equal(await publicMetadata(env,'https://unconfigured.example/o/r'),null);
});

test('public image locators recheck access instead of trusting old snapshot contents',async()=>{
 const {publicImageMetadata}=await import('../../integrations/link-preview/public-metadata.mjs');
 const raw='https://forge.example/owner/repo',reads=[];
 const context={config:{slack:{}},forgejo:{parse:u=>u===raw?{}:null,metadata:async(u,t,opts)=>{reads.push(opts);return {private:true,description:'PRIVATE NOW'};}},oauth:{access:async()=>null}};
 assert.equal(await publicImageMetadata(context,{sourceUrl:raw,version:2}),null);
 assert.equal(await publicImageMetadata(context,{private:false,summary:{},link:{originalUrl:raw}}),null);
 assert.ok(reads.every(options=>options.publicOnly===true));
 const before=reads.length;assert.equal(await publicImageMetadata(context,{sourceUrl:'https://evil.example/repo'}),null);assert.equal(reads.length,before);
 context.forgejo.metadata=async()=>({private:false,description:'PUBLIC AGAIN'});
 assert.equal((await publicImageMetadata(context,{sourceUrl:raw})).description,'PUBLIC AGAIN');
});
