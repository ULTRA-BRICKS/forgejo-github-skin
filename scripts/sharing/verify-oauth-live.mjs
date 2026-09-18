import { loadPlaywright } from "../playwright.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, "../..");
const service = "https://forgejo-links.hyperide.ai";
const forge = "https://forgejo-ui-demo.hyperide.ai";
const output = path.join(root, "research/screenshots/sharing");
const results = [];
const users = JSON.parse(
  await fs.readFile(
    path.join(root, "../forgejo-github-skin-demo/.demo/users.json"),
    "utf8",
  ),
);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.setDefaultNavigationTimeout(25000);
let revoked = false;
async function access(method) {
  const response = await fetch(
    forge +
      "/api/v1/repos/demo-author/link-preview-private/collaborators/demo-reviewer",
    {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization:
          "Basic " +
          Buffer.from("demo-author:" + users["demo-author"]).toString("base64"),
        "Content-Type": "application/json",
      },
      body:
        method === "PUT" ? JSON.stringify({ permission: "read" }) : undefined,
    },
  );
  assert.ok(response.ok, "Synthetic repository permission update");
}
try {
  await fs.mkdir(output, { recursive: true });
  const before = await context.request.get(service + "/demo/private");
  assert.equal(before.status(), 401);
  results.push({ name: "Anonymous personal endpoint denied", pass: true });
  await page.goto(service + "/demo/login", { waitUntil: "domcontentloaded" });
  assert.equal(new URL(page.url()).origin, forge);
  await page.locator('input[name="user_name"]').fill("demo-reviewer");
  await page.locator('input[name="password"]').fill(users["demo-reviewer"]);
  await page
    .locator("form")
    .filter({ has: page.locator('input[name="password"]') })
    .getByRole("button", { name: /sign in/i })
    .click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
  console.log(
    "Consent actions:",
    await page.getByRole("button").allTextContents(),
  );
  // Forgejo may skip consent for a previously authorized client. Both paths
  // must complete through the same real callback, not a fake seeded session.
  const authorize = page.getByRole("button", {
    name: /authorize application/i,
  });
  await Promise.race([
    authorize.waitFor({ state: "visible" }),
    page.waitForURL(service + "/demo"),
  ]);
  if (await authorize.isVisible()) await authorize.click();
  await page.waitForURL(service + "/demo");
  await page
    .getByRole("button", { name: "Check my access", exact: true })
    .click();
  await page
    .locator("#result")
    .getByText(/FJ-DEMO-PRIVATE-PREVIEW-2026/)
    .waitFor();
  results.push({
    name: "Real Forgejo consent and PKCE callback expose only authorized synthetic content",
    pass: true,
  });
  await page.screenshot({
    path: path.join(output, "authorized-private-view.png"),
    fullPage: true,
  });
  await page
    .locator("#result")
    .screenshot({ path: path.join(output, "authorized-private-card.png") });
  revoked = true;
  await access("DELETE");
  const denied = await context.request.get(service + "/demo/private");
  assert.equal(denied.status(), 403);
  assert.ok(!(await denied.text()).includes("FJ-DEMO-PRIVATE-PREVIEW-2026"));
  results.push({
    name: "Revoked repository access denied immediately without re-login",
    pass: true,
  });
  await access("PUT");
  revoked = false;
  const restored = await context.request.get(service + "/demo/private");
  assert.equal(restored.status(), 200);
  const anonymous = await browser.newContext();
  assert.equal(
    (await anonymous.request.get(service + "/demo/private")).status(),
    401,
  );
  await anonymous.close();
  results.push({
    name: "Independent browser cannot reuse another viewers authorization",
    pass: true,
  });
} catch (error) {
  results.push({ pass: false, error: error.message });
  process.exitCode = 1;
} finally {
  try {
    if (revoked) await access("PUT");
  } catch {
    results.push({
      pass: false,
      error: "Synthetic reviewer access restoration needs attention",
    });
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
  await fs.writeFile(
    path.join(root, "research/sharing-oauth-proof.json"),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scope:
          "Real browser OAuth on synthetic Forgejo only. No browser storage, credentials or tokens exported; not a Slack event-delivery claim.",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
}
