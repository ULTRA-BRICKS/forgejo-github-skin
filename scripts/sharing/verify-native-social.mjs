import { loadPlaywright } from "../playwright.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, "../.."),
  base = "https://forgejo-ui-demo.hyperide.ai";
const { chromium } = await loadPlaywright(),
  browser = await chromium.launch(),
  results = [];
try {
  const page = await browser.newPage();
  for (const route of [
    "/demo-author/keyboard-lab",
    "/demo-author/keyboard-lab/issues/1",
    "/demo-author/keyboard-lab/pulls/3",
  ]) {
    const response = await page.goto(base + route, {
      waitUntil: "domcontentloaded",
    });
    assert.equal(response.status(), 200);
    assert.equal(page.url(), base + route, "No link-preview landing page");
    assert.equal(await page.locator('meta[property="og:title"]').count(), 1);
    assert.equal(await page.locator('meta[property="og:image"]').count(), 1);
    const imageURL = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    assert.equal(new URL(imageURL).origin, "https://forgejo-links.hyperide.ai");
    assert.equal(new URL(imageURL).searchParams.get("url"), base + route);
    const image = await page.request.get(imageURL);
    assert.equal(image.status(), 200);
    const bytes = await image.body();
    assert.equal(bytes.readUInt32BE(16), 1440);
    assert.equal(bytes.readUInt32BE(20), 672);
    results.push({
      route,
      pass: true,
      canonical: page.url(),
      imageSize: [1440, 672],
    });
  }
  const denied = await page.goto(
    base + "/demo-author/link-preview-private/issues/1",
    { waitUntil: "domcontentloaded" },
  );
  const title = await page
    .locator('meta[property="og:title"]')
    .getAttribute("content");
  assert.ok(!title.includes("Synthetic private"));
  assert.ok(
    [401, 403, 404].includes(denied.status()) ||
      new URL(page.url()).pathname.includes("/login"),
  );
  results.push({
    name: "Private native URL retains Forgejo authentication gate",
    pass: true,
  });
} catch (error) {
  results.push({ pass: false, error: error.message });
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(root, "research/native-social-proof.json"),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scope:
          "Actual native HTTP/DOM/PNG, distinct from Slack client rendering and private app unfurls",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
}
