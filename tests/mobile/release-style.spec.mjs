import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const base='https://release.test/git';
test('an old cached theme cannot mask new skin CSS; theme changes reuse one versioned link',async({page})=>{
 const requests=[];
 await page.route('https://release.test/**',async route=>{
  const url=new URL(route.request().url());requests.push(url.pathname+url.search);
  if(url.pathname.endsWith('/skin.mjs')||url.pathname.endsWith('/core.mjs')||url.pathname.endsWith('/mobile-chrome.mjs')||url.pathname.endsWith('/list-options.mjs')||url.pathname.endsWith('/repository-controls.mjs'))return route.fulfill({contentType:'text/javascript',body:await fs.readFile(new URL('../../src/'+url.pathname.split('/').at(-1),import.meta.url),'utf8')});
  if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:':root{--release-probe:v'+url.searchParams.get('skin').replaceAll('.','_')+'}'});
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en" data-theme="hypergithub-auto"><head><meta name="viewport" content="width=device-width"><style>:root{--release-probe:old}</style></head><body><overflow-menu></overflow-menu><script>window.updateCalls=0;document.querySelector("overflow-menu").updateItems=()=>window.updateCalls++;</script><script type="module" src="/git/assets/hypergithub/0.1.6/skin.mjs"></script></body></html>'});
 });
 await page.goto(base+'/repo');
 const current=page.locator('link[data-hgh-release-theme]');await expect(current).toHaveCount(1);
 await expect(current).toHaveAttribute('href',base+'/assets/css/theme-hypergithub-auto.css?skin=0.1.6');
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--release-probe').trim())).toBe('v0_1_6');
 await expect.poll(()=>page.evaluate(()=>window.updateCalls)).toBe(1);
 await page.evaluate(()=>document.documentElement.dataset.theme='hypergithub-dark');
 await expect(current).toHaveAttribute('href',base+'/assets/css/theme-hypergithub-dark.css?skin=0.1.6');await expect(current).toHaveCount(1);
 await page.evaluate(()=>document.documentElement.dataset.theme='forgejo-auto');await expect.poll(()=>current.evaluate(el=>el.disabled)).toBe(true);
 await page.evaluate(()=>document.documentElement.dataset.theme='hypergithub-auto');await expect.poll(()=>current.evaluate(el=>el.disabled)).toBe(false);
 expect(requests.some(url=>url.includes('theme-hypergithub-auto.css?skin=0.1.6'))).toBe(true);
});
