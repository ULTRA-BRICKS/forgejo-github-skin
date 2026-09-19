import {test,expect} from '@playwright/test';
const story=(page,id)=>page.goto('/iframe.html?id='+id+'&viewMode=story');
const checkBox=async(locator)=>locator.evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}});
test('repository: footer-only brand, small header icons and separate compact visibility',async({page})=>{
 await story(page,'screens-repository--private');
 await expect(page.locator('.hgh-reference-shell')).toBeVisible();
 await expect(page.locator('.hgh-app-header [aria-label="Forgejo home"]')).toHaveCount(0);
 await expect(page.locator('.hgh-site-footer [aria-label="Forgejo home"]')).toHaveCount(1);
 for(const name of ['Search repositories','Notifications']) {
  const button=page.getByRole('button',{name,exact:true});
  if(await button.isVisible()) { const box=await checkBox(button); expect(box.w).toBeGreaterThanOrEqual(32); const symbol=await checkBox(button.locator('svg'));expect(symbol.w).toBe(16);expect(symbol.h).toBe(16); }
 }
 await expect(page.locator('.hgh-app-header')).toHaveCSS('background-color','rgb(246, 248, 250)');
 await expect(page.getByLabel('Repository context: primer/react')).toBeVisible();
 await expect(page.getByText('Private repository',{exact:true})).toBeVisible();
 await expect(page.locator('.hgh-desktop-title')).toBeHidden();
 await expect(page.getByRole('button',{name:'Star repository'})).toHaveAttribute('aria-pressed','false');
 await page.getByRole('button',{name:'Star repository'}).click();
 await expect(page.getByRole('button',{name:'Star repository'})).toHaveAttribute('aria-pressed','true');
});
test('repository controls: icons centered, edge gutters, branch changes, clone opens',async({page})=>{
 await story(page,'screens-repository--desktop');
 for(const selector of ['.hgh-branch>summary','.hgh-clone-control>summary','.hgh-file-actions>summary']){
  const item=page.locator(selector),box=await checkBox(item);expect(box.x).toBeGreaterThanOrEqual(15);expect(box.x+box.w).toBeLessThanOrEqual(page.viewportSize().width-15);
  for(const svg of await item.locator('svg').all()){const icon=await checkBox(svg);expect(Math.abs(icon.y+icon.h/2-box.y-box.h/2)).toBeLessThanOrEqual(1);}
 }
 await page.locator('.hgh-branch>summary').click();await page.getByRole('button',{name:'feature/keyboard-navigation',exact:true}).click();
 await expect(page.locator('.hgh-branch>summary')).toContainText('feature/keyboard-navigation');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
 await page.locator('.hgh-clone-control>summary').click();await expect(page.getByText('Clone repository',{exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('.hgh-clone-control')).not.toHaveAttribute('open','');
 await expect(page.locator('.hgh-clone-control>summary')).toBeFocused();
});
test('one PR menu owns sort, filters and density; state changes are applied and retained',async({page})=>{
 await story(page,'screens-workflows--pull-requests');
 const button=page.locator('.hgh-list-options>summary');await expect(button).toHaveCount(1);
 await button.click();await page.getByLabel('Sort by',{exact:true}).selectOption('oldest');
 await expect(page.locator('[data-pr-id]').first()).toHaveAttribute('data-pr-id','8409');
 await page.getByLabel('Author',{exact:true}).selectOption('alex');await expect(page.locator('[data-pr-id]')).toHaveCount(3);
 await page.getByLabel('Label',{exact:true}).selectOption('bug');await expect(page.locator('[data-pr-id]')).toHaveCount(2);
 await page.getByRole('radio',{name:'Compact',exact:true}).check();await expect(page.locator('.hgh-reference-shell')).toHaveAttribute('data-density','compact');
 await page.keyboard.press('Escape');await expect(button).toBeFocused();await expect(page.locator('.hgh-options-panel').filter({has:page.getByLabel('Sort by',{exact:true})})).toBeHidden();
 await button.click();await expect(page.getByLabel('Author',{exact:true})).toHaveValue('alex');
 await page.getByRole('button',{name:'Reset options'}).click();await expect(page.locator('[data-pr-id]')).toHaveCount(6);
 await page.locator('.hgh-list-heading h1').click();await expect(page.locator('.hgh-list-options')).not.toHaveAttribute('open','');
});
test('repository header and controls pixel regression',async({page})=>{
 await story(page,'screens-repository--desktop');await expect(page.locator('.hgh-app-header')).toHaveScreenshot('repository-header.png');
 await expect(page.locator('.hgh-repo-toolbar')).toHaveScreenshot('repository-toolbar.png');
});
test('PR menu pixel regression',async({page})=>{
 await story(page,'screens-workflows--pull-request-options');await expect(page.locator('.hgh-list-options>.hgh-options-panel')).toHaveScreenshot('pr-options.png');
});
for(const id of ['screens-repository--desktop','screens-repository--folder','screens-repository--long-name','screens-repository--signed-out','screens-workflows--pull-requests','screens-workflows--issues','screens-workflows--file']){
 test(id+' has no overflow or render failure',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await story(page,id);await expect(page.locator('.hgh-app-header')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
 });
}
