import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const css=(await fs.readFile(new URL('../../src/skin.css',import.meta.url),'utf8')).replace(/^@import.*$/mg,'');
const fixture=`<html data-theme="hypergithub-auto" data-hgh-ready="true"><head><meta name="viewport" content="width=device-width"><style>
*{box-sizing:border-box}body{margin:8px;font:14px Arial}#diff-container{display:flex}#diff-content-container{flex:1 1 0%}.diff-file-box{border:1px solid #ddd}.diff-file-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;margin:0;padding:8px;gap:8px}.diff-file-name{display:flex;align-items:center;gap:4px;flex:1;min-width:90px}.file{display:flex;align-items:center;flex:1;min-width:0}.file-link{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ui.label{padding:4px 8px;background:#eee;white-space:nowrap}.diff-file-header-actions{display:flex;align-items:center;gap:4px;white-space:nowrap}.diff-file-header-actions button{padding:8px 12px}.diff-file-body pre{width:1100px;margin:0;padding:8px}.diff-file-body{overflow:auto}button{min-height:28px;cursor:pointer}
</style></head><body><main class="repository"><div id="diff-container"><div id="diff-content-container"><div id="diff-file-boxes"><div class="diff-file-box"><h4 class="diff-file-header"><div class="diff-file-name"><button aria-label="Collapse file">⌄</button><span>+45 −12</span><span class="file"><a class="file-link" href="#file" title="dist/public/assets/hypergithub/0.1.8/repository-controls.mjs">dist/public/assets/hypergithub/0.1.8/repository-controls.mjs</a><button aria-label="Copy file path">Copy</button><span class="ui label">vendored</span></span></div><div class="diff-file-header-actions"><button>Code</button><button>Raw</button><a href="#file">View file</a><label><input type="checkbox"> Viewed</label></div></h4><div class="diff-file-body"><pre>+ const aVeryLongSourceLine = '${'x'.repeat(140)}';</pre></div></div></div></div></div></main></body></html>`;
test('native diff headers, long paths and badges fit without losing actions or code scrolling',async({page})=>{
 // Exercise guaranteed narrow code overflow before restoring desktop. The 1100px
 // fixture can legitimately fit at 1280px; font metrics must not decide the assertion.
 await page.setViewportSize({width:Math.min(page.viewportSize().width,767),height:956});
 await page.setContent(fixture);await page.addStyleTag({content:css});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width+1);
 const visible=await page.locator('.diff-file-header-actions').evaluate(e=>{const r=e.getBoundingClientRect();return r.right<=innerWidth&&r.width>0});expect(visible).toBe(true);
 await expect(page.getByRole('link',{name:'View file',exact:true})).toBeVisible();
 await page.getByRole('checkbox',{name:'Viewed'}).check();await expect(page.getByRole('checkbox',{name:'Viewed'})).toBeChecked();
 // The source line is wider than the narrow viewport regardless of guest font metrics.
 const code=page.locator('.diff-file-body');
 expect(await code.evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true);
 await code.evaluate(e=>{e.scrollLeft=64;});
 expect(await code.evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);
 await expect(page.locator('.file-link')).toHaveAttribute('title',/repository-controls.mjs$/);
 await page.setViewportSize({width:1280,height:956});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1281);
 await expect(page.getByRole('link',{name:'View file',exact:true})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:'Viewed'})).toBeChecked();
});
