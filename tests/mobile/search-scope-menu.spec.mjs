import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const palette='--hgh-color-canvas:#fff;--hgh-color-text:#1f2328;--hgh-color-muted:#59636e;--hgh-color-border:#d1d9e0;--hgh-color-subtle:#f6f8fa;--hgh-color-counter:#eff1f3;--hgh-color-link:#0969da';
async function mount(page,{owner='acme',repo='project',global=false,theme='light'}={}){
  const css=await fs.readFile(new URL('src/universal-search.css',root),'utf8');
  await page.route('http://scope.test/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/src/'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(new URL(url.pathname.slice(1),root),'utf8')});
    return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en" data-theme="hypergithub-${theme}"><head><meta name="viewport" content="width=device-width"><style>:root{${palette}}body{margin:0;font:14px/1.4 system-ui;overflow-wrap:break-word}#navbar,.navbar-left,.navbar-right{display:flex;gap:8px}.navbar-right{margin-left:auto}${css}</style></head><body><nav id="navbar"><div class="navbar-left"><a href="/">Forgejo</a><div class="navbar-mobile-right"></div></div><div class="navbar-right"></div></nav>${global?'':`<div class="repo-header"><div class="flex-item-title"><a href="/${owner}">${owner}</a> / <a href="/${owner}/${repo}">${repo}</a></div></div>`}<main>Repository content</main></body></html>`});
  });
  await page.goto('http://scope.test/'+(global?'explore/repos':owner+'/'+repo));
  await page.evaluate(async()=>{
    const m=await import('/src/universal-search.mjs');window.searchModule=m;window.searchRequests=[];
    m.enhanceUniversalSearch(document,{fetchImpl:async url=>{
      const q=new URL(url,location.href).searchParams.get('q');if(q)window.searchRequests.push(q);
      return new Response(JSON.stringify({inferred:'text',results:q?Array.from({length:30},(_,i)=>({repo:'acme/project',kind:i%2?'structure':'definition',path:`src/components/navigation/result-${i}.mjs`,line:i+1,ref:'refs/heads/main',snippet:'export function <mark>needle</mark>() { return state.items; }'})):[]}),{status:200,headers:{'Content-Type':'application/json'}});
    }});
    m.openUniversalSearch(document,{seed:'needle'});
  });
  await expect(page.locator('.hgh-search-results>a')).toHaveCount(30);
}
const trigger=page=>page.locator('.hgh-search-scope-trigger');
const input=page=>page.locator('#hgh-universal-search input');
const menu=page=>page.locator('#hgh-search-scope-menu');

test('scope is an inline dropdown; results have no permanent kind gutter',async({page},info)=>{
  await mount(page);
  await expect(trigger(page)).toBeVisible();
  await expect(trigger(page)).toHaveAttribute('aria-haspopup','menu');
  await expect(menu(page)).toBeHidden();
  const geometry=await page.evaluate(()=>{
    const row=document.querySelector('.hgh-search-input-row'),trigger=row.querySelector('.hgh-search-scope-trigger'),input=row.querySelector('input'),result=document.querySelector('.hgh-search-results>a');
    const box=n=>n.getBoundingClientRect().toJSON();
    return {row:box(row),trigger:box(trigger),input:box(input),result:box(result),title:box(result.querySelector('b')),snippet:box(result.querySelector('.hgh-search-main>span')),kind:box(result.querySelector('.hgh-search-kind')),overflow:document.documentElement.scrollWidth-innerWidth};
  });
  expect(geometry.trigger.right).toBeLessThanOrEqual(geometry.input.left);
  expect(geometry.input.width).toBeGreaterThanOrEqual(100);
  expect(geometry.title.left-geometry.result.left).toBeLessThanOrEqual(16);
  expect(geometry.snippet.left).toBeCloseTo(geometry.title.left,0);
  expect(geometry.kind.left).toBeGreaterThanOrEqual(geometry.title.right-1);
  expect(geometry.overflow).toBeLessThanOrEqual(0);
  await page.screenshot({path:info.outputPath('inline-scope.png')});
});
test('choosing scope preserves the query and sends exactly one replacement',async({page})=>{
  await mount(page);
  for(const [scope,prefix] of [['owner','owner:acme needle'],['global','needle'],['repo','repo:acme/project needle']]){
    const before=await page.evaluate(()=>window.searchRequests.length);
    await trigger(page).click();await page.locator(`[role=menuitemradio][data-scope=${scope}]`).click();
    await expect(menu(page)).toBeHidden();await expect(input(page)).toBeFocused();await expect(input(page)).toHaveValue('needle');
    await expect.poll(()=>page.evaluate(()=>window.searchRequests.length)).toBe(before+1);
    expect(await page.evaluate(()=>window.searchRequests.at(-1))).toBe(prefix);
    await page.waitForTimeout(180);expect(await page.evaluate(()=>window.searchRequests.length)).toBe(before+1);
  }
});
test('keyboard selection, Escape ordering and outside dismissal preserve the dialog',async({page})=>{
  await mount(page);await input(page).focus();await page.keyboard.press('Shift+Tab');await expect(trigger(page)).toBeFocused();
  await page.keyboard.press('ArrowDown');await expect(menu(page)).toBeVisible();
  await page.keyboard.press('End');await expect(page.locator('[data-scope=global]')).toBeFocused();
  await page.keyboard.press('Enter');await expect(input(page)).toBeFocused();await expect(trigger(page)).toHaveAttribute('data-scope-value','global');
  await trigger(page).click();await page.keyboard.press('Escape');await expect(menu(page)).toBeHidden();await expect(trigger(page)).toBeFocused();
  await expect(page.locator('#hgh-universal-search')).toHaveAttribute('open','');
  await trigger(page).click();await input(page).click();await expect(menu(page)).toBeHidden();await expect(input(page)).toHaveValue('needle');
  await page.keyboard.press('Escape');await expect(page.locator('#hgh-universal-search')).not.toHaveAttribute('open','');
});
test('long scope names fit and hidden choices cannot receive focus',async({page},info)=>{
  await mount(page,{owner:'ultrabricks-platform-engineering-research',repo:'a-very-long-repository-name'});
  await trigger(page).click();await expect(menu(page)).toBeVisible();
  const rect=await menu(page).boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.screenshot({path:info.outputPath('scope-menu-open.png')});
  await page.keyboard.press('Escape');await page.keyboard.press('Tab');await expect(input(page)).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(0);
});
test('global pages never invent repository or organization choices',async({page})=>{
  await mount(page,{global:true});await trigger(page).click();
  await expect(menu(page).getByRole('menuitemradio')).toHaveCount(1);
  await expect(menu(page).getByRole('menuitemradio')).toHaveAttribute('data-scope','global');
});
