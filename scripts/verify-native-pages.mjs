import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const {version}=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
const browser=await chromium.connectOverCDP(process.env.FORGEJO_QA_CDP||'http://127.0.0.1:9223');
const context=browser.contexts()[0],output=path.resolve(process.env.FORGEJO_EVIDENCE_DIR||'.qa/native-pages');
await fs.mkdir(output,{recursive:true});
const root='https://git.hyperide.ai',repo=root+'/ultrabricks/forgejo-github-skin';
const cases=[['organization',root+'/ultrabricks'],['pull',repo+'/pulls/31']];
const receipt={checkedAt:new Date().toISOString(),version,source:'Authenticated live Forgejo; no injected styles',results:[]};
try{
 for(const width of [320,440,1280])for(const [name,url]of cases){
  const page=await context.newPage();page.setDefaultTimeout(16000);
  try{
   await page.setViewportSize({width,height:956});await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
   const response=await page.goto(url,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
   await page.waitForFunction(v=>{const link=document.querySelector('link[data-hgh-release-theme]');return link?.sheet&&new URL(link.href).searchParams.get('skin')===v;},version);
   await page.waitForTimeout(200);
   const data=await page.evaluate(name=>{
    const m={width:innerWidth,documentWidth:document.documentElement.scrollWidth,stylesheet:document.querySelector('link[data-hgh-release-theme]').href};
    if(name==='organization')Object.assign(m,{repositoriesY:document.querySelector('.eleven.column').getBoundingClientRect().y,membersY:document.querySelector('.segment.members').getBoundingClientRect().y,creationY:document.querySelector('.five.column>.center.aligned').getBoundingClientRect().y});
    else{const active=document.querySelector('.secondary-nav .overflow-menu-items>.item.active');m.activeTabVisible=!!active?.getClientRects().length;m.tabs=[...document.querySelectorAll('.ui.pull.tabular.menu>a.item')].map(e=>({label:e.textContent.replace(/\s+/g,' ').trim(),right:e.getBoundingClientRect().right,client:e.clientWidth,scroll:e.scrollWidth}));}
    return m;
   },name);
   assert.ok(data.documentWidth<=width+1);
   if(width<768&&name==='organization'){assert.ok(data.creationY<data.repositoriesY);assert.ok(data.repositoriesY<data.membersY);}
   if(width<768&&name==='pull'){assert.equal(data.activeTabVisible,true);assert.ok(data.tabs.every(t=>t.right<=width&&t.scroll<=t.client+1));
    await page.getByRole('button',{name:'More items',exact:true}).click();const settings=page.getByRole('menuitem',{name:'Settings',exact:true});await settings.waitFor();assert.ok((await settings.getAttribute('href')).endsWith('/settings'));await page.keyboard.press('Escape');data.settingsMenuReachable=true;}
   await page.screenshot({path:path.join(output,name+'-'+width+'.png'),animations:'disabled',mask:[page.locator('#navbar img.avatar')],maskColor:'#d1d9e0'});
   receipt.results.push({name,...data,passed:true});
  }finally{await page.close();}
 }
}catch(error){receipt.results.push({passed:false,error:error.message});process.exitCode=1;}
finally{receipt.allPassed=receipt.results.length===6&&receipt.results.every(r=>r.passed);await fs.writeFile(path.join(output,'proof.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));process.exit(process.exitCode||0);}
