/** Exercises the production search consumer with captured disposable-backend responses.
 * Transport is controlled so obsolete responses can arrive even after cancellation.
 */
import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

const root=new URL('../../',import.meta.url);
const fixtures=JSON.parse(await fs.readFile(new URL('stories/search-coverage-fixtures.json',root),'utf8'));
const clone=value=>structuredClone(value);
async function prepare(page,{theme='light',width=440}={}){
  await page.setViewportSize({width,height:900});
  await page.route('http://coverage.test/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.startsWith('/src/'))return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:await fs.readFile(new URL(path.slice(1),root),'utf8')});
    if(path.startsWith('/assets/css/theme-forgejo-'))return route.fulfill({contentType:'text/css',body:''});
    if(path.startsWith('/assets/'))return route.fulfill({contentType:'text/css',body:await fs.readFile(new URL('dist/public'+path,root),'utf8')});
    return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en" data-theme="hypergithub-${theme}"><head><link rel="stylesheet" href="/assets/css/theme-hypergithub-${theme}.css"><link rel="stylesheet" href="/src/universal-search.css"></head><body><nav id="navbar"><div class="navbar-left"><div class="navbar-mobile-right"></div></div><div class="navbar-right"></div></nav><main>Search contract fixture</main></body></html>`});
  });
  await page.goto('http://coverage.test/');
  await page.evaluate(async()=>{
    const search=await import('/src/universal-search.mjs');
    window.pending=[];
    window.search=search;
    search.enhanceUniversalSearch(document,{fetchImpl:url=>{
      if(!new URL(url,location.href).searchParams.get('q'))return Promise.resolve(new Response('{}'));
      return new Promise(resolve=>pending.push({url,resolve}));
    }});
    document.querySelector('.hgh-global-search-trigger').click();
  });
}
const input=page=>page.locator('#hgh-universal-search input');
const details=page=>page.locator('.hgh-search-coverage details');
const options=page=>page.getByRole('option');
async function query(page,value='ast:needle($A)'){
  await input(page).fill(value);
  await expect.poll(()=>page.evaluate(()=>pending.length)).toBeGreaterThan(0);
}
async function respond(page,payload,{status=200,index=0}={}){
  await page.evaluate(({payload,status,index})=>{
    pending.splice(index,1)[0].resolve(new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}}));
  },{payload,status,index});
}
async function show(page,payload){await query(page);await respond(page,payload);}

