/**
 * A pending `G` navigation prefix ends on deliberate pointer input (#67), including a click on a
 * native file line, whose Forgejo handler only calls history.pushState (no hashchange/popstate).
 * The fixture is native Forgejo 16.0.6-shaped: the line-number table and click handler transcribe
 * web_src/js/features/repo-code.ts (selectRange + changeHash). The real production skin.mjs runs.
 */
import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const {version}=JSON.parse(await fs.readFile(new URL('../../package.json',import.meta.url),'utf8'));
const origin='https://pointer-sequence.test';
const repo='/lab/repo';
const filePath=repo+'/src/branch/main/package.json';
const fixture=`<!doctype html><html lang="en" data-theme="hypergithub-light"><head><meta name="viewport" content="width=device-width">
<style>body{margin:0;font:14px Arial}.overflow-menu-items{display:flex;flex-wrap:wrap}.overflow-menu-items a{padding:8px}
td.lines-num{padding:0 12px;text-align:right;cursor:pointer}.lines-num span::after{content:attr(data-line-number)}tr.active{background:#fff8c5}</style>
<script>
window.trace=[];
for(const type of ['pointerdown','click','hashchange','popstate'])window.addEventListener(type,event=>trace.push({type,pointerType:event.pointerType??null,trusted:event.isTrusted,prevented:event.defaultPrevented,hash:location.hash}));
// Bubble phase on window runs after the skin's document listener: prevented === true means the skin consumed the key to navigate.
// Reported through a binding, not page state, so the record survives the navigation a surviving sequence would start.
window.addEventListener('keydown',event=>window.recordKeydown(event.key,event.defaultPrevented));
</script></head><body>
<nav id="navbar"><a id="mobile-notifications-icon" href="/notifications">Notifications</a></nav>
<main class="page-content repository file list">
<div class="secondary-nav"><div class="ui secondary stackable menu"><div class="overflow-menu-items"><a class="item" href="${repo}">Code</a><a class="item" href="${repo}/issues">Issues</a><a class="item" href="${repo}/pulls">Pull requests</a></div></div></div>
<div class="file-header"><button type="button" class="ui mini basic button" id="native-action">Copy path</button></div>
<div class="code-view"><table><tbody>
<tr><td class="lines-num"><span id="L1" data-line-number="1"></span></td><td rel="L1" class="lines-code chroma"><code class="code-inner">{</code></td></tr>
<tr><td class="lines-num"><span id="L2" data-line-number="2"></span></td><td rel="L2" class="lines-code chroma"><code class="code-inner">  "name": "lab",</code></td></tr>
<tr><td class="lines-num"><span id="L3" data-line-number="3"></span></td><td rel="L3" class="lines-code chroma"><code class="code-inner">  "private": true</code></td></tr>
<tr><td class="lines-num"><span id="L4" data-line-number="4"></span></td><td rel="L4" class="lines-code chroma"><code class="code-inner">}</code></td></tr>
</tbody></table></div></main>
<script>
// repo-code.ts: the click handler is delegated on document and only calls history.pushState.
document.addEventListener('click',event=>{
 if(!event.target.matches('.lines-num span'))return;
 const lines=[...document.querySelectorAll('.code-view td.lines-code')];
 const selected=lines.find(line=>line.matches('[rel='+event.target.id+']'));
 for(const line of lines)line.closest('tr').classList.remove('active');
 selected.closest('tr').classList.add('active');
 window.history.pushState(null,null,'#'+selected.getAttribute('rel'));
 window.getSelection().removeAllRanges();
});
document.getElementById('native-action').addEventListener('click',()=>{window.nativeActionCalls=(window.nativeActionCalls||0)+1;});
</script>
<script type="module" src="/assets/hypergithub/${version}/skin.mjs"></script></body></html>`;

async function open(page){
 const navigations=[];const errors=[];const keydowns=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.exposeFunction('recordKeydown',(key,prevented)=>keydowns.push({key,prevented}));
 await page.route(origin+'/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('.mjs'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(new URL('../../src/'+url.pathname.split('/').at(-1),import.meta.url),'utf8')});
  if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,body:''});
  if(route.request().isNavigationRequest())navigations.push(url.pathname);
  return route.fulfill({contentType:'text/html',body:url.pathname===filePath?fixture:'<!doctype html><title>'+url.pathname+'</title>'});
 });
 await page.goto(origin+filePath);
 await page.locator('html[data-hgh-ready="true"]').waitFor();
 return {navigations,errors,keydowns};
}

