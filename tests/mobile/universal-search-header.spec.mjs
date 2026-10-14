import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

// Native-shaped DOM with real ES modules and styles; only the search service is simulated.
const root=new URL('../../',import.meta.url);
const navbar='<nav id="navbar"><div class="navbar-left"><a id="navbar-logo" href="/">Forgejo</a><div class="navbar-mobile-right"><button id="navbar-expand-toggle">Menu</button></div><a href="/explore/repos">Explore</a></div><div class="navbar-right"><a href="/user/login">Sign in</a></div></nav>';
const repository='<div class="repo-header"><div class="flex-item-title"><a href="/acme">acme</a> / <a href="/acme/project">project</a></div></div><form class="code-search"><input type="search" placeholder="Search code"></form>';
const profile='<div class="page-content organization profile"><div class="ui small secondary filter menu"><form id="repo-search-form"><div class="ui small fluid action input"><input type="search" name="q" placeholder="Search repos…"><button>Search</button></div><select aria-label="Sort"><option>Updated</option></select><button type="button" aria-label="Filter">Filter</button></form></div></div>';
const dashboard='<div class="secondary-nav"><div class="right menu"><a class="ui basic button" href="/acme">View home</a></div></div><div id="dashboard-repo-list"><div class="repos-search"><div class="ui action input"><input type="search" placeholder="Search repos…"><button aria-label="Filter">Filter</button></div><div class="repos-filter">All repositories</div></div></div>';
async function prepare(page,{kind='repo',theme='light',status=200,header=true,query=''}={}){
  const path=(kind==='repo'?'/acme/project':kind==='profile'?'/acme':'/org/acme/dashboard')+query+(kind==='dashboard'?'#repos':'');
  await page.route('http://search.test/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/src/'))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await fs.readFile(new URL(url.pathname.slice(1),root),'utf8')});
    if(url.pathname.startsWith('/assets/css/theme-forgejo-'))return route.fulfill({contentType:'text/css',body:''});
    if(url.pathname.startsWith('/assets/css/'))return route.fulfill({contentType:'text/css',body:await fs.readFile(new URL('dist/public'+url.pathname,root),'utf8')});
    if(url.pathname.startsWith('/assets/hypergithub/')){
      try{return await route.fulfill({contentType:'text/css',body:await fs.readFile(new URL('dist/public'+url.pathname,root),'utf8')});}
      catch{return route.fulfill({status:404,body:'Missing release asset'});}
    }
    if(url.pathname==='/api/hypersearch')return route.fulfill({status,contentType:'application/json',body:JSON.stringify({results:[],inferred:'text'})});
    return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en" data-theme="hypergithub-${theme}"><head><link rel="stylesheet" href="/assets/css/theme-hypergithub-${theme}.css"><style>body{margin:0}#navbar,.navbar-left,.navbar-right,.navbar-mobile-right{display:flex;align-items:center;gap:8px}.navbar-right{margin-left:auto}#navbar{min-height:64px}.navbar-left{min-width:0}.navbar-mobile-right{display:none}@media(max-width:767px){.navbar-left{width:100%}.navbar-mobile-right{display:flex;margin-left:auto}.navbar-right,.navbar-left>a[href$="/explore/repos"]{display:none}}</style></head><body>${header?navbar:''}${kind==='repo'?repository:kind==='profile'?profile:dashboard}<main><h1>Native content</h1></main><footer></footer></body></html>`});
  });
  await page.goto('http://search.test'+path);
  await page.evaluate(async()=>{
    window.search=await import('/src/universal-search.mjs');
    window.chromeEnhancer=await import('/src/mobile-chrome.mjs');
    window.nativeInput=document.querySelector('input[type="search"]');
    window.nativeInput.value=new URL(location.href).searchParams.get('q')||'';
  });
}
async function enhance(page){await page.evaluate(()=>{chromeEnhancer.enhanceNativeChrome(document);search.enhanceUniversalSearch(document);search.enhanceUniversalSearch(document);});}
const trigger=page=>page.locator('#navbar .hgh-global-search-trigger:visible, #navbar .hgh-native-search:visible');

