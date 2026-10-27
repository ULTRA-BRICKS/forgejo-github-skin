/** NDJSON v1 transport for universal search: a bounded, strict parser and a cancellable reader.
 * Wire format (forgejo-search streaming v1, frozen): one UTF-8 JSON object per newline.
 *   started, heartbeat*, result {data: full successful envelope}, done   |   ... error {code,status} (terminal)
 * The successful envelope stays staged until `done` and a clean end of stream; any violation, cap breach,
 * invalid byte, or missing terminal is a failure, so a broken stream can never look like an empty success.
 * Pure module: no DOM, no network. The controller owns request identity and rendering.
 */
export const SEARCH_STREAM_ACCEPT='application/x-ndjson';
export const SEARCH_STREAM_LIMITS=Object.freeze({recordBytes:2*1024*1024,totalBytes:8*1024*1024,records:256});

const ERROR_CODES=new Set(['authentication_required','visibility_unavailable','code_visibility_unavailable','deadline_exceeded','search_unavailable','server_busy']);
const ERROR_STATUSES=new Set([401,503,504]);
const NEWLINE=10,CARRIAGE_RETURN=13;

/** kind: protocol | encoding | limit | interrupted | remote. Messages are static; no stream content is echoed. */
export class SearchStreamError extends Error{
  constructor(kind,message,{status,code}={}){
    super(message);
    this.name='SearchStreamError';
    this.kind=kind;
    if(status!==undefined)this.status=status;
    if(code!==undefined)this.code=code;
  }
}
const fail=(kind,message)=>{throw new SearchStreamError(kind,message);};
const abortError=()=>new DOMException('Search request was aborted','AbortError');

/** Dispatch on the SAME response: 'stream' (NDJSON), 'json' (legacy backend), or null (reject). */
export function searchResponseKind(response){
  const header=response?.headers?.get?.('content-type');
  if(typeof header!=='string')return null;
  const [media,...parameters]=header.split(';');
  const type=media.trim().toLowerCase();
  if(type==='application/json')return 'json';
  if(type!=='application/x-ndjson')return null;
  for(const parameter of parameters){
    const [name,...rest]=parameter.split('=');
    if(name.trim().toLowerCase()!=='charset')continue;
    if(rest.join('=').trim().replace(/^"(.*)"$/,'$1').toLowerCase()!=='utf-8')return null;
  }
  return 'stream';
}

/** The existing full successful envelope: an object carrying a results array. Shared by the stream result record
 * and the legacy JSON document, so neither transport can turn a malformed body into an empty success. */
export function isSearchEnvelope(data){
  return data!==null&&typeof data==='object'&&!Array.isArray(data)&&Array.isArray(data.results);
}

function hasExactKeys(record,keys){
  const own=Object.keys(record);
  return own.length===keys.length&&keys.every(key=>Object.hasOwn(record,key));
}

/** Validates one decoded record against the phase machine start -> open -> result -> closed. */
function accept(record,state){
  if(record===null||typeof record!=='object'||Array.isArray(record))fail('protocol','Search record is not an object');
  if(record.v!==1)fail('protocol','Unsupported search stream version');
  switch(record.type){
    case 'started':
      if(state.phase!=='start'||!hasExactKeys(record,['v','type']))fail('protocol','Unexpected started record');
      state.phase='open';
      return {type:'started'};
    case 'heartbeat':
      if(state.phase!=='open'||!hasExactKeys(record,['v','type']))fail('protocol','Unexpected heartbeat record');
      return {type:'heartbeat'};
    case 'result':{
      if(state.phase!=='open'||!hasExactKeys(record,['v','type','data']))fail('protocol','Unexpected result record');
      if(!isSearchEnvelope(record.data))fail('protocol','Malformed search result envelope');
      state.phase='result';
      return {type:'result',data:record.data};
    }
    case 'done':
      if(state.phase!=='result'||!hasExactKeys(record,['v','type']))fail('protocol','Unexpected done record');
      state.phase='closed';
      state.terminal='done';
      return {type:'done'};
    case 'error':
      if((state.phase!=='open'&&state.phase!=='result')||!hasExactKeys(record,['v','type','code','status'])||
        !ERROR_CODES.has(record.code)||!ERROR_STATUSES.has(record.status))fail('protocol','Unexpected error record');
      state.phase='closed';
      state.terminal='error';
      return {type:'error',code:record.code,status:record.status};
    default:
      fail('protocol','Unknown search record type');
  }
}

