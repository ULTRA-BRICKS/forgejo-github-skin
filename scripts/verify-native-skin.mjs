import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadPlaywright} from './playwright.mjs';
const {chromium}=await loadPlaywright();
const {version}=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
const browser=await chromium.connectOverCDP(process.env.FORGEJO_QA_CDP||'http://127.0.0.1:9223');
const output=path.resolve(process.env.FORGEJO_EVIDENCE_DIR||'.qa/native-skin');
await fs.mkdir(output,{recursive:true});
const proof={checkedAt:new Date().toISOString(),source:'https://git.hyperide.ai/ultrabricks/forgejo-github-skin',results:[]};
try {
 for(const [name,width,colorScheme] of [['mobile-light',440,'light'],['mobile-dark',440,'dark'],['desktop-light',1280,'light']]) {
  const page=await browser.contexts()[0].newPage();page.setDefaultTimeout(18000);
  try {
   await page.setViewportSize({width,height:956});await page.emulateMedia({colorScheme});
   await page.goto(proof.source+'/pulls',{waitUntil:'domcontentloaded'});
   await page.locator('html[data-hgh-repository-chrome]').waitFor({state:'attached'});
   assert.equal(new URL(page.url()).origin,'https://git.hyperide.ai');
   const state=await page.evaluate(()=>{
    const visible=e=>!!e&&getComputedStyle(e).visibility!=='hidden'&&e.getClientRects().length>0;
    return {theme:document.documentElement.dataset.theme,sourceScripts:[...document.scripts].map(s=>s.src).filter(s=>s.includes('/hypergithub/')),headerLogoVisible:visible(document.querySelector('#navbar-logo')),footerLogoVisible:visible(document.querySelector('footer.page-footer .hgh-footer-brand')),width:innerWidth,documentWidth:document.documentElement.scrollWidth,icons:[...document.querySelectorAll('#navbar svg')].filter(visible).map(e=>Math.round(e.getBoundingClientRect().width))};
   });
   console.log('Native state:',JSON.stringify({name,...state}));
   assert.ok(state.sourceScripts.some(src=>src.includes('/'+version+'/skin.mjs')));
   assert.equal(state.headerLogoVisible,false);assert.equal(state.footerLogoVisible,true);
   assert.ok(state.documentWidth<=width+1);
   if(width<768)assert.ok(state.icons.every(size=>size<=16));
   await page.locator('#navbar').screenshot({path:path.join(output,name+'-header.png'),mask:[page.locator('#navbar img.avatar')],maskColor:'#d1d9e0'});
   if(width<768) {
    const options=page.locator('[data-hgh-native-options]');await options.locator('summary').click();
    await page.locator('.hgh-options-panel .list-header-sort').click();
    assert.ok((await page.locator('.hgh-options-panel .list-header-sort .menu').innerText()).includes('Newest'));
    await page.locator('.hgh-options-panel').screenshot({path:path.join(output,name+'-options.png')});
    await page.keyboard.press('Escape');
    if(await options.evaluate(e=>e.open))await page.keyboard.press('Escape');
    assert.equal(await options.evaluate(e=>e.open),false);
    await page.setViewportSize({width:1280,height:956});
    await page.waitForFunction(()=>document.querySelector('[data-hgh-native-options]')?.hidden===true);
    assert.equal(await page.locator('#issue-filters .filter.menu .list-header-sort').count(),1);
    state.desktopRestoration=true;
   }
   proof.results.push({name,...state,passed:true});
  }finally{await page.close();}
 }
}catch(error){proof.results.push({passed:false,error:error.message});process.exitCode=1;}
finally {
 proof.allPassed=proof.results.length===3&&proof.results.every(r=>r.passed);
 await fs.writeFile(path.join(output,'native-skin-proof.json'),JSON.stringify(proof,null,2));
 console.log(JSON.stringify(proof,null,2));process.exit(process.exitCode||0);
}
