import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { once } from "node:events";
const root = path.resolve(import.meta.dirname, "../..");
async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
test("real HTTP boundary verifies raw signatures, denies private sessions and acknowledges only valid requests", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fj-sharing-http-"));
  const port = await freePort(),
    origin = "http://127.0.0.1:" + port;
  const signing = "synthetic-signing-secret-for-tests";
  const config = {
    origin: "https://links.example",
    forgejo: "https://forge.example",
    port,
    encryptionKey: randomBytes(32).toString("hex"),
    oauth: { clientId: "test", clientSecret: "test" },
    slack: {
      teamId: "T123",
      appId: "A123",
      signingSecret: signing,
      botToken: "synthetic-test-token",
    },
    privateDestinations: [],
  };
  const configPath = path.join(directory, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  const child = spawn(
    process.execPath,
    ["integrations/link-preview/server.mjs"],
    {
      cwd: root,
      env: { ...process.env, FORGEJO_PREVIEW_CONFIG: configPath },
      stdio: "ignore",
    },
  );
  try {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(origin + "/health")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.equal((await fetch(origin + "/health")).status, 200);
    const unavailableImage = await fetch(origin + "/image?url=" + encodeURIComponent("https://unconfigured.invalid/a/b"));
    assert.equal(unavailableImage.status, 204);
    assert.equal((await unavailableImage.arrayBuffer()).byteLength, 0);

    const head = await fetch(origin + "/health", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.equal((await fetch(origin + "/demo/private")).status, 401);
    assert.equal(
      (
        await fetch(origin + "/demo/private", {
          headers: { Cookie: "fj_demo=" + "a".repeat(64) },
        })
      ).status,
      401,
    );
    const json = { type: "url_verification", challenge: "test-challenge" };
    const raw = JSON.stringify(json),
      timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", signing)
      .update(`v0:${timestamp}:${raw}`)
      .digest("hex");
    const headers = {
      "Content-Type": "application/json",
      "X-Slack-Request-Timestamp": timestamp,
      "X-Slack-Signature": "v0=" + signature,
    };
    const valid = await fetch(origin + "/slack/events", {
      method: "POST",
      headers,
      body: raw,
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { challenge: "test-challenge" });
    assert.equal(
      (
        await fetch(origin + "/slack/events", {
          method: "POST",
          headers,
          body: raw + " ",
        })
      ).status,
      401,
    );
    const old = String(Number(timestamp) - 301),
      oldSig = createHmac("sha256", signing)
        .update(`v0:${old}:${raw}`)
        .digest("hex");
    assert.equal(
      (
        await fetch(origin + "/slack/events", {
          method: "POST",
          headers: {
            ...headers,
            "X-Slack-Request-Timestamp": old,
            "X-Slack-Signature": "v0=" + oldSig,
          },
          body: raw,
        })
      ).status,
      401,
    );
    const hostile = {
      type: "event_callback",
      team_id: "T999",
      api_app_id: "A123",
      event_id: "Ev1",
      event: {
        type: "link_shared",
        links: [{ url: "https://forge.example/x/y" }],
      },
    };
    const hostileBody = JSON.stringify(hostile),
      hostileSig = createHmac("sha256", signing)
        .update(`v0:${timestamp}:${hostileBody}`)
        .digest("hex");
    const rejected = await fetch(origin + "/slack/events", {
      method: "POST",
      headers: { ...headers, "X-Slack-Signature": "v0=" + hostileSig },
      body: hostileBody,
    });
    assert.equal(rejected.status, 200);
    assert.equal(await rejected.text(), "Ignored");
    const invalid = await fetch(origin + "/connect?ticket=invalid");
    assert.equal(invalid.status, 400);
    assert.match(invalid.headers.get("cache-control"), /no-store/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, "exit");
      child.kill("SIGTERM");
      const timeout = setTimeout(() => child.kill("SIGKILL"), 3000);
      await stopped;
      clearTimeout(timeout);
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
