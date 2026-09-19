import {randomBytes} from 'node:crypto';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const activeByStore=new WeakMap();
const transient=error=>error.status===429||error.slackCode==='ratelimited'||error.status>=500||['internal_error','service_unavailable','request_timeout'].includes(error.slackCode)||['AbortError','TimeoutError','TypeError'].includes(error.name);

/** Claim before HTTP acknowledgement; complete the marker only after Slack accepts the response. */
export function dispatchEntityDetails(envelope,store,respond,{pause=wait}={}) {
 const key='entity-event:'+envelope.event_id;
 let active=activeByStore.get(store);if(!active){active=new Set();activeByStore.set(store,active);}
 if(active.has(key)||store.get(key))return null;
 const attemptId=randomBytes(12).toString('hex'),started=Date.now();
 store.put(key,{state:'processing',attemptId},45);active.add(key);
 return (async()=>{
  try{
   for(let attempt=0;attempt<2;attempt++){
    try{
     await respond(envelope);
     if(store.get(key)?.attemptId===attemptId)store.put(key,{state:'completed'},600);
     return;
    }catch(error){
     const seconds=Number(error.retryAfter);
     const delay=Number.isFinite(seconds)&&seconds>0?seconds*1000:200;
     if(attempt||!transient(error)||delay>2000||Date.now()-started+delay>25000)throw error;
     await pause(delay);
    }
   }
  }catch(error){
   if(store.get(key)?.attemptId===attemptId)store.take(key);
   throw error;
  }finally{active.delete(key);}
 })();
}
