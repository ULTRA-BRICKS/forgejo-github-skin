import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {openNativeFixture,exposeModules} from './native-module-fixture.mjs';
const css=(await fs.readFile(new URL('../../src/skin.css',import.meta.url),'utf8')).replace(/^@import.*$/mg,'')+await fs.readFile(new URL('../../src/repository-ui.css',import.meta.url),'utf8');
const fixture='<html lang="en" data-theme="hypergithub-light" data-hgh-ready="true"><head><meta name="viewport" content="width=device-width"><style>:root{--hgh-color-border:#d1d9e0;--hgh-color-subtle:#f6f8fa;--hgh-color-text:#1f2328}body{margin:16px;font:14px Arial}.repo-button-row{display:flex}.button-sequence{display:flex}.button{display:inline-flex}.ui.container{width:100%}.branch-dropdown-button{width:100px}button{height:32px}</style></head><body><main class="repository file"><div class="repo-header"><div class="repo-buttons"><div class="ui labeled button"><button class="ui button">Watch</button><a class="ui basic label" href="#watchers">3</a></div></div></div><div class="ui container"><div class="repo-description">Repository description</div><div class="repo-button-row"><div class="button-sequence"><div class="js-branch-tag-selector"><button class="branch-dropdown-button">main</button></div><a class="button" id="new-pull-request" href="/compare">PR</a><a class="button" href="/find/main">Find file</a><button class="button" id="add-native">Add file</button></div><div><details class="hgh-clone"><summary>Code</summary><input value="clone URL"></details></div><button class="button" data-hgh-help>Shortcuts</button></div></div></main></body></html>';
async function prepare(page){
 await openNativeFixture(page,fixture);await page.addStyleTag({content:css});
 await exposeModules(page,'repository-controls.mjs');
 await page.evaluate(()=>{window.originalButton=document.getElementById('add-native');window.hits=0;originalButton.onclick=()=>window.hits++;enhanceRepositoryControls();enhanceRepositoryControls();});
}
test('compact file actions preserve native nodes, handlers, original desktop positions and theme teardown',async({page})=>{
 await prepare(page);const menu=page.locator('.hgh-repo-more');await expect(menu).toHaveCount(1);
 await menu.locator('summary').click();await page.getByRole('button',{name:'Add file',exact:true}).click();expect(await page.evaluate(()=>window.hits)).toBe(1);
 expect(await page.evaluate(()=>document.getElementById('add-native')===window.originalButton)).toBe(true);
 await expect(page.locator('.ui.container > .repo-buttons')).toBeVisible();
 await page.keyboard.press('Escape');await expect(menu.locator('summary')).toBeFocused();
 await page.setViewportSize({width:1280,height:956});await expect(menu).toBeHidden();await expect(page.locator('.button-sequence > #add-native')).toBeVisible();
 await expect(page.locator('.repo-header > .repo-buttons')).toBeVisible();
 await page.evaluate(()=>restoreRepositoryControls());await expect(menu).toHaveCount(0);await expect(page.locator('.hgh-control-label')).toHaveCount(0);
});
test('counter and mobile primary controls stay aligned instead of split badge buttons',async({page})=>{
 await prepare(page);
 const data=await page.evaluate(()=>{const b=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};return {social:b(document.querySelector('.labeled.button')),label:b(document.querySelector('.labeled.button>.label')),branch:b(document.querySelector('.branch-dropdown-button')),clone:b(document.querySelector('.hgh-clone>summary')),more:b(document.querySelector('.hgh-repo-more>summary'))};});
 expect(data.social.height).toBe(32);expect(data.label.height).toBe(20);
 expect(Math.abs(data.branch.y-data.clone.y)).toBeLessThanOrEqual(1);expect(Math.abs(data.more.y-data.clone.y)).toBeLessThanOrEqual(1);
 expect(data.more.x+data.more.width).toBeLessThanOrEqual(page.viewportSize().width-15);
});
test('real skin closes the file menu before Shortcuts so one Escape closes the modal and restores focus',async({page})=>{
 const html=fixture.replace('<button class="button" data-hgh-help>Shortcuts</button>','').replace('</body>','<script type="module" src="/assets/hypergithub/0.1.8/skin.mjs"></script></body>');
 await page.route('https://native-ui.test/**',async route=>{
  const u=new URL(route.request().url()),name=u.pathname.split('/').at(-1);
  if(name.endsWith('.mjs'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(new URL('../../src/'+name,import.meta.url),'utf8')});
  if(name.endsWith('.css'))return route.fulfill({contentType:'text/css',body:css});
  return route.fulfill({contentType:'text/html',body:html});
 });
 await page.goto('https://native-ui.test/repo');const menu=page.locator('.hgh-repo-more');await menu.locator('summary').click();
 await page.getByRole('button',{name:'Keyboard shortcuts',exact:true}).click();
 await expect(page.locator('.hgh-dialog[open]')).toHaveCount(1);await expect(menu).not.toHaveAttribute('open','');
 await page.keyboard.press('Escape');await expect(page.locator('.hgh-dialog[open]')).toHaveCount(0);await expect(menu.locator('summary')).toBeFocused();
});
test('a removed description cannot crash a later mobile transition or strand native controls',async({page})=>{
 await page.setViewportSize({width:1280,height:956});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await prepare(page);await page.locator('.repo-description').evaluate(e=>e.remove());
 await page.setViewportSize({width:320,height:956});await expect(page.locator('.hgh-repo-more')).toBeVisible();
 await expect(page.locator('.repo-buttons')).toHaveCount(1);await expect(page.locator('.repo-buttons')).toBeVisible();
 await page.evaluate(()=>restoreRepositoryControls());await expect(page.locator('.repo-header>.repo-buttons')).toBeVisible();await expect(page.locator('.button-sequence>#add-native')).toBeVisible();expect(errors).toEqual([]);
});

test('a temporarily detached-but-reused row restores its exact original controls on reinsertion',async({page})=>{
 await page.setViewportSize({width:320,height:956});
 await prepare(page);
 await expect(page.locator('.hgh-repo-more')).toBeVisible();
 const result=await page.evaluate(()=>{
  const row=document.querySelector('.repo-button-row');
  const parent=row.parentNode,next=row.nextSibling;
  row.remove(); // detach but keep a live reference — a framework reusing the same node
  enhanceRepositoryControls(); // sees the detached row and tears down its state via cleanupDisconnected()
  parent.insertBefore(row,next); // reinsert the SAME node
  return {
   addFilePresent: document.getElementById('add-native')===window.originalButton,
   moreCount: document.querySelectorAll('.hgh-repo-more').length,
  };
 });
 expect(result.addFilePresent).toBe(true); // original control restored to its exact original slot, not lost
 expect(result.moreCount).toBe(0); // stale disclosure torn down, not leaked
 await page.evaluate(()=>enhanceRepositoryControls());
 await expect(page.locator('.hgh-repo-more')).toBeVisible();
 await expect(page.locator('#add-native')).toHaveCount(1);
});
