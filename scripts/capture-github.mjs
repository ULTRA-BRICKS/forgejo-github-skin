import {loadPlaywright} from './playwright.mjs';
const {chromium}=await loadPlaywright();
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const api=(p)=>JSON.parse(execFileSync('gh',['api',p],{encoding:'utf8',timeout:30000}));
const repo='primer/react', base=`https://github.com/${repo}`;
const meta=api(`repos/${repo}`), branch=meta.default_branch;
const pr=api(`repos/${repo}/pulls?state=all&per_page=1`)[0]??null;
const issue=api(`repos/${repo}/issues?state=all&per_page=30`).find(x=>!x.pull_request)??null;
const commit=api(`repos/${repo}/commits?per_page=1`)[0];
const runs=api(`repos/${repo}/actions/runs?per_page=1`).workflow_runs;
const pages=[['repository',''],['branches','/branches'],['directory',`/tree/${branch}/.github`],['file',`/blob/${branch}/package.json`],['commits',`/commits/${branch}/`],['file-history',`/commits/${branch}/package.json`],['commit',`/commit/${commit.sha}`],['blame',`/blame/${branch}/package.json`],['issues','/issues'],['pulls','/pulls'],['compare',`/compare/${commit.sha}...${branch}`],['search',`/search?q=Button&type=issues`],['actions','/actions']];
if(issue) pages.push(['issue',`/issues/${issue.number}`]);
if(pr) pages.push(['pull',`/pull/${pr.number}`],['pull-commits',`/pull/${pr.number}/commits`],['pull-files',`/pull/${pr.number}/files`]);
if(runs[0]) pages.push(['action-run',`/actions/runs/${runs[0].id}`]);
await fs.mkdir(`${root}/research/observations`,{recursive:true});
const manifest={capturedAt:new Date().toISOString(),repo,branch,commit:commit.sha,pr:pr?.number??null,issue:issue?.number??null,auth:'signed-out public repository; no private account settings',records:[]};
const browser=await chromium.launch({headless:true});
const props=['color','backgroundColor','borderColor','borderRadius','borderWidth','fontFamily','fontSize','fontWeight','lineHeight','padding','margin','gap','height','width','boxShadow','transitionDuration','transitionTimingFunction','animationDuration'];
const metrics=()=>{const s=getComputedStyle(document.documentElement);return {url:location.href,title:document.title,htmlAttributes:Object.fromEntries([...document.documentElement.attributes].map(a=>[a.name,a.value])),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},scrollWidth:document.documentElement.scrollWidth,tokens:Object.fromEntries([...s].filter(k=>k.startsWith('--')).map(k=>[k,s.getPropertyValue(k).trim()])),elements:[...document.querySelectorAll('body,header,main,h1,h2,button,input,nav,a,pre,code,[role=dialog],[role=tab],[role=menu]')].filter(e=>e.getBoundingClientRect().width>0).slice(0,160).map(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,class:e.className,label:e.getAttribute('aria-label'),text:(e.innerText||'').slice(0,80),role:e.getAttribute('role'),hotkey:e.getAttribute('data-hotkey'),rect:{x:r.x,y:r.y,width:r.width,height:r.height},styles:Object.fromEntries(props.map(k=>[k,c[k]]))}})}};
for(const [device,viewport,isMobile] of [['desktop',{width:1440,height:1000},false],['mobile',{width:390,height:844},true]]){
 const context=await browser.newContext({viewport,isMobile,hasTouch:isMobile,deviceScaleFactor:1,colorScheme:'light',locale:'en-US'});
 const page=await context.newPage();page.setDefaultTimeout(5000);
 await fs.mkdir(`${root}/research/screenshots/github/${device}`,{recursive:true});
 async function save(name,extra={}){const data=await page.evaluate(metrics);const file=`research/screenshots/github/${device}/${name}.png`;await page.screenshot({path:`${root}/${file}`});await fs.writeFile(`${root}/research/observations/github-${device}-${name}.json`,JSON.stringify(data,null,2));const record={device,name,url:page.url(),title:data.title,file,...extra};manifest.records.push(record);await fs.writeFile(`${root}/research/capture-manifest.json`,JSON.stringify(manifest,null,2));console.log(JSON.stringify(record));}
 for(const [name,suffix] of pages){
  try {const response=await page.goto(base+suffix,{waitUntil:'domcontentloaded',timeout:35000});await page.waitForTimeout(1300);const text=await page.locator('body').innerText();const status=response?.status()??0;const blocked=!response||status>=400||/Whoa there!|rate limit exceeded|Too many requests/i.test(text);await save(name,{httpStatus:status||null,status:blocked?'blocked':'captured'});if(status===429)break;}
  catch(e){manifest.records.push({device,name,status:'failed',error:e.message});console.log('FAILED',device,name,e.message);}
 }
 const actions=[['branch-switcher',async()=>{await page.keyboard.press('w');}],['keyboard-help',async()=>{await page.keyboard.press('?');}],['file-finder',async()=>{await page.keyboard.press('t');}],['clone-menu',async()=>{await page.getByRole('button',{name:'Code',exact:true}).click();}]];
 for(const [name,perform] of actions){
  try {await page.goto(base,{waitUntil:'domcontentloaded',timeout:35000});await page.waitForTimeout(1000);await perform();await page.waitForTimeout(650);const dialogs=await page.locator('[role=dialog]:visible,[role=menu]:visible,details[open]').count();const active=await page.locator(':focus').evaluate(e=>({tag:e.tagName,role:e.getAttribute('role'),label:e.getAttribute('aria-label')})).catch(()=>null);await save(name,{status:dialogs>0||page.url().includes('/find/')?'interaction-observed':'needs-manual-validation',dialogs,active});await page.keyboard.press('Escape');}
  catch(e){manifest.records.push({device,name,status:'failed',error:e.message});console.log('FAILED',device,name,e.message);}
 }
 await context.close();
}
await browser.close();
await fs.writeFile(`${root}/research/capture-manifest.json`,JSON.stringify(manifest,null,2));
console.log('COMPLETE',manifest.records.length);
