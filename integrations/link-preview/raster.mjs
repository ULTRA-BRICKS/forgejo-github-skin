import fs from "node:fs";
import path from "node:path";
import { browserSession, withTimeout, RenderTimeoutError } from "./browser-session.mjs";
import { graphic, graphicLayout, hasGraphicFacts } from "./graphic.mjs";
import { loadPlaywright } from "../../scripts/playwright.mjs";
const root = path.resolve(import.meta.dirname, "../..");
const tokens = JSON.parse(
  fs.readFileSync(path.join(root, "tokens.json"), "utf8"),
);
const sizes = JSON.parse(
  fs.readFileSync(path.join(root, "tokens/preview.tokens.json"), "utf8"),
);
// FJ-24: a page render (context/page/screenshot) has no inherent bound either, same failure
// class as an unbounded browser launch — a wedged page would otherwise queue every future
// render behind it forever. `renderTimeoutMs` bounds it separately from `startupTimeoutMs`
// (browser-session.mjs) so callers (e.g. render-preflight.mjs) can tell a slow cold launch
// apart from a slow/wedged render. A render-level timeout drops the specific browser instance
// this render used, via `session.dropIfCurrent()` — the page that wedged it may have left the
// browser process itself unusable — but only if that instance is *still* the shared one; a
// sibling render whose own recovery already replaced it is left alone, so one wedged render
// among several concurrent ones can never tear down an unrelated, healthy, freshly-launched
// browser. An ordinary render error (bad content, a thrown exception) never drops it at all.
// Must comfortably exceed the sum of every per-op timeout inside `renderPage`: `setContent` and
// `screenshot` are each bounded by `page.setDefaultTimeout(6000)` below (12s worst case for the
// two combined); `evaluate` takes no Playwright timeout of its own and is bounded *only* by this
// overall bound — the render bound firing before those legitimately finish would treat a
// slow-but-healthy multi-step render as wedged and destructively drop the shared browser.
const DEFAULT_RENDER_TIMEOUT_MS = 20000;
export function createRenderer(session, { renderTimeoutMs = DEFAULT_RENDER_TIMEOUT_MS } = {}) {
  async function renderPage(instance, meta) {
    const layout = graphicLayout(meta, sizes);
    const context = await instance.newContext({
      viewport: {
        width: layout.width,
        height: layout.height,
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
  async function renderGraphicTimed(meta) {
    if (!hasGraphicFacts(meta)) throw new TypeError("No renderable preview facts");
    const startupStartedAt = performance.now();
    const instance = await session.get();
    const browserStartupMs = performance.now() - startupStartedAt;
    const renderStartedAt = performance.now();
    try {
      const bytes = await withTimeout(
        renderPage(instance, meta),
        renderTimeoutMs,
        `Renderer render exceeded ${renderTimeoutMs}ms bound`,
      );
      return { bytes, browserStartupMs, renderMs: performance.now() - renderStartedAt };
    } catch (error) {
      if (error instanceof RenderTimeoutError) {
        await session.dropIfCurrent(instance).catch(() => {});
      }
      throw error;
    }
  }
  async function renderGraphic(meta) {
    return (await renderGraphicTimed(meta)).bytes;
  }
  return { renderGraphicTimed, renderGraphic };
}
const session = browserSession(async () => {
  const { chromium } = await loadPlaywright();
  return chromium.launch({ headless: true });
});
const { renderGraphic, renderGraphicTimed } = createRenderer(session);
/** Reuses the process-wide render browser instead of launching a second one.
 * Internal build-tooling hook (e.g. pixel-comparing a fixture): the caller MUST
 * NOT call `.close()` on the returned instance — it is shared with every
 * `renderGraphic()` call in this process; only `closeRenderer()` may close it. */
export async function acquireBrowser() {
  return session.get();
}
export { renderGraphic, renderGraphicTimed };
export async function closeRenderer() {
  await session.close();
}
