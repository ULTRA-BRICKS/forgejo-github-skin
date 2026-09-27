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
 context.forgejo.metadata=async()=>({private:false,description:'PUBLIC AGAIN',summary:{kind:'repository',activity:{days:[1,0,2]}}});
 const fresh=await publicImageMetadata(context,{sourceUrl:raw});
 assert.equal(fresh.description,'PUBLIC AGAIN');
 assert.equal(fresh.previewVariant,'activity');
});
test('image variant is derived from the freshly resolved kind, never a stale/legacy locator',async()=>{
 const {publicImageMetadata}=await import('../../integrations/link-preview/public-metadata.mjs');
 const raw='https://forge.example/owner/repo';
 const context=kind=>({config:{slack:{}},forgejo:{parse:u=>u===raw?{}:null,metadata:async()=>({private:false,summary:kind==='file'?{kind:'file',code:['const x = 1;']}:kind==='repository'?{kind:'repository',activity:{days:[0,1]}}:{kind}})},oauth:{access:async()=>null}});
 // A pre-fix locator (no `view` at all) is remapped by kind, never left as a full card.
 assert.equal((await publicImageMetadata(context('repository'),{sourceUrl:raw})).previewVariant,'activity');
 assert.equal((await publicImageMetadata(context('file'),{sourceUrl:raw})).previewVariant,'code');
 // A v2 locator predates variants entirely; still remapped by kind, not trusted as full.
 assert.equal((await publicImageMetadata(context('repository'),{sourceUrl:raw,version:2,view:'code'})).previewVariant,'activity');
 // A kind that never gets a supplemental image (pull/issue/commit/organization) yields
 // no image at all, regardless of locator contents.
 assert.equal(await publicImageMetadata(context('pull'),{sourceUrl:raw,version:3,view:'activity'}),null);
 // A current-schema (v3+) locator whose explicit view no longer matches the freshly
 // resolved kind is rejected outright rather than silently "fixed" — that mismatch
 // means a corrupted/tampered store entry, not ordinary staleness.
 assert.equal(await publicImageMetadata(context('repository'),{sourceUrl:raw,version:3,view:'code'}),null);
 // No activity data yet: the kind supports the variant, but there is nothing additive to show.
 assert.equal(await publicImageMetadata({config:{slack:{}},forgejo:{parse:u=>u===raw?{}:null,metadata:async()=>({private:false,summary:{kind:'repository',activity:null}})},oauth:{access:async()=>null}},{sourceUrl:raw}),null);
});
