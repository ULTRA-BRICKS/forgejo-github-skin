import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

// Native-shaped page with Forgejo's own body typography and wrapping (copied from its index.css: the inherited
// `overflow-wrap: break-word` is what split the kind pill mid-word on real pages), the generated theme tokens and
// the real search modules and styles from src. Only the search service is simulated. Each project supplies the
// viewport width; light and dark run in every project.
const root=new URL('../../',import.meta.url);
const NATIVE_BODY='body{margin:0;line-height:20px;font-family:-apple-system,"Segoe UI",system-ui,"Noto Sans","Noto Sans Hebrew",Roboto,"Helvetica Neue",Arial,"Liberation Sans",sans-serif;display:flex;flex-direction:column;overflow-wrap:break-word}';
// Every kind forgejo-search emits (repository, file, symbol roles, lexical code, structural) plus the client fallback.
const KINDS=['repository','file','definition','reference','code','structure',undefined];

function hits(count){
  return Array.from({length:count},(_,index)=>{
    const kind=KINDS[index%KINDS.length];
    if(kind==='repository')return {kind,repo:`acme/project-${index}`,path:'',line:0,ref:'refs/heads/main',url:`/acme/project-${index}`,snippet:`acme/project-${index}`};
    return {kind,repo:'acme/project',path:`src/components/navigation/very-long-module-name-${index}.mjs`,language:'javascript',line:index+1,
      ref:'refs/heads/main',snippet:`export function <mark>needle</mark>${index}(state, options) { return state.items.filter(item => item.visible); }`};
  });
}

async function openWithResults(page,{theme,owner='acme',count=30}){
  await page.route('http://search.test/**',async route=>{
    const url=new URL(route.request().url());
    if(/^\/src\/[\w-]+\.mjs$/.test(url.pathname))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(new URL(url.pathname.slice(1),root),'utf8')});
    if(url.pathname.startsWith('/assets/css/theme-forgejo-'))return route.fulfill({contentType:'text/css',body:''});
    if(url.pathname.startsWith('/assets/css/'))return route.fulfill({contentType:'text/css',body:await fs.readFile(new URL('dist/public'+url.pathname,root),'utf8')});
    // Any release directory resolves to the current source styles, so this spec exercises src, not a stale build.
    const asset=url.pathname.match(/^\/assets\/hypergithub\/[^/]+\/([\w-]+\.css)$/);
    if(asset)return route.fulfill({contentType:'text/css',body:await fs.readFile(new URL('src/'+asset[1],root),'utf8')});
    if(url.pathname==='/api/hypersearch'){
      const q=url.searchParams.get('q');
      return route.fulfill({contentType:'application/json',body:JSON.stringify(q?{inferred:'text',total_ms:42,results:hits(count)}:{results:[]})});
    }
    return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en" data-theme="hypergithub-${theme}"><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/css/theme-hypergithub-${theme}.css"><style>${NATIVE_BODY}#navbar,.navbar-left,.navbar-right{display:flex;align-items:center;gap:8px}.navbar-right{margin-left:auto}#navbar{min-height:64px}@media(max-width:767px){.navbar-left{width:100%}}</style></head><body><nav id="navbar"><div class="navbar-left"><a id="navbar-logo" href="/">Forgejo</a><div class="navbar-mobile-right"></div></div><div class="navbar-right"><a href="/user/login">Sign in</a></div></nav><div class="repo-header"><div class="flex-item-title"><a href="/${owner}">${owner}</a> / <a href="/${owner}/project">project</a></div></div><form class="code-search"><input type="search" placeholder="Search code"></form><main><h1>Native content</h1></main></body></html>`});
  });
  await page.goto('http://search.test/'+owner+'/project');
  await page.evaluate(async()=>{(await import('/src/universal-search.mjs')).enhanceUniversalSearch(document);});
  await page.locator('#navbar .hgh-global-search-trigger:visible').click();
  await page.locator('#hgh-universal-search input').fill('needle');
  await expect(page.locator('#hgh-universal-search .hgh-search-results>a')).toHaveCount(count);
}

const dialogGeometry=page=>page.evaluate(()=>{
  const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
  const dialog=document.querySelector('#hgh-universal-search'),scopes=dialog.querySelector('.hgh-search-scopes'),results=dialog.querySelector('.hgh-search-results');
  const scrollable=value=>value==='auto'||value==='scroll';
  // A scrolling region is a user-scrollable box whose content overflows it; overflow:hidden clamps are not.
  const scrollers=[dialog,...dialog.querySelectorAll('*')].filter(node=>{
    const style=getComputedStyle(node);
    return (scrollable(style.overflowY)&&node.scrollHeight>node.clientHeight+1)||(scrollable(style.overflowX)&&node.scrollWidth>node.clientWidth+1);
  }).map(node=>node.className||node.tagName);
  return {
    dialog:rect(dialog),scopes:{...rect(scopes),clientHeight:scopes.clientHeight,scrollHeight:scopes.scrollHeight,clientWidth:scopes.clientWidth,scrollWidth:scopes.scrollWidth},
    buttons:[...scopes.querySelectorAll('button')].map(button=>({label:button.textContent,...rect(button)})),
    scrollers,resultsOverflow:results.scrollHeight-results.clientHeight,
    documentOverflow:document.documentElement.scrollWidth-innerWidth,
  };
});

