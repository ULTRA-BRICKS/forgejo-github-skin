import { graphicLayout, hasGraphicFacts } from "./graphic.mjs";
import previewTokens from "../../tokens/preview.tokens.json" with { type: "json" };
import { slackReadiness } from "./readiness.mjs";
export const escapeHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const generic = {
  title: "Protected link — sign in to view",
  description:
    "This link requires authorization or is not available. No private repository data is included in this preview.",
  status: "Access checked on open",
  repository: "Code host",
  private: true,
};
const e = escapeHtml;
const hostLabel = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return generic.repository;
  }
};
export function card(meta) {
  return `<article class="card"><div class="eyebrow">${e(meta.brand?.name || generic.repository)} <span>${e(meta.private ? "PRIVATE VIEW" : "PUBLIC")}</span></div><h2>${e(meta.title)}</h2><p>${e(meta.description)}</p><footer>${e(meta.repository)} · ${e(meta.status)}</footer></article>`;
}
export function shell(title, body, head = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title>${head}<link rel="stylesheet" href="/style.css"></head><body><main>${body}</main></body></html>`;
}
export function sharePage(meta, url, origin) {
  const image = origin + "/image?v=2&url=" + encodeURIComponent(url);
  const brand = meta.private
    ? hostLabel(url)
    : meta.brand?.name || hostLabel(url);
  const visible = !meta.private && hasGraphicFacts(meta);
  const dimensions = graphicLayout(meta, previewTokens);
  const visual = !visible
    ? ""
    : `<meta property="og:image" content="${e(image)}"><meta property="og:image:alt" content="Activity and facts, without duplicating the link title"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="${dimensions.width * previewTokens.preview.scale.$value}"><meta property="og:image:height" content="${dimensions.height * previewTokens.preview.scale.$value}"><meta name="twitter:card" content="summary_large_image">`;
  return shell(
    meta.title,
    `<a class="button" href="${e(url)}">Open on ${e(brand)}</a><p class="muted">Preview inspection only. Normal link navigation opens the original directly.</p>${!visible ? "" : `<img src="${e(image)}" class="preview-graphic" width="${dimensions.width}" height="${dimensions.height}" alt="${e(meta.summary?.kind || "Object")} statistics">`}`,
    `<meta property="og:url" content="${e(url)}"><meta property="og:type" content="website"><meta property="og:site_name" content="${e(brand)}"><meta property="og:title" content="${e(meta.title)}"><meta property="og:description" content="${e(meta.description)}">${visual}`,
  );
}
export function demoPage(config) {
  const instanceName = config.brand?.name || hostLabel(config.forgejo);
  return shell(
    instanceName + " link previews — live demo",
    `<header><img class="mark" src="/logo.svg" width="32" height="32" alt="${e(instanceName)}"> ${e(instanceName)} <span class="badge">LIVE API DEMO</span></header><h1>Useful previews.<br>Private means private.</h1><p class="lead">Public links get rich chat cards. Protected links are read only after an authorized Forgejo sign-in.</p><div class="grid"><section><h3>01 · Public chat card</h3><p>Anonymous, server-rendered Open Graph metadata and PNG image.</p><a class="button" href="/share?url=${encodeURIComponent(config.demoPublicUrl)}">Open public preview</a></section><section><h3>02 · Protected link</h3><p>No title or body leaks to an anonymous crawler.</p><a class="button secondary" href="/share?url=${encodeURIComponent(config.demoPrivateUrl)}">Inspect protected preview</a></section></div><section><h3>03 · Authorized private view</h3><p>Use an ordinary demo Forgejo account. OAuth access is broader than a read-only token; this demo never uses an administrator account.</p><a class="button" href="/demo/login">Connect Forgejo</a> <button id="load-private" class="button secondary">Check my access</button><div id="result" aria-live="polite"></div></section><section><h3>04 · Slack integration</h3><p id="slack-state">${slackReadiness(config).configured ? "App configured; actual event delivery is verified separately in Slack." : "The Slack app is installed, but its runtime credentials and event connection are not completed. The receiver rejects unsigned requests."}</p><p class="muted">Channel-wide private cards are explicit shared copies, not per-viewer access control. Personal views recheck the clicking user’s access.</p></section><footer class="muted">Synthetic data only. This service runs on the demo Mac; availability depends on that host.</footer><script src="/ui.js" defer></script>`,
  );
}
export const css = `.preview-graphic{display:block;max-width:100%;height:auto;margin-top:16px;}:root{color-scheme:light dark;--bg:#f6f8fa;--surface:#fff;--text:#1f2328;--muted:#59636e;--border:#d1d9e0;--accent:#0969da}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1056px;margin:0 auto;padding:40px 24px}header{font-weight:650;display:flex;align-items:center;gap:14px;margin-bottom:48px}.mark{font-size:36px}.badge,.eyebrow span{font:11px/1.5 ui-monospace,monospace;border:1px solid var(--border);border-radius:20px;padding:3px 9px}h1{font-size:clamp(34px,6vw,56px);line-height:1.1;letter-spacing:-1.5px;margin:0 0 24px}h2{line-height:1.3;margin:24px 0 16px;font-size:28px}h3{font-size:18px;margin:0 0 10px}.lead{font-size:19px;max-width:680px;color:var(--muted);margin-bottom:32px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}section,.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:20px}.card{margin:20px 0;max-width:760px}.card p{white-space:pre-wrap;overflow-wrap:anywhere}.eyebrow{font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:space-between;color:var(--muted)}.card footer{border-top:1px solid var(--border);padding-top:16px;font-size:13px;color:var(--muted)}.button{display:inline-block;border:1px solid transparent;border-radius:6px;background:var(--accent);color:white;text-decoration:none;font-family:inherit;font-size:14px;font-weight:600;line-height:1.5;padding:10px 16px;cursor:pointer;transition:filter .12s,box-shadow .12s}.button:hover{filter:brightness(.94)}.button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.secondary{background:var(--surface);border-color:var(--border);color:var(--text)}button:disabled{opacity:.65;cursor:wait}.muted{font-size:13px;color:var(--muted)}.error{padding:14px;border:1px solid #cf222e;border-radius:6px;margin-top:16px;color:#cf222e}@media(max-width:640px){.grid{grid-template-columns:1fr}main{padding:24px 16px}header{margin-bottom:28px}.button{margin-bottom:8px}}@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--surface:#161b22;--text:#e6edf3;--muted:#9da7b3;--border:#30363d;--accent:#1f6feb}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}`;
export const ui = `const button=document.getElementById('load-private'),out=document.getElementById('result');button?.addEventListener('click',async()=>{button.disabled=true;button.textContent='Checking access…';out.replaceChildren();try{const r=await fetch('/demo/private',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('Connect an authorized Forgejo account first. Access is checked for this browser session.');const data=await r.json(),box=document.createElement('article');box.className='card';for(const [tag,value] of [['h2',data.title],['p',data.description],['footer',data.repository+' · '+data.status]]){const el=document.createElement(tag);el.textContent=value;box.append(el);}out.append(box);}catch(e){const p=document.createElement('p');p.className='error';p.textContent=e.message;out.append(p);}finally{button.disabled=false;button.textContent='Check my access';}});`;
