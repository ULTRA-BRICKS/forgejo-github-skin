import fs from "node:fs";
import { browserSession } from "./browser-session.mjs";
import path from "node:path";
import { graphic } from "./graphic.mjs";
import { loadPlaywright } from "../../scripts/playwright.mjs";
const root = path.resolve(import.meta.dirname, "../..");
const tokens = JSON.parse(
  fs.readFileSync(path.join(root, "tokens.json"), "utf8"),
);
const sizes = JSON.parse(
  fs.readFileSync(path.join(root, "tokens/preview.tokens.json"), "utf8"),
);
const session = browserSession(async () => {
  const { chromium } = await loadPlaywright();
  return chromium.launch({ headless: true });
});
export async function renderGraphic(meta) {
  const instance = await session.get();
  const context = await instance.newContext({
    viewport: {
      width: sizes.preview.width.$value.value,
      height: sizes.preview.height.$value.value,
    },
    deviceScaleFactor: sizes.preview.scale.$value,
    colorScheme: "light",
  });
  try {
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    await page.setContent(
      '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:"><body style="margin:0;background:transparent">' +
        graphic(meta, tokens, sizes, { mode: "adaptive" }),
    );
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ type: "png", animations: "disabled", omitBackground: true });
  } finally {
    await context.close();
  }
}
export async function closeRenderer() {
  await session.close();
}
