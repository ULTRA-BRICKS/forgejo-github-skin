import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

// The explicit per-instance opt-out `<meta name="hypergithub-search" content="disabled">` is for isolated
// deployments without a HyperSearch backend (the native demo). These run the production skin entry point on a
// native-shaped page; only the search service is simulated. Absence of the opt-out and every backend failure
// must keep the mounted header search.
const root=new URL('../../',import.meta.url);
const OPT_OUT='<meta name="hypergithub-search" content="disabled">';

async function open(page,{head='',body='',status=200}={}){
  const searches=[];
  await page.route('http://capability.test/**',async route=>{
    const url=new URL(route.request().url());
    const asset=url.pathname.match(/^\/assets\/hypergithub\/[^/]+\/([\w-]+)\.(mjs|css)$/);
    if(asset)return route.fulfill({contentType:asset[2]==='mjs'?'text/javascript':'text/css',body:await fs.readFile(new URL(`src/${asset[1]}.${asset[2]}`,root),'utf8')});
    if(url.pathname.startsWith('/assets/css/theme-forgejo-'))return route.fulfill({contentType:'text/css',body:''});
    if(url.pathname.startsWith('/assets/css/'))return route.fulfill({contentType:'text/css',body:await fs.readFile(new URL('dist/public'+url.pathname,root),'utf8')});
    if(url.pathname==='/api/hypersearch'){
      searches.push(url.searchParams.get('q'));
      return route.fulfill({status,contentType:'application/json',body:status===200?JSON.stringify({results:[]}):'{}'});
    }
    return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en" data-theme="hypergithub-light"><head><meta name="viewport" content="width=device-width">${head}<link rel="stylesheet" href="/assets/css/theme-hypergithub-light.css"><style>body{margin:0}#navbar,.navbar-left,.navbar-right{display:flex;align-items:center;gap:8px}.navbar-right{margin-left:auto}#navbar{min-height:64px}</style></head><body>${body}<nav id="navbar"><div class="navbar-left"><a id="navbar-logo" href="/">Forgejo</a><div class="navbar-mobile-right"></div></div><div class="navbar-right"><a href="/user/login">Sign in</a></div></nav><div class="repo-header"><div class="flex-item-title"><a href="/acme">acme</a> / <a href="/acme/project">project</a></div></div><form class="code-search" action="/acme/project/search"><input type="search" name="q" placeholder="Search code"></form><main><h1>Native content</h1></main><script type="module" src="/assets/hypergithub/current/skin.mjs"></script></body></html>`});
  });
  await page.goto('http://capability.test/acme/project');
  await expect(page.locator('html')).toHaveAttribute('data-hgh-ready','true');
  await page.evaluate(()=>{
    window.nativeInput=document.querySelector('.code-search input');
    window.keys=[];
    // Registered after the skin's document listener, so it observes the skin's decision for the same event.
    window.addEventListener('keydown',event=>window.keys.push({key:event.key,ctrl:event.ctrlKey,prevented:event.defaultPrevented}));
  });
  return searches;
}
const trigger=page=>page.locator('#navbar .hgh-global-search-trigger');
const nativeField=page=>page.locator('.code-search input');
const SHORTCUTS=['s','/','Control+k','Control+/'];
async function pressShortcuts(page,{expectOpen}){
  const prevented=[];
  for(const shortcut of SHORTCUTS){
    await page.evaluate(()=>{document.activeElement?.blur();window.keys=[];});
    await page.keyboard.press(shortcut);
    prevented.push(await page.evaluate(()=>window.keys.at(-1)?.prevented));
    if(expectOpen){
      await expect(page.locator('#hgh-universal-search[open]'),shortcut).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(page.locator('#hgh-universal-search[open]')).toHaveCount(0);
    }
  }
  return prevented;
}

test('without the opt-out the header search mounts and owns its shortcuts',async({page})=>{
  const searches=await open(page);
  await expect(trigger(page)).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('data-hgh-search-mounted','true');
  await expect(nativeField(page)).toBeHidden();
  expect(searches).toContain('');
  expect(await pressShortcuts(page,{expectOpen:true})).toEqual(SHORTCUTS.map(()=>true));
});

test('the explicit opt-out keeps native search usable, sends no search request and leaves shortcuts unclaimed',async({page})=>{
  const searches=await open(page,{head:OPT_OUT});
  await expect(trigger(page)).toHaveCount(0);
  await expect(page.locator('#hgh-universal-search')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-hgh-search-mounted');
  await expect(nativeField(page)).toBeVisible();
  expect(await pressShortcuts(page,{expectOpen:false})).toEqual(SHORTCUTS.map(()=>false));
  await expect(page.locator('#hgh-universal-search')).toHaveCount(0);
  await nativeField(page).fill('needle');
  await expect(nativeField(page)).toHaveValue('needle');
  expect(await page.evaluate(()=>document.querySelector('.code-search input')===window.nativeInput)).toBe(true);
  expect(searches).toEqual([]);
});

test('adding the opt-out restores the native search in place and removing it mounts the header search again',async({page})=>{
  await open(page);
  await expect(trigger(page)).toHaveCount(1);
  const toggle=disabled=>page.evaluate(async([disabled,meta])=>{
    if(disabled)document.head.insertAdjacentHTML('beforeend',meta);
    else document.head.querySelector('meta[name="hypergithub-search"]').remove();
    // Same module instance the skin imported: one release directory, one module map entry.
    (await import('/assets/hypergithub/current/universal-search.mjs')).enhanceUniversalSearch(document);
  },[disabled,OPT_OUT]);
  await toggle(true);
  await expect(trigger(page)).toHaveCount(0);
  await expect(page.locator('#hgh-universal-search')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-hgh-search-mounted');
  await expect(nativeField(page)).toBeVisible();
  expect(await page.evaluate(()=>document.querySelector('.code-search input')===window.nativeInput)).toBe(true);
  await toggle(false);
  await expect(trigger(page)).toHaveCount(1);
  await expect(nativeField(page)).toBeHidden();
});

for(const status of [401,404,503]){
  test(`a ${status} search backend never disables the mounted header search`,async({page})=>{
    await open(page,{status});
    await expect(trigger(page)).toHaveCount(1);
    await expect(nativeField(page)).toBeHidden();
    await trigger(page).click();
    await page.locator('#hgh-universal-search input').fill('needle');
    await expect(page.locator('#hgh-universal-search').getByRole('status')).toContainText(status===401?'Sign in':'temporarily unavailable');
    if(status!==401)await expect(page.locator('#hgh-universal-search .hgh-search-retry')).toBeVisible();
    await expect(nativeField(page)).toBeHidden();
    await expect(trigger(page)).toHaveCount(1);
  });
}

test('only an exact head opt-out disables the header search',async({page})=>{
  await open(page,{head:'<meta name="hypergithub-search" content="enabled">',body:OPT_OUT});
  await expect(trigger(page)).toHaveCount(1);
  await expect(nativeField(page)).toBeHidden();
});
