import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { jsonRequest } from "./forgejo.mjs";
const random = () => randomBytes(32).toString("hex");
export const cookie = (request, name) => {
  const value = (request.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="))
    ?.slice(name.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
};
export class OAuth {
  constructor(config, store, forgejo, request = jsonRequest) {
    this.config = config;
    this.store = store;
    this.forgejo = forgejo;
    this.request = request;
    this.refreshing = new Map();
  }
  key(type, value) {
    return (
      type +
      ":" +
      (this.config.namespace ? this.config.namespace + ":" : "") +
      value
    );
  }
  ticket(team, user) {
    if (!/^T[A-Z0-9]+$/.test(team) || !/^U[A-Z0-9]+$/.test(user))
      throw new Error("Slack identity must be verified");
    const id = random();
    this.store.put(this.key("ticket", id), { team, user }, 300);
    return (
      this.config.origin +
      (this.config.connectPath || "/connect") +
      "?ticket=" +
      id
    );
  }
  begin(request, response, identity) {
    const binding = random(),
      state = random(),
      verifier = random(),
      challenge = createHash("sha256").update(verifier).digest("base64url");
    this.store.put(
      this.key("state", state),
      { binding, verifier, ...identity },
      600,
    );
    const url = new URL(this.config.forgejo + "/login/oauth/authorize");
    for (const [k, v] of Object.entries({
      client_id: this.config.oauth.clientId,
      redirect_uri:
        this.config.origin + (this.config.callbackPath || "/oauth/callback"),
      response_type: "code",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }))
      url.searchParams.set(k, v);
    response.setHeader(
      "Set-Cookie",
      `fj_oauth=${binding}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    );
    response.writeHead(303, { Location: url.href });
    response.end();
  }
  async complete(request, response, url) {
    const state = url.searchParams.get("state"),
      code = url.searchParams.get("code"),
      binding = cookie(request, "fj_oauth");
    if (
      !state ||
      !/^[a-f0-9]{64}$/.test(state) ||
      !binding ||
      !code ||
      code.length > 2048
    )
      throw new Error("Invalid authorization callback");
    const preview = this.store.get(this.key("state", state));
    if (
      !preview ||
      !timingSafeEqual(Buffer.from(preview.binding), Buffer.from(binding))
    )
      throw new Error("OAuth browser binding mismatch");
    const context = this.store.take(this.key("state", state));
    if (!context) throw new Error("Authorization state already consumed");
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.config.oauth.clientId,
      client_secret: this.config.oauth.clientSecret,
      redirect_uri:
        this.config.origin + (this.config.callbackPath || "/oauth/callback"),
      code,
      code_verifier: context.verifier,
    });
    const token = await this.request(
      this.config.forgejo + "/login/oauth/access_token",
      { method: "POST", body: form.toString() },
    );
    if (typeof token.access_token !== "string" || !token.access_token)
      throw new Error("No access token");
    const account = await this.forgejo.api("/user", token.access_token);
    if (!Number.isSafeInteger(account.id) || account.is_admin === true)
      throw new Error("Invalid source identity");
    this.store.put(
      this.key("account", context.team + ":" + context.user),
      {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expires: Date.now() + Number(token.expires_in || 3600) * 1000,
        accountId: account.id,
      },
      30 * 86400,
    );
    if (context.team === "demo")
      response.setHeader("Set-Cookie", [
        `fj_demo=${context.user}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`,
        "fj_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      ]);
    else
      response.setHeader(
        "Set-Cookie",
        "fj_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      );
    return context;
  }
  async access(team, user) {
    const key = team + ":" + user;
    if (this.refreshing.has(key)) return this.refreshing.get(key);
    const pending = this.accessOnce(team, user);
    this.refreshing.set(key, pending);
    try {
      return await pending;
    } finally {
      this.refreshing.delete(key);
    }
  }
  async accessOnce(team, user) {
    const key = this.key("account", team + ":" + user),
      account = this.store.get(key);
    if (!account) return null;
    if (account.expires > Date.now() + 30000) return account.accessToken;
    if (!account.refreshToken) {
      this.store.remove(key);
      return null;
    }
    try {
      const form = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: account.refreshToken,
        client_id: this.config.oauth.clientId,
        client_secret: this.config.oauth.clientSecret,
      });
      const token = await this.request(
        this.config.forgejo + "/login/oauth/access_token",
        { method: "POST", body: form.toString() },
      );
      if (typeof token.access_token !== "string")
        throw new Error("Invalid refresh response");
      this.store.put(
        key,
        {
          ...account,
          accessToken: token.access_token,
          refreshToken: token.refresh_token || account.refreshToken,
          expires: Date.now() + Number(token.expires_in || 3600) * 1000,
        },
        30 * 86400,
      );
      return token.access_token;
    } catch {
      this.store.remove(key);
      return null;
    }
  }
}
