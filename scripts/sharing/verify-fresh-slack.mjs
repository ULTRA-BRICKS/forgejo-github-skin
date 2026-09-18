import { loadPlaywright } from "../playwright.mjs";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const fixture = JSON.parse(
  await fs.readFile(path.join(root, ".sharing/visual-fixture.json"), "utf8"),
);
const wrapper = process.argv.includes("--wrapper");
const target = wrapper
  ? "https://forgejo-links.hyperide.ai/s" + new URL(fixture.url).pathname
  : fixture.url;
const flag = path.join(
  root,
  `.sharing/fresh-${wrapper ? "wrapper" : "native"}-sent.json`,
);
const { chromium } = await loadPlaywright(),
  browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const results = [];
try {
  const page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes("/client/T09LDGG3DJB/C0C2X21ECTB"));
  if (!page) throw new Error("Private demo channel is not open");
  page.setDefaultTimeout(10000);
  if (
    process.argv.includes("--send") &&
    !(await fs.stat(flag).catch(() => null))
  ) {
    const editor = page.getByRole("textbox", {
      name: "Message to forgejo-preview-demo",
      exact: true,
    });
    if ((await editor.innerText()).trim())
      throw new Error("Existing draft preserved");
    await editor.fill(
      (wrapper
        ? "Свежий тест compact classic-preview; клик ведёт к оригиналу."
        : "Свежая прямая ссылка на демо issue — проверка новой карточки без кеша старого URL.") +
        "\n" +
        target,
    );
    await editor.press("Enter");
    await fs.writeFile(
      flag,
      JSON.stringify({ target, at: new Date().toISOString() }),
      { mode: 0o600 },
    );
  }
  const title = page
    .locator('[data-qa="message_attachment_title_link"]')
    .filter({ hasText: fixture.title })
    .last();
  await title.waitFor({ timeout: 20000 });
  const attachment = title.locator(
    'xpath=ancestor::*[@data-qa="message_attachment_default"][1]',
  );
  await attachment.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await attachment.screenshot({
    path: path.join(
      root,
      `research/screenshots/preview-v2/slack-fresh-${wrapper ? "wrapper" : "native"}.png`,
    ),
  });
  results.push({
    pass: true,
    target,
    transport: wrapper ? "classic-wrapper" : "direct-native",
    text: await attachment.innerText(),
    scope: "Actual classic Slack client card; not authenticated app delivery",
  });
} catch (error) {
  results.push({ pass: false, target, error: error.message });
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(
      root,
      `research/slack-fresh-${wrapper ? "wrapper" : "native"}-proof.json`,
    ),
    JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
}
