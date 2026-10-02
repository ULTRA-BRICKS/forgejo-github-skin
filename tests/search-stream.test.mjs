/** Frozen NDJSON v1 search transport, driven by genuine ReadableStream byte fixtures.
 * Contract: forgejo-search streaming v1 (started, heartbeat*, result, done | error), 2 MiB record /
 * 8 MiB total / 256 record caps, fatal UTF-8, fail closed. No DOM involved; the controller proof is browser-side.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import v8 from 'node:v8';
import vm from 'node:vm';
import {
  SEARCH_STREAM_ACCEPT,SEARCH_STREAM_LIMITS,SearchStreamError,
  isSearchEnvelope,searchResponseKind,createSearchStreamParser,readSearchStream
} from '../src/search-stream.mjs';

v8.setFlagsFromString('--expose-gc');
const gc=vm.runInNewContext('gc');
const coverageFixtures=JSON.parse(fs.readFileSync(new URL('../stories/search-coverage-fixtures.json',import.meta.url),'utf8'));
const encoder=new TextEncoder();
const bytes=value=>typeof value==='string'?encoder.encode(value):value;
const concat=(...parts)=>{
  const chunks=parts.map(bytes),out=new Uint8Array(chunks.reduce((sum,chunk)=>sum+chunk.length,0));
  let offset=0;
  for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}
  return out;
};
const line=record=>(typeof record==='string'?record:JSON.stringify(record))+'\n';
const lines=(...records)=>records.map(line).join('');
const STARTED={v:1,type:'started'},HEARTBEAT={v:1,type:'heartbeat'},DONE={v:1,type:'done'};
const ENVELOPE={
  query:'ключ 🔎',inferred:'text',total_ms:5.5,
  results:[{repo:'ацме/проект',path:'файл-🔎.mjs',kind:'code',line:3,snippet:'ключ <mark>🔎</mark> 𝒳 ü'}],
  coverage:coverageFixtures.enabled.coverage
};
const RESULT=(data=ENVELOPE)=>({v:1,type:'result',data});
const SUCCESS=lines(STARTED,HEARTBEAT,HEARTBEAT,RESULT(),DONE);
const SUCCESS_BYTES=bytes(SUCCESS);
const ERROR=(code='search_unavailable',status=503)=>({v:1,type:'error',code,status});

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const outcome=async promise=>Promise.race([promise.then(()=>'resolved',()=>'rejected'),delay(30).then(()=>'pending')]);
const thrown=fn=>{try{fn();}catch(error){return error;}return null;};
async function rejection(promise){try{await promise;}catch(error){return error;}return null;}

function feed(parser,...chunks){
  const events=[];
  for(const chunk of chunks)events.push(...parser.push(bytes(chunk)));
  return events;
}
function readableOf(chunks){
  return new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(bytes(chunk));controller.close();}});
}
function controlled(){
  const state={cancelled:false,reason:undefined};
  let controller;
  const body=new ReadableStream({start(c){controller=c;},cancel(reason){state.cancelled=true;state.reason=reason;}});
  return {body,state,push:chunk=>controller.enqueue(bytes(chunk)),close:()=>controller.close(),fail:error=>controller.error(error)};
}
function splitAt(data,offsets){
  const out=[];let previous=0;
  for(const offset of [...offsets,data.length]){out.push(data.slice(previous,offset));previous=offset;}
  return out;
}
function mulberry32(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

test('contract constants are frozen to NDJSON v1 caps',()=>{
  assert.equal(SEARCH_STREAM_ACCEPT,'application/x-ndjson');
  assert.deepEqual({...SEARCH_STREAM_LIMITS},{recordBytes:2*1024*1024,totalBytes:8*1024*1024,records:256});
  assert.equal(Object.isFrozen(SEARCH_STREAM_LIMITS),true);
});

test('response Content-Type decides the transport from the same response',()=>{
  const kind=value=>searchResponseKind(new Response('',value===null?{}:{headers:{'Content-Type':value}}));
  for(const value of ['application/x-ndjson','Application/X-NDJSON','application/x-ndjson; charset=utf-8','application/x-ndjson;charset="UTF-8"'])assert.equal(kind(value),'stream',value);
  for(const value of ['application/json','Application/JSON; charset=utf-8','application/json;charset=iso-8859-1'])assert.equal(kind(value),'json',value);
  for(const value of ['application/x-ndjson; charset=iso-8859-1','application/x-ndjson; charset=utf-16','text/plain','text/html','text/event-stream','application/ndjson','application/jsonl','application/x-ndjson-v2','application/jsonx','application/problem+json','application/octet-stream',''])assert.equal(kind(value),null,value);
  assert.equal(searchResponseKind(new Response('{}',{headers:{}})),null,'string bodies default to text/plain');
  assert.equal(searchResponseKind({headers:new Headers()}),null);
});

test('the search envelope check is shared by both transports and rejects every non-envelope',()=>{
  for(const value of [{results:[]},{results:[{}],query:'x'},ENVELOPE,...Object.values(coverageFixtures)])assert.equal(isSearchEnvelope(value),true);
  for(const value of [null,undefined,[],[{results:[]}],'ok',1,true,{},{query:'x'},{results:{}},{results:null},{results:'[]'}])assert.equal(isSearchEnvelope(value),false,JSON.stringify(value));
});

test('parser yields the success sequence with the full envelope and requires a clean finish',()=>{
  const parser=createSearchStreamParser();
  const events=feed(parser,SUCCESS_BYTES);
  assert.deepEqual(events.map(event=>event.type),['started','heartbeat','heartbeat','result','done']);
  assert.deepEqual(events[3].data,ENVELOPE);
  assert.equal(parser.terminal,'done');
  assert.doesNotThrow(()=>parser.finish());
});

test('every split of the byte stream, including inside multi-byte characters, parses identically',()=>{
  for(let offset=0;offset<=SUCCESS_BYTES.length;offset++){
    const parser=createSearchStreamParser();
    const events=feed(parser,SUCCESS_BYTES.slice(0,offset),SUCCESS_BYTES.slice(offset));
    parser.finish();
    assert.deepEqual(events.map(event=>event.type),['started','heartbeat','heartbeat','result','done'],`split ${offset}`);
    assert.deepEqual(events[3].data,ENVELOPE,`split ${offset}`);
  }
});

test('byte-at-a-time, random and many-lines-per-chunk framing all agree',()=>{
  const parser=createSearchStreamParser();
  const events=feed(parser,...Array.from(SUCCESS_BYTES,byte=>Uint8Array.of(byte)));
  parser.finish();
  assert.deepEqual(events[3].data,ENVELOPE);
  const random=mulberry32(20261002);
  for(let round=0;round<200;round++){
    const offsets=new Set();
    for(let i=0;i<1+Math.floor(random()*12);i++)offsets.add(Math.floor(random()*SUCCESS_BYTES.length));
    const split=createSearchStreamParser();
    const seen=feed(split,...splitAt(SUCCESS_BYTES,[...offsets].sort((a,b)=>a-b)));
    split.finish();
    assert.deepEqual(seen.map(event=>event.type),['started','heartbeat','heartbeat','result','done']);
    assert.deepEqual(seen[3].data,ENVELOPE);
  }
  const whole=createSearchStreamParser();
  assert.equal(feed(whole,SUCCESS_BYTES).length,5,'multiple records in one chunk');
});

test('CRLF terminators are accepted and not counted as record content',()=>{
  const parser=createSearchStreamParser();
  const events=feed(parser,SUCCESS.replaceAll('\n','\r\n'));
  parser.finish();
  assert.deepEqual(events.map(event=>event.type),['started','heartbeat','heartbeat','result','done']);
  const split=createSearchStreamParser();
  const out=feed(split,...Array.from(bytes(SUCCESS.replaceAll('\n','\r\n')),byte=>Uint8Array.of(byte)));
  split.finish();
  assert.deepEqual(out[3].data,ENVELOPE);
});

test('invalid UTF-8 is fatal, never replaced with U+FFFD, wherever the chunks split',()=>{
  const prefix=lines(STARTED);
  const bad={
    'lone 0xFF':[0xff],'truncated lead':[0xc3],'overlong slash':[0xc0,0xaf],'encoded surrogate':[0xed,0xa0,0x80],
    'beyond U+10FFFF':[0xf4,0x90,0x80,0x80],'stray continuation':[0x80],'truncated emoji':[0xf0,0x9f,0x94]
  };
  for(const [name,sequence] of Object.entries(bad)){
    const data=concat(prefix,'{"v":1,"type":"result","data":{"results":[],"x":"',Uint8Array.from(sequence),'"}}\n');
    for(const offsets of [[],[prefix.length+30],[data.length-6],[data.length-4,data.length-3]]){
      const parser=createSearchStreamParser();
      const error=thrown(()=>feed(parser,...splitAt(data,offsets)));
      assert.ok(error instanceof SearchStreamError,name);
      assert.equal(error.kind,'encoding',name);
    }
  }
  const truncatedAtNewline=createSearchStreamParser();
  assert.equal(thrown(()=>feed(truncatedAtNewline,prefix,concat('{"v":1,"type":"heartbeat"}',Uint8Array.of(0xc3),'\n'))).kind,'encoding');
});

test('a byte order mark is not silently stripped',()=>{
  const parser=createSearchStreamParser();
  assert.equal(thrown(()=>feed(parser,concat(Uint8Array.of(0xef,0xbb,0xbf),line(STARTED)))).kind,'protocol');
});

const violations={
  'heartbeat before started':[HEARTBEAT],
  'result before started':[RESULT()],
  'done before started':[DONE],
  'error before started':[ERROR()],
  'started twice':[STARTED,STARTED],
  'result twice':[STARTED,RESULT(),RESULT()],
  'heartbeat after result':[STARTED,RESULT(),HEARTBEAT],
  'started after result':[STARTED,RESULT(),STARTED],
  'done without result':[STARTED,DONE],
  'done twice':[STARTED,RESULT(),DONE,DONE],
  'error after done':[STARTED,RESULT(),DONE,ERROR()],
  'done after error':[STARTED,ERROR(),DONE],
  'error twice':[STARTED,ERROR(),ERROR()],
  'result after error':[STARTED,ERROR(),RESULT()],
  'unknown version 2':[{v:2,type:'started'}],
  'string version':[{v:'1',type:'started'}],
  'missing version':[{type:'started'}],
  'null version':[{v:null,type:'started'}],
  'unknown type progress':[STARTED,{v:1,type:'progress'}],
  'partial hit batch':[STARTED,{v:1,type:'hits',data:[]}],
  'missing type':[{v:1}],
  'numeric type':[{v:1,type:1}],
  'started extra key':[{v:1,type:'started',count:3}],
  'heartbeat extra key':[STARTED,{v:1,type:'heartbeat',stage:'listing'}],
  'done extra key':[STARTED,RESULT(),{v:1,type:'done',data:{}}],
  'result extra key':[STARTED,{v:1,type:'result',data:ENVELOPE,extra:true}],
  'error extra key':[STARTED,{...ERROR(),message:'boom'}],
  'null result data':[STARTED,{v:1,type:'result',data:null}],
  'array result data':[STARTED,{v:1,type:'result',data:[]}],
  'string result data':[STARTED,{v:1,type:'result',data:'ok'}],
  'missing result data':[STARTED,{v:1,type:'result'}],
  'result without results array':[STARTED,RESULT({inferred:'text'})],
  'results not an array':[STARTED,RESULT({results:{}})],
  'unknown error code':[STARTED,ERROR('boom',503)],
  'raw exception as code':[STARTED,ERROR('Traceback (most recent call last)',503)],
  'missing error code':[STARTED,{v:1,type:'error',status:503}],
  'unknown error status 500':[STARTED,ERROR('search_unavailable',500)],
  'string error status':[STARTED,ERROR('search_unavailable','503')],
  'missing error status':[STARTED,{v:1,type:'error',code:'search_unavailable'}],
  'array record':[STARTED,'[]'],
  'null record':[STARTED,'null'],
  'number record':[STARTED,'1'],
  'string record':[STARTED,'"heartbeat"'],
  'invalid JSON':[STARTED,'{"v":1,"type":"heartbeat"'],
  'blank line':[STARTED,''],
  'whitespace only line':[STARTED,'   '],
  'two objects on one line':[STARTED,'{"v":1,"type":"heartbeat"}{"v":1,"type":"heartbeat"}'],
  'garbage after object':[STARTED,'{"v":1,"type":"heartbeat"} x']
};
for(const [name,records] of Object.entries(violations))test(`violation fails closed: ${name}`,()=>{
  const parser=createSearchStreamParser();
  const error=thrown(()=>{feed(parser,lines(...records));parser.finish();});
  assert.ok(error instanceof SearchStreamError,'expected SearchStreamError, got '+error);
  assert.equal(error.kind,'protocol');
});

test('every allowlisted error category and status is accepted as the terminal record',()=>{
  for(const code of ['authentication_required','visibility_unavailable','code_visibility_unavailable','deadline_exceeded','search_unavailable','server_busy'])for(const status of [401,503,504]){
    const parser=createSearchStreamParser();
    const events=feed(parser,lines(STARTED,HEARTBEAT,ERROR(code,status)));
    parser.finish();
    assert.deepEqual(events.at(-1),{type:'error',code,status});
    assert.equal(parser.terminal,'error');
  }
});

test('an error record may follow a result that was withheld, and is still terminal',()=>{
  const parser=createSearchStreamParser();
  const events=feed(parser,lines(STARTED,RESULT(),ERROR('deadline_exceeded',504)));
  assert.deepEqual(events.map(event=>event.type),['started','result','error']);
  assert.equal(parser.terminal,'error');
});

test('bytes after the terminal record are a violation in any framing',()=>{
  for(const tail of ['\n','{"v":1,"type":"heartbeat"}\n','x','\r\n']){
    for(const terminal of [lines(STARTED,RESULT(),DONE),lines(STARTED,ERROR())]){
      const whole=createSearchStreamParser();
      assert.equal(thrown(()=>feed(whole,terminal+tail)).kind,'protocol',JSON.stringify(tail));
      const split=createSearchStreamParser();
      feed(split,terminal);
      assert.equal(thrown(()=>feed(split,tail)).kind,'protocol',JSON.stringify(tail));
    }
  }
});

test('EOF without a terminal marker is an interruption, never an empty success',()=>{
  const incomplete={
    'no bytes':'',
    'started only':lines(STARTED),
    'heartbeats only':lines(STARTED,HEARTBEAT),
    'result without done':lines(STARTED,RESULT()),
    'done without trailing newline':lines(STARTED,RESULT())+JSON.stringify(DONE),
    'truncated record':lines(STARTED)+JSON.stringify(RESULT()).slice(0,40)
  };
  for(const [name,text] of Object.entries(incomplete)){
    const parser=createSearchStreamParser();
    feed(parser,text);
    const error=thrown(()=>parser.finish());
    assert.ok(error instanceof SearchStreamError,name);
    assert.equal(error.kind,'interrupted',name);
  }
});

test('a line longer than the record cap fails before its newline arrives; exact fits pass',()=>{
  const limits={recordBytes:80,totalBytes:10_000,records:20};
  const filler=length=>'{"v":1,"type":"heartbeat"}'+' '.repeat(length);
  const exact=filler(80-26);
  assert.equal(bytes(exact).length,80);
  const ok=createSearchStreamParser(limits);
  assert.equal(feed(ok,lines(STARTED),exact+'\n').length,2);
  const crlf=createSearchStreamParser(limits);
  assert.equal(feed(crlf,lines(STARTED),exact+'\r\n').length,2,'CRLF is not record content');
  const tooLong=createSearchStreamParser(limits);
  feed(tooLong,lines(STARTED));
  const error=thrown(()=>feed(tooLong,exact+' '));
  assert.equal(error.kind,'limit');
  const tooLongNewline=createSearchStreamParser(limits);
  feed(tooLongNewline,lines(STARTED));
  assert.equal(thrown(()=>feed(tooLongNewline,exact+' \n')).kind,'limit');
  const unbounded=createSearchStreamParser(limits);
  feed(unbounded,lines(STARTED));
  assert.equal(thrown(()=>{for(let i=0;i<50;i++)feed(unbounded,'x'.repeat(40));}).kind,'limit','pending buffer stays bounded without a newline');
});

test('the record count and total byte caps are enforced independently',()=>{
  const counted=createSearchStreamParser({recordBytes:1000,totalBytes:100_000,records:5});
  feed(counted,lines(STARTED,HEARTBEAT,HEARTBEAT,HEARTBEAT,HEARTBEAT));
  assert.equal(thrown(()=>feed(counted,lines(HEARTBEAT))).kind,'limit');
  const sized=createSearchStreamParser({recordBytes:1000,totalBytes:100,records:50});
  feed(sized,lines(STARTED,HEARTBEAT));
  assert.equal(thrown(()=>feed(sized,lines(HEARTBEAT,HEARTBEAT,HEARTBEAT))).kind,'limit');
  const midLine=createSearchStreamParser({recordBytes:1000,totalBytes:60,records:50});
  assert.equal(thrown(()=>feed(midLine,lines(STARTED),'{"v":1,"type":"heartbeat"}'+' '.repeat(10))).kind,'limit','total counts partial lines');
});

test('default caps accept maximal streams and reject one step beyond',()=>{
  const maxRecords=lines(STARTED,...Array(253).fill(HEARTBEAT),RESULT(),DONE);
  const accept=createSearchStreamParser();
  assert.equal(feed(accept,maxRecords).length,SEARCH_STREAM_LIMITS.records);
  accept.finish();
  const extra=createSearchStreamParser();
  assert.equal(thrown(()=>feed(extra,lines(STARTED,...Array(255).fill(HEARTBEAT),RESULT()))).kind,'limit');

  const pad=SEARCH_STREAM_LIMITS.recordBytes-bytes(JSON.stringify(RESULT({results:[],pad:''}))).length;
  const exact=RESULT({results:[],pad:'x'.repeat(pad)});
  assert.equal(bytes(JSON.stringify(exact)).length,SEARCH_STREAM_LIMITS.recordBytes);
  const large=createSearchStreamParser();
  assert.equal(feed(large,lines(STARTED),line(exact),line(DONE)).length,3);
  const over=createSearchStreamParser();
  assert.equal(thrown(()=>feed(over,lines(STARTED),line(RESULT({results:[],pad:'x'.repeat(pad+1)})))).kind,'limit');

  const heavy=createSearchStreamParser();
  const chunk='{"v":1,"type":"heartbeat"}'+' '.repeat(100*1024)+'\n';
  feed(heavy,lines(STARTED));
  let total=bytes(lines(STARTED)).length,records=1;
  const error=thrown(()=>{while(true){feed(heavy,chunk);total+=bytes(chunk).length;records++;}});
  assert.equal(error.kind,'limit');
  assert.ok(records<SEARCH_STREAM_LIMITS.records,'total byte cap, not the record cap, stopped it');
  assert.ok(total<=SEARCH_STREAM_LIMITS.totalBytes&&total+bytes(chunk).length>SEARCH_STREAM_LIMITS.totalBytes);
});

test('a near-maximal record sent one byte at a time retains no per-chunk objects and still parses',{timeout:60000},()=>{
  const parser=createSearchStreamParser();
  feed(parser,lines(STARTED));
  const pad=SEARCH_STREAM_LIMITS.recordBytes-bytes(JSON.stringify(RESULT({results:[],pad:''}))).length-1024;
  const record=bytes(JSON.stringify(RESULT({results:[],pad:'x'.repeat(pad)})));
  assert.ok(record.length>SEARCH_STREAM_LIMITS.recordBytes-2048);
  const one=new Uint8Array(1);
  gc();
  const before=process.memoryUsage().heapUsed;
  for(let i=0;i<record.length;i++){one[0]=record[i];assert.equal(parser.push(one).length,0);}
  gc();
  const growth=process.memoryUsage().heapUsed-before;
  assert.ok(growth<16*1024*1024,`heap grew ${growth} bytes while one record was pending`);
  const events=parser.push(bytes('\n'));
  assert.equal(events.length,1);
  assert.equal(events[0].data.pad.length,pad);
  assert.equal(feed(parser,line(DONE)).at(-1).type,'done');
  parser.finish();
});

test('reader returns the staged envelope only after done and a clean end of stream',async()=>{
  const ctl=controlled();
  const pending=readSearchStream(ctl.body);
  ctl.push(lines(STARTED,HEARTBEAT));
  assert.equal(await outcome(pending),'pending');
  ctl.push(lines(RESULT()));
  assert.equal(await outcome(pending),'pending','result alone is withheld');
  ctl.push(lines(DONE));
  assert.equal(await outcome(pending),'pending','done without end of stream is not yet complete');
  ctl.close();
  assert.deepEqual(await pending,ENVELOPE);
  assert.equal(ctl.body.locked,false,'reader lock released on success');
});

test('started is reported as soon as it arrives, heartbeats stay silent, before any data',async()=>{
  const ctl=controlled();
  let starts=0;
  const pending=readSearchStream(ctl.body,{onStarted:()=>starts++});
  assert.equal(starts,0);
  ctl.push(lines(STARTED));
  await delay(5);
  assert.equal(starts,1,'observable while the final data has not been sent');
  for(let i=0;i<5;i++){ctl.push(lines(HEARTBEAT));await delay(2);}
  assert.equal(starts,1);
  ctl.push(lines(RESULT(),DONE));ctl.close();
  assert.deepEqual(await pending,ENVELOPE);
  assert.equal(starts,1);
});

test('reader handles every two-chunk split and one-byte chunks through a real ReadableStream',async()=>{
  for(let offset=0;offset<=SUCCESS_BYTES.length;offset+=1){
    const data=await readSearchStream(readableOf(splitAt(SUCCESS_BYTES,[offset])));
    assert.deepEqual(data,ENVELOPE,`split ${offset}`);
  }
  assert.deepEqual(await readSearchStream(readableOf(Array.from(SUCCESS_BYTES,byte=>Uint8Array.of(byte)))),ENVELOPE);
});

test('slow, delayed chunks complete without polling and keep the result staged',async()=>{
  const chunks=splitAt(SUCCESS_BYTES,[10,40,77,200]);
  let index=0,pulls=0;
  const body=new ReadableStream({async pull(controller){
    pulls++;
    await delay(4);
    if(index<chunks.length)controller.enqueue(chunks[index++]);else controller.close();
  }},{highWaterMark:0});
  assert.deepEqual(await readSearchStream(body),ENVELOPE);
  assert.ok(pulls<=chunks.length+2,`pulls ${pulls} stay proportional to chunks`);
});

test('captured backend envelopes pass through unchanged',async()=>{
  for(const [name,payload] of Object.entries(coverageFixtures)){
    assert.deepEqual(await readSearchStream(readableOf([lines(STARTED,RESULT(payload),DONE)])),payload,name);
  }
});

test('terminal error after a withheld result rejects with the stable category and never yields data',async()=>{
  const error=await rejection(readSearchStream(readableOf([lines(STARTED,HEARTBEAT,RESULT(),ERROR('deadline_exceeded',504))])));
  assert.ok(error instanceof SearchStreamError);
  assert.equal(error.kind,'remote');
  assert.equal(error.code,'deadline_exceeded');
  assert.equal(error.status,504);
  const auth=await rejection(readSearchStream(readableOf([lines(STARTED,ERROR('authentication_required',401))])));
  assert.equal(auth.kind,'remote');
  assert.equal(auth.status,401);
});

test('stream ending early or erroring is an interruption and clears the lock',async()=>{
  for(const text of ['',lines(STARTED),lines(STARTED,HEARTBEAT),lines(STARTED,RESULT())]){
    const body=readableOf([text]);
    const error=await rejection(readSearchStream(body));
    assert.equal(error?.kind,'interrupted',JSON.stringify(text));
    assert.equal(body.locked,false);
  }
  const ctl=controlled();
  const pending=rejection(readSearchStream(ctl.body));
  ctl.push(lines(STARTED,RESULT()));
  ctl.fail(new TypeError('network error'));
  const error=await pending;
  assert.equal(error.kind,'interrupted');
  assert.equal(error.name,'SearchStreamError');
  assert.equal(ctl.body.locked,false);
});

test('a missing body is an interruption, not an empty result',async()=>{
  for(const body of [null,undefined])assert.equal((await rejection(readSearchStream(body)))?.kind,'interrupted');
});

test('protocol, encoding and limit failures cancel the open stream and release the lock',{timeout:10000},async()=>{
  const cases={
    protocol:[lines(STARTED,STARTED)],
    encoding:[lines(STARTED),concat('{"v":1,"type":"heartbeat"}',Uint8Array.of(0xff),'\n')],
    limit:[lines(STARTED),'x'.repeat(2*1024*1024+2)]
  };
  for(const [kind,chunks] of Object.entries(cases)){
    const ctl=controlled();
    const pending=rejection(readSearchStream(ctl.body));
    for(const chunk of chunks)ctl.push(chunk);
    const error=await pending;
    assert.equal(error?.kind,kind);
    assert.equal(ctl.state.cancelled,true,`${kind}: underlying source cancelled`);
    assert.equal(ctl.body.locked,false,`${kind}: lock released`);
  }
});

test('terminal error cancels the connection without waiting for more bytes',async()=>{
  const ctl=controlled();
  const pending=rejection(readSearchStream(ctl.body));
  ctl.push(lines(STARTED,ERROR('server_busy',503)));
  const error=await pending;
  assert.equal(error.kind,'remote');
  assert.equal(ctl.state.cancelled,true);
  assert.equal(ctl.body.locked,false);
});

test('abort during a slow read rejects as AbortError, cancels the source and drops the staged result',async()=>{
  const ctl=controlled(),abort=new AbortController();
  const pending=rejection(readSearchStream(ctl.body,{signal:abort.signal}));
  ctl.push(lines(STARTED,RESULT()));
  await delay(5);
  abort.abort();
  const error=await pending;
  assert.equal(error?.name,'AbortError');
  assert.equal(ctl.state.cancelled,true);
  assert.equal(ctl.body.locked,false);
  assert.equal(error instanceof SearchStreamError,false,'an abort is not a transport failure');
});

test('pre-aborted signal never starts reading; abort racing stream completion never yields a result',async()=>{
  const abort=new AbortController();abort.abort();
  const ctl=controlled();
  const error=await rejection(readSearchStream(ctl.body,{signal:abort.signal}));
  assert.equal(error?.name,'AbortError');
  assert.equal(ctl.state.cancelled,true);
  assert.equal(ctl.body.locked,false);

  const late=new AbortController();
  const body=new ReadableStream({start(controller){controller.enqueue(bytes(SUCCESS));queueMicrotask(()=>{late.abort();try{controller.close();}catch{/* already cancelled by the abort */}});}});
  const lateError=await rejection(readSearchStream(body,{signal:late.signal}));
  assert.equal(lateError?.name,'AbortError','abort racing completion is stale');
});

