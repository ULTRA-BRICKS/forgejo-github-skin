import {
  richCard,
  previewDecision,
} from "../../ops/handoff/slack/preview-core.mjs";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>|]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "|": "¦" })[c],
  );
export function unfurlLayout(meta, facts, policy, serviceOrigin) {
  // Authorization is checked by the existing policy core before any protected content is composed.
  const checked = richCard({
    facts,
    policy,
    link: meta.link,
    title: meta.title,
    description: meta.description,
    status: meta.status,
  });
  const decision = previewDecision(facts, policy),
    name = meta.brand?.name || new URL(meta.link.originalUrl).host;
  const blocks = [
    {
      type: "context",
      elements: [{ type: "plain_text", text: name, emoji: false }],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${meta.link.originalUrl}|${escape(meta.title)}>`,
        verbatim: true,
      },
    },
  ];
  if (meta.description)
    blocks.push({
      type: "section",
      text: { type: "plain_text", text: meta.description, emoji: false },
    });
  if (decision === "public" && serviceOrigin) {
    blocks.push({
      type: "image",
      image_url:
        serviceOrigin +
        "/image?v=2&url=" +
        encodeURIComponent(meta.link.originalUrl),
      alt_text:
        "Activity and object statistics; title and description are provided above",
    });
  } else if (meta.summary?.metrics?.length) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "plain_text",
          text: meta.summary.metrics
            .map((m) => `${m.label}: ${m.value ?? "—"}`)
            .join(" · "),
          emoji: false,
        },
      ],
    });
  }
  // Keep the original safety disclosure and the direct native destination.
  if (decision === "disclosed") {
    const disclosure = checked.blocks.find((b) => b.type === "context");
    if (disclosure) blocks.push(disclosure);
  }
  return { blocks };
}
