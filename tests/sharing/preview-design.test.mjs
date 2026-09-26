import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { graphic, graphicLayout, hasGraphicFacts } from "../../integrations/link-preview/graphic.mjs";
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
    if (!hasGraphicFacts(fixture)) { assert.equal(svg, ""); return; }
    const layout = graphicLayout(fixture, sizes);
    assert.ok(svg.includes(`viewBox="0 0 480 ${layout.height}"`));
    if (fixture.summary) {
      assert.ok(!svg.includes(fixture.title));
      assert.ok(!svg.includes(fixture.description));
    }
    assert.ok(!svg.includes("FORGEJO"));
    assert.ok(svg.includes("Ultrabricks"));
    assert.ok(!svg.includes("foreignObject"));
    assert.ok(!svg.includes("<script"));
  });
test("unavailable resources emit no placeholder, authorized private fixtures retain facts", () => {
  const unavailable = graphic(previewFixtures.protectedUnavailable, tokens, sizes);
  assert.equal(unavailable, "");
  assert.equal(graphic(previewFixtures.missing, tokens, sizes), "");
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
test("adaptive shared SVG is transparent, compact, and cross-surface neutral", () => {
  const svg = graphic(previewFixtures.pull, tokens, sizes, { mode: "adaptive" });
  assert.ok(svg.includes('viewBox="0 0 480 136"'));
  assert.ok(!svg.includes('<rect width="480" height="136"'));
  assert.ok(svg.includes('fill="#797979"'));
  assert.ok(svg.includes('fill="#1a7f37"'));
  assert.ok(svg.includes('fill="#cf222e"'));
});
test("adaptive-mode text and code rows never use a stroke/halo trick for contrast", () => {
  const svg = graphic(previewFixtures.file, tokens, sizes, { mode: "adaptive" });
  assert.ok(svg.includes('data-code-row="0"'));
  assert.ok(!svg.includes('paint-order="stroke"'));
  assert.ok(!svg.includes('stroke="white"'));
});
test("file snippets syntax-highlight code without changing the source text", () => {
  const f = structuredClone(previewFixtures.file);
  f.summary.code = ['const answer = "yes"; // note'];
  const svg = graphic(f, tokens, sizes);
  assert.ok(svg.includes('fill="#0969da"'));
  assert.ok(svg.includes('fill="#1a7f37"'));
  assert.ok(svg.includes('fill="#797979"'));
  assert.ok(svg.includes('>const</tspan>'));
});
test("literal code is XML-escaped, whitespace-preserving, and at most five lines", () => {
  const f = structuredClone(previewFixtures.file);
  f.summary.code = ["<script>&  exact code", ...Array(8).fill("const x = 1;")];
  const svg = graphic(f, tokens, sizes);
  assert.ok(svg.includes("&lt;script&gt;&amp;"));
  assert.ok(svg.includes('xml:space="preserve"'));
  assert.equal((svg.match(/>const<\/tspan>/g) || []).length, 4);
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

test('file layout reserves every source line and a separate footer without narrowing the image', () => {
  for (let count = 1; count <= 8; count++) {
    const meta = structuredClone(previewFixtures.file);
    meta.summary.code = Array(count).fill('  return 42;');
    const layout = graphicLayout(meta, sizes);
    assert.equal(layout.width, 480);
    assert.equal(layout.lines.length, Math.min(count, 5));
    assert.ok(layout.codeFooter >= layout.codeStart + (layout.lines.length - 1) * layout.codeStep + 20);
    assert.ok(layout.height >= layout.codeFooter + 12);
    assert.ok(layout.height <= 160);
  }
});
test('unknown facts remain absent while real zero values still get a preview', () => {
  assert.equal(hasGraphicFacts({summary:{kind:'repository',metrics:[{value:NaN}]}}), false);
  assert.equal(hasGraphicFacts({summary:{kind:'repository',metrics:[{value:0}]}}), true);
});

test('unknown palette is rejected and zero activity is real data', () => {
  assert.throws(() => graphic(previewFixtures.file, tokens, sizes, { mode: 'night' }), TypeError);
  const meta = { private: false, summary: { kind: 'repository', metrics: [], activity: { days: Array(28).fill(0), total: 0, authorCount: 0 } } };
  assert.equal(hasGraphicFacts(meta), true);
  assert.ok(graphic(meta, tokens, sizes).includes('0 commits'));
});