for(const width of [320,440,1280])for(const theme of ['light','dark'])for(const kind of ['repo','profile','dashboard']){
  test(`header-only ${kind} ${width} ${theme}`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    await prepare(page,{kind,theme,status:401});
    await expect(page.locator('input[type="search"]')).toBeVisible();
    await enhance(page);
    await expect(page.locator('input[type="search"]').first()).toBeHidden();
    await expect(trigger(page)).toHaveCount(1);
    await expect(page.locator('.hgh-global-search-trigger')).toHaveCSS('background-color',theme==='dark'?'rgb(13, 17, 23)':'rgb(255, 255, 255)');
    if(width===1280)await expect(page.locator('#navbar .navbar-right > .hgh-global-search-trigger')).toBeVisible();
    const headerBox=await page.locator('#navbar').boundingBox(),buttonBox=await trigger(page).boundingBox();
    expect(buttonBox.y+buttonBox.height).toBeLessThanOrEqual(headerBox.y+headerBox.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({path:testInfo.outputPath('header.png')});
    await trigger(page).click();
    await expect(page.locator('#hgh-universal-search input')).toBeFocused();
    await expect(page.locator(`[data-scope="${kind==='repo'?'repo':'owner'}"]`)).toHaveAttribute('aria-checked','true');
    const request=page.waitForRequest(request=>request.url().includes('/api/hypersearch?q=')&&new URL(request.url()).searchParams.get('q'));
    await page.locator('#hgh-universal-search input').fill('needle');
    expect(new URL((await request).url()).searchParams.get('q')).toBe((kind==='repo'?'repo:acme/project':'owner:acme')+' needle');
    await expect(page.getByRole('status')).toContainText('Sign in');
    await expect(page.locator('input[type="search"]').first()).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(trigger(page)).toBeFocused();
  });
}

test('backend failure, restore and re-enhance preserve native controls and filters',async({page})=>{
  await prepare(page,{kind:'dashboard',status:503});
  await enhance(page);
  await trigger(page).click();
  await page.locator('#hgh-universal-search input').fill('needle');
  await expect(page.getByRole('status')).toContainText('temporarily unavailable');
  await expect(page.locator('#dashboard-repo-list input')).toBeHidden();
  await expect(page.getByRole('button',{name:'Filter'})).toBeVisible();
  await page.locator('.hgh-search-scope-trigger').click();
  await page.getByRole('menuitemradio',{name:'Everywhere'}).click();
  await expect(page.getByRole('menuitemradio',{name:'Everywhere',includeHidden:true})).toHaveAttribute('aria-checked','true');
  await page.evaluate(()=>search.restoreUniversalSearch(document));
  await expect(page.locator('#dashboard-repo-list input')).toBeVisible();
  expect(await page.evaluate(()=>document.querySelector('#dashboard-repo-list input')===nativeInput)).toBe(true);
  await expect(page.locator('html')).not.toHaveAttribute('data-hgh-search-mounted');
  await enhance(page);
  await expect(trigger(page)).toHaveCount(1);
  await expect(page.locator('#dashboard-repo-list input')).toBeHidden();
});

test('without a header action host enhancement cannot hide the native fallback',async({page})=>{
  await prepare(page,{header:false});
  await enhance(page);
  await expect(page.locator('.code-search')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-hgh-search-mounted');
});

test('resizing relocates the organization action without re-enhancement',async({page})=>{
  await prepare(page,{kind:'profile'});
  await enhance(page);
  for(const width of [1280,320,1280,440]){
    await page.setViewportSize({width,height:900});
    await expect(trigger(page)).toHaveCount(1);
    await trigger(page).click();
    await expect(page.locator('#hgh-universal-search input')).toBeFocused();
    await page.keyboard.press('Escape');
  }
});

test('replacing the header keeps one mounted action',async({page})=>{
  await prepare(page);
  await enhance(page);
  await page.evaluate(html=>{chromeEnhancer.restoreNativeChrome(document);document.querySelector('#navbar').outerHTML=html;},navbar);
  await enhance(page);
  await expect(trigger(page)).toHaveCount(1);
  await trigger(page).click();
  await expect(page.locator('#hgh-universal-search input')).toBeFocused();
});

test('filtered organization preserves native filters and an explicit query reset',async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:900});
  await prepare(page,{kind:'profile',query:'?q=missing&page=3&sort=recentupdate&archived=1',status:503});
  await enhance(page);
  await page.evaluate(()=>{location.hash='repos';});
  await expect(page.locator('#repo-search-form input[type="search"]')).toBeHidden();
  await expect(page.getByRole('combobox',{name:'Sort'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Filter',exact:true})).toBeVisible();
  const reset=page.getByRole('link',{name:'Clear repository filter: missing'});
  await expect(reset).toBeVisible();
  await expect(reset).toHaveAttribute('href','http://search.test/acme?sort=recentupdate&archived=1#repos');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('active-filter.png')});
  await page.evaluate(()=>search.restoreUniversalSearch(document));
  await expect(reset).toHaveCount(0);
  await expect(page.locator('#repo-search-form input[type="search"]')).toHaveValue('missing');
  await expect(page.locator('#repo-search-form input[type="search"]')).toBeVisible();
  await enhance(page);
  await reset.click();
  await expect(page).toHaveURL('http://search.test/acme?sort=recentupdate&archived=1#repos');
});

