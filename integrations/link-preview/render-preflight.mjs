// FJ-24: a fixed, public-free sample that exercises the real render pipeline (browser launch,
// page content, screenshot) so the deployment workflow and `/health` can prove the renderer
// actually works instead of trusting that an HTTP 200 from `/health` implies a warm Chromium.
//
// The sample is a static literal, never derived from a request, a source fetch, or the render
// cache: running it adds no network dependency and never touches user or private data. Timing
// is split into `browserStartupMs` (near-zero once the shared browser is warm; large only on a
// genuine cold start) and `renderMs` (page content + screenshot), so a slow deploy or `/health`
// reading is never conflated with upstream/source-fetch latency, which this path never touches.
// Both numbers are already bounded by browser-session.mjs's startupTimeoutMs and raster.mjs's
// renderTimeoutMs, so a call to `renderPreflight()` can itself never hang a deploy pipeline.
import { renderGraphicTimed } from "./raster.mjs";

export const PREFLIGHT_SAMPLE = Object.freeze({
  private: false,
  brand: Object.freeze({ name: "Renderer preflight", initials: "RP" }),
  title: "Renderer preflight sample",
  description: "Synthetic fixture rendered to prove the renderer works; never returned to a client.",
  summary: Object.freeze({
    kind: "repository",
    metrics: Object.freeze([Object.freeze({ label: "Sample", value: 1, tone: "text" })]),
  }),
});

// Returns the real PNG buffer (not just its length) so a caller that needs the bytes — e.g.
// the cold-start evidence script, which writes it to disk for visual proof — never has to
// duplicate the render call just to get at them.
export async function renderPreflight() {
  const { bytes, browserStartupMs, renderMs } = await renderGraphicTimed(PREFLIGHT_SAMPLE);
  return { ok: true, bytes, browserStartupMs, renderMs };
}
