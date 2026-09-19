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
