// Shared by the production PNG exporter and Storybook. Layout is in logical pixels.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const cut = (value, limit) => {
  const chars = [...String(value ?? '').slice(0, 4096).toWellFormed()];
  return chars.length > limit ? chars.slice(0, limit - 1).join('') + '…' : chars.join('');
};
const num = value => value == null ? '—' : typeof value === 'number' && value >= 10000
  ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  : String(value);
const color = token => '#' + token.$value.components.map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
const hasValue = value => typeof value === 'number' ? Number.isFinite(value) && value >= 0 : typeof value === 'string' && value.trim().length > 0;
export function hasGraphicFacts(meta) {
  const fact = meta?.summary;
  return !!fact && ((fact.metrics || []).some(m => hasValue(m.value)) ||
    (fact.code || []).some(line => typeof line === 'string' && line.length) ||
    (fact.activity?.days || []).some(n => Number.isFinite(n) && n >= 0));
}
function codeLines(meta) {
  return (meta.summary?.code || []).slice(0, 5).map(line => String(line).slice(0, 4096).replace(/\r/g, '').replace(/\t/g, '    ').toWellFormed());
}
/** One geometry source for SVG viewBox, PNG viewport and Open Graph dimensions. */
export function graphicLayout(meta, tokens) {
  const dim = name => tokens.preview[name].$value.value;
  const width = dim('width'), baseHeight = dim('height'), gap = dim('gutter');
  const codeOnly=meta.previewVariant==='code'&&meta.summary?.kind==='file';
  // The Slack native object already shows title/metrics/logo as text fields; an
  // activity-only image repeats none of that — just the chart and its date legend.
  const activityOnly=meta.previewVariant==='activity'&&meta.summary?.kind==='repository';
  const lines = codeLines(meta), codeStart = codeOnly?28:64, codeStep = codeOnly?20:dim('lineHeight');
  const codeEnd = codeStart + Math.max(0, lines.length - 1) * codeStep;
  const codeFooter = codeEnd + 20;
  const activityChartTop = 12, activityChartBottom = 60, activityFooter = 80;
  const height = activityOnly ? activityFooter + 14
    : meta.summary?.kind === 'file' && lines.length
      ? (codeOnly?codeFooter+16:Math.max(baseHeight, codeFooter + 12)) : baseHeight;
  return { width, height, gap, lines, codeOnly, activityOnly, codeStart, codeStep, codeFooter,
    header: 22, rule: 32, metadata: 46, metricValue: 58, metricLabel: 75,
    chartTop: activityOnly?activityChartTop:87, chartBottom: activityOnly?activityChartBottom:109,
    detail: 106, footer: activityOnly?activityFooter:height - 12 };
}
export function syntaxSegments(line) {
  const pattern = /(\/\/.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|for|while|async|await|import|export|from|class|new|throw|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/g;
  const result = []; let end = 0;
  for (const match of line.matchAll(pattern)) {
    if (match.index > end) result.push({ text: line.slice(end, match.index), tone: 'text' });
    const token = match[0];
    const tone = token.startsWith('//') ? 'muted' : /^["']/.test(token) ? 'success' : /^\d/.test(token) ? 'danger' : 'link';
    result.push({ text: token, tone }); end = match.index + token.length;
  }
  if (end < line.length) result.push({ text: line.slice(end), tone: 'text' });
  return result;
}
export function graphic(meta, baseTokens, previewTokens, { mode = 'adaptive' } = {}) {
  if (!hasGraphicFacts(meta)) return '';
  if (!['adaptive', 'light', 'dark'].includes(mode)) throw new TypeError('Unknown preview palette');
  const layout = graphicLayout(meta, previewTokens);
  const { width: W, height: H, gap: G } = layout;
  const dim = name => previewTokens.preview[name].$value.value;
  const c = Object.fromEntries(Object.entries(baseTokens.color[mode === 'adaptive' ? 'light' : mode]).map(([k, v]) => [k, color(v)]));
  // Measured against #ffffff and the GitHub/Slack dark canvas #0d1117 (relative-luminance
  // formula): #797979 is the highest min(lightContrast, darkContrast) any single grey can
  // reach against both (~4.35:1 each). Nothing rendered here is WCAG "large text" (18.66px+
  // bold / 24px+), so this sits just under the 4.5:1 AA-normal bar on both surfaces — the
  // best simultaneous compromise, not a full AA pass. `muted` reuses the same grey: a dimmer
  // secondary tone would push one surface's contrast below this floor (see #6e7781's 4.16:1
  // worst case, or #858585's 3.69:1 — both worse than this optimum).
  if (mode === 'adaptive') Object.assign(c, {
    text: '#797979', muted: '#797979', border: '#8c959f',
    success: '#1a7f37', danger: '#cf222e', link: '#0969da',
  });
  const text = (x, y, value, { size = dim('labelSize'), tone = 'text', weight = 400, anchor = 'start', attrs = '' } = {}) =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${c[tone] || c.text}" font-weight="${weight}" text-anchor="${anchor}"${attrs}>${esc(value)}</text>`;
  const line = (x1, y1, x2, y2) => `<path d="M${x1},${y1}L${x2},${y2}" fill="none" stroke="${c.border}" stroke-opacity=".5"/>`;
  const fact = meta.summary, brand = meta.brand || { name: 'Code host', initials: 'CH' };
  const safeLogo = typeof brand.logoData === 'string' && /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/.test(brand.logoData) && brand.logoData.length < 200000;
  const mark = safeLogo
    ? `<image x="${G}" y="8" width="18" height="18" preserveAspectRatio="xMidYMid meet" href="${brand.logoData}"/>`
    : `<rect x="${G}" y="8" width="18" height="18" rx="3" fill="none" stroke="${c.text}"/>` + text(G + 9, 21, cut(brand.initials || brand.name, 2).toUpperCase(), { size: 9, weight: 650, anchor: 'middle' });
  const kind = fact.kind === 'pull' ? 'PR' : fact.kind === 'repository' ? 'REPO' : String(fact.kind).toUpperCase();
  let body = `<g data-preview-header>${mark}${text(G + 26, layout.header, cut(brand.name, 24), { weight: 650 })}${text(W - G, layout.header, kind + (fact.number ? ' #' + fact.number : ''), { tone: 'muted', anchor: 'end' })}</g>` + line(G, layout.rule, W - G, layout.rule);
  if(layout.codeOnly||layout.activityOnly)body='';
  if (fact.kind === 'file' && layout.lines.length) {
    const start = Number.isSafeInteger(fact.lineStart) && fact.lineStart > 0 ? fact.lineStart : 1;
    const lastNumber = start + layout.lines.length - 1;
    const codeSize = layout.codeOnly?16:dim('codeSize');
    const numberWidth = String(lastNumber).length * codeSize * .65;
    const codeX = G + Math.max(30, numberWidth + 12);
    const maxChars = Math.max(8, Math.floor((W - G - codeX) / (codeSize * .66)));
    if(!layout.codeOnly)body += text(G, layout.metadata, `${num(fact.metrics?.find(m => m.label === 'Bytes')?.value)} bytes · ${cut(fact.sha || '—', 12)}`, { tone: 'muted', size: 11, attrs: ' data-preview-metadata' });
    layout.lines.forEach((source, i) => {
      const y = layout.codeStart + i * layout.codeStep;
      body += text(G, y, String(start + i), { tone: 'muted', size: codeSize, attrs: ' data-line-number font-family="ui-monospace, SFMono-Regular, Menlo, monospace"' });
      // A single SVG text run lets the browser position tokens, preserving spaces and glyph widths.
      const spans = syntaxSegments(cut(source, maxChars)).map(token => `<tspan fill="${c[token.tone]}" data-tone="${token.tone}">${esc(token.text)}</tspan>`).join('');
      body += `<text data-code-row="${i}" x="${codeX}" y="${y}" xml:space="preserve" font-size="${codeSize}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${spans}</text>`;
    });
    body += text(G, layout.codeFooter, `Lines ${start}–${lastNumber} · excerpt only`, { tone: 'muted', size: 11, attrs: ' data-preview-footer' });
  } else {
    if(!layout.activityOnly){
      const metrics = (fact.metrics || []).filter(m => hasValue(m.value)).slice(0, 4);
      const step = (W - 2 * G) / Math.max(1, metrics.length);
      for (const [i, item] of metrics.entries()) {
        const value = cut(num(item.value), 10);
        const preferred = typeof item.value === 'string' ? dim('textValueSize') : dim('numberSize');
        const size = Math.max(12, Math.min(preferred, (step - dim('metricGap')) / Math.max(1, [...value].length) / .68));
        body += `<g data-metric="${i}">${text(G + i * step, layout.metricValue, value, { size, weight: 650, tone: item.tone })}${text(G + i * step, layout.metricLabel, cut(item.label, 13), { size: 11, tone: 'muted' })}</g>`;
      }
    }
    if (fact.kind === 'repository' && fact.activity?.days?.length) {
      const activity = fact.activity, days = activity.days.slice(0, 28).map(n => Number.isFinite(n) && n > 0 ? n : 0);
      const max = Math.max(1, ...days), step = (W - 2 * G) / 28;
      body += '<g data-preview-chart>';
      days.forEach((count, i) => {
        if (count) { const h = count / max * (layout.chartBottom - layout.chartTop);
          body += `<rect x="${G + i * step + 1}" y="${layout.chartBottom - h}" width="${step - 3}" height="${h}" rx="1" fill="${c.success}"/>`; }
      });
      body += line(G, layout.chartBottom, W - G, layout.chartBottom) + '</g>';
      body += text(G, layout.footer, cut(`${num(activity.total)}${activity.sampled ? '+' : ''} commits · ${num(activity.authorCount)} authors`, 37), { tone: 'muted', size: 11, attrs: ' data-preview-footer' });
      body += text(W - G, layout.footer, '28d' + (activity.end ? ' · ' + String(activity.end).slice(5, 10) : ''), { tone: 'muted', size: 11, anchor: 'end' });
    } else if (fact.kind === 'pull' || fact.kind === 'commit') {
      const add = fact.metrics?.find(m => m.label === 'Added')?.value;
      const del = fact.metrics?.find(m => m.label === 'Removed')?.value;
      if (Number.isFinite(add) && Number.isFinite(del) && add >= 0 && del >= 0 && add + del > 0) {
        const span = W - 2 * G, plus = span * add / (add + del);
        body += `<g data-preview-diff><rect x="${G}" y="86" width="${plus}" height="4" fill="${c.success}"/><rect x="${G + plus}" y="86" width="${span - plus}" height="4" fill="${c.danger}"/></g>`;
      }
      const detail = fact.kind === 'pull' ? `${fact.base || 'base'} ← ${fact.head || 'head'}` : `${fact.sha || '—'} · ${num(fact.metrics?.find(m => m.label === 'Parents')?.value)} parent(s)`;
      body += text(G, layout.detail, cut(detail, 54), { size: 11, tone: 'muted', attrs: ' data-preview-detail' });
      if (fact.author) body += text(G, layout.footer, cut(fact.author, 30), { size: 11, tone: 'muted', attrs: ' data-preview-footer' });
      if (fact.created) body += text(W - G, layout.footer, cut(fact.created, 10), { size: 11, tone: 'muted', anchor: 'end' });
    } else if (fact.kind === 'issue') {
      if (fact.author) body += text(G, 94, cut('by ' + fact.author, 30), { size: 11, tone: 'muted' });
      if (fact.created) body += text(W - G, 94, cut(fact.created, 10), { size: 11, tone: 'muted', anchor: 'end' });
      if (fact.labels?.length) body += text(G, 109, cut(fact.labels.join(' · '), 58), { size: 11, tone: 'muted' });
      if (fact.updated && fact.updated !== fact.created) body += text(W - G, layout.footer, 'Updated ' + cut(fact.updated, 10), { size: 11, tone: 'muted', anchor: 'end', attrs: ' data-preview-footer' });
    } else {
      if (fact.language) body += text(G, layout.footer, cut(fact.language, 25), { size: 11, tone: 'muted' });
      if (fact.updated) body += text(W - G, layout.footer, cut(fact.updated, 10), { size: 11, tone: 'muted', anchor: 'end' });
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(fact.kind + ' facts; title and description are in the message text')}" style="display:block;width:100%;height:auto;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;font-variant-numeric:tabular-nums">${body}</svg>`;
}
