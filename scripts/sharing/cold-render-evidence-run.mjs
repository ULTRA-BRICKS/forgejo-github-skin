// Invoked as a fresh subprocess, once per run, by cold-render-evidence.mjs — a brand-new
// process guarantees no warm browserSession state survives between runs, so every run is a
// genuine cold Chromium launch, not just the first. Delegates to renderPreflight() (rather
// than duplicating the render call) so the evidence run exercises exactly the same bounded
// path the deploy-time check does. Writes the real PNG for visual proof and prints timing
// metadata (JSON, last stdout line) for the parent to collect.
import fs from "node:fs";
import { renderPreflight } from "../../integrations/link-preview/render-preflight.mjs";
import { closeRenderer } from "../../integrations/link-preview/raster.mjs";

const pngPath = process.argv[2];
if (!pngPath) {
  console.error("Usage: cold-render-evidence-run.mjs <output.png>");
  process.exit(1);
}
try {
  const startedAt = Date.now();
  const { bytes, browserStartupMs, renderMs } = await renderPreflight();
  fs.writeFileSync(pngPath, bytes);
  console.log(
    JSON.stringify({
      ok: true,
      bytes: bytes.length,
      browserStartupMs,
      renderMs,
      totalMs: Date.now() - startedAt,
    }),
  );
} finally {
  await closeRenderer();
}
