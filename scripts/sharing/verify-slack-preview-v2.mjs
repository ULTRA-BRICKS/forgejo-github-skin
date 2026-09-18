import { loadPlaywright } from "../playwright.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, "../..");
const transport = process.argv.includes("--classic-wrapper")
  ? "wrapper"
  : "direct";
const target =
  transport === "direct"
    ? "https://forgejo-ui-demo.hyperide.ai/demo-author/keyboard-lab/pulls/3"
    : "https://forgejo-links.hyperide.ai/s/demo-author/keyboard-lab/pulls/3";
const { chromium } = await loadPlaywright(),
  browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const results = [];
try {
  const page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes("/client/T09LDGG3DJB/C0C2X21ECTB"));
  if (!page) throw new Error("Open the existing private demo channel first");
  page.setDefaultTimeout(10000);
  const flag = path.join(
    root,
    transport === "direct"
      ? ".sharing/slack-native-v2-sent.json"
      : ".sharing/slack-wrapper-v2-sent.json",
  );
  if (
    process.argv.includes("--send") &&
    !(await fs.stat(flag).catch(() => null))
  ) {
    const editor = page.getByRole("textbox", {
      name: "Message to forgejo-preview-demo",
      exact: true,
    });
    if ((await editor.innerText()).trim())
      throw new Error("Existing user draft preserved; no test message sent");
    await editor.fill(
      (transport === "direct"
        ? "Прямой URL демо PR."
        : "Проверка нового изображения через classic-preview URL; клик перенаправляет на исходный PR. Не считаем это пруфом приватного Slack app.") +
        "\n" +
        target,
    );
    await editor.press("Enter");
    await fs.writeFile(
      flag,
      JSON.stringify({ target, sentAt: new Date().toISOString() }),
      { mode: 0o600 },
    );
  }
  const title = page
    .locator('[data-qa="message_attachment_title_link"]')
    .filter({ hasText: "Preserve keyboard focus and repository context" })
    .last();
  await title.waitFor({ timeout: 30000 });
  const attachment = title.locator(
    'xpath=ancestor::*[@data-qa="message_attachment_default"][1]',
  );
  await attachment.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const image = attachment.locator("img").filter({ visible: true }).last();
  await image.waitFor();
  await image.evaluate((image) =>
    image.complete
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
        }),
  );
  const actual = await image.evaluate((i) => ({
    src: i.currentSrc,
    width: i.naturalWidth,
    height: i.naturalHeight,
  }));
  assert.ok(actual.width > 0 && actual.height > 0);
  await fs.mkdir(path.join(root, "research/screenshots/preview-v2"), {
    recursive: true,
  });
  await attachment.screenshot({
    path: path.join(
      root,
      "research/screenshots/preview-v2/slack-direct-pr.png",
    ),
  });
  results.push({
    name: "Actual Slack classic preview of direct native Forgejo URL",
    pass: true,
    transport,
    target,
    text: await attachment.innerText(),
    loadedImage: true,
    scope:
      "Public native URL only; does not certify private app event delivery",
  });
} catch (error) {
  results.push({ pass: false, transport, error: error.message });
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(root, `research/slack-${transport}-v2-proof.json`),
    JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
}
