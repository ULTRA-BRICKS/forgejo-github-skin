import { createRuntime, reloadRuntime } from "./runtime.mjs";
import { slackReadiness } from "./readiness.mjs";
import { renderGraphic, closeRenderer } from "./raster.mjs";
import { RenderCache } from "./render-cache.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { validEnvelope, validInteraction, Budget } from "./protocol.mjs";
import { Store } from "./store.mjs";
import { isAccessDenied } from "./forgejo.mjs";
import { cookie } from "./oauth.mjs";
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
  if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077)
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
const config = readConfig();
const stateDirectory = path.resolve(process.env.FORGEJO_PREVIEW_STATE_DIR || path.dirname(configPath));
const store = new Store(
    path.join(stateDirectory, "state.sqlite"),
    Buffer.from(config.encryptionKey, "hex"),
  );
let runtime = createRuntime(config, store);
let configurationReloadRejected = false;
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
  const { sources } = runtime;
  const link = sources.parse(raw);
  if (!link) return null;
  try {
    return await sources.metadata(raw, undefined, { enrich: true });
  } catch (e) {
    if (isAccessDenied(e.status)) return null;
    throw e;
  }
}
async function renderImage(meta) {
  if (activeRenders >= 2) throw new Error("Image renderer busy");
  activeRenders++;
  try {
    return await renderGraphic(meta);
  } finally {
    activeRenders--;
  }
}
const publicBudget = new Budget(120, 60000),
  loginBudget = new Budget(12, 60000);

const renderCache = new RenderCache(renderImage);
const logo = fs.readFileSync(path.join(root, "assets/forgejo-graphite.svg"));
const server = http.createServer(async (request, response) => {
  const { config, sources, forgejo, oauth, slack } = runtime;
  try {
    const url = new URL(request.url, config.origin);
    const snapshotMatch = url.pathname.match(/^\/image\/s\/([a-f0-9]{48})$/);
    if (snapshotMatch && request.method === "GET") {
      if (!publicBudget.allow()) return send(response, 429, "Retry shortly", "text/plain");
      const snapshot = store.get("image:" + snapshotMatch[1]);
      if (!snapshot?.summary) return send(response, 404, "Preview expired", "text/plain");
      metrics.publicImages++;
      return send(response, 200, await renderCache.get(snapshot), "image/png");
    }
    const isPublicRead =
      [
        "/health",
        "/style.css",
        "/ui.js",
        "/logo.svg",
        "/robots.txt",
        "/share",
        "/image",
        "/inspect",
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
            build: process.env.FORGEJO_PREVIEW_BUILD || "development",
            slackConfigured: slackReadiness(config).configured,
            oauthConfigured: !!oauth,
            configurationReloadRejected,
            sources: [...sources.entries.values()].map(source => ({ id: source.id, origin: source.base, oauthConfigured: !!source.auth })),
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
        url.pathname === "/inspect" ||
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
        const link = sources.parse(raw);
        // Browser navigation goes straight to the validated original, before API lookup.
        if (
          link &&
          url.pathname !== "/image" &&
          url.pathname !== "/inspect" &&
          request.headers["sec-fetch-mode"] === "navigate"
        ) {
          headers(response);
          response.writeHead(302, { Location: link.originalUrl });
          return response.end();
        }
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
        if (!oauth) return send(response, 503, "Account linking unavailable", "text/plain");
        if (!loginBudget.allow())
          return send(response, 429, "Retry shortly", "text/plain");
        headers(response);
        return oauth.begin(request, response, {
          team: "demo",
          user: randomBytes(32).toString("hex"),
        });
      }
      if (
        url.pathname === "/connect" ||
        /^\/connect\/[a-z][a-z0-9-]*$/.test(url.pathname)
      ) {
        const entry =
          url.pathname === "/connect"
            ? sources.primary
            : sources.byId(url.pathname.split("/")[2]);
        if (!entry?.auth)
          return send(
            response,
            503,
            "Account linking is not configured for this source",
            "text/plain",
          );
        const selected = entry.auth;
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
        const identity = store.take(selected.key("ticket", id));
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
        return selected.begin(request, response, identity);
      }
      if (
        url.pathname === "/oauth/callback" ||
        /^\/oauth\/[a-z][a-z0-9-]*\/callback$/.test(url.pathname)
      ) {
        const entry =
          url.pathname === "/oauth/callback"
            ? sources.primary
            : sources.byId(url.pathname.split("/")[2]);
        if (!entry?.auth)
          return send(
            response,
            503,
            "Account linking unavailable",
            "text/plain",
          );
        headers(response);
        const identity = await entry.auth.complete(request, response, url);
        if (identity.team === "demo") {
          response.writeHead(303, { Location: "/demo" });
          return response.end();
        }
        return send(
          response,
          200,
          shell(
            "Forgejo connected",
            "<h1>Forgejo connected.</h1><p>Return to Slack and select Preview again. Your account’s access is checked before showing protected details.</p>",
          ),
        );
      }
      if (url.pathname === "/demo/private") {
        const id = cookie(request, "fj_demo");
        const token = id && (await oauth?.access("demo", id));
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
      if (!slackReadiness(config).configured)
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
const listenPort = Number(process.env.FORGEJO_PREVIEW_PORT || config.port);
if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) throw new Error("Invalid listening port");
server.listen(listenPort, "127.0.0.1", () =>
  console.log(
    `Preview service listening on loopback:${listenPort}; Slack configured=${slackReadiness(config).configured}`,
  ),
);
setInterval(async () => {
  const { config, slack } = runtime;
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
    path.join(stateDirectory, "metrics.json"),
    JSON.stringify(metrics),
    { mode: 0o600 },
  );
}, 30000).unref();
function reloadConfig() {
  try {
    const next = readConfig();
    runtime = reloadRuntime(runtime, next, store);
    configurationReloadRejected = false;
    console.log(
      "Configuration reloaded; Slack configured=" + slackReadiness(runtime.config).configured,
    );
  } catch {
    configurationReloadRejected = true;
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
  server.close(async () => {
    await closeRenderer();
    store.close();
    process.exit(0);
  });
});
