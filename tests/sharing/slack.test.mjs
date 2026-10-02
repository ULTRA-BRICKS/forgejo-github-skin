import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { SlackIntegration } from "../../integrations/link-preview/slack.mjs";
import { Store } from "../../integrations/link-preview/store.mjs";
import { parseForgejoLink } from "../../ops/handoff/slack/preview-core.mjs";
import {
  validEnvelope,
  validInteraction,
  Budget,
} from "../../integrations/link-preview/protocol.mjs";
const source = "https://forge.example",
  raw = source + "/owner/private/issues/1";
const config = {
  forgejo: source,
  slack: {
    teamId: "T123",
    appId: "A123",
    disclosureUser: "U123",
    demoChannel: "C123",
  },
  privateDestinations: [
    {
      workspaceId: "T123",
      channelId: "C123",
      repositoryId: "2",
      instanceOrigin: source,
      approvedToCopy: true,
    },
  ],
};
const event = (extra = {}) => ({
  type: "event_callback",
  team_id: "T123",
  api_app_id: "A123",
  event_id: "Ev123",
  event: {
    type: "link_shared",
    user: "U123",
    channel: "C123",
    message_ts: "1789733603.123",
    source: "conversations_history",
    links: [{ url: raw }],
    ...extra,
  },
});
function fixture({ connected = true, shared = false, allowed = true } = {}) {
  const store = new Store(":memory:", randomBytes(32)),
    calls = [],
    reads = [];
  const forgejo = {
    parse: (url) => parseForgejoLink(url, source),
    metadata: async (url, token) => {
      reads.push({ url, token: !!token });
      if (!token || !allowed) {
        const e = new Error("Unavailable");
        e.status = 404;
        throw e;
      }
      return {
        link: parseForgejoLink(url, source),
        private: true,
        repositoryId: "2",
        title: "PRIVATE SENTINEL",
        description: "PRIVATE BODY",
        status: "Open",
        repository: "owner/private",
      };
    },
  };
  const slack = new SlackIntegration(config, store, forgejo, {
    access: async () => (connected ? "synthetic-token" : null),
    ticket: () => "https://links.example/connect?ticket=" + "a".repeat(64),
  });
  slack.call = async (method, payload) => {
    calls.push({ method, payload });
    if (method === "conversations.info")
      return {
        channel: {
          id: "C123",
          is_private: true,
          is_ext_shared: shared,
          is_pending_ext_shared: false,
          is_org_shared: false,
          is_shared: shared,
        },
      };
    if (method === "views.open") return { view: { id: "V123" } };
    return { ok: true };
  };
  return { store, calls, reads, slack };
}
test("unlinked private link only produces a neutral card", async () => {
  const f = fixture({ connected: false });
  try {
    await f.slack.unfurl(event());
    assert.ok(!JSON.stringify(f.calls).includes("PRIVATE SENTINEL"));
    assert.match(JSON.stringify(f.calls), /Preview/);
    assert.ok(f.reads.every((x) => !x.token));
  } finally {
    f.store.close();
  }
});
test("approved synthetic channel copy requires linked actor and fresh safe audience", async () => {
  const f = fixture();
  try {
    await f.slack.unfurl(event());
    assert.ok(JSON.stringify(f.calls).includes("PRIVATE SENTINEL"));
    assert.ok(JSON.stringify(f.calls).includes("Shared copy"));
  } finally {
    f.store.close();
  }
});
for (const [name, options, extra] of [
  ["external Slack Connect channel", { shared: true }, {}],
  ["unapproved channel", {}, { channel: "C999" }],
  ["different sender", {}, { user: "U999" }],
  ["composer", {}, { source: "composer", unfurl_id: "composer123" }],
  ["revoked source access", { allowed: false }, {}],
])
  test(name + " cannot publish protected metadata", async () => {
    const f = fixture(options);
    try {
      await f.slack.unfurl(event(extra));
      assert.ok(!JSON.stringify(f.calls).includes("PRIVATE SENTINEL"));
      assert.match(JSON.stringify(f.calls), /Preview/);
    } finally {
      f.store.close();
    }
  });
