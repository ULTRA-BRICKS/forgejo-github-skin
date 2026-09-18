import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createSetupServer } from "./local-setup.mjs";
import { loadPlaywright } from "../playwright.mjs";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fj-setup-browser-")),
  { chromium } = await loadPlaywright(),
  browser = await chromium.launch();
const results = [];
try {
  for (const [name, policy, legacy, status] of [
    ["reproduce original bug", "no-referrer", false, 403],
    ["fixed native form", "same-origin", true, 200],
    ["legacy form with bound CSRF", "no-referrer", true, 200],
  ]) {
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, JSON.stringify({ slack: {} }), { mode: 0o600 });
    const server = createSetupServer({
      configFile: file,
      port: 0,
      progressive: false,
      referrerPolicy: policy,
      acceptBoundLegacyOrigin: legacy,
      fetchImpl: async () => ({
        json: async () => ({
          ok: true,
          team_id: "T09LDGG3DJB",
          bot_id: "B1",
          user_id: "U1",
        }),
      }),
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = "http://127.0.0.1:" + server.address().port;
    const c = await browser.newContext(),
      p = await c.newPage();
    let received;
    server.on("request", (req) => {
      if (req.method === "POST")
        received = {
          origin: req.headers.origin,
          site: req.headers["sec-fetch-site"],
        };
    });
    try {
      await p.goto(origin);
      await p.locator("input[name=signing]").fill("a".repeat(32));
      await p
        .locator("input[name=bot]")
        .fill("xoxb-synthetic-test-not-a-real-credential");
      const post = p.waitForResponse((r) => r.url().endsWith("/configure"));
      await p.getByRole("button", { name: "Save local connection" }).click();
      const response = await post;
      assert.equal(response.status(), status);
      results.push({ name, pass: true, status, received });
    } finally {
      await c.close();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  }
} finally {
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
fs.mkdirSync("research", { recursive: true });
fs.writeFileSync(
  "research/setup-browser-proof.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      scope:
        "Real Chromium form navigation; synthetic credentials and stub Slack auth only.",
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results, null, 2));
