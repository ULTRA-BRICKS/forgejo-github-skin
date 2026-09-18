import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { slackReadiness } from "../../integrations/link-preview/readiness.mjs";
import { createSetupServer } from "../../scripts/sharing/local-setup.mjs";
const valid = {
  signing: "a".repeat(32),
  bot: "xoxb-synthetic-test-only-not-a-real-token",
};
async function withSetup(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fj-setup-")),
    file = path.join(dir, "config.json");
  fs.writeFileSync(file, JSON.stringify({ slack: {} }), { mode: 0o600 });
  let calls = 0;
  const server = createSetupServer({
    configFile: file,
    port: 0,
    fetchImpl: async () => {
      calls++;
      return {
        json: async () => ({
          ok: true,
          team_id: "T09LDGG3DJB",
          bot_id: "B1",
          user_id: "U1",
        }),
      };
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port;
  try {
    await run({ url, file, server, calls: () => calls });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
// Host matching uses the actual bound ephemeral port for isolated test servers.
test("setup form has same-origin referrer policy, CSRF binding and no cross-origin secret submission", async () =>
  withSetup(async ({ url, file, calls }) => {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("referrer-policy"), "same-origin");
    const html = await page.text(),
      cookie = page.headers.get("set-cookie").split(";")[0],
      csrf = /name="csrf" value="([a-f0-9]+)"/.exec(html)[1];
    const post = (origin, site, token = csrf) =>
      fetch(url + "/configure", {
        method: "POST",
        headers: { origin, "sec-fetch-site": site, cookie },
        body: new URLSearchParams({ ...valid, csrf: token }),
      });
    assert.equal(
      (await post("https://evil.example", "cross-site")).status,
      403,
    );
    assert.equal(calls(), 0);
    assert.equal((await post("null", "cross-site")).status, 403);
    assert.equal(calls(), 0);
    assert.equal(
      (await post("null", "same-origin", "b".repeat(64))).status,
      403,
    );
    assert.equal(calls(), 0);
    assert.equal((await post(url, "same-origin")).status, 200);
    assert.equal(calls(), 1);
    assert.equal(JSON.parse(fs.readFileSync(file)).slack.botUserId, "U1");
    assert.equal(JSON.parse(fs.readFileSync(file)).slack.teamId, "T09LDGG3DJB");
    assert.equal(slackReadiness(JSON.parse(fs.readFileSync(file))).configured, true);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal((await post(url, "same-origin")).status, 403);
  }));
test("legacy no-referrer POST Origin:null works only with live CSRF and same-origin fetch metadata", async () =>
  withSetup(async ({ url, calls }) => {
    const page = await fetch(url),
      html = await page.text(),
      cookie = page.headers.get("set-cookie").split(";")[0],
      csrf = /name="csrf" value="([a-f0-9]+)"/.exec(html)[1];
    const r = await fetch(url + "/configure", {
      method: "POST",
      headers: { origin: "null", "sec-fetch-site": "same-origin", cookie },
      body: new URLSearchParams({ ...valid, csrf }),
    });
    assert.equal(r.status, 200);
    assert.equal(calls(), 1);
  }));
test("opening another setup tab does not invalidate a still-live form", async () =>
  withSetup(async ({ url }) => {
    const first = await fetch(url),
      html = await first.text(),
      cookie = first.headers.get("set-cookie").split(";")[0],
      csrf = /name="csrf" value="([a-f0-9]+)"/.exec(html)[1];
    await fetch(url, { headers: { cookie } });
    const r = await fetch(url + "/configure", {
      method: "POST",
      headers: { origin: url, cookie },
      body: new URLSearchParams({ ...valid, csrf }),
    });
    assert.equal(r.status, 200);
  }));

test("a returning setup tab remains usable when the fresh-session cap is reached", async () =>
  withSetup(async ({ url }) => {
    const first = await fetch(url);
    const cookie = first.headers.get("set-cookie").split(";")[0];
    await first.text();
    for (let i = 1; i < 32; i++) {
      const response = await fetch(url);
      assert.equal(response.status, 200);
      await response.text();
    }
    const stranger = await fetch(url);
    assert.equal(stranger.status, 429);
    await stranger.text();
    const returning = await fetch(url, { headers: { cookie } });
    assert.equal(returning.status, 200);
    await returning.text();
  }));
