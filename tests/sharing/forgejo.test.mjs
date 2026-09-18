import test from "node:test";
import assert from "node:assert/strict";
import {
  Forgejo,
  jsonRequest,
  bounded,
} from "../../integrations/link-preview/forgejo.mjs";
import { generic, sharePage } from "../../integrations/link-preview/views.mjs";
test("anonymous metadata has no credential and rejects a private repository", async () => {
  const calls = [];
  const f = new Forgejo("https://forge.example", async (url, options) => {
    calls.push({ url, options });
    return { id: 2, private: true, full_name: "private/repo" };
  });
  assert.equal(await f.metadata("https://forge.example/private/repo"), null);
  assert.equal(calls[0].options.token, undefined);
});
test("issue metadata is fetched using only the linked viewers credential", async () => {
  const calls = [];
  const f = new Forgejo("https://forge.example", async (url, options) => {
    calls.push({ url, options });
    return url.endsWith("/issues/1")
      ? { title: "Authorized secret", body: "Private body", state: "open" }
      : { id: 2, private: true, full_name: "owner/repo" };
  });
  const m = await f.metadata(
    "https://forge.example/owner/repo/issues/1",
    "synthetic-user-token",
  );
  assert.equal(m.title, "Issue #1: Authorized secret");
  assert.equal(m.private, true);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.options.token === "synthetic-user-token"));
});
test("external/traversal/credential-bearing URL never causes a source request", async () => {
  let calls = 0;
  const f = new Forgejo("https://forge.example", async () => {
    calls++;
  });
  for (const url of [
    "https://evil.example/a/b",
    "https://forge.example/a/b?token=x",
    "https://user:pass@forge.example/a/b",
    "https://forge.example/a/%2e%2e/b",
  ])
    assert.equal(await f.metadata(url), null);
  assert.equal(calls, 0);
});
test("upstream redirects and oversize responses fail closed", async () => {
  let passed;
  const fetchImpl = async (url, options) => {
    passed = options;
    return new Response("x".repeat(200), { status: 200 });
  };
  await assert.rejects(
    () => jsonRequest("https://forge.example/a", { limit: 100, fetchImpl }),
    /bound/,
  );
  assert.equal(passed.redirect, "error");
});
test("private HTML metadata stays generic and safely escapes original URLs", () => {
  const html = sharePage(
    generic,
    "https://forge.example/owner/repo",
    "https://links.example",
  );
  assert.ok(html.includes("Protected link — sign in to view"));
  assert.ok(!html.includes("Authorized secret"));
  assert.ok(
    !html.includes("og:image"),
    "protected previews have no redundant public raster card",
  );
  const hostile = sharePage(
    { ...generic, title: "<script>alert(1)</script>" },
    "https://forge.example/a/b",
    "https://links.example",
  );
  assert.ok(!hostile.includes("<script>alert(1)"));
});
test("bounded metadata remains well-formed and limits large values before expansion", () => {
  assert.equal([...bounded("🧪".repeat(100000), 400)].length, 400);
  assert.equal(bounded("x\ud800x").isWellFormed(), true);
});
test("malformed repository visibility never becomes a public authorization fact", async () => {
  const f = new Forgejo("https://forge.example", async () => ({
    id: 2,
    full_name: "a/b",
  }));
  await assert.rejects(
    () => f.metadata("https://forge.example/a/b", "synthetic-token"),
    /metadata/,
  );
});

test("an unknown immutable file size is not fabricated as undefined bytes", async () => {
  const sha = "a".repeat(40);
  const client = new Forgejo("https://forge.example", async (url) =>
    url.includes("/contents/")
      ? { type: "file", name: "example.ts" }
      : { id: 2, private: false, full_name: "owner/repo" },
  );
  const meta = await client.metadata(
    "https://forge.example/owner/repo/src/commit/" + sha + "/example.ts",
  );
  assert.match(meta.description, /Size unknown/);
  assert.ok(!meta.description.includes("undefined"));
});
