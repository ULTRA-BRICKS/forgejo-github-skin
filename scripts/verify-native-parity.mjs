/** Read-only native Forgejo keyboard proof; candidate mode swaps only this worktree's skin assets. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadPlaywright} from './playwright.mjs';
const {chromium, webkit} = await loadPlaywright();

const root = path.resolve(import.meta.dirname, '..');
const base = process.env.PARITY_BASE || 'https://git.hyperide.ai/ultrabricks/forgejo-github-skin';
const out = process.env.PARITY_EVIDENCE || path.join(root, '.qa/native-parity');
const candidate = process.argv.includes('--candidate');
const candidateAssets = new Map();
async function readCandidateAsset(name) {
  if (!candidateAssets.has(name)) {
    try { candidateAssets.set(name, await fs.readFile(path.join(root, 'src', name))); }
    catch (error) { throw new Error(`Candidate asset unavailable: ${name}: ${error.message}`); }
  }
  return candidateAssets.get(name);
}
if (candidate) {
  await readCandidateAsset('skin.mjs');
  await readCandidateAsset('skin.css');
}
await fs.mkdir(out, {recursive:true});
const results = [];
for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await type.launch();
  try {
    for (const width of [390, 1440]) {
    const page = await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
    const prefix = `${engine}-${width}`;
    page.setDefaultTimeout(10000);
    const candidateErrors = [];
    const fulfilledAssets = new Set();
    if (candidate) await page.route('**/assets/hypergithub/*/*', async route => {
      const name = path.basename(new URL(route.request().url()).pathname);
      if (/\.(?:woff2?|ttf|otf|eot|svg|png|jpe?g|gif|webp|ico)$/.test(name)) return route.continue();
      try {
        if (!/^[a-z-]+\.(mjs|css)$/.test(name)) throw new Error(`Unexpected candidate asset: ${name}`);
        await route.fulfill({body:await readCandidateAsset(name), contentType:name.endsWith('.mjs')?'text/javascript':'text/css'});
        fulfilledAssets.add(name);
      } catch (error) {
        candidateErrors.push(error.message);
        await route.abort('failed');
      }
    });
    async function check(name, fn) {
      try {
        assert.deepEqual(candidateErrors, []);
        fulfilledAssets.clear();
        await fn();
        if (candidate) {
          assert.deepEqual(candidateErrors, []);
          assert.ok(fulfilledAssets.has('skin.mjs'), 'Candidate skin.mjs was not fulfilled');
          assert.ok(fulfilledAssets.has('skin.css'), 'Candidate skin.css was not fulfilled');
        }
        results.push({engine,width,name,pass:true,...(candidate?{candidateAssets:[...fulfilledAssets].sort()}:{})});
        console.log('PASS',prefix,name);
      } catch (error) {
        const message = candidateErrors.length ? candidateErrors.join('; ') : error.message;
        results.push({engine,width,name,pass:false,error:message});
        console.error('FAIL',prefix,name,message);
      }
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
      await page.locator('.js-branch-tag-selector[data-v-app] .menu.transition').waitFor({state:'hidden'});
      await page.waitForFunction(() => document.activeElement?.matches('.branch-dropdown-button'));
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
      await page.keyboard.type('rig/tracked-files-task-route');
      await page.locator('.js-branch-tag-selector .scrolling.menu > .item').filter({hasText:'rig/tracked-files-task-route'}).waitFor({state:'visible'});
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/src\/branch\/rig(?:%2F|\/)tracked-files-task-route(?:\?|$)/, {waitUntil:'domcontentloaded'});
      await page.locator('[data-hgh-ready]').waitFor();
      assert.match(page.url(), /\/src\/branch\/rig(?:%2F|\/)tracked-files-task-route(?:\?|$)/);
      await page.screenshot({path:path.join(out,prefix+'-branch-selected.png')});
    });
    await check('author filter Escape restores native filter focus', async () => {
      await page.goto(base+'/issues', {waitUntil:'load'});
      await page.locator('[data-hgh-ready]').waitFor();
      await openAuthor();
      await page.keyboard.press('Escape');
      await page.locator('.list-header-author .menu').first().waitFor({state:'hidden'});
      await page.waitForFunction(() => document.querySelector('.list-header-author')?.getAttribute('aria-expanded') === 'false');
      await page.waitForFunction(() => document.activeElement?.matches('.list-header-author'));
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
      assert.ok(value && value.trim(), 'Native author item must expose a nonempty data-value');
      const beforeSelection = page.url();
      const optionCount = await page.locator('.list-header-author .menu .item:visible').count();
      for (let step=0; step<optionCount && !await author.evaluate(item=>item.classList.contains('selected')); step++) {
        await page.keyboard.press('ArrowDown');
      }
      assert.equal(await author.evaluate(item=>item.classList.contains('selected')), true, 'Native author must be keyboard-selected before Enter');
      await page.keyboard.press('Enter');
      await page.waitForURL(url=>url.searchParams.get('poster')===value, {waitUntil:'domcontentloaded'});
      await page.locator('[data-hgh-ready]').waitFor();
      assert.notEqual(page.url(), beforeSelection, 'Author selection must navigate');
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
