import test from 'node:test';
import assert from 'node:assert/strict';
import {HomeDispatcher} from '../../integrations/link-preview/home-dispatch.mjs';
import {Store} from '../../integrations/link-preview/store.mjs';
import {randomBytes} from 'node:crypto';
const event=user=>({team_id:'T123',event:{user,tab:'home'}});
test('Home storms coalesce and cannot fill the link job queue',async()=>{
 const waits=[],calls=[];
 const dispatch=new HomeDispatcher(e=>new Promise(resolve=>{calls.push(e);waits.push(resolve);}),{capacity:4,concurrency:1});
 const first=dispatch.enqueue(event('U1'));
 for(let i=0;i<1000;i++){const result=dispatch.enqueue(event('U1'));assert.equal(result.coalesced,true);assert.equal(result.task,first.task);}
 const tasks=[first.task];for(const id of ['U2','U3','U4'])tasks.push(dispatch.enqueue(event(id)).task);
 assert.equal(dispatch.enqueue(event('U5')),null);
 const store=new Store(':memory:',randomBytes(32));
 try{assert.equal(store.enqueue('new-link',{event:{type:'link_shared'}}),true);assert.equal(store.pendingCount(),1);}finally{store.close();}
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,1);
 for(let i=0;i<4;i++){waits[i]();await new Promise(resolve=>setImmediate(resolve));}
 await Promise.all(tasks);assert.equal(dispatch.active.size+dispatch.pending.size,0);
 const next=dispatch.enqueue(event('U1'));assert.equal(next.coalesced,false);await new Promise(resolve=>setImmediate(resolve));waits[4]();await next.task;
});
test('failed Home publication releases capacity for the next explicit refresh',async()=>{
 let count=0;const dispatch=new HomeDispatcher(async()=>{if(++count===1)throw new Error('fixture');return 'published';});
 await assert.rejects(dispatch.enqueue(event('U1')).task,/fixture/);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(await dispatch.enqueue(event('U1')).task,'published');
 assert.throws(()=>new HomeDispatcher(()=>{}, {capacity:0}),TypeError);
});
test('a changed preference during publication is rendered in one coalesced follow-up',async()=>{
 const seen=[],waits=[];
 const dispatch=new HomeDispatcher(e=>new Promise(resolve=>{seen.push(e.marker);waits.push(()=>resolve(e.marker));}));
 const a=dispatch.enqueue({...event('U1'),marker:'old'});await new Promise(resolve=>setImmediate(resolve));
 const b=dispatch.enqueue({...event('U1'),marker:'new'});assert.equal(a.task,b.task);
 waits[0]();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(seen,['old','new']);
 waits[1]();assert.equal(await a.task,'new');
});