function expectScopesWhole(geometry){
  expect(geometry.scopes.scrollHeight,'scope row content is not clipped vertically').toBeLessThanOrEqual(geometry.scopes.clientHeight);
  expect(geometry.scopes.scrollWidth,'scope row does not overflow horizontally').toBeLessThanOrEqual(geometry.scopes.clientWidth);
  expect(geometry.buttons.length).toBe(3);
  for(const button of geometry.buttons){
    expect(button.height,button.label).toBeGreaterThanOrEqual(28);
    expect(button.top,button.label).toBeGreaterThanOrEqual(geometry.scopes.top-0.5);
    expect(button.bottom,button.label).toBeLessThanOrEqual(geometry.scopes.bottom+0.5);
    expect(button.left,button.label).toBeGreaterThanOrEqual(geometry.scopes.left-0.5);
    expect(button.right,button.label).toBeLessThanOrEqual(geometry.scopes.right+0.5);
    expect(button.bottom,button.label).toBeLessThanOrEqual(geometry.dialog.bottom);
  }
  expect(geometry.scrollers,'the results list is the only scrolling region').toEqual(['hgh-search-results']);
  expect(geometry.resultsOverflow,'many results scroll inside the list').toBeGreaterThan(0);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(0);
}

for(const theme of ['light','dark']){
  test(`every emitted result kind stays one whole readable word with native typography (${theme})`,async({page},testInfo)=>{
    await openWithResults(page,{theme});
    const report=await page.evaluate(()=>{
      const pills=[...document.querySelectorAll('#hgh-universal-search .hgh-search-kind')].map(pill=>{
        const range=document.createRange();range.selectNodeContents(pill);
        const lines=new Set([...range.getClientRects()].filter(r=>r.width>0).map(r=>Math.round(r.top))).size;
        const box=pill.getBoundingClientRect(),main=pill.parentElement.querySelector('.hgh-search-main').getBoundingClientRect();
        return {text:pill.textContent,lines,clipped:pill.scrollWidth>pill.clientWidth,fontSize:parseFloat(getComputedStyle(pill).fontSize),
          overlapsMain:box.right>main.left+0.5,mainLeft:Math.round(main.left),rowOverflow:pill.parentElement.scrollWidth>pill.parentElement.clientWidth};
      });
      return {pills,documentOverflow:document.documentElement.scrollWidth-innerWidth};
    });
    expect(new Set(report.pills.map(pill=>pill.text))).toEqual(new Set(['repository','file','definition','reference','code','structure','result']));
    for(const pill of report.pills){
      expect(pill.lines,`${pill.text} renders on one line`).toBe(1);
      expect(pill.clipped,`${pill.text} is not clipped`).toBe(false);
      expect(pill.fontSize,`${pill.text} font size`).toBeGreaterThanOrEqual(10);
      expect(pill.overlapsMain,`${pill.text} stays beside the title column`).toBe(false);
      expect(pill.rowOverflow,`${pill.text} row has no horizontal overflow`).toBe(false);
    }
    expect(new Set(report.pills.map(pill=>pill.mainLeft)).size,'titles align across kinds').toBe(1);
    expect(report.documentOverflow).toBeLessThanOrEqual(0);
    await page.screenshot({path:testInfo.outputPath(`kinds-${theme}.png`)});
  });

  test(`scope tabs keep full height and stay clickable and keyboard reachable with many results (${theme})`,async({page},testInfo)=>{
    await openWithResults(page,{theme});
    expectScopesWhole(await dialogGeometry(page));
    await page.screenshot({path:testInfo.outputPath(`scopes-${theme}.png`)});
    for(const scope of ['global','owner','repo']){
      await page.locator(`#hgh-universal-search [data-scope="${scope}"]`).click();
      await expect(page.locator(`#hgh-universal-search [data-scope="${scope}"]`)).toHaveAttribute('aria-checked','true');
      await expect(page.locator('#hgh-universal-search .hgh-search-results>a')).toHaveCount(30);
      expectScopesWhole(await dialogGeometry(page));
    }
    await page.locator('#hgh-universal-search input').focus();
    for(let step=0;step<6&&await page.evaluate(()=>document.activeElement?.dataset.scope!=='owner');step++)await page.keyboard.press('Tab');
    await expect(page.locator('#hgh-universal-search [data-scope="owner"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#hgh-universal-search [data-scope="owner"]')).toHaveAttribute('aria-checked','true');
    await expect(page.locator('#hgh-universal-search .hgh-search-results>a')).toHaveCount(30);
    expectScopesWhole(await dialogGeometry(page));
  });
}

test('a long organization name wraps the scope tabs instead of scrolling them',async({page},testInfo)=>{
  await openWithResults(page,{theme:'light',owner:'ultrabricks-platform-engineering-research'});
  expectScopesWhole(await dialogGeometry(page));
  await page.locator('#hgh-universal-search [data-scope="global"]').click();
  await expect(page.locator('#hgh-universal-search [data-scope="global"]')).toHaveAttribute('aria-checked','true');
  await page.screenshot({path:testInfo.outputPath('long-owner.png')});
});
