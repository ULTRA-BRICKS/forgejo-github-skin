import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
async function mount(page,{lang='en',nativeFocus=false}={}){
  const css=await fs.readFile(new URL('src/universal-search.css',root),'utf8');
  await page.route('http://resize.test/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/src/'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(new URL(url.pathname.slice(1),root),'utf8')});
    return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${lang}" data-theme="hypergithub-light"><head><meta name="viewport" content="width=device-width"><style>:root{--hgh-color-canvas:#fff;--hgh-color-text:#1f2328;--hgh-color-muted:#59636e;--hgh-color-border:#d1d9e0;--hgh-color-subtle:#f6f8fa;--hgh-color-counter:#eff1f3;--hgh-color-link:#0969da}body{margin:0;font:14px/1.4 system-ui}${nativeFocus?'.hgh-search-input-row>input:focus{outline:2px solid blue!important}':''}${css}</style></head><body><nav id="navbar"><div class="navbar-left"><div class="navbar-mobile-right"></div></div><div class="navbar-right"></div></nav><div class="repo-header"><div class="flex-item-title"><a href="/acme">acme</a> / <a href="/acme/project">project</a></div></div></body></html>`});
  });
  await page.goto('http://resize.test/acme/project');
  await page.evaluate(async()=>{
    const search=await import('/src/universal-search.mjs');
    search.enhanceUniversalSearch(document,{fetchImpl:async url=>{
      if(!new URL(url,location.href).searchParams.get('q'))return new Response('{"results":[]}',{headers:{'Content-Type':'application/json'}});
      return new Promise(resolve=>window.finishResults=()=>resolve(new Response(JSON.stringify({inferred:'text',results:Array.from({length:30},(_,i)=>({repo:'acme/project',kind:'code',path:'src/example-'+i+'.mjs',line:1,ref:'refs/heads/main',snippet:'A real result layout'}))}),{headers:{'Content-Type':'application/json'}})));
    }});
    search.openUniversalSearch(document,{seed:'needle'});
  });
  await page.waitForFunction(()=>typeof window.finishResults==='function');
}
const gap=page=>page.evaluate(()=>document.querySelector('#hgh-search-scope-menu').getBoundingClientRect().top-document.querySelector('.hgh-search-scope-trigger').getBoundingClientRect().bottom);
test('open scope menu follows dialog recentering when delayed results arrive',async({page})=>{
  await page.setViewportSize({width:1280,height:956});await mount(page);
  await page.locator('.hgh-search-scope-trigger').click();
  const before=await page.locator('#hgh-universal-search').boundingBox();
  await expect.poll(()=>gap(page)).toBeCloseTo(8,0);
  await page.evaluate(()=>window.finishResults());
  await expect(page.locator('.hgh-search-results>a')).toHaveCount(30);
  await expect.poll(async()=>before.y-(await page.locator('#hgh-universal-search').boundingBox()).y).toBeGreaterThan(100);
  await expect.poll(()=>gap(page)).toBeCloseTo(8,0);
  await expect(page.locator('[role=menuitemradio][data-scope=repo]')).toBeFocused();
});
test('native focus styling uses the query row without a nested field frame',async({page})=>{
  await page.setViewportSize({width:440,height:956});await mount(page,{nativeFocus:true});
  await page.locator('#hgh-universal-search input').focus();
  await expect(page.locator('#hgh-universal-search input')).toHaveCSS('outline-style','none');
  await expect(page.locator('.hgh-search-input-row')).not.toHaveCSS('box-shadow','none');
});
test('short repository scope labels stay complete at 320 pixels in both locales',async({page})=>{
  await page.setViewportSize({width:320,height:956});
  for(const lang of ['en','ru']){
    await mount(page,{lang});
    const label=page.locator('.hgh-search-scope-current');
    await expect(label).toHaveText(lang==='ru'?'Репозиторий':'Repository');
    expect(await label.evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThanOrEqual(0);
    expect(await page.locator('#hgh-universal-search input').evaluate(node=>node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(100);
  }
});

test('forced colors keep focus visible for both query and scope choices',async({page})=>{
  await page.emulateMedia({forcedColors:'active'});
  await mount(page,{nativeFocus:true});
  await expect.poll(()=>page.evaluate(()=>matchMedia('(forced-colors: active)').matches)).toBe(true);
  const input=page.locator('#hgh-universal-search input');await input.focus();
  const queryOutline=await input.evaluate(node=>getComputedStyle(node).outlineStyle);
  await page.locator('.hgh-search-scope-trigger').click();
  const choice=page.locator('[role=menuitemradio][data-scope=repo]');await choice.focus();
  const choiceOutline=await choice.evaluate(node=>getComputedStyle(node).outlineStyle);
  expect({queryOutline,choiceOutline}).toEqual({queryOutline:'solid',choiceOutline:'solid'});
});