test("forged workspace cannot cause any Slack API calls", async () => {
  const f = fixture();
  try {
    await f.slack.unfurl({ ...event(), team_id: "T999" });
    assert.equal(f.calls.length, 0);
  } finally {
    f.store.close();
  }
});
test("private modal rechecks the clicking viewer and reports revoked access generically", async () => {
  const f = fixture({ allowed: false });
  try {
    const reference = f.slack.reference("T123", raw);
    await f.slack.interact({
      team: { id: "T123" },
      api_app_id: "A123",
      user: { id: "U123" },
      trigger_id: "trigger",
      actions: [{ action_id: "forgejo_view_private", value: reference }],
    });
    assert.equal(f.calls[0].method, "views.open");
    assert.equal(f.calls.at(-1).method, "views.update");
    assert.ok(!JSON.stringify(f.calls).includes("PRIVATE SENTINEL"));
    assert.match(JSON.stringify(f.calls), /unavailable to your linked account/);
  } finally {
    f.store.close();
  }
});
test("protocol refuses missing destinations, invalid identities and unbounded link batches", () => {
  assert.ok(validEnvelope(event(), config));
  assert.ok(!validEnvelope({ ...event(), team_id: "T999" }, config));
  assert.ok(!validEnvelope(event({ message_ts: "invalid" }), config));
  assert.ok(
    !validEnvelope(event({ links: Array(21).fill({ url: raw }) }), config),
  );
  assert.ok(
    !validInteraction({ team: { id: "T123" }, api_app_id: "A123" }, config),
  );
  const budget = new Budget(2, 60000);
  assert.equal(budget.allow(), true);
  assert.equal(budget.allow(), true);
  assert.equal(budget.allow(), false);
});

test('an expired personal-view reference opens an actionable message instead of silently ignoring the click', async () => {
  const f = fixture();
  try {
    await f.slack.interact({ team: { id: 'T123' }, api_app_id: 'A123', user: { id: 'U123' },
      trigger_id: 'fixture-trigger', actions: [{ action_id: 'forgejo_view_private', value: 'a'.repeat(48) }] });
    assert.equal(f.calls[0]?.method, 'views.open');
    assert.match(JSON.stringify(f.calls[0]), /expired/i);
    assert.ok(!JSON.stringify(f.calls).includes('PRIVATE SENTINEL'));
  } finally { f.store.close(); }
});
test('unconfigured account linking still provides a validated original URL', async () => {
  const f = fixture({ connected: false });
  f.slack.oauth.ticket = () => null;
  try {
    const value = f.slack.reference('T123', raw);
    await f.slack.interact({ team: { id: 'T123' }, api_app_id: 'A123', user: { id: 'U123' },
      trigger_id: 'fixture-trigger', actions: [{ action_id: 'forgejo_view_private', value }] });
    const update = f.calls.find(call => call.method === 'views.update');
    const buttons = update.payload.view.blocks.flatMap(block => block.elements || []);
    assert.equal(buttons.find(button => button.action_id === 'forgejo_open_original')?.url, raw);
    assert.ok(!JSON.stringify(f.calls).includes('PRIVATE SENTINEL'));
  } finally { f.store.close(); }
});

for (const [anonymousReadable, privateFlag, expectedImage] of [[false, false, false], [true, false, false], [true, undefined, false]]) {
  test(`shared PNG requires actual anonymous source access (${anonymousReadable}, ${privateFlag})`, async () => {
    const f = fixture();
    f.slack.config = { ...f.slack.config, origin: 'https://links.example' };
    f.slack.forgejo.metadata = async (url, token) => {
      if (!anonymousReadable && !token) {
        const error = new Error('Instance requires login');
        error.status = 403;
        throw error;
      }
      return { link: parseForgejoLink(url, source), private: privateFlag,
        repositoryId: '2', title: 'Public object', description: 'Verified public metadata',
        summary: { kind: 'pull', metrics: [{ label: 'State', value: 'Open' }] } };
    };
    try {
      await f.slack.unfurl(event());
      const blocks = f.calls.find(call => call.method === 'chat.unfurl').payload.unfurls[raw].blocks;
      assert.match(JSON.stringify(blocks), /Public object/);
      assert.equal(blocks.some(block => block.type === 'image'), expectedImage);
    } finally { f.store.close(); }
  });
}

test('image snapshots require meaningful facts and strip protected code/prose', () => {
  const f = fixture();
  f.slack.config = { ...f.slack.config, origin: 'https://links.example' };
  try {
    assert.equal(f.slack.imageSnapshot({ private: false, summary: { kind: 'repository', metrics: [{ label: 'Stars', value: null }] } }), null);
    const url = f.slack.imageSnapshot({ private: true, title: 'SECRET TITLE', description: 'SECRET BODY',
      summary: { kind: 'file', code: ['SECRET CODE'], metrics: [{ label: 'Bytes', value: 12 }] } });
    assert.match(url, /^https:\/\/links\.example\/image\/s\/[a-f0-9]{48}$/);
    const id = url.split('/').at(-1), stored = f.store.get('image:' + id);
    assert.equal(stored.title, 'Private repository preview');
    assert.equal(stored.description, '');
    assert.equal(stored.summary.code, null);
    assert.ok(!JSON.stringify(stored).includes('SECRET'));
  } finally { f.store.close(); }
});
