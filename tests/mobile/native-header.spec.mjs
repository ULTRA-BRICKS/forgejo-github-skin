import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const source = await fs.readFile(new URL('../../src/mobile-chrome.mjs', import.meta.url), 'utf8');
const css = (await fs.readFile(new URL('../../src/skin.css', import.meta.url), 'utf8')).replace(/^@import[^\n]+/mg, '');
test('native repository brand exists only in footer; restoration retains original controls', async ({ page }) => {
  await page.setContent(`<html data-theme="hypergithub-light"><body><nav id="navbar"><div class="navbar-left"><a id="navbar-logo" href="/">Forgejo</a><div class="navbar-mobile-right"><button id="navbar-expand-toggle">Menu</button></div><a href="/explore/repos">Explore</a></div><div class="navbar-right"><details><summary><img class="avatar" width="24" height="24" alt="Account"></summary><p>Account menu</p></details></div></nav><div class="repo-header"><div class="flex-item-title"><a href="/owner">owner</a> / <a href="/owner/repo">repo</a></div></div><footer>Footer</footer></body></html>`);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: source.replaceAll('export ', '') });
  await page.evaluate(() => { window.originalToggle = document.querySelector('#navbar-expand-toggle'); enhanceNativeChrome(); enhanceNativeChrome(); });
  await expect(page.locator('#navbar-logo')).toBeHidden();
  await expect(page.locator('footer .hgh-footer-brand')).toHaveCount(1);
  await expect(page.locator('footer [aria-label="Forgejo home"]')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('#navbar-logo')).toBeHidden();
  await expect(page.locator('footer .hgh-footer-brand')).toHaveCount(1);
  await page.evaluate(() => restoreNativeChrome());
  await expect(page.locator('#navbar-logo')).toBeVisible();
  await expect(page.locator('footer .hgh-footer-brand')).toHaveCount(0);
  expect(await page.evaluate(() => window.originalToggle === document.querySelector('#navbar-expand-toggle'))).toBe(true);
});

test('a page without a footer retains its native brand link', async ({ page }) => {
  await page.setContent('<html data-theme="hypergithub-light"><body><nav id="navbar"><div class="navbar-left"><a id="navbar-logo" href="/">Forgejo</a></div></nav><div class="repo-header"><div class="flex-item-title"><a href="/a/b">repo</a></div></div></body></html>');
  await page.addStyleTag({content:css});
  await page.addScriptTag({content:source.replaceAll('export ', '')});
  await page.evaluate(()=>enhanceNativeChrome());
  await expect(page.locator('#navbar-logo')).toBeVisible();
  await expect(page.locator('.hgh-footer-brand')).toHaveCount(0);
});

test('native chrome releases old navbar and avoids duplicated SVG ids',async({page})=>{
 await page.setContent('<html lang="ru" data-theme="hypergithub-light"><body><nav id="navbar"><div class="navbar-left"><a id="navbar-logo" href="/">Forgejo</a></div><div class="navbar-right"></div><a href="/explore/repos">Explore</a><button id="navbar-expand-toggle">Menu</button><svg class="octicon-search" id="original-search"><path id="original-path"/></svg></nav><div class="repo-header"><div class="flex-item-title"><a href="/a/b">repo</a></div></div><footer></footer></body></html>');
 await page.addStyleTag({content:css});
 await page.evaluate(()=>{const original=window.matchMedia;window.chromeBalance=0;window.matchMedia=q=>{const m=original(q),add=m.addEventListener.bind(m),remove=m.removeEventListener.bind(m);m.addEventListener=(t,f,...a)=>{if(t==='change')window.chromeBalance++;return add(t,f,...a)};m.removeEventListener=(t,f,...a)=>{if(t==='change')window.chromeBalance--;return remove(t,f,...a)};return m;};});
 await page.addScriptTag({content:source.replaceAll('export ','')});
 await page.evaluate(()=>enhanceNativeChrome());
 await expect(page.locator('#original-search')).toHaveCount(1);await expect(page.locator('#original-path')).toHaveCount(1);
 await expect(page.locator('.hgh-native-search')).toHaveCount(0);
 await page.evaluate(()=>{document.querySelector('#navbar').remove();enhanceNativeChrome();});
 expect(await page.evaluate(()=>window.chromeBalance)).toBe(0);
 await expect(page.locator('.hgh-footer-brand')).toHaveCount(0);
});

test('native logo moves to the page footer rather than an earlier hidden-dialog footer',async({page})=>{
 await page.setContent('<html lang="en" data-theme="hypergithub-light"><body><nav id="navbar"><div class="navbar-left"><a id="navbar-logo" href="/">Forgejo</a></div></nav><div class="repo-header"><div class="flex-item-title"><a href="/a/b">repo</a></div></div><dialog><footer class="actions">Dialog actions</footer></dialog><footer class="page-footer">Site footer</footer></body></html>');
 await page.addStyleTag({content:css});await page.addScriptTag({content:source.replaceAll('export ','')});
 await page.evaluate(()=>enhanceNativeChrome());
 await expect(page.locator('footer.page-footer .hgh-footer-brand')).toHaveCount(1);
 await expect(page.locator('footer.page-footer .hgh-footer-brand')).toBeVisible();
 await expect(page.locator('dialog .hgh-footer-brand')).toHaveCount(0);
 await expect(page.locator('#navbar-logo')).toBeHidden();
});

test('content with a page-footer class cannot capture the repository mark',async({page})=>{
 await page.setContent('<html lang="en" data-theme="hypergithub-light"><body><nav id="navbar"><div class="navbar-left"><a id="navbar-logo" href="/">Forgejo</a></div></nav><div class="repo-header"><div class="flex-item-title"><a href="/a/b">repo</a></div></div><main><footer class="page-footer">Content footer</footer></main><footer class="page-footer">Global footer</footer></body></html>');
 await page.addStyleTag({content:css});await page.addScriptTag({content:source.replaceAll('export ','')});
 await page.evaluate(()=>enhanceNativeChrome());
 await expect(page.locator('body > footer.page-footer .hgh-footer-brand')).toBeVisible();
 await expect(page.locator('main .hgh-footer-brand')).toHaveCount(0);
});
