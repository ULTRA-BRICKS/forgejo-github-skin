import {test,expect} from '@playwright/test';
const open=(page,id)=>page.goto('/iframe.html?id=sharing-slack-native-unfurls--'+id+'&viewMode=story');
for(const id of ['file','file-image-dark','file-text-syntax','private-repository','personal-private-file','connect-my-account','connected-account'])test(id+' has useful code or explicit personal access without shared-summary labels',async({page})=>{
 await open(page,id);await expect(page.locator('.wo-card')).toBeVisible();
 await expect(page.locator('.wo-card')).not.toContainText('shared summary');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 if(['file','file-image-dark'].includes(id)){
  const image=page.locator('[data-key=code_preview] img');await expect(image).toBeVisible();
  await expect.poll(()=>image.evaluate(e=>e.complete&&e.naturalWidth===1440&&e.naturalHeight===432)).toBe(true);
 }
 if(['file-text-syntax','personal-private-file'].includes(id)){await expect(page.locator('.wo-code [data-tone=link]').first()).toBeVisible();await expect(page.locator('.wo-code-line')).toHaveCount(5);}
 if(id==='private-repository'){await expect(page.locator('[data-key=visibility]')).toHaveText('VisibilityPrivate');await expect(page.locator('.wo-tag')).toHaveCount(0);}
});
test('every private preview menu exposes personal connection and access, not another user’s token',async({page})=>{
 await open(page,'private-file');await page.locator('.wo-more>summary').click();
 await page.getByRole('button',{name:'Connect my account',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'My Forgejo account'});await expect(dialog).toContainText('your own Forgejo account');
 await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.wo-more>summary').click();await page.getByRole('button',{name:'View with my access',exact:true}).click();
 await expect(page.locator('.wo-code-line')).toHaveCount(5);await expect(page.locator('.wo-privacy')).toHaveCount(0);
});
for(const id of ['file-image-dark','file-text-syntax','private-repository','connect-my-account'])test(id+' reviewed pixel state',async({page})=>{
 await open(page,id);const target=id==='connect-my-account'?page.getByRole('dialog'):page.locator('.wo-card');await expect(target).toBeVisible();await expect(target).toHaveScreenshot(id+'.png');
});
