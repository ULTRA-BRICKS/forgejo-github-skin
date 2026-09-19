// One pure renderer for production PNGs and Storybook. No network or HTML injection.
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const cut = (value, n) => {
  const chars = [...String(value ?? "").toWellFormed()];
  return chars.length > n
    ? chars.slice(0, n - 1).join("") + "…"
    : chars.join("");
};
const num = (value) =>
  value === null || value === undefined
    ? "—"
    : typeof value === "number" && value >= 10000
      ? new Intl.NumberFormat("en", {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(value)
      : String(value);
const syntaxSegments = (line) => {
  const pattern = /(\b(?:const|let|var|function|return|if|else|for|while|async|await|import|export|from|true|false|null)\b|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\/\/.*$)/g;
  const out = []; let last = 0;
  for (const match of String(line).matchAll(pattern)) {
    if (match.index > last) out.push({ text: line.slice(last, match.index), tone: "text" });
    const token = match[0];
    const tone = token.startsWith("//") ? "muted" : /^["']/.test(token) ? "success" : /^\d/.test(token) ? "danger" : "link";
    out.push({ text: token, tone }); last = match.index + token.length;
  }
  if (last < line.length) out.push({ text: line.slice(last), tone: "text" });
  return out;
};
const color = (token) =>
  "#" +
  token.$value.components
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
export function graphic(
  meta,
  baseTokens,
  previewTokens,
  { mode = "adaptive" } = {},
) {
  const spec = previewTokens.preview,
    palette = baseTokens.color[mode === "adaptive" ? "light" : mode],
    c = Object.fromEntries(
      Object.entries(palette).map(([k, v]) => [k, color(v)]),
    );
  if (mode === "adaptive") { c.text = "#66707b"; c.muted = "#7d8590"; c.border = "#8c959f"; c.success = "#1a7f37"; c.danger = "#cf222e"; c.link = "#0969da"; }
  const dim = (name) => spec[name].$value.value,
    W = dim("width"),
    H = dim("height"),
    G = dim("gutter"),
    label = dim("labelSize");
  const fact = meta.summary || {
      kind: "repository",
      metrics: [],
      activity: null,
    },
    brand = meta.brand || { name: "Code host", initials: "CH" };
  const textStroke = mode === "adaptive" ? ' paint-order="stroke" stroke="white" stroke-opacity=".76" stroke-width="1.05" stroke-linejoin="round"' : "";
  const t = (
    x,
    y,
    text,
    {
      size = label,
      tone = "text",
      weight = 400,
      anchor = "start",
      mono = false,
    } = {},
  ) =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${c[tone] || c.text}" font-weight="${weight}" text-anchor="${anchor}"${mono ? ' xml:space="preserve" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"' : ""}${textStroke}>${esc(text)}</text>`;
  const line = (x, y, x2, y2, tone = "border", width = 1) =>
    `<path d="M${x},${y}L${x2},${y2}" fill="none" stroke="${c[tone]}" stroke-width="${width}"/>`;
  const safeLogo =
    typeof brand.logoData === "string" &&
    /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/.test(brand.logoData) &&
    brand.logoData.length < 200000;
  let mark = safeLogo
    ? `<image x="${G}" y="16" width="${dim("logoSize")}" height="${dim("logoSize")}" preserveAspectRatio="xMidYMid meet" href="${brand.logoData}"/>`
    : `<rect x="${G}" y="16" width="22" height="22" rx="4" fill="${c.text}"/>${t(G + 11, 32, cut(brand.initials || brand.name, 2).toUpperCase(), { size: 12, tone: "canvas", weight: 650, anchor: "middle" })}`;
  if (safeLogo && mode === "dark")
    mark =
      `<rect x="${G - 2}" y="14" width="26" height="26" rx="4" fill="${color(baseTokens.color.light.subtle)}"/>` +
      mark;
  let body =
    mark +
    t(G + 32, 33, cut(brand.name, 24), { weight: 650 }) +
    t(
      W - G,
      33,
      `${fact.kind === "pull" ? "PR" : fact.kind === "repository" ? "REPO" : String(fact.kind).toUpperCase()}${fact.number ? " #" + fact.number : ""}`,
      { tone: "muted", anchor: "end" },
    );
  body += line(G, 49, W - G, 49);
  if (meta.private !== false && !meta.summary) {
    body +=
      t(G, 97, "Protected link", { size: 26, weight: 650 }) +
      t(G, 134, "Details require your own access.", { tone: "muted" }) +
      t(G, 188, "Open the original to continue.", { tone: "muted" });
  } else if (fact.kind === "file") {
    const code = (fact.code || []).slice(0, 5);
    body += t(
      G,
      73,
      `${num(fact.metrics?.[0]?.value)} bytes · ${fact.sha || "—"}`,
      { tone: "muted" },
    );
    if (!code.length)
      body += t(G, 121, "No text preview available", { tone: "muted" });
    code.forEach((text, i) => {
      body += t(
        G,
        99 + i * dim("lineHeight"),
        String((fact.lineStart || 1) + i),
        { tone: "muted", size: dim("codeSize"), mono: true },
      );
      let codeX = G + 40;
      for (const segment of syntaxSegments(cut(text, 39))) {
        body += t(codeX, 99 + i * dim("lineHeight"), segment.text, {
          size: dim("codeSize"), tone: segment.tone, mono: true,
        });
        codeX += [...segment.text].length * dim("codeSize") * 0.61;
      }
    });
    body += t(
      G,
      H - 14,
      `Lines ${fact.lineStart || 1}–${(fact.lineStart || 1) + Math.max(0, code.length - 1)} · excerpt only`,
      { tone: "muted" },
    );
  } else {
    const metrics = (fact.metrics || []).slice(0, 4),
      step = (W - 2 * G) / Math.max(1, metrics.length);
    metrics.forEach((item, i) => {
      const value = cut(num(item.value), 8);
      const size =
        typeof item.value === "string"
          ? Math.min(dim("textValueSize"), dim("numberSize"))
          : Math.min(
              dim("numberSize"),
              Math.floor(
                (step - dim("metricGap")) /
                  Math.max(1, [...value].length) /
                  0.64,
              ),
            );
      body += t(G + i * step, 90, value, {
        size: Math.max(label, size),
        weight: 650,
        tone: item.tone,
      });
      body += t(G + i * step, 115, cut(item.label, 12), { tone: "muted" });
    });
    if (fact.kind === "repository" && fact.activity) {
      const a = fact.activity,
        max = Math.max(1, ...a.days),
        startY = 179,
        chartY = 137,
        barWidth = (W - 2 * G) / 28;
      a.days.slice(0, 28).forEach((value, i) => {
        if (value > 0)
          body += `<rect x="${G + i * barWidth + 1}" y="${startY - (value / max) * (startY - chartY)}" width="${barWidth - 3}" height="${(value / max) * (startY - chartY)}" rx="1" fill="${c.text}"/>`;
      });
      body +=
        t(W - G, 134, `max ${max}/day`, { tone: "muted", anchor: "end" }) +
        line(G, startY, W - G, startY) +
        t(
          G,
          204,
          `${a.total}${a.sampled ? "+" : ""} commits · ${a.authorCount} authors`,
          { tone: "muted" },
        ) +
        t(W - G, 204, `28d · ${a.end.slice(5)}`, {
          tone: "muted",
          anchor: "end",
        });
    } else if (fact.kind === "pull" || fact.kind === "commit") {
      const add = fact.metrics?.find((x) => x.label === "Added")?.value,
        del = fact.metrics?.find((x) => x.label === "Removed")?.value;
      if (typeof add === "number" && typeof del === "number" && add + del > 0) {
        const span = W - 2 * G;
        body += `<rect x="${G}" y="137" width="${(span * add) / (add + del)}" height="5" fill="${c.success}"/><rect x="${G + (span * add) / (add + del)}" y="137" width="${(span * del) / (add + del)}" height="5" fill="${c.danger}"/>`;
      }
      const detail =
        fact.kind === "pull"
          ? `${fact.base || "base"} ← ${fact.head || "head"}`
          : `${fact.sha} · ${num(fact.metrics?.find((x) => x.label === "Parents")?.value)} parent(s)`;
      body += t(G, 173, cut(detail, 45), { tone: "muted" });
      body +=
        t(G, 204, cut(fact.author || "Author unavailable", 25), {
          tone: "muted",
        }) +
        t(W - G, 204, fact.created || "Date unavailable", {
          tone: "muted",
          anchor: "end",
        });
    } else if (fact.kind === "issue") {
      body +=
        t(
          G,
          155,
          cut(fact.author ? `by ${fact.author}` : "Author unavailable", 25),
          { tone: "muted" },
        ) +
        t(W - G, 155, fact.created || "—", { tone: "muted", anchor: "end" });
      body += t(G, 190, cut(fact.labels?.join(" · ") || "No labels", 46), {
        tone: "muted",
      });
      if (fact.updated && fact.updated !== fact.created)
        body += t(W - G, 215, "Updated " + fact.updated, {
          tone: "muted",
          anchor: "end",
        });
    } else {
      body +=
        t(G, 160, "Activity not available", { tone: "muted" }) +
        t(G, 204, fact.language || "No language reported", { tone: "muted" }) +
        t(W - G, 204, fact.updated || "Date unavailable", {
          tone: "muted",
          anchor: "end",
        });
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(fact.kind + " facts; title and description are in the message text")}" style="display:block;width:100%;height:auto;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;font-variant-numeric:tabular-nums">${body}</svg>`;
}