test('dashboard reset notifies the native filtering consumer and restores the original input',async({page})=>{
  await prepare(page,{kind:'dashboard',status:503});
  await page.evaluate(()=>{
    const repos=document.createElement('ul');
    repos.id='native-filtered-repositories';
    repos.innerHTML='<li>Alpha repository</li><li>Beta repository</li>';
    document.querySelector('#dashboard-repo-list').append(repos);
    nativeInput.addEventListener('input',()=>{
      for(const row of repos.children)row.hidden=!row.textContent.toLowerCase().includes(nativeInput.value.toLowerCase());
    });
  });
  await enhance(page);
  await page.evaluate(()=>{
    nativeInput.value='missing';
    nativeInput.dispatchEvent(new Event('input',{bubbles:true}));
    history.replaceState(null,'','?q=missing&sort=recentupdate&archived=1#repos');
  });
  await expect(page.locator('#native-filtered-repositories li:visible')).toHaveCount(0);
  await expect(page.locator('#dashboard-repo-list input')).toBeHidden();
  const reset=page.getByRole('button',{name:'Clear repository filter: missing'});
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(page.locator('#dashboard-repo-list input')).toHaveValue('');
  await expect(page.locator('#native-filtered-repositories li:visible')).toHaveText(['Alpha repository','Beta repository']);
  await expect(reset).toHaveCount(0);
  expect(await page.evaluate(()=>({
    sort:new URL(location.href).searchParams.get('sort'),
    archived:new URL(location.href).searchParams.get('archived'),hash:location.hash
  }))).toEqual({sort:'recentupdate',archived:'1',hash:'#repos'});
  await expect(page.getByRole('button',{name:'Filter',exact:true})).toBeVisible();
  await page.evaluate(()=>search.restoreUniversalSearch(document));
  await expect(page.locator('#dashboard-repo-list input')).toBeVisible();
  await expect(page.locator('#dashboard-repo-list input')).toHaveValue('');
  expect(await page.evaluate(()=>document.querySelector('#dashboard-repo-list input')===nativeInput)).toBe(true);
  await page.locator('#dashboard-repo-list input').fill('missing');
  await expect(reset).toHaveCount(0);
  await enhance(page);
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(page.locator('#native-filtered-repositories li:visible')).toHaveCount(2);
});

test('dashboard filter mounted asynchronously still gains a visible reset without re-enhancement',async({page})=>{
  await prepare(page,{kind:'dashboard'});
  await page.evaluate(()=>{
    window.filterHost=document.querySelector('.repos-search');
    filterHost.remove();
  });
  await enhance(page);
  await page.evaluate(()=>{
    document.querySelector('#dashboard-repo-list').append(filterHost);
    nativeInput.value='mounted-later';
    nativeInput.dispatchEvent(new Event('input',{bubbles:true}));
  });
  const reset=page.getByRole('button',{name:'Clear repository filter: mounted-later'});
  await expect(reset).toBeVisible();
  await expect(page.locator('#dashboard-repo-list input')).toBeHidden();
  await reset.click();
  await expect(page.locator('#dashboard-repo-list input')).toHaveValue('');
  await expect(reset).toHaveCount(0);
  expect(await page.evaluate(()=>document.querySelector('#dashboard-repo-list input')===nativeInput)).toBe(true);
});
