import {test,expect} from '@playwright/test';
const open=(page,id)=>page.goto('/iframe.html?id='+id+'&viewMode=story');
test('organization search, filters, order and Follow work without losing the current view',async({page})=>{
 await open(page,'screens-organization--overview');
 const results=page.locator('.org-repo-list [data-repo]');await expect(results).toHaveCount(4);
 await page.getByLabel('Find a repository',{exact:true}).fill('calendar');await expect(results).toHaveCount(1);
 await page.getByRole('button',{name:'Clear filters'}).click();await expect(results).toHaveCount(4);
 await page.getByLabel('Type',{exact:true}).selectOption('Public');await expect(results).toHaveCount(2);
 await page.getByLabel('Language',{exact:true}).selectOption('Go');await expect(page.getByRole('heading',{name:'No repositories match'})).toBeVisible();
 await page.getByRole('button',{name:'Clear filters'}).click();await page.getByLabel('Sort',{exact:true}).selectOption('Stars');await expect(results.first()).toHaveAttribute('data-repo','component-library');
 await page.getByRole('button',{name:'Follow',exact:true}).click();await expect(page.getByRole('button',{name:'Following',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('public organization view excludes private fixture repositories',async({page})=>{
 await open(page,'screens-organization--public-view');await expect(page.locator('.org-repo-list [data-repo]')).toHaveCount(2);await expect(page.locator('.org-repo-list')).not.toContainText('calendar-tools');
});
test('issue discussion accepts safe literal text and source errors are actionable',async({page})=>{
 await open(page,'screens-issue-detail--open');await expect(page.getByRole('button',{name:'Comment',exact:true})).toBeDisabled();
 await page.getByLabel('Comment',{exact:true}).fill('<img src=x onerror=alert(1)> literal text');await page.getByRole('button',{name:'Comment',exact:true}).click();
 await expect(page.locator('.issue-detail-comment').last()).toContainText('<img src=x onerror=alert(1)>');await expect(page.locator('.issue-detail-comment img')).toHaveCount(0);
 await expect(page.getByRole('status')).toHaveText('Comment added to this preview.');
 await open(page,'screens-issue-detail--source-error');await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('.issue-detail-conversation')).toBeVisible();
});
for(const id of ['screens-organization--overview','screens-organization--dark','screens-organization--empty-results','screens-organization--loading','screens-issue-detail--open','screens-issue-detail--closed','screens-issue-detail--dark','screens-issue-detail--long-title','screens-issue-detail--access-unavailable'])test(id+' visual regression and bounds',async({page})=>{
 await open(page,id);await expect(page.locator('.hgh-app-header')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 if(id.endsWith('--dark'))await expect(page.locator('.hgh-reference-shell')).toHaveCSS('background-color','rgb(13, 17, 23)');
 await expect(page).toHaveScreenshot(id+'.png',{fullPage:false});
});
