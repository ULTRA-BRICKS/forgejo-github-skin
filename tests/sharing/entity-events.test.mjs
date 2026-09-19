import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../../integrations/link-preview/store.mjs';
import {dispatchEntityDetails} from '../../integrations/link-preview/entity-events.mjs';
const event={event_id:'EvDetail123',team_id:'T123',event:{trigger_id:'fixture'}};
test('transient detail response errors are retried and only success marks completion',async()=>{
 const store=new Store(':memory:',randomBytes(32));let attempts=0;
 try{
  const task=dispatchEntityDetails(event,store,async()=>{attempts++;if(attempts===1)throw Object.assign(new Error('503'),{status:503});},{pause:async()=>{}});
  assert.equal(dispatchEntityDetails(event,store,async()=>{assert.fail('duplicate');}),null);
  await task;assert.equal(attempts,2);assert.equal(store.get('entity-event:EvDetail123').state,'completed');
  assert.equal(dispatchEntityDetails(event,store,async()=>{}),null);
 }finally{store.close();}
});
test('an unsuccessful response releases the delivery marker so a subsequent event can respond',async()=>{
 const store=new Store(':memory:',randomBytes(32));
 try{
  await assert.rejects(dispatchEntityDetails(event,store,async()=>{throw Object.assign(new Error('revoked'),{slackCode:'token_revoked'});},{pause:async()=>{}}),/revoked/);
  assert.equal(store.get('entity-event:EvDetail123'),null);
  let called=false;await dispatchEntityDetails(event,store,async()=>{called=true;});assert.equal(called,true);
 }finally{store.close();}
});

test('Slack 429 retries once after its bounded Retry-After interval',async()=>{
 const store=new Store(':memory:',randomBytes(32));let attempts=0;const delays=[];
 try{
  await dispatchEntityDetails(event,store,async()=>{if(++attempts===1)throw Object.assign(new Error('ratelimited'),{status:429,retryAfter:1});},{pause:async delay=>delays.push(delay)});
  assert.equal(attempts,2);assert.deepEqual(delays,[1000]);
 }finally{store.close();}
});
test('a live in-process request stays single-flight after its persisted lease expires',async()=>{
 const store=new Store(':memory:',randomBytes(32));let release;
 try{
  const pending=dispatchEntityDetails(event,store,()=>new Promise(resolve=>{release=resolve;}));
  store.take('entity-event:'+event.event_id);
  assert.equal(dispatchEntityDetails(event,store,async()=>{assert.fail('duplicate in-flight request');}),null);
  release();await pending;
  let retried=false;await dispatchEntityDetails(event,store,async()=>{retried=true;});assert.equal(retried,true);
 }finally{store.close();}
});
