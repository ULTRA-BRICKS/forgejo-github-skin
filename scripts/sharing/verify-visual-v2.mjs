import { loadPlaywright } from "../playwright.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, "../.."),
  out = path.join(root, "research/screenshots/preview-v2");
await fs.mkdir(out, { recursive: true });
const { chromium } = await loadPlaywright(),
  browser = await chromium.launch(),
  results = [];
const stories = [
  "repository",
  "issue",
  "pull-request",
  "commit",
  "file",
  "missing-data",
  "dark-repository",
];
try {
  for (const width of [480, 360]) {
    const c = await browser.newContext({
        viewport: { width, height: 500 },
        deviceScaleFactor: 3,
      }),
      p = await c.newPage();
    p.setDefaultTimeout(7000);
    for (const name of stories) {
      await p.goto(
        `http://127.0.0.1:6010/iframe.html?id=sharing-compact-previews--${name}&viewMode=story`,
        { waitUntil: "networkidle" },
      );
      const svg = p.locator("#storybook-root svg").first();
      await svg.waitFor();
      await p.evaluate(() => document.fonts.ready);
      const bounds = await svg.evaluate((svg) =>
        [...svg.querySelectorAll("text")].map((el) => {
          const b = el.getBBox();
          return {
            text: el.textContent,
            x: b.x,
            y: b.y,
            right: b.x + b.width,
            bottom: b.y + b.height,
            size: parseFloat(el.getAttribute("font-size")),
          };
        }),
      );
      const overflow = bounds.filter(
        (b) => b.x < 0 || b.y < 0 || b.right > 480.5 || b.bottom > 224.5,
      );
      assert.deepEqual(overflow, [], `${name}/${width} text overflow`);
      const values = bounds
        .filter((b) => Math.abs(b.bottom - 90) < 6)
        .sort((a, b) => a.x - b.x);
      for (let i = 1; i < values.length; i++)
        assert.ok(
          values[i].x - values[i - 1].right >= 8,
          `${name}/${width}: metric values visually collide`,
        );
      assert.ok(
        bounds.every((x) => x.size >= 16),
        `${name} label size below specification`,
      );
      await svg.screenshot({ path: path.join(out, `${name}-${width}.png`) });
      results.push({
        name,
        width,
        pass: true,
        svgSize: [480, 224],
        minimumLabel: Math.min(...bounds.map((b) => b.size)),
      });
    }
    await c.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const original =
    "https://forgejo-ui-demo.hyperide.ai/demo-author/keyboard-lab/issues/1";
  await page.goto(
    "https://forgejo-links.hyperide.ai/s/demo-author/keyboard-lab/issues/1",
    { waitUntil: "domcontentloaded" },
  );
  assert.equal(page.url(), original);
  results.push({
    name: "actual mobile click redirects to original without a gate page",
    pass: true,
  });
  const response = await page.request.get(
    "https://forgejo-links.hyperide.ai/image?v=2&url=" +
      encodeURIComponent(original),
  );
  assert.equal(response.status(), 200);
  const png = await response.body();
  assert.equal(png.readUInt32BE(16), 1440);
  assert.equal(png.readUInt32BE(20), 672);
  await fs.writeFile(path.join(out, "live-issue.png"), png);
  results.push({
    name: "actual anonymous image is native 3x PNG",
    pass: true,
    size: [1440, 672],
  });
} catch (e) {
  results.push({ pass: false, error: e.message });
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(root, "research/preview-v2-visual-proof.json"),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scope:
          "Shared production renderer in Storybook at two widths; synthetic fixtures explicitly labelled. Live redirect and live anonymous PNG checked separately.",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
}
