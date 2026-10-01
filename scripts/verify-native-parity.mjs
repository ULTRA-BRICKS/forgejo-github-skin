/** Read-only native Forgejo keyboard proof; candidate mode swaps only this worktree's skin assets. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium, webkit} from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const base = process.env.PARITY_BASE || 'https://git.hyperide.ai/ultrabricks/forgejo-github-skin';
const out = process.env.PARITY_EVIDENCE || path.join(root, '.qa/native-parity');
const candidate = process.argv.includes('--candidate');
await fs.mkdir(out, {recursive:true});
const results = [];
for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await type.launch();
  try {
    for (const width of [390, 1440]) {
    const page = await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
    const prefix = `${engine}-${width}`;
    page.setDefaultTimeout(10000);
    if (candidate) await page.route('**/assets/hypergithub/*/*', async route => {
      const name = path.basename(new URL(route.request().url()).pathname);
      if (!/^[a-z-]+\.(mjs|css)$/.test(name)) return route.continue();
      const file = path.join(root, 'src', name);
      try { await route.fulfill({path:file, contentType:name.endsWith('.mjs')?'text/javascript':'text/css'}); }
      catch { await route.continue(); }
    });
    async function check(name, fn) {
      try { await fn(); results.push({engine,width,name,pass:true}); console.log('PASS',prefix,name); }
      catch(error) { results.push({engine,width,name,pass:false,error:error.message}); console.error('FAIL',prefix,name,error.message); }
    }
    async function openAuthor() {
      if (!await page.locator('.list-header-author').isVisible()) {
        const summary = page.locator('.hgh-list-options > summary');
        for (let step=0; step<80 && !await summary.evaluate(el=>el===document.activeElement); step++) await page.keyboard.press('Tab');
        assert.equal(await summary.evaluate(el=>el===document.activeElement), true);
        await page.keyboard.press('Enter');
      }
      await page.keyboard.press('u');
      await page.locator('.list-header-author .menu.visible').waitFor();
    }
    await check('branch Escape restores focus to native trigger', async () => {
      await page.goto(base, {waitUntil:'load'});
      await page.locator('.js-branch-tag-selector[data-v-app] .menu.transition').waitFor({state:'attached'});
      await page.locator('.branch-dropdown-button').waitFor();
      await page.locator('[data-hgh-ready]').waitFor();
      await page.keyboard.press('w');
      await page.locator('.js-branch-tag-selector input').waitFor({state:'visible'});
      await page.screenshot({path:path.join(out,prefix+'-branch-open.png')});
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      assert.equal(await page.locator('.branch-dropdown-button').evaluate(el=>el===document.activeElement), true);
      await page.screenshot({path:path.join(out,prefix+'-branch-dismissed.png')});
    });
    await check('branch keyboard selection preserves real server destination', async () => {
      await page.goto(base, {waitUntil:'load'});
      await page.locator('.js-branch-tag-selector[data-v-app] .menu.transition').waitFor({state:'attached'});
      await page.locator('[data-hgh-ready]').waitFor();
      await page.locator('.branch-dropdown-button').waitFor();
      await page.keyboard.press('w');
      const input = page.locator('.js-branch-tag-selector input');
      await input.waitFor({state:'visible'});
      await page.keyboard.type('ci/rig-ci');
      await page.locator('.js-branch-tag-selector .scrolling.menu > .item').filter({hasText:'ci/rig-ci'}).waitFor({state:'visible'});
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/src\/branch\/ci(?:%2F|\/)rig-ci(?:\?|$)/);
      assert.match(page.url(), /\/src\/branch\/ci(?:%2F|\/)rig-ci(?:\?|$)/);
      await page.screenshot({path:path.join(out,prefix+'-branch-selected.png')});
    });
    await check('author filter Escape restores native filter focus', async () => {
      await page.goto(base+'/issues', {waitUntil:'load'});
      await page.locator('[data-hgh-ready]').waitFor();
      await openAuthor();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      assert.equal(await page.locator('.list-header-author').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('.list-header-author').evaluate(el=>el===document.activeElement), true);
      assert.equal(await page.locator('.list-header-author').evaluate(el => { const style=getComputedStyle(el); return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2; }), true, 'restored focus must be visible');
      await page.screenshot({path:path.join(out,prefix+'-filter-dismissed.png')});
    });
    await check('author keyboard selection preserves the native filter query', async () => {
      await page.goto(base+'/issues?state=open&sort=oldest', {waitUntil:'load'});
      await page.locator('[data-hgh-ready]').waitFor();
      await openAuthor();
      await page.keyboard.type('alex');
      const author = page.locator('.list-header-author .dynamic-item').filter({hasText:'alex-mextner'});
      await author.waitFor({state:'visible'});
      const value = await author.getAttribute('data-value');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForURL(url=>url.searchParams.get('poster')===value);
      assert.equal(new URL(page.url()).searchParams.get('state'), 'open');
      assert.equal(new URL(page.url()).searchParams.get('sort'), 'oldest');
      await page.screenshot({path:path.join(out,prefix+'-author-selected.png')});
    });
    await page.close();
    }
  } finally { await browser.close(); }
}
await fs.writeFile(path.join(out,'keyboard.json'),JSON.stringify({kind:candidate?'native public DOM and native server JavaScript with local candidate skin assets':'unchanged native public production',mutations:0,results},null,2));
if (results.some(r=>!r.pass)) process.exitCode=1;
