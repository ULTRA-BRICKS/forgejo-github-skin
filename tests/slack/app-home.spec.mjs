import {test,expect} from '@playwright/test';
const story=(page,name)=>page.goto('/iframe.html?id=sharing-slack-native-unfurls--'+name+'&viewMode=story');
test('Home reuses settings payload, persists preferences and supports keyboard cancellation',async({page})=>{
 await story(page,'app-home');
 await expect(page.getByRole('heading',{name:'Forgejo link previews'})).toBeVisible();
 await page.getByRole('button',{name:'Edit preview settings'}).click();
 const dialog=page.getByRole('dialog',{name:'Preview settings'});
 await dialog.getByLabel('Information density').selectOption('detailed');
 await dialog.getByLabel('Supplemental charts').selectOption('off');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();
 await expect(dialog).toHaveCount(0);await expect(page.getByText('Detailed',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit preview settings'}).click();
 await expect(dialog.getByLabel('Information density')).toHaveValue('detailed');
 await expect(dialog.getByLabel('Supplemental charts')).toHaveValue('off');
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Edit preview settings'})).toBeFocused();
 await page.getByRole('button',{name:'Refresh status'}).click();await expect(page.getByRole('status')).toContainText('refreshed');
});
for(const name of ['app-home','app-home-disconnected','app-home-connection-error','app-home-dark'])test(name+' fits and renders actual fields',async({page})=>{
 await story(page,name);await expect(page.getByRole('heading',{name:'Forgejo link previews'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await expect(page.locator('.wo-home')).toHaveScreenshot(name+'.png');
});