test('abort is reported at once even when the source takes forever to finish cancelling',{timeout:10000},async()=>{
  const abort=new AbortController();
  let cancelled=false;
  const stuck=()=>new ReadableStream({cancel(){cancelled=true;return new Promise(()=>{});}});
  abort.abort();
  const early=await Promise.race([rejection(readSearchStream(stuck(),{signal:abort.signal})),delay(500).then(()=>'hung')]);
  assert.equal(early?.name,'AbortError','pre-aborted signal');
  assert.equal(cancelled,true);
  const live=new AbortController(),body=stuck();
  const pending=rejection(readSearchStream(body,{signal:live.signal}));
  await delay(5);
  live.abort();
  const active=await Promise.race([pending,delay(500).then(()=>'hung')]);
  assert.equal(active?.name,'AbortError','abort during a pending read');
  assert.equal(body.locked,false);
});

test('abort listener is removed and a fetch-style abort error surfaces as AbortError',async()=>{
  const abort=new AbortController();
  let listeners=0;
  const signal=abort.signal,add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
  signal.addEventListener=(...args)=>{listeners++;return add(...args);};
  signal.removeEventListener=(...args)=>{listeners--;return remove(...args);};
  assert.deepEqual(await readSearchStream(readableOf([SUCCESS]),{signal}),ENVELOPE);
  assert.equal(listeners,0,'listener removed after success');
  const ctl=controlled();
  const pending=rejection(readSearchStream(ctl.body,{signal:new AbortController().signal}));
  ctl.fail(new DOMException('The operation was aborted.','AbortError'));
  assert.equal((await pending)?.name,'AbortError');
});
