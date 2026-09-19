import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywright } from '../playwright.mjs';
import { graphic } from '../../integrations/link-preview/graphic.mjs';
import { renderGraphic, closeRenderer } from '../../integrations/link-preview/raster.mjs';
import { previewFixtures } from '../../stories/preview-fixtures.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const base = JSON.parse(await fs.readFile(path.join(root, 'tokens.json'), 'utf8'));
const sizes = JSON.parse(await fs.readFile(path.join(root, 'tokens/preview.tokens.json'), 'utf8'));
const out = path.resolve(process.env.PREVIEW_PROOF_DIR || path.join(root, '.qa/render-check'));
await fs.mkdir(out, { recursive: true });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const kind of ['file', 'repository', 'pull', 'commit', 'issue', 'privateRepository', 'privatePull']) {
    const meta = structuredClone(previewFixtures[kind]);
    const svg = graphic(meta, base, sizes);
    const page = await browser.newPage({ viewport: { width: 480, height: 240 }, deviceScaleFactor: 3 });
    await page.setContent('<body style="margin:0;background:transparent">' + svg);
    await page.evaluate(() => document.fonts.ready);
    const boxes = await page.locator('svg').evaluate(svg => {
      const vb = svg.viewBox.baseVal;
      const boxes = [...svg.querySelectorAll('text')].map(el => {
        const b = el.getBBox(); return { text: el.textContent, x: b.x, y: b.y, width: b.width, height: b.height };
      });
      return { width: vb.width, height: vb.height, boxes,
        outside: boxes.filter(b => b.x < -1 || b.y < -1 || b.x + b.width > vb.width + 1 || b.y + b.height > vb.height + 1) };
    });
    assert.equal(boxes.width, 480, kind + ': unchanged width');
    assert.ok(boxes.height <= 160, kind + ': compact height');
    assert.deepEqual(boxes.outside, [], kind + ': text must fit in exported image');
    if (kind === 'file') {
      const lines = page.locator('[data-code-row]');
      assert.equal(await lines.count(), 5, 'all five source lines are present');
      const rowBounds = await lines.evaluateAll(rows => rows.map(row => {
        const b = row.getBBox(); return { text: row.textContent, y: b.y, bottom: b.y + b.height };
      }));
      const footer = await page.locator('[data-preview-footer]').evaluate(el => el.getBBox().y);
      assert.ok(footer >= rowBounds.at(-1).bottom + 6, 'code and footer never intersect');
      for (let i = 1; i < rowBounds.length; i++) assert.ok(rowBounds[i].y >= rowBounds[i - 1].bottom, 'code rows do not overlap');
      assert.ok(rowBounds.at(-1).text.includes('}'), 'final closing brace is visible');
    }
    const png = await renderGraphic(meta);
    assert.ok(Buffer.isBuffer(png), kind + ': real production PNG');
    assert.equal(png.readUInt32BE(16), boxes.width * sizes.preview.scale.$value);
    assert.equal(png.readUInt32BE(20), boxes.height * sizes.preview.scale.$value);
    const url = 'data:image/png;base64,' + png.toString('base64');
    const alpha = await page.evaluate(async url => {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 0) transparent++;
      return transparent / (pixels.length / 4);
    }, url);
    assert.ok(alpha > 0.6, kind + ': PNG background is transparent');
    await fs.writeFile(path.join(out, kind + '-transparent.png'), png);
    for (const [name, color] of [['light', '#ffffff'], ['dark', '#1a1d21']]) {
      await page.setViewportSize({ width: boxes.width, height: boxes.height });
      await page.setContent('<body style="margin:0;background:' + color + '"><img style="display:block;width:480px;height:auto" src="' + url + '">');
      await page.locator('img').evaluate(image => image.decode());
      await page.screenshot({ path: path.join(out, kind + '-' + name + '.png'), animations: 'disabled' });
    }
    await page.close(); results.push({ kind, width: boxes.width, height: boxes.height, alpha, status: 'passed' });
  }
} finally {
  await closeRenderer(); await browser.close();
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ results }, null, 2));
}
console.log(JSON.stringify({ passed: results.length, results }, null, 2));
