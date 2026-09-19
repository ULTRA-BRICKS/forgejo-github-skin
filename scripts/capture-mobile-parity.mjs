import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from '@playwright/test';
const base=process.argv[2]||'http://127.0.0.1:6119';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'research/screenshots/mobile-parity');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),checks=[];
try{
 for(const [name,id] of [['repository','screens-repository--desktop'],['private','screens-repository--private'],['folder','screens-repository--folder'],['signed-out','screens-repository--signed-out'],['pulls','screens-workflows--pull-requests'],['pull-options','screens-workflows--pull-request-options'],['compact','screens-workflows--pull-requests-compact'],['issues','screens-workflows--issues'],['branches','screens-workflows--branches'],['pull-detail','screens-workflows--pull-request-detail']]){
  const page=await browser.newPage({viewport:{width:440,height:956},deviceScaleFactor:3});
  await page.goto(base+'/iframe.html?id='+id+'&viewMode=story',{waitUntil:'networkidle'});
  await page.locator('.hgh-app-header').waitFor();
  await page.screenshot({path:path.join(out,name+'-after.png'),animations:'disabled'});
  if(name==='repository'){
   await page.screenshot({path:path.join(out,'header-after.png'),clip:{x:0,y:0,width:440,height:100},animations:'disabled'});
   await page.locator('.hgh-repo-toolbar').screenshot({path:path.join(out,'toolbar-after.png'),animations:'disabled'});
  }
  checks.push({id,file:name+'-after.png',viewport:page.viewportSize(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)});
  await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(path.join(root,'docs/proofs/mobile-captures.json'),JSON.stringify({source:'Synthetic Storybook states; no user private repository content',url:base,checkedAt:new Date().toISOString(),engine:'Chromium',deviceScaleFactor:3,checks},null,2));
console.log(JSON.stringify({screens:checks.length,overflow:checks.filter(x=>x.overflow>0)},null,2));
