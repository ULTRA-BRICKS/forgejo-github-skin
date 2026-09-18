// Explicitly synthetic fixtures for visual acceptance; never served as live repository metrics.
const brand = { name: "Ultrabricks", initials: "UB" };
const metric = (label, value, tone = "text") => ({ label, value, tone });
const common = {
  private: false,
  brand,
  title: "Context stays in the native message",
  description: "The image contributes facts, not another copy of this text.",
};
export const previewFixtures = {
  repository: {
    ...common,
    summary: {
      kind: "repository",
      metrics: [
        metric("Stars", 128),
        metric("Open issues", 12),
        metric("Open PRs", 4),
        metric("Forks", 19),
      ],
      activity: {
        days: [
          1, 0, 2, 3, 2, 0, 0, 3, 5, 2, 1, 0, 0, 1, 2, 3, 4, 3, 0, 0, 2, 5, 7,
          3, 2, 2, 0, 1,
        ],
        total: 59,
        authorCount: 5,
        start: "2026-08-22",
        end: "2026-09-18",
        sampled: false,
      },
    },
  },
  issue: {
    ...common,
    summary: {
      kind: "issue",
      number: 42,
      metrics: [
        metric("State", "Open", "success"),
        metric("Replies", 8),
        metric("Assignees", 2),
      ],
      author: "alex",
      created: "2026-09-12",
      updated: "2026-09-18",
      labels: ["accessibility", "keyboard"],
    },
  },
  pull: {
    ...common,
    summary: {
      kind: "pull",
      number: 28,
      metrics: [
        metric("State", "Merged", "link"),
        metric("Files", 7),
        metric("Added", 186, "success"),
        metric("Removed", 42, "danger"),
      ],
      base: "main",
      head: "fix/focus-return",
      author: "lena",
      created: "2026-09-17",
    },
  },
  commit: {
    ...common,
    summary: {
      kind: "commit",
      sha: "8ae41f7b",
      metrics: [
        metric("Files", 3),
        metric("Added", 28, "success"),
        metric("Removed", 9, "danger"),
        metric("Parents", 1),
      ],
      author: "alex",
      created: "2026-09-18",
    },
  },
  file: {
    ...common,
    summary: {
      kind: "file",
      sha: "8ae41f7b",
      metrics: [metric("Bytes", 2840)],
      lineStart: 12,
      code: [
        "function restoreFocus(trigger) {",
        "  if (!trigger?.isConnected) return;",
        "  trigger.focus({preventScroll: true});",
        "  closeMenu();",
        "}",
      ],
    },
  },
  missing: {
    ...common,
    summary: {
      kind: "repository",
      metrics: [
        metric("Stars", null),
        metric("Open issues", null),
        metric("Open PRs", null),
        metric("Forks", null),
      ],
      activity: null,
      updated: "",
    },
  },
};

const activity = previewFixtures.repository.summary.activity;
activity.total = activity.days.reduce((sum, n) => sum + n, 0);