for(const [name,payload] of Object.entries(fixtures)){
  test(`captured ${name} coverage keeps results and exposes bounded scope`,async({page})=>{
    await prepare(page);await show(page,payload);
    await expect(options(page)).toHaveCount(payload.results.length);
    await expect(details(page).locator('summary')).toHaveText('Search details');
    await details(page).locator('summary').click();
    await expect(details(page)).toContainText('authorized, indexed default branches');
    await expect(details(page)).toContainText('not exhaustive');
    await expect(page.getByRole('status')).toContainText(`${payload.total_ms} ms total`);
    await expect(page.locator('.hgh-search-partial')).toHaveCount(['enabled','truncated'].includes(name)?1:0);
  });
}
for(const status of ['ran','not_requested','no_candidates','unavailable','timeout','failed']){
  test(`engine ${status} is explicit without completeness or availability guesses`,async({page})=>{
    const payload=clone(status==='no_candidates'?fixtures.denied:fixtures.unavailable);
    payload.coverage.ast.status=status;
    await prepare(page);await show(page,payload);
    await details(page).locator('summary').click();
    const outcome=details(page).locator('.hgh-search-engine');
    const expected={ran:/Structural refinement ran/,not_requested:/Structural refinement was not requested/,no_candidates:/No eligible candidates.*availability was not checked/,unavailable:/Structural refinement is unavailable/,timeout:/Structural refinement timed out/,failed:/Structural refinement failed/};
    await expect(outcome).toHaveText(expected[status]);
    if(['unavailable','timeout','failed'].includes(status)){
      await expect(outcome).toContainText('fallback matches');
      await query(page,'ast:missing($A)');
      payload.results=[];
      await respond(page,payload);
      await details(page).locator('summary').click();
      await expect(outcome).toContainText('No fallback matches');
      await expect(outcome).toContainText('not an exhaustive no-match result');
    }
    await expect(page.locator('.hgh-search-partial')).toHaveCount(0);
  });
}
for(const state of ['complete','truncated','unknown']){
  test(`stage ${state} describes its bound independently of hit count`,async({page})=>{
    const payload=clone(fixtures.denied);
    payload.coverage.limits.lexical_candidates.state=state;
    await prepare(page);await show(page,payload);
    await details(page).locator('summary').click();
    await expect(details(page).locator('li')).toHaveCount(3);
    await expect(details(page)).not.toContainText('Repository hits');
    await expect(details(page)).toContainText('Lexical candidates');
    await expect(details(page)).toContainText('40');
    await expect(details(page)).toContainText({complete:'Within limit',truncated:'Limit reached; more candidates exist',unknown:'Coverage unknown'}[state]);
    await expect(page.locator('.hgh-search-partial')).toHaveCount(state==='complete'?0:1);
  });
}
test('missing unsupported and malformed coverage cannot break older results or render unsafe fields',async({page})=>{
  await prepare(page);
  const variants=[undefined,null,[],{}, {...fixtures.enabled.coverage,version:2},{...fixtures.enabled.coverage,version:'1'}];
  for(const alter of [c=>c.ast.status='<img src=x onerror=alert(1)>',c=>c.scope='private/path',c=>c.semantics.references='semantic',c=>c.limits.results.limit='30',c=>c.limits.results.limit=-1,c=>c.limits.results.limit=1.2,c=>c.limits.repository_hits.limit=13,c=>c.limits.lexical_candidates.limit=39,c=>c.limits.ast_files.limit=21,c=>c.limits.results.state='exhaustive',c=>delete c.limits.file_hits]){
    const coverage=clone(fixtures.enabled.coverage);alter(coverage);variants.push(coverage);
  }
  for(let i=0;i<variants.length;i++){
    await query(page,'needle '+i);await respond(page,{...fixtures.enabled,coverage:variants[i]});
    await expect(options(page)).toHaveCount(1);
    await expect(page.locator('.hgh-search-coverage')).toBeHidden();
    await expect(page.locator('#hgh-universal-search img, #hgh-universal-search script')).toHaveCount(0);
    await expect(page.locator('#hgh-universal-search')).not.toContainText('private/path');
  }
});
test('reference and definition searches disclose lexical and pattern-based semantics',async({page})=>{
  await prepare(page);
  for(const [mode,qualifier,explanation] of [['reference','ref:needle','References are lexical'],['symbol','def:needle','Definitions are pattern-based']]){
    await query(page,qualifier);await respond(page,{...fixtures.enabled,mode,inferred:mode});
    await details(page).locator('summary').click();
    await expect(details(page)).toContainText(explanation);
    await expect(details(page)).toContainText('not semantic');
  }
});
test('empty query and authentication/backend errors clear prior matches and coverage',async({page})=>{
  await prepare(page);
  for(const status of [401,503]){
    await show(page,fixtures.enabled);await expect(options(page)).toHaveCount(1);
    await query(page,'next '+status);
    await expect(options(page)).toHaveCount(0);
    await expect(page.locator('.hgh-search-coverage')).toBeHidden();
    await respond(page,fixtures.enabled,{status});
    await expect(page.getByRole('status')).toContainText(status===401?'Sign in':'temporarily unavailable');
    await expect(options(page)).toHaveCount(0);
    await expect(page.locator('.hgh-search-coverage')).toBeHidden();
  }
  await show(page,fixtures.enabled);await expect(options(page)).toHaveCount(1);
  await input(page).fill('');
  await expect(options(page)).toHaveCount(0);
  await expect(page.locator('.hgh-search-coverage')).toBeHidden();
  await expect(page.locator('.hgh-search-help')).toBeVisible();
  await expect(page.getByRole('status')).toBeEmpty();
});
test('obsolete success and error responses cannot replace newer query details or readiness',async({page})=>{
  await prepare(page);
  for(const status of [200,401,503]){
    await query(page,'older '+status);
    await input(page).fill('newer '+status);
    await expect.poll(()=>page.evaluate(()=>pending.length)).toBe(2);
    await respond(page,fixtures.truncated,{index:1});
    await expect(options(page)).toContainText('needle00.js');
    await respond(page,fixtures.denied,{status});
    await expect(options(page)).toContainText('needle00.js');
    await expect(page.locator('.hgh-search-partial')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-hgh-search-ready','true');
  }
});
test('a stale response body cannot overwrite a newer completed query',async({page})=>{
  await prepare(page);await query(page,'older body');
  await page.evaluate(()=>{
    pending.shift().resolve(new Response(new ReadableStream({
      start(controller){window.oldBody=controller;}
    }),{headers:{'Content-Type':'application/json'}}));
  });
  await query(page,'newer body');await respond(page,fixtures.truncated);
  await expect(options(page)).toContainText('needle00.js');
  await page.evaluate(payload=>{
    oldBody.enqueue(new TextEncoder().encode(JSON.stringify(payload)));
    oldBody.close();
  },fixtures.denied);
  await expect(options(page)).toContainText('needle00.js');
  await expect(page.locator('.hgh-search-partial')).toBeVisible();
});
test('malformed optional mode data does not discard valid matches',async({page})=>{
  await prepare(page);await show(page,{...fixtures.enabled,inferred:{error:'private/path'}});
  await expect(options(page)).toHaveCount(1);
  await expect(page.getByRole('status')).not.toContainText('unavailable');
  await expect(page.getByRole('status')).not.toContainText('private/path');
});
test('emptying or closing a pending query prevents late results',async({page})=>{
  await prepare(page);await query(page);
  await input(page).fill('');await respond(page,fixtures.enabled);
  await expect(options(page)).toHaveCount(0);
  await expect(page.locator('.hgh-search-coverage')).toBeHidden();
  await query(page);
  await page.evaluate(()=>{
    window.closeSettled=new Promise(resolve=>document.querySelector('#hgh-universal-search').addEventListener('close',resolve,{once:true}));
  });
  await input(page).press('Escape');
  await page.evaluate(()=>closeSettled);
  await page.evaluate(async payload=>{
    const response=new Response('{}');
    response.json=async()=>payload;
    pending.shift().resolve(response);
    // The immediate decoder's continuations settle before the next frame.
    await new Promise(requestAnimationFrame);
  },fixtures.enabled);
  await expect(page.locator('#hgh-universal-search')).toBeHidden();
  await expect(page.locator('#hgh-universal-search [role="option"]')).toHaveCount(0);
  await expect(page.locator('.hgh-search-coverage > *')).toHaveCount(0);
  await page.locator('.hgh-global-search-trigger').click();
  await expect(options(page)).toHaveCount(0);
  await expect(page.locator('.hgh-search-coverage')).toBeHidden();
});
test('only valid total request timing is labelled total',async({page})=>{
  await prepare(page);
  for(const total_ms of [undefined,null,'12',-1]){
    await query(page,'timing '+String(total_ms));await respond(page,{...fixtures.enabled,total_ms,elapsed_ms:999});
    await expect(options(page)).toHaveCount(1);
    await expect(page.getByRole('status')).not.toContainText('999');
    await expect(page.getByRole('status')).not.toContainText('ms');
  }
});
for(const width of [320,440,1280])for(const theme of ['light','dark']){
  test(`coverage disclosure keyboard and layout ${width} ${theme}`,async({page},testInfo)=>{
    await prepare(page,{width,theme});await show(page,fixtures.truncated);
    const summary=details(page).locator('summary');
    await input(page).press('ArrowDown');
    await expect(options(page).first()).toHaveAttribute('aria-selected','true');
    await input(page).press('Tab');
    await expect(page.locator('.hgh-search-close')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(details(page)).toHaveAttribute('open','');
    await expect(summary).toBeFocused();
    await expect(options(page).first()).toHaveAttribute('aria-selected','true');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    expect(await page.locator('#hgh-universal-search').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
    await page.locator('#hgh-universal-search').screenshot({path:testInfo.outputPath('coverage-expanded.png')});
    await page.keyboard.press('Space');await expect(details(page)).not.toHaveAttribute('open');
    await page.keyboard.press('Escape');await expect(page.locator('#hgh-universal-search')).toBeHidden();
    await expect(page.locator('.hgh-global-search-trigger')).toBeFocused();
  });
}
