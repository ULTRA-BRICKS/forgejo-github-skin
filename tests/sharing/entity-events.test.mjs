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
