/** Home is derived per-user state. Coalesce refreshes separately from durable link jobs. */
export class HomeDispatcher {
  constructor(publish, {capacity=32, concurrency=2}={}) {
    if(typeof publish!=='function'||!Number.isInteger(capacity)||capacity<1||!Number.isInteger(concurrency)||concurrency<1||concurrency>capacity)throw new TypeError('Bounded Home dispatcher required');
    Object.assign(this,{publish,capacity,concurrency});this.pending=new Map();this.active=new Map();
  }
  enqueue(event) {
    const key=event.team_id+':'+event.event.user;
    const existing=this.pending.get(key)||this.active.get(key);
    if(existing){existing.event=event;if(this.active.has(key))existing.again=true;return {coalesced:true,task:existing.task};}
    if(this.pending.size+this.active.size>=this.capacity)return null;
    let resolve,reject;
    const task=new Promise((yes,no)=>{resolve=yes;reject=no;});
    this.pending.set(key,{event,task,resolve,reject,again:false});
    queueMicrotask(()=>this.drain());
    return {coalesced:false,task};
  }
  drain() {
    while(this.active.size<this.concurrency&&this.pending.size){
      const [key,item]=this.pending.entries().next().value;
      this.pending.delete(key);this.active.set(key,item);item.again=false;
      const finish=(error,result)=>{
        this.active.delete(key);
        // Preferences may have changed during the network request. Publish the latest state once more.
        if(item.again)this.pending.set(key,item);
        else if(error)item.reject(error);
        else item.resolve(result);
        this.drain();
      };
      Promise.resolve().then(()=>this.publish(item.event)).then(result=>finish(null,result),error=>finish(error));
    }
  }
}
