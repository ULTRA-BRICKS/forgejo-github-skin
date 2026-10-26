// FJ-24: real, fresh-process cold-start evidence for the bounded renderer preflight. Each of
// three runs spawns a brand-new node process (see cold-render-evidence-run.mjs) so Chromium
// always launches cold — calling `renderPreflight()` three times in one process would only
// exercise a genuine cold start on the first call. Every run's real PNG and elapsed timing
// (browserStartupMs distinct from renderMs) is written under `.qa/cold-render/` for review.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const outDir = path.resolve(process.env.COLD_RENDER_EVIDENCE_DIR || path.join(root, ".qa/cold-render"));
fs.mkdirSync(outDir, { recursive: true });
const childScript = path.join(import.meta.dirname, "cold-render-evidence-run.mjs");
const RUNS = 3;
const runs = [];
for (let i = 1; i <= RUNS; i++) {
  const pngPath = path.join(outDir, `run-${i}.png`);
  // Matches deploy-local.py's identical-workload timeout: comfortably above the renderer's own
  // worst case — up to two full startup attempts if the first instance connects but is then
  // found disconnected (8s + 8s), plus render (20s) plus close (5s) = 41s — plus node/Playwright
  // module load, so a healthy-but-slow cold start on loaded hardware is never recorded as a
  // failed run.
  const result = spawnSync(process.execPath, [childScript, pngPath], {
    cwd: root,
    encoding: "utf8",
    timeout: 60000,
  });
  if (result.status !== 0 || result.error) {
    runs.push({ run: i, ok: false, error: (result.stderr || result.error?.message || "unknown failure").trim() });
    continue;
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim().split("\n").pop());
  } catch {
    runs.push({ run: i, ok: false, error: "Unparseable stdout from cold-render-evidence-run.mjs: " + result.stdout.slice(-500) });
    continue;
  }
  runs.push({ run: i, png: path.relative(root, pngPath), ...parsed });
}
const summary = { checkedAt: new Date().toISOString(), runs };
fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (runs.some((run) => !run.ok)) process.exitCode = 1;
