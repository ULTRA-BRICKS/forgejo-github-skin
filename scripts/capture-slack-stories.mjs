import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
const base=process.argv[2]||'http://127.0.0.1:6127';
const output=path.resolve('research/screenshots/slack-native');await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch();
try{
 for(const [name,id,width] of [['pull-request-light','pull-request',600],['pull-request-dark','dark-pull-request',600],['pull-request-mobile','mobile-pull-request',390],['private-summary','private-pull-request',390],['file','file',600],['repository-activity','repository',600],['settings','settings',440],['actions','actions-menu',440]]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:2});
  await page.goto(base+'/iframe.html?id=sharing-slack-native-unfurls--'+id+'&viewMode=story',{waitUntil:'domcontentloaded'});
  await page.locator('.wo-card').waitFor();
  const target=id==='settings'?page.getByRole('dialog'):id==='actions-menu'?page.locator('.wo-menu'):page.locator('.wo-card');
  await target.waitFor();await page.evaluate(()=>document.fonts.ready);
  for(const image of await target.locator('img').all())await image.evaluate(e=>e.decode());
  await target.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});
  console.log(name);await page.close();
 }
}finally{await browser.close();}
