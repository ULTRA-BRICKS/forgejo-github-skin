import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Store } from "../../integrations/link-preview/store.mjs";
import { OAuth, cookie } from "../../integrations/link-preview/oauth.mjs";
const cfg = {
  origin: "https://links.example",
  forgejo: "https://forge.example",
  oauth: { clientId: "fixture-client", clientSecret: "fixture-secret" },
};
const response = () => ({
  headers: {},
  setHeader(k, v) {
    this.headers[k] = v;
  },
  writeHead(code, headers) {
    this.code = code;
    Object.assign(this.headers, headers);
  },
  end() {},
});
function fixture(
  request = async () => ({
    access_token: "synthetic-token",
    expires_in: 3600,
    refresh_token: "synthetic-refresh",
  }),
) {
  const store = new Store(":memory:", randomBytes(32));
  return {
    store,
    oauth: new OAuth(cfg, store, { api: async () => ({ id: 17 }) }, request),
  };
}
test("OAuth uses unpredictable browser-bound state, PKCE and a fixed redirect", () => {
  const { store, oauth } = fixture();
  try {
    const res = response();
    oauth.begin({ headers: {} }, res, { team: "T123", user: "U123" });
    const u = new URL(res.headers.Location);
    assert.equal(u.origin, cfg.forgejo);
    assert.equal(
      u.searchParams.get("redirect_uri"),
      cfg.origin + "/oauth/callback",
    );
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
    assert.equal(u.searchParams.get("state").length, 64);
    assert.match(res.headers["Set-Cookie"], /HttpOnly; Secure; SameSite=Lax/);
    assert.ok(!u.href.includes(cfg.oauth.clientSecret));
  } finally {
    store.close();
  }
});
test("callback rejects another browser and accepts a valid single-use state", async () => {
  let sent;
  const { store, oauth } = fixture(async (url, opts) => {
    sent = new URLSearchParams(opts.body);
    return { access_token: "token", expires_in: 3600 };
  });
  try {
    const start = response();
    oauth.begin({ headers: {} }, start, { team: "T123", user: "U123" });
    const state = new URL(start.headers.Location).searchParams.get("state");
    const callback = new URL(
      cfg.origin + "/oauth/callback?state=" + state + "&code=fixture-code",
    );
    await assert.rejects(
      () =>
        oauth.complete(
          { headers: { cookie: "fj_oauth=" + "0".repeat(64) } },
          response(),
          callback,
        ),
      /binding/,
    );
    assert.ok(store.get(oauth.key("state", state)));
    const request = {
      headers: { cookie: start.headers["Set-Cookie"].split(";")[0] },
    };
    await oauth.complete(request, response(), callback);
    assert.equal(await oauth.access("T123", "U123"), "token");
    assert.equal(sent.get("code_verifier").length, 64);
    await assert.rejects(() => oauth.complete(request, response(), callback));
  } finally {
    store.close();
  }
});
test("refresh is single-flight per viewer and never shared between viewers", async () => {
  let calls = 0;
  const { store, oauth } = fixture(async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return {
      access_token: "fresh",
      refresh_token: "rotated",
      expires_in: 3600,
    };
  });
  try {
    store.put(oauth.key("account", "T1:U1"), {
      accessToken: "old",
      expires: 0,
      refreshToken: "old-refresh",
    });
    assert.deepEqual(
      await Promise.all([oauth.access("T1", "U1"), oauth.access("T1", "U1")]),
      ["fresh", "fresh"],
    );
    assert.equal(calls, 1);
    assert.equal(await oauth.access("T1", "U2"), null);
  } finally {
    store.close();
  }
});
test("connection tickets are short-lived opaque identities, never raw tokens", () => {
  const { store, oauth } = fixture();
  try {
    const u = new URL(oauth.ticket("T123", "U123"));
    assert.equal(u.origin, cfg.origin);
    const ticket = u.searchParams.get("ticket");
    assert.match(ticket, /^[a-f0-9]{64}$/);
    assert.deepEqual(store.take(oauth.key("ticket", ticket)), {
      team: "T123",
      user: "U123",
    });
    assert.equal(store.take(oauth.key("ticket", ticket)), null);
    assert.throws(() => oauth.ticket("evil", "U123"));
  } finally {
    store.close();
  }
});
test("cookie parser rejects arbitrary session values", () => {
  assert.equal(
    cookie({ headers: { cookie: "fj_demo=oops" } }, "fj_demo"),
    null,
  );
  assert.equal(
    cookie(
      { headers: { cookie: "x=1; fj_demo=" + "a".repeat(64) } },
      "fj_demo",
    ),
    "a".repeat(64),
  );
});
