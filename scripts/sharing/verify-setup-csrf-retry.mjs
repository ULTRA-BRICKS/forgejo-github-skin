// Regression test: "Retry save" must work after the CSRF session backing the
// form has expired, not resubmit the same dead token forever. Fails against
// the pre-fix client (which never refreshes the token on failure) and passes
// once the client refetches "/" before allowing another submit.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createSetupServer } from "./local-setup.mjs";
import { loadPlaywright } from "../playwright.mjs";
const FAKE_BOT_TOKEN = "xoxb-PLACEHOLDER-NOT-A-REAL-TOKEN-000000";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fj-setup-csrf-retry-")),
  file = path.join(dir, "config.json");
fs.writeFileSync(file, JSON.stringify({ slack: {} }), { mode: 0o600 });
const server = createSetupServer({
  configFile: file,
  port: 0,
  sessionTtlMs: 1500,
  fetchImpl: async () => ({
    json: async () => ({
      ok: true,
      team_id: "T09LDGG3DJB",
      bot_id: "B1",
      user_id: "U1",
    }),
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
  await page.locator("input[name=bot]").fill(FAKE_BOT_TOKEN);
  // Let the CSRF session (and its cookie) expire before the first submit,
  // so /configure rejects it exactly like a stale/expired session would.
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: "Save local connection" }).click();
  await page.locator("#setup-feedback[data-state=error]").waitFor();
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), { slack: {} });
  // The dead session is gone server-side; a retry that reuses the same old
  // token must fail identically. This asserts the fix, not the bug: a real
  // save after the refreshed token is submitted.
  await page.getByRole("button", { name: "Retry save" }).click();
  await page.locator("#setup-feedback[data-state=saved]").waitFor();
  assert.equal(await page.locator("input[name=bot]").inputValue(), "");
  assert.equal(
    JSON.parse(fs.readFileSync(file)).slack.botToken,
    FAKE_BOT_TOKEN,
  );
  console.log(
    "PASS: retry after CSRF session expiry refreshes the token and actually saves.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}
