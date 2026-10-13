/** Production search consumer against a real chunked HTTP server (Chromium and WebKit fetch streaming).
 * Covers NDJSON v1 negotiation, staged result, JSON compatibility, fail-closed errors, cancellation, retry,
 * native mounted fallback and the 320/440/1280 light/dark layout of every transport state.
 * Transport timing here is the harness's, not a proxy's: no first-byte claim about production ingress.
 */
import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {startSearchServer,started,heartbeat,done,result,failure,ndjson,STREAM_TYPE,TEXT} from './stream-harness.mjs';

const fixtures=JSON.parse(await fs.readFile(new URL('../../stories/search-coverage-fixtures.json',import.meta.url),'utf8'));
const unicodeEnvelope={
  ...structuredClone(fixtures.enabled),
  results:[{...fixtures.enabled.results[0],path:'src/файл.mjs',snippet:'ключ <mark>🔎</mark> 𝒳'}]
};
const twoHits={...structuredClone(fixtures.enabled),results:[fixtures.enabled.results[0],{...fixtures.enabled.results[0],path:'src/second.js',line:2}]};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let server;
test.beforeAll(async()=>{server=await startSearchServer();});
test.afterAll(async()=>{await server.close();});
test.beforeEach(()=>server.reset());

const dialog=page=>page.locator('#hgh-universal-search');
const input=page=>dialog(page).locator('input[type="search"]');
const status=page=>dialog(page).locator('.hgh-search-status');
const options=page=>dialog(page).getByRole('option');
async function boot(page,{theme='light',width=440,lang='en',path='/acme/project'}={}){
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.setViewportSize({width,height:900});
  await page.goto(`${server.origin}${path}?theme=${theme}&lang=${lang}`);
  await page.evaluate(async()=>{
    window.search=await import('/src/universal-search.mjs');
    window.search.enhanceUniversalSearch(document);
  });
  await expect.poll(()=>server.probes.length).toBe(1);
  return errors;
}
async function open(page){await page.locator('.hgh-global-search-trigger:visible').click();await expect(input(page)).toBeFocused();}
async function search(page,text='needle',index=0){
  await input(page).fill(text);
  await expect.poll(()=>server.searches.length).toBeGreaterThan(index);
  return server.searches[index];
}
const begin=async(page,text,index=0)=>{const entry=await search(page,text,index);entry.start().write(ndjson(started));return entry;};
const state=page=>dialog(page).getAttribute('data-hgh-search-state');

