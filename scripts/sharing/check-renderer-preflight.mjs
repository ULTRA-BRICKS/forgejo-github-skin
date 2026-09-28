#!/usr/bin/env node
// FJ-24: deterministic, bounded renderer readiness check, run separately from `/health`.
// `/health` must stay fast — it answers from in-memory config, never touches Chromium — so a
// deployment cannot infer "the renderer works" from its 200. This script actually launches
// the renderer cold (or reuses the warm one, once the process is up) and renders the fixed
// public-free sample. It is inherently bounded by browser-session.mjs's startupTimeoutMs and
// raster.mjs's renderTimeoutMs, so a genuinely stalled Chromium fails this check instead of
// hanging the deploy pipeline. Mirrors doctor.mjs's shape: JSON on stdout, exit 2 on failure.
import { renderPreflight } from "../../integrations/link-preview/render-preflight.mjs";
import { closeRenderer } from "../../integrations/link-preview/raster.mjs";

try {
  const { ok, bytes, browserStartupMs, renderMs } = await renderPreflight();
  console.log(
    JSON.stringify(
      { checkedAt: new Date().toISOString(), ok, bytes: bytes.length, browserStartupMs, renderMs },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 2;
} finally {
  await closeRenderer();
}
