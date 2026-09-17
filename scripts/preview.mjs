import {loadPlaywright} from './playwright.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');const {chromium}=await loadPlaywright();
const browser=await chromium.launch();const report={at:new Date().toISOString(),results:[]};
await fs.mkdir(`${root}/research/screenshots/preview`,{recursive:true});
try{
 const c=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'}),p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const r=await p.goto('http://127.0.0.1:3187/',{waitUntil:'networkidle',timeout:30000});assert.equal(r.status(),200);
 const result=await p.evaluate(()=>({theme:document.documentElement.dataset.theme,ready:document.documentElement.dataset.hghReady,background:getComputedStyle(document.body).backgroundColor,version:document.querySelector('footer')?.innerText}));
 assert.equal(result.theme,'hypergithub-auto');assert.equal(result.ready,'true');assert.equal(result.background,'rgb(255, 255, 255)');assert.deepEqual(errors,[]);
 await p.screenshot({path:`${root}/research/screenshots/preview/native-16.0.3-homepage.png`});report.results.push({name:'native-16.0.3-assets-and-footer',status:'pass',scope:'real empty Forgejo homepage only; not authenticated repository workflows',...result});await c.close();
 const css=(await fs.readFile(`${root}/dist/public/assets/css/theme-hypergithub-light.css`,'utf8')).replace(/@import[^;]+;/g,'')+'\n'+await fs.readFile(`${root}/src/skin.css`,'utf8');
 const js=(await fs.readFile(`${root}/src/core.mjs`,'utf8')).replace(/^export\s+/gm,'')+'\n'+(await fs.readFile(`${root}/src/skin.mjs`,'utf8')).replace(/^import\s.+$/gm,'');
 for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport,colorScheme:'light',bypassCSP:true,isMobile:device==='mobile',hasTouch:device==='mobile'});const page=await context.newPage();
  for(const [name,url] of [['repository','https://codeberg.org/forgejo/forgejo'],['issues','https://codeberg.org/forgejo/forgejo/issues']]){
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(1000);assert.equal(response.status(),200);
   const prefix=`research/screenshots/preview/codeberg-${device}-${name}`;await page.screenshot({path:`${root}/${prefix}-before.png`});
   await page.addStyleTag({content:css});await page.evaluate(()=>document.documentElement.dataset.theme='hypergithub-light');await page.addScriptTag({content:`(()=>{${js}\n})();`});await page.waitForTimeout(300);
   await page.screenshot({path:`${root}/${prefix}-after.png`});report.results.push({name:`${device}-${name}`,status:'browser-preview',url,before:prefix+'-before.png',after:prefix+'-after.png',scope:'read-only browser injection on public Codeberg development version; not deployment and not exact-version integration',overflow:await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}))});
  }await context.close();
 }
}catch(e){report.results.push({status:'failed',error:e.stack});process.exitCode=1;}
finally{await browser.close();await fs.writeFile(`${root}/research/preview-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
