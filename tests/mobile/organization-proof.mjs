/** Owned browser acceptance helpers: use generated production tokens, real media preferences,
 * and per-test screenshots. Native DOM fixtures remain explicitly separate from live acceptance. */
import fs from 'node:fs/promises';

const themes = new Map(await Promise.all(['light', 'dark'].map(async scheme => [scheme,
  (await fs.readFile(new URL(`../../dist/public/assets/css/theme-hypergithub-${scheme}.css`, import.meta.url), 'utf8'))
    .replace(/^@import.*$/mg, '').replace(':root {', 'body {'),
])));

export const appearances = ['light', 'dark'].flatMap(scheme => ['no-preference', 'reduce'].map(motion => ({scheme, motion})));

export async function applyAppearance(page, {scheme, motion}) {
  await page.emulateMedia({colorScheme: scheme, reducedMotion: motion});
  await page.evaluate(scheme => { document.documentElement.dataset.theme = `hypergithub-${scheme}`; }, scheme);
  await page.addStyleTag({content: themes.get(scheme) + '\nbody{background:var(--hgh-color-canvas);color:var(--hgh-color-text)}'});
}

export async function captureProof(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({path, fullPage: true});
  await testInfo.attach(name, {path, contentType: 'image/png'});
}
