import { Forgejo } from "./forgejo.mjs";
import { OAuth } from "./oauth.mjs";
export class Sources {
  constructor(config, store, createClient = (base) => new Forgejo(base)) {
    this.entries = new Map();
    const ids = new Set();
    for (const input of [
      {
        id: config.primaryId || "demo",
        base: config.forgejo,
        oauth: config.oauth,
        brand: config.brand,
        organizationBrands: config.organizationBrands,
        primary: true,
      },
      ...(config.instances || []),
    ]) {
      const u = new URL(input.base);
      if (
        !/^[a-z][a-z0-9-]{0,30}$/.test(input.id) ||
        u.protocol !== "https:" ||
        u.pathname !== "/" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        this.entries.has(u.origin) ||
        ids.has(input.id)
      )
        throw new Error("Invalid/duplicate configured source");
      ids.add(input.id);
      const client = createClient(u.origin),
        ready = !!input.oauth?.clientId && !!input.oauth?.clientSecret;
      const auth = ready
        ? new OAuth(
            {
              ...config,
              forgejo: u.origin,
              oauth: input.oauth,
              namespace: input.primary ? "" : input.id,
              connectPath: input.primary ? "/connect" : "/connect/" + input.id,
              callbackPath: input.primary
                ? "/oauth/callback"
                : "/oauth/" + input.id + "/callback",
            },
            store,
            client,
          )
        : null;
      this.entries.set(u.origin, { ...input, base: u.origin, client, auth });
    }
    this.primary = this.entries.get(new URL(config.forgejo).origin);
  }
  canonical(raw) {
    // Upgrade a posted HTTP spelling without ever fetching over HTTP. Keep the
    // raw path so the strict parser can still reject encoded/dot traversal.
    if (typeof raw !== "string") return raw;
    try {
      const url = new URL(raw);
      if (url.protocol === "http:" && !url.port && !url.username && !url.password) {
        const secure = raw.replace(/^http:/i, "https:");
        if (this.entries.has(new URL(secure).origin)) return secure;
      }
    } catch { /* The strict parser returns null for malformed URLs. */ }
    return raw;
  }
  source(raw) {
    try {
      return this.entries.get(new URL(this.canonical(raw)).origin) || null;
    } catch {
      return null;
    }
  }
  parse(raw) {
    return this.source(raw)?.client.parse(this.canonical(raw)) || null;
  }
  async metadata(raw, credential, options) {
    const entry = this.source(raw);
    if (!entry) return null;
    if (credential) {
      if (typeof credential !== "object" || credential.origin !== entry.base)
        throw new Error("Source credential mismatch");
    }
    const result = await entry.client.metadata(
      this.canonical(raw),
      credential?.accessToken,
      options,
    );
    if (result) {
      const identity =
        result.private === false
          ? entry.organizationBrands?.[result.link.owner] || entry.brand
          : entry.brand;
      result.brand = {
        name: identity?.name || new URL(entry.base).host,
        initials: identity?.initials || "HI",
        logoData: identity?.logoData || null,
      };
    }
    return result;
  }
  async access(team, user, raw) {
    const entry = this.source(raw),
      accessToken = await entry?.auth?.access(team, user);
    return accessToken ? { origin: entry.base, accessToken } : null;
  }
  ticket(team, user, raw) {
    const entry = this.source(raw);
    return entry?.auth?.ticket(team, user) || null;
  }
  byId(id) {
    return [...this.entries.values()].find((e) => e.id === id) || null;
  }
}
