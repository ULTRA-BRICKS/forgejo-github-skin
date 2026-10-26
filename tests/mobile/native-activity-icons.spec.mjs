import {test, expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {openNativeFixture, exposeModules} from './native-module-fixture.mjs';

// Captured server output of Forgejo 16.0.6 (see tests/fixtures/forgejo-16.0.6/provenance.json) plus the
// exact native rules that match it. Only the document shell is synthetic; the production enhancer and
// production stylesheet run unchanged.
const fixtureDir = new URL('../fixtures/forgejo-16.0.6/', import.meta.url);
const nativeCss = await fs.readFile(new URL('native-activity.css', fixtureDir), 'utf8');
const skinCss = await fs.readFile(new URL('../../src/organization.css', import.meta.url), 'utf8');
const pages = {
  'user profile Public activity tab': await fs.readFile(new URL('profile-activity.html', fixtureDir), 'utf8'),
  'personal dashboard': await fs.readFile(new URL('dashboard-activity.html', fixtureDir), 'utf8'),
};
const shell = (main) => `<!doctype html><html lang="en" data-theme="hypergithub-light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>${nativeCss}</style><style>${skinCss}</style><style>body{margin:0;font:14px/20px Arial}</style></head><body>${main}</body></html>`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const typeIcons = (page) => page.locator('#activity-feed .flex-item-trailing > svg');
const sizes = (locator) => locator.evaluateAll(nodes => nodes.map(node => {
  const box = node.getBoundingClientRect();
  return [Math.round(box.width), Math.round(box.height), getComputedStyle(node).width, getComputedStyle(node).height];
}));

for (const [name, main] of Object.entries(pages)) {
  test(`${name}: native 32px event glyphs become 16px and are restored on teardown`, async ({page}) => {
    await page.route('**/avatars/**', route => route.fulfill({contentType: 'image/png', body: png}));
    await openNativeFixture(page, shell(main));
    const icons = typeIcons(page);
    const count = await icons.count();
    expect(count).toBeGreaterThanOrEqual(6);
    // Control: the unmodified native document really draws these glyphs at 32px.
    expect(await sizes(icons)).toEqual(Array(count).fill([32, 32, '32px', '32px']));

    await exposeModules(page, 'organization.mjs');
    await page.evaluate(() => window.enhanceOrganization(document));
    expect(await sizes(icons)).toEqual(Array(count).fill([16, 16, '16px', '16px']));

    // Portraits and the 16px commit-author avatars are not event glyphs and keep their native size.
    const portraits = page.locator('#activity-feed .flex-item-leading img.ui.avatar');
    expect(await portraits.evaluateAll(nodes => [...new Set(nodes.map(n => Math.round(n.getBoundingClientRect().width)))])).toEqual([28]);
    expect(await page.locator('#activity-feed .flex-text-block img.ui.avatar').evaluateAll(nodes => [...new Set(nodes.map(n => Math.round(n.getBoundingClientRect().width)))])).toEqual([16]);

    await page.evaluate(() => window.restoreOrganization(document));
    expect(await sizes(icons)).toEqual(Array(count).fill([32, 32, '32px', '32px']));
    await expect(page.locator('.hgh-compact-activity')).toHaveCount(0);
  });
}
