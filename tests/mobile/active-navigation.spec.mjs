import {test,expect} from '@playwright/test';
test('the active Issues tab remains visible on phones and every destination remains reachable',async({page})=>{
 await page.goto('/iframe.html?id=screens-workflows--issues&viewMode=story');
 const nav=page.getByRole('navigation',{name:'Repository navigation'});
 await expect(nav.locator('a[aria-current=page]')).toHaveText(/Issues/);
 await expect(nav.locator('a[aria-current=page]')).toBeVisible();
 await nav.locator('.hgh-more-nav>summary').click();
 for(const name of ['Code','Pull requests','Issues','Commits','Branches'])await expect(nav.locator('.hgh-options-panel').getByRole('link',{name,exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.setViewportSize({width:1280,height:900});
 expect(await nav.locator(':scope > a').evaluateAll(es=>es.map(e=>e.textContent.replace(/\d+/g,'').trim()))).toEqual(['Code','Pull requests','Issues']);
});
