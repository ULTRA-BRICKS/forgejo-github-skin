import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createSetupServer } from "./local-setup.mjs";
import { loadPlaywright } from "../playwright.mjs";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fj-setup-feedback-")),
  file = path.join(dir, "config.json");
fs.writeFileSync(file, JSON.stringify({ slack: {} }), { mode: 0o600 });
let attempt = 0;
const server = createSetupServer({
  configFile: file,
  port: 0,
  fetchImpl: async () => ({
    json: async () =>
      ++attempt === 1
        ? { ok: false }
        : { ok: true, team_id: "T09LDGG3DJB", bot_id: "B1", user_id: "U1" },
  }),
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { chromium } = await loadPlaywright(),
  browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(7000);
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.locator("input[name=signing]").fill("a".repeat(32));
  await page
    .locator("input[name=bot]")
    .fill("xoxb-synthetic-fixture-not-a-real-credential");
  await page.getByRole("button", { name: "Save local connection" }).click();
  await page.locator("#setup-feedback[data-state=error]").waitFor();
  assert.equal(
    (await page.locator("input[name=signing]").inputValue()).length,
    32,
  );
  assert.equal(attempt, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), { slack: {} });
  await page.getByRole("button", { name: "Retry save" }).click();
  await page.locator("#setup-feedback[data-state=saved]").waitFor();
  assert.equal(await page.locator("input[name=bot]").inputValue(), "");
  assert.equal(attempt, 2);
  fs.writeFileSync(
    "research/setup-feedback-proof.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scope:
          "Real browser with synthetic credentials and stub auth, not a live Slack connection",
        retainedOnError: true,
        retryVerified: true,
        clearedOnSuccess: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: failed auth retains inputs; retry stores atomically; success clears password fields.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}
