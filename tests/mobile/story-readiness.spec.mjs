import {test,expect} from '@playwright/test';
import {visibleStoryContent} from '../../scripts/story-content.mjs';
test('smoke readiness rejects empty wrappers and supports actually rendered SVG content',async({page})=>{
 await page.setContent('<main id="storybook-root"><div style="width:300px;height:100px"></div></main>');
 expect(await page.evaluate(visibleStoryContent)).toBe(false);
 await page.locator('#storybook-root').evaluate(e=>e.innerHTML='<span hidden>Hidden text</span>');
 expect(await page.evaluate(visibleStoryContent)).toBe(false);
 await page.locator('#storybook-root').evaluate(e=>e.innerHTML='<svg width="160" height="80"></svg>');
 expect(await page.evaluate(visibleStoryContent)).toBe(false);
 await page.locator('#storybook-root').evaluate(e=>e.innerHTML='<svg width="160" height="80"><rect x="2" y="2" width="40" height="20" fill="red"/></svg>');
 expect(await page.evaluate(visibleStoryContent)).toBe(true);
 await page.locator('#storybook-root').evaluate(e=>e.innerHTML='<div>Actual content</div>');
 expect(await page.evaluate(visibleStoryContent)).toBe(true);
});
test('transparent ancestors, stroked lines and referenced SVG shapes are evaluated correctly',async({page})=>{
 await page.setContent('<main id="storybook-root"></main>');
 for(const html of ['<div style="opacity:0">Invisible content</div>','<div style="opacity:0"><svg width="160" height="80"><rect width="40" height="20"/></svg></div>','<svg width="160" height="80"><defs><rect id="shape" width="40" height="20"/></defs></svg>']){
  await page.locator('#storybook-root').evaluate((e,html)=>e.innerHTML=html,html);expect(await page.evaluate(visibleStoryContent)).toBe(false);
 }
 for(const html of ['<svg width="160" height="80"><line x1="0" y1="20" x2="150" y2="20" stroke="red" stroke-width="4"/></svg>','<svg width="160" height="80"><line x1="20" y1="0" x2="20" y2="70" stroke="red" stroke-width="4"/></svg>','<svg width="160" height="80"><defs><rect id="shape" width="40" height="20"/></defs><use href="#shape"/></svg>']){
  await page.locator('#storybook-root').evaluate((e,html)=>e.innerHTML=html,html);expect(await page.evaluate(visibleStoryContent)).toBe(true);
 }
});
