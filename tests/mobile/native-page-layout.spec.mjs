import {test,expect} from '@playwright/test';import fs from 'node:fs/promises';
const css=(await fs.readFile(new URL('../../src/skin.css',import.meta.url),'utf8')).replace(/^@import.*$/mg,'');
const html='<html data-theme="hypergithub-auto"><head><meta name="viewport" content="width=device-width"><style>body{margin:0;font:14px Arial}.ui.container{width:100%}.grid{display:flex;flex-direction:column-reverse}.column{display:block}.center.aligned{height:40px}.eleven{height:150px}.members{height:90px}.pull.tabular.menu{display:flex;overflow:hidden}.pull.tabular.menu>a{display:flex;flex-shrink:0;width:140px;border:1px solid #ddd;box-sizing:border-box}.overflow-menu-items{display:flex}.overflow-menu-items>.item{width:110px;flex-shrink:0}</style></head><body><main class="organization profile"><div class="ui container"><div class="ui mobile reversed stackable grid"><div class="ui eleven wide column">Repository list</div><div class="ui five wide column"><div class="center aligned">Create actions</div><section class="segment members">Members</section></div></div></div></main><main class="repository"><div class="secondary-nav"><div class="overflow-menu-items"><a class="item">Code</a><a class="item">Issues</a><a class="item active">Pull requests</a></div></div><div class="ui pull tabs"><div class="ui pull tabular menu"><a class="item active">Conversation<span class="label">0</span></a><a class="item">Commits<span class="label">4</span></a><a class="item">Files changed<span class="label">91</span></a><span>+1215 −350</span></div></div></main></body></html>';
test('native organization lists repositories before members but keeps creation actions first',async({page})=>{
 await page.setContent(html);await page.addStyleTag({content:css});
 const y=async selector=>page.locator(selector).evaluate(e=>e.getBoundingClientRect().top);
 expect(await y('.center.aligned')).toBeLessThan(await y('.eleven.column'));
 expect(await y('.eleven.column')).toBeLessThan(await y('.members'));
 expect(await page.locator('.organization>.ui.container').evaluate(e=>e.getBoundingClientRect().x)).toBe(16);
});
test('native PR tabs fit within a phone and prioritize the active repository destination',async({page})=>{
 await page.setContent(html);await page.addStyleTag({content:css});
 const width=page.viewportSize().width;
 const tabs=await page.locator('.pull.tabular.menu>a').evaluateAll(es=>es.map(e=>({right:e.getBoundingClientRect().right,scroll:e.scrollWidth,client:e.clientWidth})));
 expect(tabs.every(t=>t.right<=width&&t.scroll<=t.client+1)).toBe(true);
 await expect(page.locator('.overflow-menu-items>.active')).toHaveCSS('order','-1');
 await page.setViewportSize({width:1280,height:900});await expect(page.locator('.overflow-menu-items>.active')).toHaveCSS('order','0');
});
