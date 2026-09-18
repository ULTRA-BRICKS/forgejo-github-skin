import test from "node:test";
import assert from "node:assert/strict";
import {
  sharePage,
  demoPage,
  generic,
  card,
} from "../../integrations/link-preview/views.mjs";
test("protected preview identifies only the public hostname, not a hardcoded product or an unverified private org", () => {
  const html = sharePage(
    { ...generic, brand: { name: "PRIVATE_ORG_SENTINEL" } },
    "https://git.example.org/a/b",
    "https://previews.example.org",
  );
  assert.ok(html.includes('og:site_name" content="git.example.org"'));
  assert.ok(!html.includes("PRIVATE_ORG_SENTINEL"));
  assert.ok(!html.includes('content="Hyperide"'));
  assert.ok(!html.includes("og:image"));
});
test("demo and personal card use the configured instance name", () => {
  const config = {
    forgejo: "https://git.example.org",
    brand: { name: "Example Engineering" },
    slack: {},
    demoPublicUrl: "https://git.example.org/a/b",
    demoPrivateUrl: "https://git.example.org/a/private",
  };
  assert.ok(demoPage(config).includes('alt="Example Engineering"'));
  assert.ok(
    card({
      title: "T",
      description: "D",
      status: "Open",
      repository: "a/b",
      private: false,
      brand: config.brand,
    }).includes("Example Engineering"),
  );
  assert.ok(!card({ ...generic }).includes(">FORGEJO "));
});
