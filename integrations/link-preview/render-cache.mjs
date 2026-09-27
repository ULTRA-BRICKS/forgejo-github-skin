import { createHash } from "node:crypto";
import { generic } from "./views.mjs";

/** Bytes-only render cache. Callers MUST recheck source access before every use.
 * It cannot answer by URL, retain an authorization result, or accept a private card.
 */
export class RenderCache {
  constructor(
    render,
    { maxEntries = 32, maxBytes = 8 * 1024 * 1024, ttlMs = 60000 } = {},
  ) {
    Object.assign(this, { render, maxEntries, maxBytes, ttlMs });
    this.entries = new Map();
    this.pending = new Map();
    this.bytes = 0;
  }
  async get(safe) {
    if (
      safe.private !== false &&
      !["title", "description", "repository", "status", "private"].every(
        (field) => safe[field] === generic[field],
      )
    ) {
      throw new Error("Private metadata cannot enter public render cache");
    }
    const metadata = {
      title: safe.title,
      description: safe.description,
      repository: safe.repository,
      status: safe.status,
      private: safe.private,
      ...(safe.private === false
        ? { summary: safe.summary, brand: safe.brand, previewVariant: safe.previewVariant }
        : {}),
      rendererVersion: 4,
    };
    const key = createHash("sha256")
      .update(JSON.stringify(metadata))
      .digest("hex");
    const old = this.entries.get(key);
    if (old) {
      this.entries.delete(key);
      this.bytes -= old.bytes.length;
      if (old.expires > Date.now()) {
        this.entries.set(key, old);
        this.bytes += old.bytes.length;
        return old.bytes;
      }
    }
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = this.render(metadata)
      .then((bytes) => {
        if (bytes.length <= this.maxBytes) {
          while (
            this.entries.size >= this.maxEntries ||
            this.bytes + bytes.length > this.maxBytes
          ) {
            const first = this.entries.keys().next().value;
            if (first === undefined) break;
            this.bytes -= this.entries.get(first).bytes.length;
            this.entries.delete(first);
          }
          this.entries.set(key, { bytes, expires: Date.now() + this.ttlMs });
          this.bytes += bytes.length;
        }
        return bytes;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}
