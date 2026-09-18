import test from "node:test";
import assert from "node:assert/strict";
import { slackReadiness } from "../../integrations/link-preview/readiness.mjs";
const complete = {
  teamId: "T123",
  appId: "A123",
  signingSecret: "synthetic-signing-secret",
  botToken: "synthetic-bot-token",
};
test("configuration cannot report ready with token but without signature verification", () => {
  const result = slackReadiness({ slack: { ...complete, signingSecret: "" } });
  assert.equal(result.configured, false);
  assert.deepEqual(result.missing, ["signingSecret"]);
});
test("all required identities and credentials are needed for configuration readiness", () => {
  for (const key of Object.keys(complete)) {
    const value = { ...complete };
    delete value[key];
    assert.equal(slackReadiness({ slack: value }).configured, false, key);
  }
  assert.equal(slackReadiness({ slack: complete }).configured, true);
  assert.equal(
    slackReadiness({ slack: { ...complete, botToken: "   " } }).configured,
    false,
  );
});
test("diagnostics contain only missing field names, never credential values or an acceptance claim", () => {
  const serialized = JSON.stringify(slackReadiness({ slack: complete }));
  assert.ok(!serialized.includes("synthetic-signing-secret"));
  assert.ok(!serialized.includes("synthetic-bot-token"));
  assert.equal(slackReadiness({}).configured, false);
  assert.deepEqual(slackReadiness({ slack: complete }), {
    configured: true,
    missing: [],
  });
});
