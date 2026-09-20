import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),candidate=process.env.FJ_CANDIDATE==='1';
const {version}=JSON.parse(await fs.readFile('package.json','utf8'));
const b=await chromium.connectOverCDP('http://127.0.0.1:9223');
const out=path.join(root,'.qa/acceptance020/'+(candidate?'candidate':'live'));await fs.mkdir(out,{recursive:true});
const repo='https://git.hyperide.ai/ultrabricks/forgejo-github-skin',results=[];
const widths=[320,440,1280],schemes=['light','dark'];
for(const width of widths)for(const scheme of schemes){
 const p=await b.contexts()[0].newPage();p.setDefaultTimeout(12000);await p.setViewportSize({width,height:956});await p.emulateMedia({colorScheme:scheme});
 if(candidate)await p.route('**/assets/**',async r=>{
  const u=new URL(r.request().url());let file;
  if(/\/hypergithub\/[^/]+\/[^/]+\.(css|mjs)$/.test(u.pathname))file=path.join(root,'src',u.pathname.split('/').at(-1));
  if(/\/css\/theme-hypergithub-(auto|light|dark)\.css$/.test(u.pathname))file=path.join(root,'dist/public/assets/css',u.pathname.split('/').at(-1));
  if(!file)return r.continue();try{await r.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.css')?'text/css':'text/javascript'});}catch{return r.continue();}
 });
 try{
  await p.goto(repo,{waitUntil:'domcontentloaded'});await p.locator('[data-hgh-repo-controls]').waitFor();
  if(!candidate)await expect(p.locator('link[data-hgh-release-theme]')).toHaveAttribute('href',new RegExp('skin='+version.replaceAll('.','\\.')));
  const dims=await p.locator('.repo-button-row').evaluate(row=>{const box=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height}};return{branch:box(row.querySelector('.branch-dropdown-button')),clone:box(row.querySelector('.hgh-clone>summary')),more:box(row.querySelector('.hgh-repo-more>summary')),width:innerWidth,scroll:document.documentElement.scrollWidth};});
  expect(dims.scroll).toBeLessThanOrEqual(width+1);
  if(width<768){expect(Math.abs(dims.branch.y-dims.clone.y)).toBeLessThanOrEqual(1);expect(Math.abs(dims.more.y-dims.clone.y)).toBeLessThanOrEqual(1);await p.locator('.hgh-repo-more>summary').click();await expect(p.getByRole('button',{name:'Keyboard shortcuts',exact:true})).toBeVisible();}
  await p.getByRole('button',{name:'Keyboard shortcuts',exact:true}).click();await expect(p.locator('.hgh-dialog[open]')).toBeVisible();await p.keyboard.press('Escape');await expect(p.locator('.hgh-dialog[open]')).toHaveCount(0);
  if(width<768){await p.keyboard.press('Escape');await expect(p.locator('.hgh-repo-more')).not.toHaveAttribute('open','');}
  await p.locator('.hgh-clone>summary').click();await expect(p.locator('#repo-clone-url')).toBeVisible();await p.locator('#repo-clone-ssh').click();await expect(p.locator('#repo-clone-url')).toHaveValue(/^ssh:/);await p.locator('#repo-clone-https').click();await p.keyboard.press('Escape');
  const search=p.locator('.code-search');await search.getByRole('combobox',{name:'Search type'}).click();await search.locator('[data-value=union]').click();await expect.poll(()=>search.locator('form').evaluate(f=>new FormData(f).get('mode'))).toBe('union');await p.keyboard.press('Escape');
  await p.screenshot({path:path.join(out,`repository-${width}-${scheme}.png`),fullPage:true,mask:[p.locator('img.avatar')],maskColor:'#cbd1d6'});
  const regions={};for(const [key,selector]of [['social','.repo-buttons'],['toolbar','.repo-button-row'],['search','.code-search']]){await p.locator(selector).screenshot({path:path.join(out,`${key}-${width}-${scheme}.png`)});regions[key]=await p.locator(selector).boundingBox();}
  results.push({width,scheme,candidate,version,pass:true,dimensions:dims,regions});
 }catch(error){results.push({width,scheme,candidate,pass:false,error:error.message});await p.screenshot({path:path.join(out,`failure-${width}-${scheme}.png`),fullPage:true}).catch(()=>{});}
 finally{await p.close();}
}
const proof={checkedAt:new Date().toISOString(),candidate,version,passed:results.filter(x=>x.pass).length,results};
await fs.writeFile(path.join(out,'repository-proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));process.exit(proof.passed===widths.length*schemes.length?0:1);