test('asks for NDJSON explicitly, keeps the empty readiness probe plain JSON and sends one request per query',async({page})=>{
  const errors=await boot(page);
  expect(server.probes[0].accept).toBe('application/json');
  await open(page);
  const entry=await search(page);
  expect(entry.accept).toBe('application/x-ndjson');
  expect(entry.q).toBe('repo:acme/project needle');
  expect(new URL(entry.url,server.origin).searchParams.get('limit')).toBe('30');
  entry.start().write(ndjson(started,result(fixtures.enabled),done));entry.end();
  await expect(options(page)).toHaveCount(fixtures.enabled.results.length);
  await sleep(250);
  expect(server.searches).toHaveLength(1);
  expect(server.probes).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('started and heartbeats show loading only; the result stays staged until done, across arbitrary chunking',async({page})=>{
  const errors=await boot(page);
  await open(page);
  const entry=await search(page);
  await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','loading');
  entry.start();
  await sleep(60);
  expect(await state(page)).toBe('loading');
  entry.write(ndjson(started));
  await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','streaming');
  await expect(status(page)).toHaveText(TEXT.searching);
  await expect(dialog(page).locator('.hgh-search-results')).toHaveAttribute('aria-busy','true');
  await expect(options(page)).toHaveCount(0);
  await page.evaluate(()=>{window.mutations=0;new MutationObserver(records=>{window.mutations+=records.length;}).observe(document.querySelector('#hgh-universal-search'),{subtree:true,childList:true,attributes:true,characterData:true});});
  for(let i=0;i<4;i++){entry.write(ndjson(heartbeat));await sleep(70);}
  expect(await page.evaluate(()=>window.mutations),'heartbeats do not touch the DOM').toBe(0);
  const line=Buffer.from(ndjson(result(unicodeEnvelope)));
  const emoji=line.indexOf(Buffer.from('🔎'));
  const cuts=[9,emoji+2,emoji+5,line.length-9];
  let previous=0;
  for(const cut of [...cuts,line.length]){entry.write(line.subarray(previous,cut));previous=cut;await sleep(40);}
  await sleep(150);
  await expect(options(page)).toHaveCount(0);
  await expect(dialog(page)).not.toContainText('файл');
  expect(await state(page)).toBe('streaming');
  entry.write(ndjson(done));entry.end();
  await expect(options(page)).toHaveCount(1);
  await expect(options(page).first()).toContainText('src/файл.mjs');
  await expect(options(page).first()).toContainText('ключ 🔎 𝒳');
  await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','done');
  await expect(dialog(page).locator('.hgh-search-results')).not.toHaveAttribute('aria-busy','true');
  await expect(dialog(page).locator('.hgh-search-coverage summary')).toHaveText('Search details');
  expect(errors).toEqual([]);
});

test('captured coverage envelopes survive the stream unchanged',async({page})=>{
  await boot(page);
  await open(page);
  for(const [index,name] of ['enabled','unavailable','truncated','denied'].entries()){
    const payload=fixtures[name];
    const entry=await search(page,`${name} ${index}`,index);
    entry.start().write(ndjson(started,heartbeat,result(payload),done));entry.end();
    await expect(options(page)).toHaveCount(payload.results.length);
    await expect(status(page)).toContainText(`${payload.total_ms} ms total`);
    await expect(dialog(page).locator('.hgh-search-partial')).toHaveCount(['enabled','truncated'].includes(name)?1:0);
  }
});

test('an older JSON backend is read from the same response with no second request',async({page})=>{
  const errors=await boot(page);
  await open(page);
  for(const [index,type] of ['application/json','application/json; charset=utf-8'].entries()){
    const entry=await search(page,`legacy ${index}`,index);
    expect(entry.accept).toBe('application/x-ndjson');
    entry.json(fixtures.enabled,200,type);
    await expect(options(page)).toHaveCount(fixtures.enabled.results.length);
    await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','done');
    await expect(status(page)).toContainText('AST');
  }
  await sleep(250);
  expect(server.searches).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('a malformed legacy JSON body fails closed instead of reading as an empty success',async({page})=>{
  const errors=await boot(page);
  await open(page);
  const bodies=[null,[],{},'ok',{query:'x'},{results:{}},{results:null}];
  for(const [index,body] of bodies.entries()){
    const entry=await search(page,`malformed ${index}`,index);
    entry.json(body);
    await expect(status(page)).toContainText(TEXT.unavailable);
    await expect(dialog(page).locator('.hgh-search-empty')).toHaveCount(0);
    await expect(options(page)).toHaveCount(0);
    await expect(dialog(page).getByRole('button',{name:'Retry'})).toBeVisible();
    await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','error');
    await expect(page.locator('html')).not.toHaveAttribute('data-hgh-search-ready','true');
  }
  await sleep(200);
  expect(server.searches).toHaveLength(bodies.length);
  expect(errors).toEqual([]);
});

test('unsupported Content-Type fails closed with a retry state and never replays automatically',async({page})=>{
  await boot(page);
  await open(page);
  for(const [index,type] of ['text/html','text/plain','application/octet-stream','application/x-ndjson; charset=iso-8859-1'].entries()){
    const entry=await search(page,`bad type ${index}`,index);
    entry.start(type).write(ndjson(started,result(fixtures.enabled),done));entry.end();
    await expect(status(page)).toContainText(TEXT.unavailable);
    await expect(options(page)).toHaveCount(0);
    await expect(dialog(page).locator('.hgh-search-coverage')).toBeHidden();
    await expect(dialog(page).getByRole('button',{name:'Retry'})).toBeVisible();
    await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','error');
  }
  await sleep(250);
  expect(server.searches).toHaveLength(4);
});

test('HTTP 401 and 503 before a stream opens keep their existing UI',async({page})=>{
  await boot(page);
  await open(page);
  await (await search(page,'one',0)).json({},401);
  await expect(status(page)).toHaveText(TEXT.signIn);
  await expect(page.locator('html')).not.toHaveAttribute('data-hgh-search-ready','true');
  await expect(dialog(page).getByRole('button',{name:'Retry'})).toHaveCount(0);
  await (await search(page,'two',1)).json({error:'busy'},503);
  await expect(status(page)).toContainText(TEXT.unavailable);
  await expect(dialog(page).getByRole('button',{name:'Retry'})).toBeVisible();
});

for(const [name,code,statusCode,auth] of [
  ['authentication_required','authentication_required',401,true],
  ['visibility_unavailable','visibility_unavailable',503,false],
  ['code_visibility_unavailable','code_visibility_unavailable',503,false],
  ['deadline_exceeded','deadline_exceeded',504,false],
  ['search_unavailable','search_unavailable',503,false],
  ['server_busy','server_busy',503,false]
])test(`terminal ${name} after a withheld result clears everything and maps to ${auth?'sign-in':'retry'}`,async({page})=>{
  await boot(page);
  await open(page);
  const entry=await search(page);
  entry.start().write(ndjson(started,heartbeat,result(fixtures.enabled),failure(code,statusCode)));
  await expect(status(page)).toHaveText(auth?TEXT.signIn:new RegExp(TEXT.unavailable.replaceAll('.','\\.')));
  await expect(options(page)).toHaveCount(0);
  await expect(dialog(page).locator('.hgh-search-coverage')).toBeHidden();
  await expect(dialog(page).locator('.hgh-search-partial')).toHaveCount(0);
  await expect(dialog(page).getByRole('button',{name:'Retry'})).toHaveCount(auth?0:1);
  await expect(page.locator('html')).not.toHaveAttribute('data-hgh-search-ready','true');
  await expect.poll(()=>entry.closed,{message:'client releases the connection after a terminal error'}).toBe(true);
});

const broken={
  'connection dropped after result':entry=>entry.start().write(ndjson(started,result(fixtures.enabled))).drop(),
  'EOF after result without done':entry=>entry.start().write(ndjson(started,result(fixtures.enabled))).end(),
  'EOF with no terminal':entry=>entry.start().write(ndjson(started,heartbeat)).end(),
  'empty body':entry=>entry.start().end(),
  'duplicate result':entry=>entry.start().write(ndjson(started,result(fixtures.enabled),result(fixtures.enabled),done)),
  'done before result':entry=>entry.start().write(ndjson(started,done)),
  'result before started':entry=>entry.start().write(ndjson(result(fixtures.enabled),done)),
  'unknown version':entry=>entry.start().write(ndjson({v:2,type:'started'},result(fixtures.enabled),done)),
  'unknown record type':entry=>entry.start().write(ndjson(started,{v:1,type:'hits',data:[]},result(fixtures.enabled),done)),
  'invalid UTF-8':entry=>entry.start().write(Buffer.concat([Buffer.from(ndjson(started)),Buffer.from('{"v":1,"type":"result","data":{"results":[],"x":"'),Buffer.from([0xff]),Buffer.from('"}}\n'+ndjson(done))])),
  'bad envelope':entry=>entry.start().write(ndjson(started,{v:1,type:'result',data:{}},done)),
  'oversized record':entry=>entry.start().write(ndjson(started)+'x'.repeat(2*1024*1024+16))
};
for(const [name,send] of Object.entries(broken))test(`broken stream fails closed: ${name}`,async({page})=>{
  const errors=await boot(page);
  await open(page);
  const entry=await search(page);
  send(entry);
  await expect(status(page)).toContainText(TEXT.unavailable);
  await expect(options(page)).toHaveCount(0);
  await expect(dialog(page).locator('.hgh-search-coverage')).toBeHidden();
  await expect(dialog(page).locator('.hgh-search-empty')).toHaveCount(0);
  await expect(dialog(page).getByRole('button',{name:'Retry'})).toBeVisible();
  await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','error');
  await expect.poll(()=>entry.closed).toBe(true);
  await sleep(150);
  expect(server.searches,'a failed stream is never replayed automatically').toHaveLength(1);
  expect(errors).toEqual([]);
});

test('a new query aborts the previous request at the network and only the newest result renders',async({page})=>{
  const errors=await boot(page);
  await open(page);
  const first=await begin(page,'first');
  first.write(ndjson(heartbeat));
  await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','streaming');
  const second=await search(page,'second',1);
  await expect.poll(()=>first.closed,{message:'superseded request is cancelled'}).toBe(true);
  expect(first.finished).toBe(false);
  await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','loading');
  await expect(options(page)).toHaveCount(0);
  second.start().write(ndjson(started,result(unicodeEnvelope),done));second.end();
  await expect(options(page)).toHaveCount(1);
  await expect(status(page)).toContainText(unicodeEnvelope.inferred.toUpperCase());
  await sleep(200);
  await expect(options(page)).toHaveCount(1);
  expect(server.searches).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('closing the dialog cancels the stream, clears results and returns focus to the trigger',async({page})=>{
  const errors=await boot(page);
  await open(page);
  const entry=await begin(page,'needle');
  entry.write(ndjson(heartbeat));
  await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','streaming');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect.poll(()=>entry.closed).toBe(true);
  expect(entry.finished).toBe(false);
  await expect(page.locator('.hgh-global-search-trigger:visible')).toBeFocused();
  await open(page);
  await expect(options(page)).toHaveCount(0);
  await expect(status(page)).toHaveText('');
  expect(errors).toEqual([]);
});

test('tearing the enhancer down mid-stream cancels the request and restores the native search',async({page})=>{
  const errors=await boot(page);
  await expect(page.locator('.code-search input')).toBeHidden();
  await open(page);
  const entry=await begin(page,'needle');
  await page.evaluate(()=>window.search.restoreUniversalSearch(document));
  await expect.poll(()=>entry.closed).toBe(true);
  await expect(page.locator('#hgh-universal-search')).toHaveCount(0);
  await expect(page.locator('.code-search input')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-hgh-search-mounted','true');
  expect(errors).toEqual([]);
});

test('manual Retry issues exactly one new request, restores focus and can succeed',async({page})=>{
  await boot(page);
  await open(page);
  const failed=await search(page);
  failed.start().write(ndjson(started,failure('deadline_exceeded',504)));
  const retry=dialog(page).getByRole('button',{name:'Retry'});
  await expect(retry).toBeVisible();
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect.poll(()=>server.searches.length).toBe(2);
  await expect(input(page)).toBeFocused();
  await expect(status(page)).toHaveText(TEXT.searching);
  await expect(retry).toHaveCount(0);
  const second=server.searches[1];
  expect(second.q).toBe(failed.q);
  second.start().write(ndjson(started,result(fixtures.enabled),done));second.end();
  await expect(options(page)).toHaveCount(fixtures.enabled.results.length);
  await sleep(200);
  expect(server.searches).toHaveLength(2);
});

test('keyboard focus stays in the field through loading, failure and success; Enter follows the selected hit',async({page})=>{
  await boot(page);
  await open(page);
  const entry=await begin(page,'needle');
  await expect(input(page)).toBeFocused();
  entry.write(ndjson(heartbeat,result(twoHits),done));entry.end();
  await expect(options(page)).toHaveCount(2);
  await expect(input(page)).toBeFocused();
  await input(page).press('ArrowDown');
  await expect(options(page).nth(1)).toHaveAttribute('aria-selected','true');
  await input(page).press('ArrowUp');
  await expect(options(page).first()).toHaveAttribute('aria-selected','true');
  await Promise.all([page.waitForURL(/\/src\/(branch|commit)\//),input(page).press('Enter')]);
});

test('native mounted fallback: stream auth failure keeps the header search as the only mounted search',async({page})=>{
  const errors=await boot(page);
  await expect(page.locator('html')).toHaveAttribute('data-hgh-search-mounted','true');
  await expect(page.locator('.code-search input')).toBeHidden();
  await expect(page.locator('.hgh-global-search-trigger:visible')).toHaveCount(1);
  await open(page);
  const entry=await search(page);
  entry.start().write(ndjson(started,failure('authentication_required',401)));
  await expect(status(page)).toHaveText(TEXT.signIn);
  await expect(page.locator('html')).not.toHaveAttribute('data-hgh-search-ready','true');
  await expect(page.locator('html')).toHaveAttribute('data-hgh-search-mounted','true');
  await expect(page.locator('.code-search input')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.hgh-global-search-trigger:visible')).toBeFocused();
  expect(errors).toEqual([]);
});

test('Russian transport copy mirrors the English states',async({page})=>{
  await boot(page,{lang:'ru'});
  await open(page);
  const entry=await search(page);
  entry.start().write(ndjson(started,failure()));
  await expect(status(page)).toContainText('Поиск временно недоступен');
  await expect(dialog(page).getByRole('button',{name:'Повторить'})).toBeVisible();
});

// Superseded work that ignores AbortSignal (fetch, stream or JSON decode finishing late) must only ever be discarded.
async function bootControlled(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.setViewportSize({width:440,height:900});
  await page.goto(`${server.origin}/acme/project?theme=light`);
  await page.evaluate(async()=>{
    const search=await import('/src/universal-search.mjs');
    const encoder=new TextEncoder();
    window.pending=[];
    window.send=(index,text)=>pending[index].controller.enqueue(encoder.encode(text));
    window.respond=(index,type)=>pending[index].resolve(new Response(pending[index].body,{headers:{'Content-Type':type}}));
    search.enhanceUniversalSearch(document,{fetchImpl:url=>{
      if(!new URL(url,location.href).searchParams.get('q'))return Promise.resolve(new Response('{}',{headers:{'Content-Type':'application/json'}}));
      return new Promise(resolve=>{
        const entry={url,resolve,cancelled:false};
        entry.body=new ReadableStream({start(controller){entry.controller=controller;},cancel(){entry.cancelled=true;}});
        pending.push(entry);
      });
    }});
  });
  await page.locator('.hgh-global-search-trigger:visible').click();
  await expect(input(page)).toBeFocused();
  return errors;
}
const queued=(page,count)=>expect.poll(()=>page.evaluate(()=>pending.length)).toBe(count);
const cancelled=(page,index)=>expect.poll(()=>page.evaluate(i=>pending[i].cancelled,index));
const feedStale=(page,index,type,text,close=true)=>page.evaluate(({index,type,text,close})=>{respond(index,type);send(index,text);if(close)pending[index].controller.close();},{index,type,text,close});

test('a response that arrives after a newer query began is discarded and its body cancelled',async({page})=>{
  const errors=await bootControlled(page);
  await input(page).fill('one');await queued(page,1);
  await input(page).fill('two');await queued(page,2);
  await page.evaluate(()=>respond(0,'application/x-ndjson'));
  await (await cancelled(page,0)).toBe(true);
  await expect(status(page)).toHaveText(TEXT.searching);
  await expect(options(page)).toHaveCount(0);
  await feedStale(page,1,'application/x-ndjson',ndjson(started,result(unicodeEnvelope),done));
  await expect(options(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a stream that ignores abort cannot overwrite the newer query; its reader is cancelled',async({page})=>{
  const errors=await bootControlled(page);
  await input(page).fill('one');await queued(page,1);
  await page.evaluate(()=>{respond(0,'application/x-ndjson');send(0,JSON.stringify({v:1,type:'started'})+'\n');});
  await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','streaming');
  await input(page).fill('two');await queued(page,2);
  await (await cancelled(page,0)).toBe(true);
  await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','loading');
  expect(await page.evaluate(()=>{try{send(0,'{"v":1,"type":"heartbeat"}\n');return 'accepted';}catch{return 'closed';}}),'old stream no longer accepts data').toBe('closed');
  await feedStale(page,1,'application/x-ndjson',ndjson(started,result(fixtures.enabled),done));
  await expect(options(page)).toHaveCount(fixtures.enabled.results.length);
  await sleep(150);
  await expect(options(page)).toHaveCount(fixtures.enabled.results.length);
  expect(errors).toEqual([]);
});

test('JSON that finishes decoding after a newer query is ignored (stale decode)',async({page})=>{
  const errors=await bootControlled(page);
  await input(page).fill('one');await queued(page,1);
  await page.evaluate(({text})=>{respond(0,'application/json');send(0,text);},{text:JSON.stringify(fixtures.truncated)});
  await input(page).fill('two');await queued(page,2);
  await page.evaluate(()=>pending[0].controller.close());
  await sleep(200);
  await expect(options(page)).toHaveCount(0);
  await expect(status(page)).toHaveText(TEXT.searching);
  await feedStale(page,1,'application/json',JSON.stringify(unicodeEnvelope));
  await expect(options(page)).toHaveCount(1);
  await expect(options(page).first()).toContainText('src/файл.mjs');
  expect(errors).toEqual([]);
});

test('a failure of superseded work cannot replace the current state',async({page})=>{
  const errors=await bootControlled(page);
  await input(page).fill('one');await queued(page,1);
  await page.evaluate(()=>{respond(0,'application/x-ndjson');send(0,'{"v":1,"type":"started"}\n');});
  await input(page).fill('two');await queued(page,2);
  await page.evaluate(()=>{try{pending[0].controller.error(new TypeError('network error'));}catch{/* already cancelled */}});
  await sleep(150);
  await expect(status(page)).toHaveText(TEXT.searching);
  await expect(dialog(page).getByRole('button',{name:'Retry'})).toHaveCount(0);
  await feedStale(page,1,'application/x-ndjson',ndjson(started,result(fixtures.enabled),done));
  await expect(options(page)).toHaveCount(fixtures.enabled.results.length);
  expect(errors).toEqual([]);
});

test('closing the dialog while the fetch is pending discards the late response body',async({page})=>{
  const errors=await bootControlled(page);
  await input(page).fill('one');await queued(page,1);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await page.evaluate(()=>respond(0,'application/x-ndjson'));
  await (await cancelled(page,0)).toBe(true);
  await page.evaluate(()=>{try{send(0,'{"v":1,"type":"started"}\n');}catch{/* cancelled */}});
  await sleep(100);
  await expect(dialog(page).locator('[role="option"]')).toHaveCount(0);
  await expect(dialog(page)).not.toHaveAttribute('data-hgh-search-state',/.+/);
  expect(errors).toEqual([]);
});

for(const width of [320,440,1280])for(const theme of ['light','dark'])for(const kind of ['loading','error','result'])
  test(`transport state ${kind} at ${width}px ${theme}: no overflow, readable, keyboard reachable`,async({page},testInfo)=>{
    const errors=await boot(page,{theme,width});
    await open(page);
    const entry=await search(page,'ast:needle($A)');
    if(kind==='loading')entry.start().write(ndjson(started,heartbeat));
    if(kind==='error')entry.start().write(ndjson(started,failure('server_busy',503)));
    if(kind==='result')entry.start().write(ndjson(started,result(fixtures.truncated),done)).end();
    if(kind==='loading')await expect(dialog(page)).toHaveAttribute('data-hgh-search-state','streaming');
    if(kind==='error')await expect(dialog(page).getByRole('button',{name:'Retry'})).toBeVisible();
    if(kind==='result'){
      await expect(options(page)).toHaveCount(fixtures.truncated.results.length);
      await dialog(page).locator('.hgh-search-coverage summary').click();
    }
    await expect(dialog(page)).toHaveCSS('background-color',theme==='dark'?'rgb(13, 17, 23)':'rgb(255, 255, 255)');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    expect(await dialog(page).evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
    const box=await dialog(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(width+1);
    if(kind==='error'){
      const retry=dialog(page).getByRole('button',{name:'Retry'});
      await retry.focus();
      await expect(retry).toBeFocused();
      const retryBox=await retry.boundingBox();
      expect(retryBox.x+retryBox.width).toBeLessThanOrEqual(box.x+box.width+1);
    }
    await dialog(page).screenshot({path:testInfo.outputPath(`stream-${kind}-${width}-${theme}.png`)});
    await testInfo.attach(`stream-${kind}-${width}-${theme}`,{path:testInfo.outputPath(`stream-${kind}-${width}-${theme}.png`),contentType:'image/png'});
    expect(errors).toEqual([]);
    entry.drop();
  });

for(const [queryStatus,probeStatus] of [[401,200],[503,200],[200,503]]){
  test(`late readiness ${probeStatus} cannot overwrite interactive status ${queryStatus}`,async({page})=>{
    await page.goto(`${server.origin}/acme/project`);
    await page.evaluate(async()=>{
      window.search=await import('/src/universal-search.mjs');
      const nativeFetch=window.fetch.bind(window);
      window.search.enhanceUniversalSearch(document,{fetchImpl:(url,options)=>{
        if(new URL(url,location.href).searchParams.get('q')==='')return new Promise(resolve=>{
          window.finishReadiness=(status)=>resolve(new Response(JSON.stringify({results:[]}),{status,headers:{'Content-Type':'application/json'}}));
        });
        return nativeFetch(url,options);
      }});
    });
    await open(page);
    const entry=await begin(page,'needle');
    if(queryStatus===200)entry.write(ndjson(result(fixtures.enabled),done));
    else entry.write(ndjson(failure(queryStatus===401?'authentication_required':'visibility_unavailable',queryStatus)));
    entry.end();
    await expect(dialog(page)).toHaveAttribute('data-hgh-search-state',queryStatus===200?'done':'error');
    await page.evaluate(status=>window.finishReadiness(status),probeStatus);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    if(queryStatus===200)await expect(page.locator('html')).toHaveAttribute('data-hgh-search-ready','true');
    else await expect(page.locator('html')).not.toHaveAttribute('data-hgh-search-ready','true');
    await expect(dialog(page)).toHaveAttribute('data-hgh-search-state',queryStatus===200?'done':'error');
  });
}