/** Incremental parser. push(bytes) returns the validated records completed by those bytes and throws
 * SearchStreamError on the first violation; finish() must be called at end of stream. Only the unfinished line is
 * ever buffered, in one geometrically grown byte buffer capped at recordBytes plus one possible carriage return,
 * so a record delivered in many tiny chunks costs neither per-chunk objects nor repeated copying. */
export function createSearchStreamParser(limits=SEARCH_STREAM_LIMITS){
  const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
  const state={phase:'start',terminal:null};
  const ceiling=limits.recordBytes+1;
  let buffer=new Uint8Array(0),buffered=0,total=0,records=0;

  function append(part){
    const needed=buffered+part.length;
    if(needed>ceiling)fail('limit','Search record is too large');
    if(needed>buffer.length){
      const grown=new Uint8Array(Math.min(Math.max(needed,buffer.length*2,1024),ceiling));
      grown.set(buffer.subarray(0,buffered));
      buffer=grown;
    }
    buffer.set(part,buffered);
    buffered=needed;
  }
  function complete(bytes){
    if(bytes.length&&bytes[bytes.length-1]===CARRIAGE_RETURN)bytes=bytes.subarray(0,bytes.length-1);
    if(bytes.length>limits.recordBytes)fail('limit','Search record is too large');
    if(++records>limits.records)fail('limit','Search stream has too many records');
    let text;
    try{text=decoder.decode(bytes);}
    catch{fail('encoding','Search stream is not valid UTF-8');}
    let record;
    try{record=JSON.parse(text);}
    catch{fail('protocol','Search record is not valid JSON');}
    return accept(record,state);
  }

  return {
    get terminal(){return state.terminal;},
    push(chunk){
      total+=chunk.length;
      if(total>limits.totalBytes)fail('limit','Search stream is too large');
      const events=[];
      let start=0;
      while(start<chunk.length){
        if(state.terminal!==null)fail('protocol','Data after the terminal search record');
        const newline=chunk.indexOf(NEWLINE,start);
        const segment=chunk.subarray(start,newline<0?chunk.length:newline);
        if(newline<0){
          append(segment);
          if(buffered>limits.recordBytes&&buffer[buffered-1]!==CARRIAGE_RETURN)fail('limit','Search record is too large');
          break;
        }
        let bytes=segment;
        if(buffered>0){append(segment);bytes=buffer.subarray(0,buffered);}
        else if(segment.length>ceiling)fail('limit','Search record is too large');
        const event=complete(bytes);
        buffered=0;
        if(buffer.length>64*1024)buffer=new Uint8Array(0);
        events.push(event);
        start=newline+1;
      }
      return events;
    },
    finish(){
      if(buffered>0||state.terminal===null)fail('interrupted','Search stream ended before its terminal record');
    }
  };
}

/** Reads a streaming search response body to its terminal record. Resolves with the staged result envelope only
 * after `done` and a clean end of stream. Rejects with SearchStreamError, or AbortError when `signal` aborts at any
 * point (pending read, decode, or after completion). The body is always cancelled on failure and the reader
 * released on every path. onStarted fires once, as soon as `started` arrives; heartbeats are consumed silently. */
export async function readSearchStream(body,{signal,onStarted,limits=SEARCH_STREAM_LIMITS}={}){
  if(signal?.aborted){
    // Cancellation closes the stream synchronously; slow source cleanup must not delay reporting the abort.
    try{body?.cancel?.()?.catch?.(()=>{});}catch{/* locked or already unusable */}
    throw abortError();
  }
  if(!body||typeof body.getReader!=='function')fail('interrupted','Search response has no body');
  const reader=body.getReader();
  const parser=createSearchStreamParser(limits);
  const cancel=()=>{reader.cancel().catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  let staged=null,finished=false;
  try{
    while(true){
      let step;
      try{step=await reader.read();}
      catch(error){
        if(signal?.aborted||error?.name==='AbortError')throw signal?.aborted?abortError():error;
        finished=true;
        fail('interrupted','Search stream was interrupted');
      }
      if(signal?.aborted)throw abortError();
      if(step.done){finished=true;break;}
      if(!(step.value instanceof Uint8Array))fail('protocol','Search stream chunk is not binary');
      for(const event of parser.push(step.value)){
        if(event.type==='started')onStarted?.();
        else if(event.type==='result')staged=event.data;
        else if(event.type==='error')throw new SearchStreamError('remote','Search service reported an error',{code:event.code,status:event.status});
      }
    }
    parser.finish();
    if(signal?.aborted)throw abortError();
    return staged;
  }catch(error){
    if(!finished)cancel();
    throw error;
  }finally{
    signal?.removeEventListener('abort',cancel);
    reader.releaseLock();
  }
}
