import {chromium} from '@playwright/test';import fs from 'node:fs/promises';
const browser=await chromium.connectOverCDP('http://127.0.0.1:9223'),context=browser.contexts()[0];
const {version}=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
const base='https://git.hyperide.ai/ultrabricks/forgejo-github-skin',out=process.env.FORGEJO_EVIDENCE_DIR||'.qa/native-page-matrix';await fs.mkdir(out,{recursive:true});
const routes=[['repository',''],['issues','/issues'],['issue','/issues/28'],['pulls','/pulls'],['pull','/pulls/31'],['changes','/pulls/31/files'],['file','/src/branch/main/src/core.mjs'],['history','/commits/branch/main'],['branches','/branches'],['actions','/actions']];
const tasks=[320,440,1280].flatMap(width=>['light','dark'].flatMap(scheme=>routes.map(([name,route])=>({width,scheme,name,url:base+route}))));
let next=0;const results=[];
await Promise.all(Array.from({length:2},async()=>{while(next<tasks.length){const job=tasks[next++],p=await context.newPage(),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.setViewportSize({width:job.width,height:956});await p.emulateMedia({colorScheme:job.scheme,reducedMotion:'reduce'});
  const response=await p.goto(job.url,{waitUntil:'load'});await p.locator('html[data-hgh-ready]').waitFor({state:'attached'});await p.evaluate(()=>document.fonts.ready);
  const measure=await p.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,theme:document.documentElement.dataset.theme,skin:document.querySelector('link[data-hgh-release-theme]')?.href,title:document.title}));
  const pass=response.status()===200&&measure.scrollWidth<=job.width+1&&errors.length===0;
  await p.screenshot({path:out+'/'+job.name+'-'+job.width+'-'+job.scheme+'.png',mask:[p.locator('img.avatar')],maskColor:'#cbd1d6',animations:'disabled'});
  results.push({...job,...measure,status:response.status(),errors,pass});if(!pass)console.log('FAIL',results.at(-1));
 }catch(error){results.push({...job,pass:false,error:error.message});console.log('ERROR',job.name,job.width,job.scheme,error.message.slice(0,150));}
 finally{await p.close();}
}}));
const proof={release:version,source:'actual authenticated Forgejo, no injected styles',checkedAt:new Date().toISOString(),total:tasks.length,passed:results.filter(r=>r.pass).length,failures:results.filter(r=>!r.pass),results};
await fs.writeFile(out+'/proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify({total:proof.total,passed:proof.passed,failures:proof.failures},null,2));process.exit(proof.passed===proof.total?0:1);
