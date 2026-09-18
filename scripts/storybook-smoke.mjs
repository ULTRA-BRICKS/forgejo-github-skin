import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const base=process.argv[2] || 'http://127.0.0.1:6007';
const index=await (await fetch(base+'/index.json')).json();
const ids=Object.keys(index.entries).filter(id=>id.startsWith('sharing-compact-previews--'));
assert.ok(ids.includes('sharing-compact-previews--gallery'));
const browser=await chromium.launch({headless:true});
try { for(const id of ids){ const p=await browser.newPage({viewport:{width:390,height:844}}), errors=[]; p.on('pageerror',e=>errors.push(e.message)); const r=await p.goto(base+'/iframe.html?id='+id+'&viewMode=story',{waitUntil:'networkidle'}); assert.equal(r.status(),200,id); assert.equal(errors.length,0,id+': '+errors.join('; ')); assert.ok((await p.locator('#storybook-root').innerText()).trim().length>0,id); await p.close(); } } finally { await browser.close(); }
console.log(JSON.stringify({passed:ids.length,ids},null,2));
