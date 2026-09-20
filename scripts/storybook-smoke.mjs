import {visibleStoryContent} from './story-content.mjs';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const base=process.argv[2]||'http://127.0.0.1:6007';
const response=await fetch(base+'/index.json',{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);
const index=await response.json(),ids=Object.values(index.entries).filter(e=>e.type==='story').map(e=>e.id);
for(const required of ['sharing-compact-previews--gallery','screens-workflows--issues','sharing-slack-native-unfurls--app-home','sharing-slack-native-unfurls--gallery','sharing-slack-native-unfurls--settings','screens-workflows--pull-requests'])assert.ok(ids.includes(required));
const browser=await chromium.launch({headless:true}),results=[];
try{
 await Promise.all([320,1280].map(async width=>{
  const context=await browser.newContext({viewport:{width,height:900}});let next=0;
  try{await Promise.all(Array.from({length:2},async()=>{
   const page=await context.newPage();page.setDefaultTimeout(15000);let errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{for(;;){const id=ids[next++];if(!id)break;errors=[];
    try{
     const r=await page.goto(base+'/iframe.html?id='+id+'&viewMode=story',{waitUntil:'load'});
     await page.waitForFunction(visibleStoryContent,undefined,{polling:120,timeout:15000});
     await page.evaluate(async()=>{await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,2000))]);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
     const pass=r.status()===200&&!errors.length&&overflow<=1;
     results.push({id,width,pass,overflow,errors:[...errors]});
    }catch(error){results.push({id,width,pass:false,error:error.message});}
   }}finally{await page.close();}
  }));}finally{await context.close();}
 }));
}finally{await browser.close();}
results.sort((a,b)=>a.width-b.width||a.id.localeCompare(b.id));
const report={base,stories:ids.length,rendered:results.length,passed:results.filter(r=>r.pass).length,failures:results.filter(r=>!r.pass),results};
console.log(JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;
