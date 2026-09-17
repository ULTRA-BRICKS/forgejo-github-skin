/** Synthetic DOM contract tests, NOT claims about authenticated Forgejo workflows. */
import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {loadPlaywright} from './playwright.mjs';
const {chromium}=await loadPlaywright();const root=path.resolve(import.meta.dirname,'..');
const packageVersion=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const fixture=theme=>`<!doctype html><html lang="en" data-theme="${theme}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/assets/css/theme-${theme}.css"><style>body{margin:0}.ui.container{margin:auto}.repo-button-row,.button-sequence{display:flex}.ui.table{width:100%}.ui.button{border:1px solid}.secondary-nav .item{display:inline-flex}.page-content{min-width:0}.clone-panel{display:flex}.file-content{overflow:auto}button,summary{cursor:pointer}</style></head><body><nav id="navbar">Hyperide — synthetic test fixture</nav><main class="repository page-content file list"><div class="secondary-nav"><div class="ui container repo-header"><div class="flex-item-title"><a href="/git/lab">lab</a> / <a href="/git/lab/repo">repo</a></div></div><div class="overflow-menu-items"><a class="item" href="/git/lab/repo"><svg class="octicon-code"></svg>Code</a><a class="item" href="/git/lab/repo/issues"><svg class="octicon-issue-opened"></svg>Issues</a><a class="item" href="/git/lab/repo/pulls"><svg class="octicon-git-pull-request"></svg>Pull requests</a><a class="item" href="/git/lab/repo/actions">Actions</a><a class="item" href="/git/lab/repo/projects">Projects</a></div></div><div class="ui container"><div class="repo-button-row"><div class="button-sequence"><div class="js-branch-tag-selector"><button class="branch-dropdown-button ui button" onclick="this.dataset.clicked='true'">main</button></div><a class="ui button" href="/git/lab/repo/find/branch/feature%2Fnavigation">Go to file</a></div><div><div class="clone-panel"><button>HTTPS</button><input aria-label="Clone URL" value="https://example.invalid/lab/repo.git"><button>Copy URL</button></div></div></div><table id="repo-files-table" class="ui table"><tbody><tr><td class="name">src</td><td class="message">Improve navigation</td><td class="age">yesterday</td></tr></tbody></table><div class="non-diff-file-content"><a href="/git/lab/repo/blame/branch/feature%2Fnavigation/src/file.ts">Blame</a><a href="/git/lab/repo/_edit/feature%2Fnavigation/src/file.ts">Edit</a><div class="file-content"><pre>${'const longLine = "'+'x'.repeat(240)+'";'}</pre><span id="L42" data-line-number="42">42</span></div></div><input aria-label="Search issues"><div contenteditable="true" aria-label="Editor">editable</div><div role="dialog" aria-modal="true" style="display:none">Hidden native modal</div></div></main><script type="module" src="/assets/hypergithub/${packageVersion}/skin.mjs"></script></body></html>`;
const requests=[];
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');requests.push({method:req.method,path:u.pathname});
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 try {
  if(u.pathname.startsWith('/assets/')) {
   if(/theme-forgejo|theme-forgejo-light|theme-forgejo-dark|theme-forgejo-auto/.test(u.pathname)){res.setHeader('Content-Type','text/css');return res.end('/* Native base omitted from synthetic contract tests. */');}
   const file=path.resolve(root,'dist/public','.'+u.pathname);
   if(!file.startsWith(path.join(root,'dist/public')+path.sep)){res.writeHead(403);return res.end();}
   const data=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');return res.end(data);
  }
  res.setHeader('Content-Type','text/html');res.end(fixture(u.searchParams.get('theme')||'hypergithub-light'));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),results=[];
