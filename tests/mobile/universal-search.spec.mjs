import {test,expect} from '@playwright/test';import fs from 'node:fs/promises';
const version=JSON.parse(await fs.readFile(new URL('../../package.json',import.meta.url),'utf8')).version;
const css=(await fs.readFile(new URL('../../src/skin.css',import.meta.url),'utf8')).replace(/^@import.*$/mg,'')+await fs.readFile(new URL('../../src/repository-ui.css',import.meta.url),'utf8')+await fs.readFile(new URL('../../src/universal-search.css',import.meta.url),'utf8');
const html='<!doctype html><html lang="en" data-theme="hypergithub-light"><head><meta name="viewport" content="width=device-width"></head><body><nav id="navbar"><div class="navbar-left"><a id="navbar-logo" href="/"><img src="/logo.svg"></a><button id="navbar-expand-toggle">menu</button></div><div class="navbar-right"><a href="/explore/repos">Explore</a><a href="/notifications">Bell</a></div></nav><main class="repository"><div class="repo-header"><div class="flex-item-title"><a href="/ultrabricks">ultrabricks</a>/<a href="/ultrabricks/forgejo-github-skin">forgejo-github-skin</a></div></div><div class="ui container"><form class="code-search"><div class="action input"><input type="search" placeholder="Search code…"><button>Search</button></div></form></div></main><footer class="page-footer"></footer><script type="module" src="/assets/hypergithub/'+version+'/skin.mjs"></script></body></html>';
async function prepare(page){
 await page.route('https://search-ui.test/**',async route=>{const u=new URL(route.request().url()),name=u.pathname.split('/').at(-1);
  if(u.pathname==='/__hypersearch/query'){const q=u.searchParams.get('q')||'';return route.fulfill({contentType:'application/json',body:JSON.stringify({took_ms:7,results:[{kind:q.includes('function')?'code':'symbol',title:'restoreFocus',repo:'ultrabricks/forgejo-github-skin',path:'src/focus.js',line:12,url:'https://search-ui.test/ultrabricks/forgejo-github-skin/src/commit/abc/src/focus.js#L12',snippet:'function restoreFocus(trigger)'}]})});}
  if(name.endsWith('.mjs'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(new URL('../../src/'+name,import.meta.url),'utf8')});
  if(name.endsWith('.css'))return route.fulfill({contentType:'text/css',body:css});if(name==='logo.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});return route.fulfill({contentType:'text/html',body:html});
 });
 await page.goto('https://search-ui.test/ultrabricks/forgejo-github-skin');await page.locator('html[data-hgh-ready]').waitFor();
}
test('header search replaces the repository-local search and returns symbol results without navigation',async({page})=>{
 await prepare(page);await expect(page.locator('.code-search')).toBeHidden();const trigger=page.getByRole('button',{name:'Search',exact:true});await expect(trigger).toBeVisible();await trigger.click();
 const dialog=page.getByRole('dialog',{name:'Search'}),input=dialog.getByRole('searchbox');await input.fill('restoreFocus');await expect(dialog.getByRole('option')).toContainText('restoreFocus');await expect(dialog.locator('.hgh-search-mode')).toHaveText('Symbols');await expect(dialog.locator('.hgh-search-latency')).toHaveText('7 ms');
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
});
test('syntax automatically selects structural mode and scope changes stay in the same dialog',async({page})=>{
 await prepare(page);await page.getByRole('button',{name:'Search',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Search'}),input=dialog.getByRole('searchbox');await input.fill('function restoreFocus ( trigger ) {');await expect(dialog.locator('.hgh-search-mode')).toHaveText('Structure');await expect(dialog.getByRole('option')).toContainText('src/focus.js');
 await dialog.getByRole('button',{name:'Everywhere',exact:true}).click();await expect(dialog.getByRole('button',{name:'Everywhere',exact:true})).toHaveAttribute('data-active','true');
 await expect(dialog).toHaveScreenshot('universal-search-structural.png',{animations:'disabled'});
});
test('mobile search stays within the viewport and Cmd/Ctrl-K opens it instantly',async({page})=>{
 await prepare(page);await page.keyboard.press('Control+k');const dialog=page.getByRole('dialog',{name:'Search'});await expect(dialog).toBeVisible();const box=await dialog.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize().width);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
 await expect(dialog).toHaveScreenshot('universal-search-empty.png',{animations:'disabled'});
});
