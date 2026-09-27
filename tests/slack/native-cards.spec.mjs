import {test,expect} from '@playwright/test';
const open=(page,id)=>page.goto('/iframe.html?id=sharing-slack-native-unfurls--'+id+'&viewMode=story');
for(const id of ['organization','repository','pull-request','issue','commit','file','private-pull-request','private-file','long-title','dark-pull-request','dark-file','failing-checks','passing-checks','no-checks','access-denied','loading','expired']) {
 test(id+' renders its real payload model with no missing images or overflow',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page,id);
  await expect(page.locator('.wo-card')).toBeVisible();expect(errors).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  for(const img of await page.locator('.wo-card img').all())await expect.poll(()=>img.evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);
 if(id==='pull-request') {await expect(page.locator('.wo-inline')).toContainText('PR #23');await expect(page.locator('.wo-card [data-action-id=forgejo_open_files]')).toHaveAttribute('href',/\/pulls\/23\/files$/);}
 if(id==='organization') {
  await expect(page.locator('.wo-inline')).toContainText('ultrabricks');
  await expect(page.locator('.wo-card [data-action-id=forgejo_open_original]')).toHaveAttribute('href','https://forge.example/ultrabricks');
  await expect(page.locator('.wo-card [data-action-id=forgejo_open_repositories]')).toHaveAttribute('href','https://forge.example/org/ultrabricks/dashboard#repos');
  await expect(page.locator('.wo-card [data-key=repository]')).toHaveCount(0);
 }
  if(id==='private-file')await expect(page.locator('[data-key=code_excerpt]')).toHaveCount(0);
 });
}
test('menu, refresh and preferences preserve selected values',async({page})=>{
 await open(page,'pull-request');const menu=page.locator('.wo-more'),trigger=menu.locator('summary');
 await trigger.click();await expect(menu.locator('.wo-menu')).toBeVisible();
 await menu.getByRole('button',{name:'Preview settings',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Preview settings'});await expect(dialog).toBeVisible();
 await dialog.getByLabel('Information density',{exact:true}).selectOption('detailed');
 await dialog.getByLabel('Supplemental charts',{exact:true}).selectOption('off');
 await dialog.getByLabel('Slack presentation',{exact:true}).selectOption('blocks');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect(page.locator('.wo-demo')).toHaveAttribute('data-density','detailed');await expect(page.getByRole('status')).toContainText('saved');
 await trigger.click();await menu.getByRole('button',{name:'Preview settings'}).click();await expect(dialog.getByLabel('Information density')).toHaveValue('detailed');
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 await page.getByRole('button',{name:'Refresh preview'}).click();await expect(page.locator('.wo-timestamp')).toHaveText('Just refreshed');
});
for(const id of ['pull-request','dark-pull-request','file','private-pull-request','actions-menu','settings']) {
 test(id+' pixel regression',async({page})=>{
  await open(page,id);await expect(page.locator('.wo-card')).toBeVisible();
  const target=id==='settings'?page.getByRole('dialog'):id==='actions-menu'?page.locator('.wo-menu'):page.locator('.wo-card');
  await expect(target).toBeVisible();await expect(target).toHaveScreenshot(id+'.png');
 });
}
test('public source actions have destinations and keyboard Escape restores menu focus',async({page})=>{
 await open(page,'pull-request');const menu=page.locator('.wo-more');
 await menu.locator('summary').focus();await page.keyboard.press('Enter');
 await expect(menu).toHaveAttribute('open','');
 await expect(menu.locator('[data-action-id=forgejo_open_commits]')).toHaveAttribute('href',/\/pulls\/23\/commits$/);
 await expect(menu.locator('[data-action-id=forgejo_open_repository]')).toHaveAttribute('href','https://forge.example/ultrabricks/keyboard-lab');
 await page.keyboard.press('Escape');await expect(menu).not.toHaveAttribute('open','');await expect(menu.locator('summary')).toBeFocused();
 await page.locator('.wo-primary>[data-action-id=forgejo_open_files]').click();await expect(page.getByRole('status')).toContainText('/pulls/23/files');
});
