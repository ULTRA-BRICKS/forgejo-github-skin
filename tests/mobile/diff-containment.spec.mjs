import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const css=(await fs.readFile(new URL('../../src/skin.css',import.meta.url),'utf8')).replace(/^@import.*$/mg,'');
const code='const aVeryLongIdentifier = '+JSON.stringify('data/'.repeat(160))+';';
const markup='<html data-theme="hypergithub-light"><head><meta name="viewport" content="width=device-width"><style>body{margin:8px;font:14px Arial}#diff-main{display:flex}#diff-content-container{flex-grow:1}#diff-file-boxes{display:flex;flex-direction:column}.diff-file-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap}.diff-file-name{display:flex;align-items:center;gap:4px;min-width:100px;flex:1}.diff-file-name>.file{display:flex;align-items:center;flex:1;min-width:0}.diff-file-header-actions{display:flex;align-items:center;gap:8px}.diff-file-body>.file-body>table{border-collapse:collapse;white-space:pre;min-width:100%}td{padding:5px}.diff-file-box{border:1px solid #ddd}.diff-file-body{border-top:1px solid #ddd}</style></head><body><main class="repository"><div id="diff-main"><div id="diff-content-container"><div id="diff-file-boxes"><section class="diff-file-box"><header class="diff-file-header"><div class="diff-file-name"><button aria-label="Fold file">▾</button><span>+12 −2</span><span class="file"><a href="#file" class="file-link" title="packages/components/keyboard/very-long-file-name.ts">packages/components/keyboard/very-long-file-name.ts</a><button aria-label="Copy path">Copy</button></span></div><div class="diff-file-header-actions"><a href="#file">View file</a><label><input type="checkbox">Viewed</label></div></header><div class="diff-file-body"><div class="file-body code-diff"><table><tbody><tr><td>12</td><td>+</td><td>'+code+'</td></tr></tbody></table></div></div></section></div></div></div></main></body></html>';
for(const theme of ['hypergithub-light','hypergithub-dark','hypergithub-auto'])test(theme+': source diff scroll is local while filename and review controls remain reachable',async({page})=>{
 await page.setContent(markup.replace('hypergithub-light',theme));await page.addStyleTag({content:css});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width+1);
 const scroller=page.locator('.code-diff');expect(await scroller.evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true);
 await scroller.evaluate(e=>e.scrollLeft=400);expect(await scroller.evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);
 for(const selector of ['.diff-file-header-actions','[aria-label="Copy path"]','[aria-label="Fold file"]']){
  const rect=await page.locator(selector).boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(page.viewportSize().width+1);
 }
 expect((await page.locator('.file-link').boundingBox()).width).toBeGreaterThan(100);
 await expect(page.locator('.file-link')).toHaveAttribute('title','packages/components/keyboard/very-long-file-name.ts');
});
