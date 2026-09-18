const count = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;
const short = (value, n = 48) =>
  typeof value === "string"
    ? [...value.slice(0, n * 2).toWellFormed()].slice(0, n).join("")
    : "";
const day = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString().slice(0, 10)
    : "";
export function baseFacts(repo, object, link) {
  const facts = {
    kind: link.kind,
    number: link.number || null,
    sha: link.sha?.slice(0, 8) || "",
    created: day(
      object.created_at || object.created || object.commit?.author?.date,
    ),
    updated: day(object.updated_at || repo.updated_at),
    author: short(
      object.user?.login || object.author?.login || object.commit?.author?.name,
    ),
    metrics: [],
    labels: [],
    activity: null,
    code: null,
  };
  const metric = (label, value, tone = "text") => ({
    label,
    value: typeof value === "number" ? count(value) : short(value, 18) || null,
    tone,
  });
  if (link.kind === "repository") {
    facts.metrics = [
      metric("Stars", repo.stars_count),
      metric("Open issues", repo.open_issues_count),
      metric("Open PRs", repo.open_pr_counter),
      metric("Forks", repo.forks_count),
    ];
    facts.created = day(repo.created_at);
    facts.updated = day(repo.updated_at);
    facts.language = short(repo.language, 20);
  } else if (link.kind === "issue") {
    facts.metrics = [
      metric(
        "State",
        object.state === "closed"
          ? "Closed"
          : object.state === "open"
            ? "Open"
            : null,
        object.state === "closed" ? "muted" : "success",
      ),
      metric("Replies", object.comments),
      metric(
        "Assignees",
        Array.isArray(object.assignees) ? object.assignees.length : null,
      ),
    ];
    facts.labels = Array.isArray(object.labels)
      ? object.labels.slice(0, 2).map((x) => short(x.name, 22))
      : [];
  } else if (link.kind === "pull") {
    const state = object.merged
      ? "Merged"
      : object.draft
        ? "Draft"
        : object.state === "closed"
          ? "Closed"
          : object.state === "open"
            ? "Open"
            : null;
    facts.metrics = [
      metric(
        "State",
        state,
        object.merged ? "link" : state === "Open" ? "success" : "muted",
      ),
      metric("Files", object.changed_files),
      metric("Added", object.additions, "success"),
      metric("Removed", object.deletions, "danger"),
    ];
    facts.base = short(object.base?.ref, 22);
    facts.head = short(object.head?.ref, 22);
    facts.reviewers = Array.isArray(object.requested_reviewers)
      ? object.requested_reviewers.length
      : null;
    facts.mergeable =
      typeof object.mergeable === "boolean" ? object.mergeable : null;
  } else if (link.kind === "commit") {
    facts.metrics = [
      metric("Files", Array.isArray(object.files) ? object.files.length : null),
      metric("Added", object.stats?.additions, "success"),
      metric("Removed", object.stats?.deletions, "danger"),
      metric(
        "Parents",
        Array.isArray(object.parents) ? object.parents.length : null,
      ),
    ];
  } else if (link.kind === "file") {
    facts.metrics = [
      metric("Bytes", object.size),
      metric("Revision", link.sha?.slice(0, 8)),
      metric(
        "Lines",
        link.lines ? link.lines.end - link.lines.start + 1 : null,
      ),
    ];
    facts.lineStart = link.lines?.start || 1;
    facts.code = [];
    if (
      object.encoding === "base64" &&
      typeof object.content === "string" &&
      object.size <= 65536
    ) {
      const text = Buffer.from(object.content, "base64").toString("utf8");
      if (!text.includes("\0"))
        facts.code = text
          .split("\n")
          .slice(
            facts.lineStart - 1,
            Math.min(facts.lineStart + 4, link.lines?.end || Infinity),
          )
          .map((line) => short(line, 55));
    }
  }
  return facts;
}
export function activityFacts(commits, now = new Date()) {
  if (!Array.isArray(commits)) return null;
  const end = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z"),
    start = new Date(end.getTime() - 27 * 86400000);
  const days = Array(28).fill(0),
    authors = new Set();
  let invalid = 0;
  for (const item of commits.slice(0, 100)) {
    const when = Date.parse(
      item.commit?.committer?.date || item.created || item.commit?.author?.date,
    );
    if (!Number.isFinite(when)) {
      invalid++;
      continue;
    }
    const index = Math.floor((when - start.getTime()) / 86400000);
    if (index >= 0 && index < days.length) {
      days[index]++;
      const name = item.author?.login || item.commit?.author?.name;
      if (name) authors.add(short(name, 24));
    }
  }
  return {
    days,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    total: days.reduce((a, b) => a + b, 0),
    sampled: commits.length >= 100 || invalid > 0,
    authors: [...authors].slice(0, 3),
    authorCount: authors.size,
  };
}
