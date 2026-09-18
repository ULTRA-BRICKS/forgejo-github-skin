import { RenderCache } from "./render-cache.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validEnvelope, validInteraction, Budget } from "./protocol.mjs";
import { Store } from "./store.mjs";
import { Forgejo, isAccessDenied } from "./forgejo.mjs";
import { OAuth, cookie } from "./oauth.mjs";
import { SlackIntegration } from "./slack.mjs";
import { verifySlackRequest } from "../../ops/handoff/slack/preview-core.mjs";
import { generic, shell, sharePage, demoPage, css, ui } from "./views.mjs";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const configPath = path.resolve(
  process.env.FORGEJO_PREVIEW_CONFIG || path.join(root, ".sharing/config.json"),
);
function readConfig() {
  const st = fs.lstatSync(configPath);
  if (st.isSymbolicLink() || st.mode & 0o077)
    throw new Error("Config must be a private regular file");
  const c = JSON.parse(fs.readFileSync(configPath, "utf8"));
  for (const field of ["origin", "forgejo"]) {
    const u = new URL(c[field]);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash
    )
      throw new Error("Exact HTTPS origins required");
  }
  if (!/^[a-f0-9]{64}$/.test(c.encryptionKey))
    throw new Error("Encryption key is required");
  return c;
}
const config = readConfig(),
  store = new Store(
    path.join(path.dirname(configPath), "state.sqlite"),
    Buffer.from(config.encryptionKey, "hex"),
  );
const forgejo = new Forgejo(config.forgejo),
  oauth = new OAuth(config, store, forgejo),
  slack = new SlackIntegration(config, store, forgejo, oauth);
const metrics = {
  events: 0,
  completed: 0,
  failed: 0,
  interactions: 0,
  publicPages: 0,
  publicImages: 0,
  slackCrawlerRequests: 0,
};
let activeRenders = 0,
  workerBusy = false;
function headers(response, type = "text/html; charset=utf-8") {
  response.setHeader("Content-Type", type);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
}
function send(response, status, body, type) {
  headers(response, type);
  response.writeHead(status);
  response.end(body);
}
async function body(request) {
  let size = 0,
    chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 262144) throw new Error("Request too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function anonymous(raw) {
  const link = forgejo.parse(raw);
  if (!link) return null;
  try {
    return await forgejo.metadata(raw);
  } catch (e) {
    if (isAccessDenied(e.status)) return null;
    throw e;
  }
}
async function renderImage(meta) {
  if (activeRenders >= 2) throw new Error("Image renderer busy");
  activeRenders++;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(
          "python3",
          [path.join(root, "scripts/sharing/render_card.py")],
          { stdio: ["pipe", "pipe", "pipe"] },
        ),
        chunks = [];
      let size = 0;
      const timer = setTimeout(() => child.kill("SIGKILL"), 8000);
      child.stdout.on("data", (data) => {
        size += data.length;
        if (size > 2 * 1024 * 1024) child.kill("SIGKILL");
        else chunks.push(data);
      });
      child.stderr.resume();
      child.stdin.on("error", () => {});
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error("Image rendering failed"));
        else resolve(Buffer.concat(chunks));
      });
      child.stdin.end(JSON.stringify(meta));
    });
  } finally {
    activeRenders--;
  }
}
const publicBudget = new Budget(120, 60000),
  loginBudget = new Budget(12, 60000);