/** Freezes the one-second prefix deadline so a slow runner cannot hide a surviving sequence. */
async function freezePrefixClock(page){
 await page.clock.install({time:new Date('2026-10-01T00:00:00Z')});
 await page.clock.pauseAt(new Date('2026-10-01T01:00:00Z'));
}
/** The key reached the page and the skin left it unconsumed, i.e. it started no navigation. */
async function expectKeyUnconsumed(env,key){
 await expect.poll(()=>env.keydowns.filter(entry=>entry.key===key).length).toBe(1);
 expect(env.keydowns.filter(entry=>entry.key===key).map(entry=>entry.prevented)).toEqual([false]);
}

/** After a cancelled sequence the same keys still work: a fresh uninterrupted G I reaches Issues. */
async function expectFreshSequenceStillNavigates(page,env){
 expect(env.navigations.filter(path=>path===repo+'/issues')).toEqual([]);
 await page.keyboard.press('g');await page.keyboard.press('i');
 await page.waitForURL('**'+repo+'/issues');
 expect(env.navigations.filter(path=>path===repo+'/issues')).toEqual([repo+'/issues']);
}

test('uninterrupted G I still navigates to Issues',async({page})=>{
 const env=await open(page);
 await page.keyboard.press('g');await page.keyboard.press('i');
 await page.waitForURL('**'+repo+'/issues');
 expect(env.errors).toEqual([]);
});

test('a mouse click on a native file line between G and I cancels the sequence',async({page})=>{
 const env=await open(page);await freezePrefixClock(page);
 await page.keyboard.press('g');
 await page.locator('[data-line-number="3"]').click();
 // The Forgejo handler really ran, through pushState only: no hashchange or popstate reached the page.
 await expect(page.locator('tr.active')).toHaveCount(1);
 expect(new URL(page.url()).hash).toBe('#L3');
 const trace=await page.evaluate(()=>trace);
 expect(trace.filter(entry=>entry.type==='hashchange'||entry.type==='popstate')).toEqual([]);
 const down=trace.find(entry=>entry.type==='pointerdown');
 expect(down).toMatchObject({pointerType:'mouse',trusted:true,prevented:false});
 await page.keyboard.press('i');
 await expectKeyUnconsumed(env,'i');
 expect(new URL(page.url()).pathname).toBe(filePath);
 expect(env.errors).toEqual([]);
 await page.clock.resume();
 await expectFreshSequenceStillNavigates(page,env);
});

// Desktop WebKit synthesizes pointerdown/touchstart/pointerup/touchend for a tap but no click, so the file-line handler is
// covered by the mouse test; what a touch must prove is that its trusted pointerdown alone ends the sequence.
test.describe('touch pointer',()=>{
 test.use({hasTouch:true});
 test('a tap between G and I cancels the sequence',async({page})=>{
  const env=await open(page);await freezePrefixClock(page);
  await page.keyboard.press('g');
  await page.locator('[data-line-number="3"]').tap();
  const down=(await page.evaluate(()=>trace)).find(entry=>entry.type==='pointerdown');
  expect(down).toMatchObject({pointerType:'touch',trusted:true,prevented:false});
  await page.keyboard.press('i');
  await expectKeyUnconsumed(env,'i');
  expect(env.errors).toEqual([]);
  await page.clock.resume();
  await expectFreshSequenceStillNavigates(page,env);
 });
});

const nativeState=page=>page.evaluate(()=>({calls:window.nativeActionCalls,focus:document.activeElement.id,trace}));

test('a pointer press keeps the native handler, default action and focus of the control it hits',async({page})=>{
 const env=await open(page);
 // Baseline: the same click with no pending sequence.
 await page.locator('#native-action').click();
 const baseline=await nativeState(page);
 await page.reload();await page.locator('html[data-hgh-ready="true"]').waitFor();await freezePrefixClock(page);
 await page.keyboard.press('g');
 await page.locator('#native-action').click();
 const withSequence=await nativeState(page);
 expect(withSequence).toEqual(baseline);
 expect(withSequence.calls).toBe(1);
 expect(withSequence.trace.map(entry=>entry.prevented)).toEqual([false,false]);
 await page.keyboard.press('i');
 await expectKeyUnconsumed(env,'i');
 expect(env.errors).toEqual([]);
});

// Focus first: a Tab between G and Enter would itself end the sequence and hide whether Enter does.
test('a keyboard-activated native control runs and also ends the sequence',async({page})=>{
 const env=await open(page);await freezePrefixClock(page);
 await page.locator('#native-action').focus();
 await page.keyboard.press('g');
 await page.keyboard.press('Enter');
 const state=await nativeState(page);
 expect(state.calls).toBe(1);
 expect(state.trace.filter(entry=>entry.type==='pointerdown')).toEqual([]);
 await page.keyboard.press('i');
 await expectKeyUnconsumed(env,'i');
 expect(env.errors).toEqual([]);
 await page.clock.resume();
 await expectFreshSequenceStillNavigates(page,env);
});
