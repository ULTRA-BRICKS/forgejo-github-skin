import http from "node:http";
import { setupUi } from "./setup-ui.mjs";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { shell, css } from "../../integrations/link-preview/views.mjs";
export function createSetupServer({
  configFile,
  port = 3191,
  fetchImpl = fetch,
  referrerPolicy = "same-origin",
  acceptBoundLegacyOrigin = true,
  progressive = true,
}) {
  const sessions = new Map();
  const server = http.createServer(async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Frame-Options", "DENY");
      // no-referrer makes native form POST send Origin:null.
      res.setHeader("Referrer-Policy", referrerPolicy);
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      );
      if (
        ![
          `127.0.0.1:${port || server.address().port}`,
          `localhost:${port || server.address().port}`,
        ].includes(req.headers.host)
      ) {
        res.writeHead(403);
        return res.end();
      }
      if (req.method === "GET" && req.url === "/setup.js") {
        res.setHeader("Content-Type", "text/javascript");
        return res.end(setupUi);
      }
      if (req.method === "GET" && req.url === "/style.css") {
        res.setHeader("Content-Type", "text/css");
        return res.end(css);
      }
      if (req.method === "GET" && req.url === "/") {
        for (const [key, expiry] of sessions)
          if (expiry < Date.now()) sessions.delete(key);
        const existing = (req.headers.cookie || "").match(
          /(?:^|;\s*)fj_setup=([a-f0-9]{64})(?:;|$)/,
        )?.[1];
        if (
          sessions.size >= 32 &&
          !(existing && sessions.get(existing) > Date.now())
        ) {
          res.writeHead(429);
          return res.end("Too many setup windows; retry shortly");
        }
        const csrf =
          existing && sessions.get(existing) > Date.now()
            ? existing
            : randomBytes(32).toString("hex");
        sessions.set(csrf, Date.now() + 600000);
        res.setHeader(
          "Set-Cookie",
          `fj_setup=${csrf}; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`,
        );
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.end(
          shell(
            "Connect the demo Slack app",
            `<h1>Connect Hyperide Links to Slack</h1><p>This setup page is available only on this Mac. Paste the two credentials from the app you just installed. They are written to a private configuration file, never displayed or logged.</p><p>App ID: <code>A0C2QBRV3NH</code> · Workspace: Glide</p><p><a href="https://api.slack.com/apps/A0C2QBRV3NH/general" target="_blank" rel="noreferrer">Open Signing Secret</a> · <a href="https://api.slack.com/apps/A0C2QBRV3NH/oauth" target="_blank" rel="noreferrer">Open Bot User OAuth Token</a></p><form method="post" action="/configure"><input type="hidden" name="csrf" value="${csrf}"><p><label>Signing Secret<br><input type="password" name="signing" autocomplete="off" required minlength="32" maxlength="32"></label></p><p><label>Bot User OAuth Token (xoxb-)<br><input type="password" name="bot" autocomplete="off" required minlength="20" maxlength="512"></label></p><button class="button" type="submit">Save local connection</button></form><p id="setup-feedback" role="status" aria-live="polite"></p>${progressive ? '<script src="/setup.js" defer></script>' : ""}`,
          ),
        );
      }
      if (req.method === "POST" && req.url === "/configure") {
        if (
          req.headers.origin !== `http://${req.headers.host}` &&
          !(
            acceptBoundLegacyOrigin &&
            req.headers.origin === "null" &&
            req.headers["sec-fetch-site"] === "same-origin"
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
          !/^[a-f0-9]{64}$/.test(csrf) ||
          !timingSafeEqual(Buffer.from(csrf), Buffer.from(cookie)) ||
          !sessions.has(csrf) ||
          sessions.get(csrf) < Date.now()
        ) {
          res.writeHead(403);
          return res.end("Reload the local setup page");
        }
        const signing = fields.get("signing") || "",
          bot = fields.get("bot") || "";
        if (
          !/^[a-f0-9]{32}$/.test(signing) ||
          !/^xoxb-[A-Za-z0-9-]{15,500}$/.test(bot)
        ) {
          res.writeHead(400);
          return res.end(
            "Unexpected format. Use the new demo app credentials.",
          );
        }
        try {
          const response = await fetchImpl("https://slack.com/api/auth.test", {
            method: "POST",
            headers: { Authorization: "Bearer " + bot },
            signal: AbortSignal.timeout(8000),
          });
          const check = await response.json();
          if (!check.ok || check.team_id !== "T09LDGG3DJB" || !check.bot_id)
            throw new Error("Wrong workspace or token");
          if (fs.lstatSync(configFile).isSymbolicLink())
            throw new Error("Config symlink rejected");
          const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
          config.slack = {
            ...config.slack,
            teamId: check.team_id,
            appId: "A0C2QBRV3NH",
            signingSecret: signing,
            botToken: bot,
            botUserId: check.user_id,
          };
          const temporary =
            configFile + "." + randomBytes(8).toString("hex") + ".tmp";
          fs.writeFileSync(temporary, JSON.stringify(config, null, 2), {
            mode: 0o600,
            flag: "wx",
          });
          fs.renameSync(temporary, configFile);
          sessions.delete(csrf);
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
    } catch {
      if (!res.headersSent) res.writeHead(400);
      res.end("Setup could not complete. Submitted secrets are never logged.");
    }
  });
  server.requestTimeout = 15000;
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const root = path.resolve(import.meta.dirname, "../..");
  createSetupServer({
    configFile: path.join(root, ".sharing/config.json"),
  }).listen(3191, "127.0.0.1", () =>
    console.log("Local-only Slack setup ready: http://127.0.0.1:3191/"),
  );
}