const renderCache = new RenderCache(renderImage);
const logo = fs.readFileSync(path.join(root, "assets/forgejo-graphite.svg"));
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, config.origin);
    const isPublicRead =
      [
        "/health",
        "/style.css",
        "/ui.js",
        "/logo.svg",
        "/robots.txt",
        "/share",
        "/image",
      ].includes(url.pathname) || url.pathname.startsWith("/s/");
    if (
      request.method === "GET" ||
      (request.method === "HEAD" && isPublicRead)
    ) {
      if (/Slackbot/i.test(request.headers["user-agent"] || ""))
        metrics.slackCrawlerRequests++;
      if (url.pathname === "/health")
        return send(
          response,
          200,
          JSON.stringify({
            service: "forgejo-link-preview",
            slackConfigured: !!config.slack.appId && !!config.slack.botToken,
            oauthConfigured: !!config.oauth.clientId,
          }),
          "application/json",
        );
      if (url.pathname === "/" || url.pathname === "/demo")
        return send(response, 200, demoPage(config));
      if (url.pathname === "/robots.txt")
        return send(
          response,
          200,
          "User-agent: *\nAllow: /s/\nAllow: /share\nAllow: /image\nDisallow: /demo\nDisallow: /oauth/\nDisallow: /connect\n",
          "text/plain",
        );
      if (url.pathname === "/style.css")
        return send(response, 200, css, "text/css");
      if (url.pathname === "/ui.js")
        return send(response, 200, ui, "text/javascript");
      if (url.pathname === "/logo.svg")
        return send(response, 200, logo, "image/svg+xml");
      if (
        url.pathname === "/share" ||
        url.pathname === "/image" ||
        url.pathname.startsWith("/s/")
      ) {
        if (!publicBudget.allow())
          return send(
            response,
            429,
            "Preview request budget exceeded; retry shortly",
            "text/plain",
          );
        const raw = url.pathname.startsWith("/s/")
          ? config.forgejo + url.pathname.slice(2)
          : url.searchParams.get("url") || "";
        const link = forgejo.parse(raw);
        const meta = link ? await anonymous(raw) : null;
        const safe = meta && !meta.private ? meta : generic;
        if (url.pathname === "/image") {
          metrics.publicImages++;
          return send(response, 200, await renderCache.get(safe), "image/png");
        }
        metrics.publicPages++;
        return send(
          response,
          200,
          sharePage(
            safe,
            link ? link.originalUrl : config.forgejo,
            config.origin,
          ),
        );
      }
      if (url.pathname === "/demo/login") {
        if (!loginBudget.allow())
          return send(response, 429, "Retry shortly", "text/plain");
        headers(response);
        return oauth.begin(request, response, {
          team: "demo",
          user: randomBytes(32).toString("hex"),
        });
      }
      if (url.pathname === "/connect") {
        const id = url.searchParams.get("ticket") || "";
        if (!/^[a-f0-9]{64}$/.test(id))
          return send(
            response,
            400,
            shell(
              "Expired connection",
              "<h1>Open the connection from Slack again.</h1>",
            ),
          );
        const identity = store.take("ticket:" + id);
        if (!identity)
          return send(
            response,
            400,
            shell(
              "Expired connection",
              "<h1>Open the connection from Slack again.</h1>",
            ),
          );
        headers(response);
        return oauth.begin(request, response, identity);
      }
      if (url.pathname === "/oauth/callback") {
        headers(response);
        const identity = await oauth.complete(request, response, url);
        if (identity.team === "demo") {
          response.writeHead(303, { Location: "/demo" });
          return response.end();
        }
        return send(
          response,
          200,
          shell(
            "Forgejo connected",
            "<h1>Forgejo connected.</h1><p>Return to Slack and select View privately again. Your account’s access is checked before showing content.</p>",
          ),
        );
      }
      if (url.pathname === "/demo/private") {
        const id = cookie(request, "fj_demo");
        const token = id && (await oauth.access("demo", id));
        if (!token)
          return send(
            response,
            401,
            JSON.stringify({ error: "Authorization required" }),
            "application/json",
          );
        let meta;
        try {
          meta = await forgejo.metadata(config.demoPrivateUrl, token);
        } catch {
          return send(
            response,
            403,
            JSON.stringify({ error: "Unavailable to this account" }),
            "application/json",
          );
        }
        if (!meta)
          return send(
            response,
            403,
            JSON.stringify({ error: "Unavailable to this account" }),
            "application/json",
          );
        return send(
          response,
          200,
          JSON.stringify({
            title: meta.title,
            description: meta.description,
            repository: meta.repository,
            status: meta.status,
          }),
          "application/json",
        );
      }
    }
    if (
      request.method === "POST" &&
      ["/slack/events", "/slack/interactions"].includes(url.pathname)
    ) {
      if (
        !config.slack.appId ||
        !config.slack.signingSecret ||
        !config.slack.botToken
      )
        return send(response, 503, "Slack installation required", "text/plain");
      const raw = await body(request);
      if (
        !verifySlackRequest({
          rawBody: raw,
          timestamp: request.headers["x-slack-request-timestamp"],
          signature: request.headers["x-slack-signature"],
          signingSecret: config.slack.signingSecret,
          nowSeconds: Date.now() / 1000,
        })
      )
        return send(response, 401, "Invalid request", "text/plain");
      if (url.pathname === "/slack/events") {
        const payload = JSON.parse(raw.toString());
        if (
          payload.type === "url_verification" &&
          typeof payload.challenge === "string" &&
          payload.challenge.length <= 512
        )
          return send(
            response,
            200,
            JSON.stringify({ challenge: payload.challenge }),
            "application/json",
          );
        if (!validEnvelope(payload, config))
          return send(response, 200, "Ignored", "text/plain");
        if (Number(store.pendingCount()) >= 1000)
          return send(
            response,
            503,
            "Queue capacity reached; retry later",
            "text/plain",
          );
        for (let offset = 0; offset < payload.event.links.length; offset += 5) {
          const batch = {
            ...payload,
            event: {
              ...payload.event,
              links: payload.event.links.slice(offset, offset + 5),
            },
          };
          if (
            store.enqueue(
              payload.team_id + ":" + payload.event_id + ":" + offset,
              batch,
            )
          )
            metrics.events++;
        }
        return send(response, 200, "Accepted", "text/plain");
      }
      const params = new URLSearchParams(raw.toString()),
        payload = JSON.parse(params.get("payload") || "null");
      if (!validInteraction(payload, config))
        return send(response, 403, "Invalid workspace", "text/plain");
      const replay =
        "interaction:" + createHash("sha256").update(raw).digest("hex");
      if (store.get(replay)) return send(response, 200, "", "text/plain");
      store.put(replay, { handled: true }, 600);
      send(response, 200, "", "text/plain");
      metrics.interactions++;
      slack.interact(payload).catch(() => {
        metrics.failed++;
        console.error("Private view interaction failed; details suppressed");
      });
      return;
    }
    send(response, 404, "Not found", "text/plain");
  } catch (error) {
    if (!response.headersSent)
      send(
        response,
        503,
        shell(
          "Request unavailable",
          "<h1>Unable to complete this request.</h1><p>Retry from the original page. No protected contents were disclosed.</p>",
        ),
      );
    else if (!response.writableEnded) response.end();
    console.error("Request failed; sensitive details suppressed");
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(config.port, "127.0.0.1", () =>
  console.log(
    `Preview service listening on loopback:${config.port}; Slack configured=${!!config.slack.botToken}`,
  ),
);
setInterval(async () => {
  if (workerBusy || !config.slack.botToken) return;
  workerBusy = true;
  let job;
  try {
    job = store.claim();
    if (job) {
      await slack.unfurl(job.value);
      store.finish(job.id);
      metrics.completed++;
    }
  } catch (error) {
    metrics.failed++;
    if (job) store.retry(job.id, job.tries, error.retryAfter);
    console.error("Unfurl delivery queued for bounded retry");
  } finally {
    workerBusy = false;
  }
}, 300).unref();
setInterval(() => {
  store.cleanup();
  fs.writeFileSync(
    path.join(path.dirname(configPath), "metrics.json"),
    JSON.stringify(metrics),
    { mode: 0o600 },
  );
}, 30000).unref();
function reloadConfig() {
  try {
    const next = readConfig();
    if (
      next.origin !== config.origin ||
      next.forgejo !== config.forgejo ||
      next.encryptionKey !== config.encryptionKey ||
      next.port !== config.port
    )
      throw new Error("Identity changes require restart");
    Object.assign(config, next);
    console.log(
      "Configuration reloaded; Slack configured=" + !!config.slack.botToken,
    );
  } catch {
    console.error("Configuration update rejected; previous settings retained");
  }
}
process.on("SIGHUP", reloadConfig);
fs.watchFile(
  configPath,
  { interval: 2000, persistent: false },
  (next, previous) => {
    if (next.mtimeMs !== previous.mtimeMs) reloadConfig();
  },
);
process.on("SIGTERM", () => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
});
