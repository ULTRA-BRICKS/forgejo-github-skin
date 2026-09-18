import { loadPlaywright } from "../playwright.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, "../.."),
  out = path.join(root, "research/screenshots/sharing");
await fs.mkdir(out, { recursive: true });
const origin = "https://forgejo-links.hyperide.ai",
  source = "https://forgejo-ui-demo.hyperide.ai";
const cases = [
  ["public", source + "/demo-author/keyboard-lab/issues/1"],
  ["protected", source + "/demo-author/link-preview-private/issues/1"],
  ["nonexistent", source + "/demo-author/link-preview-private/issues/99999"],
];
const { chromium } = await loadPlaywright(),
  browser = await chromium.launch(),
  results = [];
let protectedMeta;
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  page.setDefaultTimeout(10000);
  for (const [name, url] of cases) {
    const response = await page.goto(
      origin + "/share?url=" + encodeURIComponent(url),
      { waitUntil: "networkidle", timeout: 30000 },
    );
    assert.equal(response.status(), 200);
    const meta = await page
      .locator('meta[property^="og:"]')
      .evaluateAll((es) =>
        Object.fromEntries(
          es.map((e) => [e.getAttribute("property"), e.content]),
        ),
      );
    const text = await page.locator("body").innerText();
    if (name === "public") {
      assert.match(meta["og:title"], /Return focus/);
    } else {
      assert.ok(!text.includes("FJ-DEMO-PRIVATE-PREVIEW-2026"));
      assert.ok(!meta["og:title"].includes("Synthetic private"));
      if (protectedMeta)
        assert.equal(meta["og:description"], protectedMeta["og:description"]);
      protectedMeta = meta;
    }
    const image = await page.request.get(meta["og:image"]);
    assert.equal(image.status(), 200);
    const bytes = await image.body();
    assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16), 1200);
    assert.equal(bytes.readUInt32BE(20), 630);
    await fs.writeFile(path.join(out, name + "-social.png"), bytes);
    await page.screenshot({ path: path.join(out, name + "-page.png") });
    results.push({
      name,
      pass: true,
      title: meta["og:title"],
      imageSize: [1200, 630],
    });
  }
  const denied = await page.request.get(origin + "/demo/private");
  assert.equal(denied.status(), 401);
  results.push({ name: "private API requires authorized session", pass: true });
  const unsigned = await page.request.post(origin + "/slack/events", {
    data: { type: "event_callback" },
  });
  assert.ok([401, 503].includes(unsigned.status()));
  results.push({
    name: "unsigned Slack requests cannot trigger source access",
    pass: true,
    status: unsigned.status(),
  });
  await page.goto(origin + "/demo");
  await page.screenshot({ path: path.join(out, "walkthrough-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "walkthrough-mobile.png") });
} catch (e) {
  results.push({ pass: false, error: e.message });
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(root, "research/sharing-public-proof.json"),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scope:
          "Actual HTTP/browser and anonymous source checks; not a proof of Slack event delivery or private OAuth success.",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
}
