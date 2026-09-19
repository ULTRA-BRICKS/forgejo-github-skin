import {test,expect} from '@playwright/test';import fs from 'node:fs/promises';
const css=(await fs.readFile(new URL('../../src/skin.css',import.meta.url),'utf8')).replace(/^@import.*$/mg,'');
test('native Settings reserves no more than one compact control and retains its accessible name',async({page})=>{
 await page.setContent('<html data-theme="hypergithub-auto"><style>.overflow-menu-items{display:flex}.item{box-sizing:border-box;display:flex;align-items:center;padding:11px 12px}svg{flex-shrink:0}</style><body><main class="repository"><nav class="secondary-nav"><div class="overflow-menu-items"><a class="item" href="/code">Code</a><a class="item active" href="/pulls">Pull requests</a><a class="item" id="settings-btn" href="/settings"><svg width="16" height="16" aria-hidden="true"><rect width="16" height="16"/></svg><span class="resize-for-semibold">Settings</span></a></div></nav></main></body></html>');await page.addStyleTag({content:css});
 const settings=page.getByRole('link',{name:'Settings',exact:true});await expect(settings).toBeVisible();
 expect(await settings.evaluate(e=>e.offsetWidth)).toBeLessThanOrEqual(38);
 await page.setViewportSize({width:1280,height:900});expect(await settings.evaluate(e=>e.offsetWidth)).toBeGreaterThan(38);
});
for(const id of ['states-micro-interactions--controls','sharing-compact-previews--gallery'])test(id+' stays within narrow viewports',async({page})=>{
 await page.goto('/iframe.html?id='+id+'&viewMode=story');await expect(page.locator('#storybook-root')).not.toBeEmpty();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
test('native overflow width reservation keeps the active PR while Settings remains reachable',async({page})=>{
 await page.setViewportSize({width:320,height:900});
 await page.setContent('<html data-theme="hypergithub-auto"><style>body{margin:8px}.secondary-nav{width:304px;position:relative}.overflow-menu-items{display:flex;gap:8px}.item{box-sizing:border-box;display:flex;align-items:center;flex-shrink:0;width:80px;height:36px}.active{width:133px}.issues{width:122px}#settings-btn{width:101px}.overflowed{display:none}</style><body><main class="repository"><nav class="secondary-nav"><div class="overflow-menu-items"><a class="item" href="/code">Code</a><a class="item issues" href="/issues">Issues</a><a class="item active" href="/pulls">Pull requests</a><a class="item" id="settings-btn" href="/settings"><svg width="16" height="16" aria-hidden="true"></svg><span class="resize-for-semibold">Settings</span></a></div><div class="overflowed"></div></nav></main></body></html>');
 await page.addStyleTag({content:css});
 // Forgejo 16's measured contract: reserve Settings width and move native nodes past the right boundary.
 const layout=()=>page.evaluate(()=>{const nav=document.querySelector('.secondary-nav'),items=nav.querySelector('.overflow-menu-items'),more=nav.querySelector('.overflowed');for(const node of [...more.children])items.append(node);const reserve=items.querySelector('#settings-btn').offsetWidth;const right=nav.offsetLeft+nav.offsetWidth;const hidden=[...items.children].filter(e=>right-(e.offsetLeft+e.offsetWidth)<reserve);for(const node of hidden)more.append(node);return {reserve,activeVisible:!!items.querySelector('.active')?.getClientRects().length,settingsReachable:!!more.querySelector('#settings-btn')};});
 let measured=await layout();expect(measured.reserve).toBe(32);expect(measured.activeVisible).toBe(true);expect(measured.settingsReachable).toBe(true);
 // Demonstrate the old large reservation reproduces the live regression.
 await page.addStyleTag({content:'#settings-btn.item{width:101px!important;min-width:101px!important;max-width:101px!important}'});
 measured=await layout();expect(measured.activeVisible).toBe(false);
});