async function test(name,fn){try{await fn();results.push({name,status:'pass'});console.log('PASS',name);}catch(e){results.push({name,status:'fail',error:e.message});console.error('FAIL',name,e.message);}}
try{
 for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport,isMobile:device==='mobile',hasTouch:device==='mobile'}),page=await context.newPage();
  const ready=async(theme='hypergithub-light')=>{await page.goto(base+'/git/lab/repo?theme='+theme);if(theme.startsWith('hypergithub'))await page.locator('html[data-hgh-ready="true"]').waitFor();};
  await test(`${device}: only intended themes enhance`,async()=>{await ready('forgejo-light');assert.equal(await page.locator('.hgh-clone').count(),0);await ready();assert.equal(await page.locator('.hgh-clone').count(),1);});
  await test(`${device}: disclosure contains native controls and Escape restores focus`,async()=>{await ready();await page.locator('.hgh-clone summary').click();await page.getByRole('textbox',{name:'Clone URL'}).focus();await page.keyboard.press('Escape');assert.equal(await page.locator('.hgh-clone').evaluate(e=>e.open),false);assert.equal(await page.locator('.hgh-clone summary').evaluate(e=>e===document.activeElement),true);});
  await test(`${device}: outside click closes disclosure`,async()=>{await ready();await page.locator('.hgh-clone summary').click();await page.locator('#navbar').click();assert.equal(await page.locator('.hgh-clone').evaluate(e=>e.open),false);});
  await test(`${device}: editable fields never trigger navigation`,async()=>{await ready();await page.getByRole('textbox',{name:'Search issues'}).fill('');await page.keyboard.type('g i t w b e');assert.ok(page.url().includes('/git/lab/repo?'));});
  await test(`${device}: sequence follows existing subpath link despite a hidden modal`,async()=>{await ready();await page.keyboard.press('g');await page.keyboard.press('i');await page.waitForURL('**/git/lab/repo/issues');});
  await test(`${device}: t preserves escaped branch path`,async()=>{await ready();await page.keyboard.press('t');await page.waitForURL('**/find/branch/feature%2Fnavigation');});
  await test(`${device}: w invokes native branch control`,async()=>{await ready();await page.keyboard.press('w');assert.equal(await page.locator('.branch-dropdown-button').getAttribute('data-clicked'),'true');});
  await test(`${device}: help remains reachable when character shortcuts are disabled`,async()=>{await ready();await page.getByRole('button',{name:'Keyboard shortcuts',exact:true}).click();await page.locator('#hgh-help input').uncheck();await page.keyboard.press('Escape');await page.keyboard.press('g');await page.keyboard.press('i');assert.ok(page.url().includes('?theme'));await page.keyboard.press('?');assert.equal(await page.locator('#hgh-help').evaluate(d=>d.open),true);await page.locator('#hgh-help input').check();await page.keyboard.press('Escape');});
  await test(`${device}: go-to-line uses existing line and URL hash`,async()=>{await ready();await page.keyboard.press('l');await page.getByRole('textbox',{name:'Line number',exact:true}).fill('42');await page.getByRole('button',{name:'Go',exact:true}).click();assert.equal(new URL(page.url()).hash,'#L42');});
  await test(`${device}: HTMX repeated enhancement is idempotent`,async()=>{await ready();await page.evaluate(()=>{for(let i=0;i<10;i++)document.dispatchEvent(new Event('htmx:afterSwap'));});await page.waitForTimeout(100);assert.equal(await page.locator('.hgh-clone').count(),1);assert.equal(await page.locator('[data-hgh-help]').count(),1);});
  await test(`${device}: changing back to native theme removes enhancement wrappers`,async()=>{await ready();await page.evaluate(()=>document.documentElement.dataset.theme='forgejo-light');await page.waitForTimeout(100);assert.equal(await page.locator('.hgh-clone').count(),0);assert.equal(await page.locator('[data-hgh-help]').count(),0);assert.equal(await page.locator('.clone-panel').count(),1);});
  await test(`${device}: no document-wide horizontal scrolling`,async()=>{await ready();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));});
  await test(`${device}: excluded units hidden only in scoped navigation`,async()=>{await ready();assert.equal(await page.locator('.secondary-nav a[href$="/projects"]').isVisible(),false);});
  await test(`${device}: dark palette is actually applied`,async()=>{await ready('hypergithub-dark');assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(13, 17, 23)');});
  await test(`${device}: reduced motion removes added transitions`,async()=>{const c=await browser.newContext({viewport,reducedMotion:'reduce'}),p=await c.newPage();await p.goto(base);await p.locator('html[data-hgh-ready]').waitFor();assert.equal(await p.locator('.hgh-clone summary').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await c.close();});
  await context.close();
 }
 await test('overlay performs no mutation requests',async()=>assert.ok(requests.every(r=>r.method==='GET'&&!r.path.startsWith('/api/'))));
}finally{
 await browser.close();await new Promise(r=>server.close(r));
 await fs.mkdir(path.join(root,'research'),{recursive:true});await fs.writeFile(path.join(root,'research/browser-test-results.json'),JSON.stringify({kind:'synthetic-DOM-contracts',completedAt:new Date().toISOString(),results},null,2));
}
if(results.some(r=>r.status==='fail'))process.exitCode=1;
