import { loadPlaywright } from "../playwright.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, "../..");
const { chromium } = await loadPlaywright();
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const proof = {
  checkedAt: new Date().toISOString(),
  message: "https://glide-vc.slack.com/archives/C0C2X21ECTB/p1789748491037249",
  scope:
    "Actual Slack client visual acceptance of a manually attached public demo card. NOT automatic/private app delivery.",
  results: [],
};
try {
  const page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes("/client/T09LDGG3DJB/C0C2X21ECTB"));
  if (!page) throw new Error("Expected synthetic demo channel tab is not open");
  page.setDefaultTimeout(12000);
  await page.reload({ waitUntil: "domcontentloaded" });
  const title = page.getByRole("link", {
    name: "PR #3: Preserve keyboard focus and repository context",
    exact: true,
  });
  await title.waitFor({ timeout: 20000 });
  const card = title.locator(
    'xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," c-message_kit__blocks ")][1]',
  );
  await card.scrollIntoViewIfNeeded();
  await card.locator("[data-qa=attachment_image]").first().waitFor();
  const image = await card
    .locator("[data-qa=attachment_image]")
    .first()
    .evaluate(async (el) => {
      const match = /^url\("(.*)"\)$/.exec(
        getComputedStyle(el).backgroundImage,
      );
      if (!match) throw new Error("Image not present");
      const img = new Image();
      img.src = match[1];
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight };
    });
  assert.ok(image.width > 0 && image.height > 0);
  proof.image = image;
  await page.waitForTimeout(250);
  assert.equal(
    await title.getAttribute("href"),
    "https://forgejo-ui-demo.hyperide.ai/demo-author/keyboard-lab/pulls/3",
  );
  const text = await card.innerText();
  assert.ok(text.includes("Hyperide"));
  assert.ok(text.includes("Ручной образец"));
  const out = path.join(
    root,
    "research/screenshots/preview-v2/slack-visual-acceptance.png",
  );
  await card.screenshot({ path: out });
  proof.results.push({
    pass: true,
    nativeTitleLink: await title.getAttribute("href"),
    text,
    screenshot: path.relative(root, out),
  });
} catch (error) {
  proof.results.push({ pass: false, error: error.message });
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(root, "research/slack-visual-acceptance.json"),
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(JSON.stringify(proof, null, 2));
}
