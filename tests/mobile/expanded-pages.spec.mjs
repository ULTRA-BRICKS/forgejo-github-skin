import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const open=(page,id)=>page.goto('/iframe.html?id='+id+'&viewMode=story');
const axeSource=await fs.readFile(new URL('../../node_modules/axe-core/axe.min.js',import.meta.url),'utf8');
async function axeViolations(page){
 await page.addScriptTag({content:axeSource});
 const results=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}));
 return results.violations;
}
test('overview shows exactly 10 repositories, enriched with real description/language/stats, and View all reaches the full list',async({page})=>{
 await open(page,'screens-organization--overview');
 await page.waitForSelector('.hgh-org-page');
 await expect.poll(()=>page.locator('.hgh-org-repo-meta').count()).toBeGreaterThan(0);
 await expect(page.locator('#dashboard-repo-list .repo-owner-name-list > li:visible')).toHaveCount(10);
 await expect(page.locator('.hgh-org-repo-desc').first()).not.toHaveText('');
 await page.locator('.hgh-org-view-all').click();
 await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view','repos');
 await expect(page.locator('#dashboard-repo-list .repo-owner-name-list > li:visible')).toHaveCount(12);
});
test('empty and error states never invent repositories or hide the status message',async({page})=>{
 await open(page,'screens-organization--empty-results');
 await expect(page.locator('#dashboard-repo-list .repo-owner-name-list > li')).toHaveCount(0);
 await open(page,'screens-organization--error-state');
 await expect(page.locator('.hgh-org-repos-status')).toHaveText('Repository details are unavailable right now.');
 await expect(page.locator('.hgh-org-repo-meta')).toHaveCount(0);
});
test('the Repos and Activity Storybook states actually land on their own view, not a copy of Overview',async({page})=>{
 await open(page,'screens-organization--repos');
 await page.waitForSelector('.hgh-org-page');
 await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view','repos');
 await expect(page.locator('.hgh-org-sidebar')).toBeHidden();
 await open(page,'screens-organization--activity');
 await page.waitForSelector('.hgh-org-page');
 await expect(page.locator('.hgh-org-page')).toHaveAttribute('data-hgh-org-view','activity');
 await expect(page.locator('.hgh-org-columns')).toBeHidden();
});
test('public organization profile keeps native repository links and the access-controlled members segment intact',async({page})=>{
 await open(page,'screens-organization--profile');
 await expect(page.locator('.page-content.organization.profile')).toHaveClass(/hgh-org-profile/);
 await expect(page.locator('.segment.members')).toBeVisible();
 await expect(page.locator('.flex-item a.text.primary.name').first()).toHaveAttribute('href',/^\/ultrabricks\//);
 // Presentation-only: enhancing must never add, remove or reorder repositories, which would risk
 // exposing (or hiding) something the server-rendered access-controlled HTML did not. 15 matches
 // organizationProfile()'s fixed REPOS fixture (stories/organization-page.mjs) exactly.
 await expect(page.locator('.page-content.organization.profile .flex-list > .flex-item')).toHaveCount(15);
});
test('PRs/Issues Storybook states demonstrate the real native handoff link, not a fabricated PR/issue list',async({page})=>{
 await open(page,'screens-organization--pull-requests');
 await expect(page.locator('.hgh-org-handoff-note')).toContainText('Pull requests');
 await expect(page.locator('.hgh-org-handoff-note a')).toHaveAttribute('href',/\/ultrabricks\/pulls$/);
 await open(page,'screens-organization--issues');
 await expect(page.locator('.hgh-org-handoff-note')).toContainText('Issues');
 await expect(page.locator('.hgh-org-handoff-note a')).toHaveAttribute('href',/\/ultrabricks\/issues$/);
});
test('user profile Public activity story renders 16px event glyphs through the production enhancer',async({page})=>{
 for(const id of ['screens-organization--user-profile-activity','screens-organization--user-profile-activity-dark']){
  await open(page,id);
  await expect(page.locator('.page-content.user.profile #activity-feed.hgh-compact-activity')).toHaveCount(1);
  const sizes=await page.locator('#activity-feed .flex-item-trailing > svg').evaluateAll(n=>n.map(e=>[Math.round(e.getBoundingClientRect().width),Math.round(e.getBoundingClientRect().height)]));
  expect(sizes).toHaveLength(7);
  expect(sizes.every(([w,h])=>w===16&&h===16)).toBe(true);
 }
});
test('overview story keeps repository names visible beside enrichment and the focused pager keeps Previous apart from Next',async({page})=>{
 await open(page,'screens-organization--overview');
 await page.waitForSelector('.hgh-org-page');
 await expect.poll(()=>page.locator('.hgh-org-repo-meta').count()).toBeGreaterThan(0);
 const widths=await page.locator('#dashboard-repo-list .repo-owner-name-list > li:visible .repo-list-link .text.truncate').evaluateAll(n=>n.map(e=>Math.round(e.getBoundingClientRect().width)));
 expect(widths.length).toBeGreaterThan(0);
 expect(widths.every(w=>w>40)).toBe(true);
 await open(page,'screens-dashboardpagination--compact');
 const pager=page.locator('#dashboard-repo-list .hgh-vpg');
 await expect(pager).toBeVisible();
 const [prev,next]=await Promise.all(['prev','next'].map(k=>pager.locator('.hgh-vpg-'+k).evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};})));
 expect(prev.width).toBeGreaterThan(60);
 expect(prev.right).toBeLessThanOrEqual(next.left+1);
});
test('desktop (1280px) overview shows a real two-column layout with no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 await open(page,'screens-organization--overview');
 await page.waitForSelector('.hgh-org-page');
 await expect.poll(()=>page.locator('.hgh-org-repo-meta').count()).toBeGreaterThan(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 const repos=await page.locator('.hgh-org-repos').boundingBox();
 const sidebar=await page.locator('.hgh-org-sidebar').boundingBox();
 expect(sidebar.x).toBeGreaterThan(repos.x+repos.width-1); // sidebar sits to the right of repos, not stacked below
 const metaBox=await page.locator('.hgh-org-repo-meta').first().boundingBox();
 expect(metaBox.width).toBeGreaterThan(300); // wraps to the row's full width, not squeezed beside the link
 await expect(page).toHaveScreenshot('screens-organization--overview-1280.png',{fullPage:false});
});
test('organization Storybook states pass real axe accessibility checks, matching this repo\'s a11y:error preview policy',async({page})=>{
 for(const id of ['screens-organization--overview','screens-organization--repos','screens-organization--activity','screens-organization--empty-results','screens-organization--profile']){
  await open(page,id);await page.waitForSelector('.hgh-org-page, .page-content.organization.profile');
  const violations=await axeViolations(page);
  expect(violations,id+': '+violations.map(v=>v.id+' — '+v.nodes.map(n=>n.target.join(' ')).join(', ')).join('\n')).toEqual([]);
 }
});
test('issue discussion accepts safe literal text and source errors are actionable',async({page})=>{
 await open(page,'screens-issue-detail--open');await expect(page.getByRole('button',{name:'Comment',exact:true})).toBeDisabled();
 await page.getByLabel('Comment',{exact:true}).fill('<img src=x onerror=alert(1)> literal text');await page.getByRole('button',{name:'Comment',exact:true}).click();
 await expect(page.locator('.issue-detail-comment').last()).toContainText('<img src=x onerror=alert(1)>');await expect(page.locator('.issue-detail-comment img')).toHaveCount(0);
 await expect(page.getByRole('status')).toHaveText('Comment added to this preview.');
 await open(page,'screens-issue-detail--source-error');await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('.issue-detail-conversation')).toBeVisible();
});
for(const id of ['screens-organization--overview','screens-organization--repos','screens-organization--pull-requests','screens-organization--issues','screens-organization--activity','screens-organization--dark','screens-organization--empty-results','screens-organization--loading','screens-organization--error-state','screens-organization--with-flash-alert','screens-organization--profile','screens-organization--profile-dark'])test(id+' visual regression and bounds',async({page})=>{
 await open(page,id);await page.waitForSelector('.hgh-org-page, .page-content.organization.profile');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 if(id.endsWith('--dark'))await expect(page.locator('.hgh-org-story')).toHaveCSS('background-color','rgb(13, 17, 23)');
 await expect(page).toHaveScreenshot(id+'.png',{fullPage:false});
});
for(const id of ['screens-issue-detail--open','screens-issue-detail--closed','screens-issue-detail--dark','screens-issue-detail--long-title','screens-issue-detail--access-unavailable'])test(id+' visual regression and bounds',async({page})=>{
 await open(page,id);await expect(page.locator('.hgh-app-header')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 if(id.endsWith('--dark'))await expect(page.locator('.hgh-reference-shell')).toHaveCSS('background-color','rgb(13, 17, 23)');
 await expect(page).toHaveScreenshot(id+'.png',{fullPage:false});
});
