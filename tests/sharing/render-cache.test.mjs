import test from "node:test";
import assert from "node:assert/strict";
import { RenderCache } from "../../integrations/link-preview/render-cache.mjs";
import { generic } from "../../integrations/link-preview/views.mjs";
const card = {
  private: false,
  title: "Public issue",
  description: "Body",
  status: "Open",
  repository: "a/b",
};

test("render bytes are reused only for identical freshly resolved metadata", async () => {
  let calls = 0;
  const cache = new RenderCache(async (meta) => {
    calls++;
    return Buffer.from(meta.title);
  });
  assert.equal((await cache.get(card)).toString(), "Public issue");
  await cache.get({ ...card });
  assert.equal(calls, 1);
  await cache.get({ ...card, title: "Updated" });
  assert.equal(calls, 2);
  // The caller resolved lost access: a prior public render must never be returned.
  assert.equal((await cache.get(generic)).toString(), generic.title);
  assert.equal(calls, 3);
  await assert.rejects(
    () => cache.get({ ...card, private: true }),
    /Private metadata/,
  );
});
test("render cache is size bounded, LRU, and single-flight", async () => {
  let calls = 0;
  const cache = new RenderCache(
    async (meta) => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return Buffer.from(meta.title);
    },
    { maxEntries: 1, maxBytes: 100 },
  );
  await Promise.all([cache.get(card), cache.get(card)]);
  assert.equal(calls, 1);
  await cache.get({ ...card, title: "Other" });
  assert.equal(cache.entries.size, 1);
  await cache.get(card);
  assert.equal(calls, 3);
  assert.ok(cache.bytes <= 100);
});
test("failed image renders are not retained as successful cached responses", async () => {
  let calls = 0;
  const cache = new RenderCache(async () => {
    calls++;
    throw new Error("Render failed");
  });
  await assert.rejects(() => cache.get(card));
  await assert.rejects(() => cache.get(card));
  assert.equal(calls, 2);
  assert.equal(cache.entries.size, 0);
  assert.equal(cache.pending.size, 0);
});
