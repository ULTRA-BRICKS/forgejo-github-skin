import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { graphic } from "../../integrations/link-preview/graphic.mjs";
import {
  baseFacts,
  activityFacts,
} from "../../integrations/link-preview/facts.mjs";
import { previewFixtures } from "../../stories/preview-fixtures.mjs";
import { Sources } from "../../integrations/link-preview/sources.mjs";
import { Store } from "../../integrations/link-preview/store.mjs";
import { Forgejo } from "../../integrations/link-preview/forgejo.mjs";
const tokens = JSON.parse(
    fs.readFileSync(new URL("../../tokens.json", import.meta.url)),
  ),
  sizes = JSON.parse(
    fs.readFileSync(
      new URL("../../tokens/preview.tokens.json", import.meta.url),
    ),
  );
for (const [kind, fixture] of Object.entries(previewFixtures))
  test(`${kind}: shared vector contains facts and small instance identity, not the duplicated title/body`, () => {
    const svg = graphic(fixture, tokens, sizes);
    assert.ok(svg.includes('viewBox="0 0 480 224"'));
    if (fixture.summary) {
      assert.ok(!svg.includes(fixture.title));
      assert.ok(!svg.includes(fixture.description));
    }
    assert.ok(!svg.includes("FORGEJO"));
    assert.ok(svg.includes("Ultrabricks"));
    assert.ok(!svg.includes("foreignObject"));
    assert.ok(!svg.includes("<script"));
  });
test("protected fallback is still a compact visual, while authorized private fixtures render real facts", () => {
  const unavailable = graphic(previewFixtures.protectedUnavailable, tokens, sizes);
  assert.ok(unavailable.includes("Protected link"));
  assert.ok(unavailable.includes("Ultrabricks"));
  const privateRepo = graphic(previewFixtures.privateRepository, tokens, sizes);
  assert.ok(privateRepo.includes("Visibility"));
  assert.ok(privateRepo.includes("Private"));
  assert.ok(!privateRepo.includes("Protected link"));
});
test("missing counts stay unknown; zero remains zero; invalid state never becomes Open", () => {
  const facts = baseFacts(
    { updated_at: "" },
    { state: "surprise" },
    { kind: "issue" },
  );
  assert.equal(facts.metrics[0].value, null);
  assert.equal(facts.metrics[1].value, null);
  const repo = baseFacts(
    { stars_count: 0, open_issues_count: null },
    {},
    { kind: "repository" },
  );
  assert.equal(repo.metrics[0].value, 0);
  assert.equal(repo.metrics[1].value, null);
});
test("activity uses real timestamps and labels truncated sampling", () => {
  const dates = [
    {
      commit: { committer: { date: "2026-09-18T10:00:00Z" } },
      author: { login: "one" },
    },
    { commit: { committer: { date: "2020-01-01T10:00:00Z" } } },
  ];
  const a = activityFacts(dates, new Date("2026-09-18T12:00:00Z"));
  assert.equal(a.total, 1);
  assert.equal(a.days.length, 28);
  assert.equal(a.authorCount, 1);
  assert.equal(a.sampled, false);
  assert.equal(
    activityFacts(Array(100).fill(dates[0]), new Date("2026-09-18")).sampled,
    true,
  );
});
test("literal code is XML-escaped, whitespace-preserving, and at most five lines", () => {
  const f = structuredClone(previewFixtures.file);
  f.summary.code = ["<script>&  exact code", ...Array(8).fill("const x = 1;")];
  const svg = graphic(f, tokens, sizes);
  assert.ok(svg.includes("&lt;script&gt;&amp;"));
  assert.ok(svg.includes('xml:space="preserve"'));
  assert.equal((svg.match(/const x = 1;/g) || []).length, 4);
});
test("direct qa-cli URL resolves only to the exact production source; demo credentials cannot cross origins", async () => {
  const store = new Store(":memory:", randomBytes(32));
  let calls = 0;
  const sources = new Sources(
    {
      origin: "https://links.example",
      forgejo: "https://demo.example",
      oauth: { clientId: "a", clientSecret: "b" },
      instances: [{ id: "production", base: "https://git.hyperide.ai" }],
    },
    store,
    (base) =>
      new Forgejo(base, async () => {
        calls++;
        return { id: 1, private: false, full_name: "ultrabricks/qa-cli" };
      }),
  );
  try {
    const direct = "https://git.hyperide.ai/ultrabricks/qa-cli";
    assert.equal(sources.parse(direct).originalUrl, direct);
    assert.equal(sources.source(direct).id, "production");
    assert.equal(
      sources.parse("https://git.hyperide.ai.evil.example/ultrabricks/qa-cli"),
      null,
    );
    await assert.rejects(
      () =>
        sources.metadata(direct, {
          origin: "https://demo.example",
          accessToken: "fixture",
        }),
      /mismatch/,
    );
    assert.equal(calls, 0);
    assert.equal(sources.ticket("T1", "U1", direct), null);
  } finally {
    store.close();
  }
});

test("source identifiers cannot alias different OAuth namespaces", () => {
  const store = new Store(":memory:", randomBytes(32));
  try {
    assert.throws(
      () =>
        new Sources(
          {
            origin: "https://links.example",
            forgejo: "https://demo.example",
            instances: [{ id: "demo", base: "https://git.hyperide.ai" }],
          },
          store,
        ),
      /Invalid\/duplicate/,
    );
  } finally {
    store.close();
  }
});
