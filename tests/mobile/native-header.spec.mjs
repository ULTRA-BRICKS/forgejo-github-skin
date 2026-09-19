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
