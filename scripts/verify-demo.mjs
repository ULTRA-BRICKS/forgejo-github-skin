import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'research/screenshots/demo');await fs.mkdir(out,{recursive:true});
const base=process.env.DEMO_URL||'http://127.0.0.1:3188';
const browser=await chromium.launch();const results=[],errors=[];
try{
 for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const c=await browser.newContext({viewport,isMobile:device==='mobile',hasTouch:device==='mobile',colorScheme:'light'});const page=await c.newPage();page.setDefaultTimeout(7000);page.setDefaultNavigationTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  for(const [name,url] of [['repository','/demo-author/keyboard-lab'],['file','/demo-author/keyboard-lab/src/branch/main/src/navigation.ts'],['blame','/demo-author/keyboard-lab/blame/branch/main/src/navigation.ts'],['issues','/demo-author/keyboard-lab/issues'],['issue','/demo-author/keyboard-lab/issues/1'],['pull','/demo-author/keyboard-lab/pulls/3'],['pull-files','/demo-author/keyboard-lab/pulls/3/files']]){
   const r=await page.goto(base+url,{waitUntil:'domcontentloaded'});assert.equal(r.status(),200,name);await page.locator('html[data-hgh-ready="true"]').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
   const info=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,logo:document.querySelector('#navbar img')?.src,logoFilter:getComputedStyle(document.querySelector('#navbar-logo img')).filter,codeWhiteSpace:document.querySelector('.code-inner')?getComputedStyle(document.querySelector('.code-inner')).whiteSpace:null}));
   assert.ok(info.scrollWidth<=info.width+1,`page overflow: ${device}/${name}`);assert.ok(info.logoFilter.includes('grayscale'),'Forgejo logo monochrome');if(name==='file')assert.equal(info.codeWhiteSpace,'pre');
   await page.screenshot({path:path.join(out,`${device}-${name}.png`)});results.push({device,name,http:r.status(),...info});
  }
  await page.goto(base+'/demo-author/keyboard-lab');await page.locator('html[data-hgh-ready]').waitFor();await page.keyboard.press('g');await page.keyboard.press('i');await page.waitForURL('**/keyboard-lab/issues');results.push({device,test:'native g i navigation',pass:true});
  await c.close();
 }
 assert.deepEqual(errors,[]);
}catch(e){results.push({pass:false,error:e.message});process.exitCode=1;}
finally{await browser.close();await fs.writeFile(path.join(root,'research/demo-smoke.json'),JSON.stringify({url:base,capturedAt:new Date().toISOString(),scope:'Real Forgejo 16.0.5 server-rendered public routes. Keyboard assertion: g i only. Not full authenticated workflow acceptance.',results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));}
