import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { shell, css } from "../../integrations/link-preview/views.mjs";
const root = path.resolve(import.meta.dirname, "../.."),
  configFile = path.join(root, ".sharing/config.json");
const sessions = new Map();
const server = http.createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  if (!["127.0.0.1:3191", "localhost:3191"].includes(req.headers.host)) {
    res.writeHead(403);
    return res.end();
  }
  if (req.method === "GET" && req.url === "/style.css") {
    res.setHeader("Content-Type", "text/css");
    return res.end(css);
  }
  if (req.method === "GET" && req.url === "/") {
    const csrf = randomBytes(32).toString("hex");
    sessions.clear();
    sessions.set(csrf, Date.now() + 600000);
    res.setHeader(
      "Set-Cookie",
      `fj_setup=${csrf}; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`,
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(
      shell(
        "Connect the demo Slack app",
        `<h1>Connect Forgejo Links to Slack</h1><p>This setup page is available only on this Mac. Paste the two credentials from the app you just installed. They are written to a private configuration file, never displayed or logged.</p><p>App ID: <code>A0C2QBRV3NH</code> · Workspace: Glide</p><p><a href="https://api.slack.com/apps/A0C2QBRV3NH/general" target="_blank" rel="noreferrer">Open Signing Secret</a> · <a href="https://api.slack.com/apps/A0C2QBRV3NH/oauth" target="_blank" rel="noreferrer">Open Bot User OAuth Token</a></p><form method="post" action="/configure"><input type="hidden" name="csrf" value="${csrf}"><p><label>Signing Secret<br><input type="password" name="signing" autocomplete="off" required minlength="32" maxlength="32"></label></p><p><label>Bot User OAuth Token (xoxb-)<br><input type="password" name="bot" autocomplete="off" required minlength="20" maxlength="512"></label></p><button class="button" type="submit">Save local connection</button></form>`,
      ),
    );
  }
  if (req.method === "POST" && req.url === "/configure") {
    if (
      !["http://127.0.0.1:3191", "http://localhost:3191"].includes(
        req.headers.origin,
      )
    ) {
      res.writeHead(403);
      return res.end("Origin rejected");
    }
    let bytes = 0,
      chunks = [];
    for await (const data of req) {
      bytes += data.length;
      if (bytes > 2048) {
        res.writeHead(413);
        return res.end();
      }
      chunks.push(data);
    }
    const fields = new URLSearchParams(Buffer.concat(chunks).toString()),
      csrf = fields.get("csrf"),
      cookie = (req.headers.cookie || "").match(
        /(?:^|;\s*)fj_setup=([a-f0-9]{64})(?:;|$)/,
      )?.[1];
    if (
      !cookie ||
      !csrf ||
      csrf.length !== 64 ||
      !timingSafeEqual(Buffer.from(csrf), Buffer.from(cookie)) ||
      !sessions.has(csrf) ||
      sessions.get(csrf) < Date.now()
    ) {
      res.writeHead(403);
      return res.end("Reload the local setup page");
    }
    sessions.delete(csrf);
    const signing = fields.get("signing") || "",
      bot = fields.get("bot") || "";
    if (
      !/^[a-f0-9]{32}$/.test(signing) ||
      !/^xoxb-[A-Za-z0-9-]{15,500}$/.test(bot)
    ) {
      res.writeHead(400);
      return res.end("Unexpected format. Use the new demo app credentials.");
    }
    try {
      const response = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: { Authorization: "Bearer " + bot },
        signal: AbortSignal.timeout(8000),
      });
      const check = await response.json();
      if (!check.ok || check.team_id !== "T09LDGG3DJB" || !check.bot_id)
        throw new Error("Wrong workspace or token");
      const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
      config.slack = {
        ...config.slack,
        appId: "A0C2QBRV3NH",
        signingSecret: signing,
        botToken: bot,
        botUserId: check.user_id,
      };
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2), {
        mode: 0o600,
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        shell(
          "Saved",
          "<h1>Saved locally.</h1><p>The demo service will reload this configuration on restart. Return to the assistant to finish event verification and the real Slack unfurl demonstration.</p>",
        ),
      );
    } catch {
      res.writeHead(400);
      res.end(
        "Slack could not verify this demo bot. No configuration was changed.",
      );
    }
    return;
  }
  res.writeHead(404);
  res.end();
});
server.requestTimeout = 15000;
server.listen(3191, "127.0.0.1", () =>
  console.log("Local-only Slack setup: http://127.0.0.1:3191/"),
);
