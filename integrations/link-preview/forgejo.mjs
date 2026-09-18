import { parseForgejoLink } from "../../ops/handoff/slack/preview-core.mjs";
export function bounded(value, n = 400) {
  if (typeof value !== "string") return "";
  // Bound UTF-16 work first; then truncate by code points without broken pairs.
  const limited = value
    .slice(0, n * 2 + 2)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .toWellFormed();
  return [...limited].slice(0, n).join("");
}
export const isAccessDenied = (status) => [401, 403, 404].includes(status);
export async function jsonRequest(
  url,
  { method = "GET", token, body, limit = 524288, fetchImpl = fetch } = {},
) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  const r = await fetchImpl(url, {
    method,
    headers,
    body,
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    const error = new Error("Upstream HTTP " + r.status);
    error.status = r.status;
    error.retryAfter = Number(r.headers.get("retry-after")) || 10;
    await r.body?.cancel();
    throw error;
  }
  const reader = r.body?.getReader();
  if (!reader) throw new Error("Empty upstream response");
  let size = 0,
    chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("Upstream response exceeds bound");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export class Forgejo {
  constructor(base, request = jsonRequest) {
    const u = new URL(base);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw new Error("Configured HTTPS origin required");
    this.base = u.href.replace(/\/$/, "");
    this.request = request;
  }
  parse(url) {
    return parseForgejoLink(url, this.base);
  }
  api(route, token) {
    if (!route.startsWith("/") || route.includes(".."))
      throw new Error("Invalid API route");
    return this.request(this.base + "/api/v1" + route, { token });
  }
  async metadata(raw, token) {
    const link = this.parse(raw);
    if (!link) return null;
    const route =
      "/repos/" +
      encodeURIComponent(link.owner) +
      "/" +
      encodeURIComponent(link.repo);
    const repo = await this.api(route, token);
    if (
      !repo ||
      !Number.isSafeInteger(repo.id) ||
      typeof repo.private !== "boolean" ||
      typeof repo.full_name !== "string"
    )
      throw new Error("Invalid repository metadata");
    if (!token && repo.private !== false) return null;
    let obj = repo,
      title = repo.full_name,
      description = repo.description,
      status = repo.private ? "Private" : "Public";
    if (link.kind === "issue" || link.kind === "pull") {
      obj = await this.api(
        route +
          "/" +
          (link.kind === "pull" ? "pulls" : "issues") +
          "/" +
          link.number,
        token,
      );
      title = `${link.kind === "pull" ? "PR" : "Issue"} #${link.number}: ${obj.title}`;
      description = obj.body;
      status = obj.merged ? "Merged" : obj.state;
    } else if (link.kind === "commit") {
      obj = await this.api(route + "/git/commits/" + link.sha, token);
      title = "Commit " + link.sha.slice(0, 8);
      description = obj.message || obj.commit?.message;
      status = "Commit";
    } else if (link.kind === "file") {
      obj = await this.api(
        route +
          "/contents/" +
          link.path.split("/").map(encodeURIComponent).join("/") +
          "?ref=" +
          link.sha,
        token,
      );
      title = link.path;
      description = `${obj.size} bytes · ${link.sha.slice(0, 8)}`;
      if (obj.encoding === "base64" && obj.content && obj.size <= 65536) {
        let lines = Buffer.from(obj.content, "base64")
          .toString("utf8")
          .split("\n");
        if (link.lines)
          lines = lines.slice(link.lines.start - 1, link.lines.end);
        else lines = lines.slice(0, 8);
        description = lines.join("\n");
      }
      status = link.lines
        ? `Lines ${link.lines.start}–${link.lines.end}`
        : "File";
    }
    return {
      link,
      repositoryId: String(repo.id),
      repository: repo.full_name,
      private: repo.private === true,
      title: bounded(title, 150),
      description: bounded(description, 400),
      status: bounded(status, 80),
      author: bounded(obj.user?.login || obj.author?.name, 80),
    };
  }
}
