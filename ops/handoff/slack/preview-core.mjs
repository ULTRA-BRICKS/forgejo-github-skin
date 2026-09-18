/** Supplemental policy/formatting core, NOT an installed Slack service.
 * Its callers must supply freshly verified server-side facts. Do not fill these
 * booleans from a browser, a Slack user's claims or an unverified event payload.
 * Default private behaviour NEVER copies repository data to the conversation.
 */
import {createHmac, timingSafeEqual} from 'node:crypto';

export function verifySlackRequest({rawBody, timestamp, signature, signingSecret, nowSeconds}) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length > 262144) return false;
  if (typeof signingSecret !== 'string' || signingSecret.length < 16) return false;
  if (typeof timestamp !== 'string' || !/^\d{10,11}$/.test(timestamp)) return false;
  if (typeof signature !== 'string' || !/^v0=[a-f0-9]{64}$/.test(signature)) return false;
  if (!Number.isFinite(nowSeconds) || Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:`).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(3), 'hex'));
}

const validName = (value) => /^[A-Za-z0-9_.-]{1,100}$/.test(value) && !['.', '..'].includes(value);
const validSha = (value) => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value);
const reserved = new Set(['api', 'admin', 'user', 'assets', 'explore', 'notifications']);
const parsedLinks = new WeakSet();
function parsed(result) {
  Object.freeze(result);
  parsedLinks.add(result);
  return result;
}

export function parseForgejoLink(raw, configuredBase) {
  try {
    if (typeof raw !== 'string' || raw.length > 4096 || /[\s\\\u0000-\u001f]/u.test(raw)) return null;
    const base = new URL(configuredBase), url = new URL(raw);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) return null;
    if (url.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password) return null;
    // Do not accept URL query credentials, ambiguous query-driven variants, or
    // WHATWG-normalized traversal. Reconstruct API routes from parsed fields only.
    if (url.search || /\/(?:\.|%2e){1,2}(?:\/|$|[?#])/i.test(raw)) return null;
    const prefix = base.pathname.replace(/\/$/, '') + '/';
    if (!url.pathname.startsWith(prefix)) return null;
    const encoded = url.pathname.slice(prefix.length).replace(/\/$/, '').split('/');
    const parts = encoded.map(decodeURIComponent);
    if (parts.some(s => !s || s === '.' || s === '..' || /[\u0000-\u001f\\/%]/u.test(s))) return null;
    const [owner, repo, route, id, ...rest] = parts;
    if (!validName(owner ?? '') || !validName(repo ?? '') || reserved.has(owner.toLowerCase())) return null;
    const root = `${base.origin}${prefix}${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const common = {originalUrl: raw, owner, repo, repositoryUrl: root};
    if (parts.length === 2 && !url.hash) return parsed({...common, kind: 'repository', resourceUrl: root});
    if (['issues', 'pulls'].includes(route) && /^[1-9]\d{0,9}$/.test(id ?? '')) {
      if (rest.length && !(route === 'pulls' && rest.length === 1 && ['files', 'commits'].includes(rest[0]))) return null;
      // General comment fragments are kept only in the original URL, never fetched.
      if (url.hash && !/^#(?:issue|issuecomment)-[1-9]\d{0,15}$/.test(url.hash)) return null;
      return parsed({...common, kind: route === 'issues' ? 'issue' : 'pull', number: Number(id),
        resourceUrl: `${root}/${route}/${id}`});
    }
    if (route === 'commit' && validSha(id ?? '') && !rest.length && !url.hash) {
      return parsed({...common, kind: 'commit', sha: id.toLowerCase(), resourceUrl: `${root}/commit/${id}`});
    }
    if (route === 'src' && id === 'commit' && validSha(rest[0] ?? '') && rest.length > 1) {
      const [sha, ...fileParts] = rest;
      const match = url.hash ? /^#L([1-9]\d{0,6})(?:-L([1-9]\d{0,6}))?$/.exec(url.hash) : null;
      if (url.hash && !match) return null;
      const start = match ? Number(match[1]) : null;
      const end = match ? Number(match[2] ?? match[1]) : null;
      if (start && (end < start || end - start + 1 > 50)) return null;
      return parsed({...common, kind: 'file', sha: sha.toLowerCase(), path: fileParts.join('/'),
        lines: start ? {start, end} : null,
        resourceUrl: `${root}/src/commit/${sha}/${fileParts.map(encodeURIComponent).join('/')}`});
    }
    return null;
  } catch { return null; }
}

/** Policy modes:
 * public = verified anonymously readable resource.
 * personal = generic channel card; protected details only after per-viewer auth.
 * disclosed = deliberate, separately authorized copy to a mapped private channel.
 * A disclosed copy is NOT per-viewer ACL protection and is not retroactively erasable.
 */
export function previewDecision(facts = {}, policy = {}) {
  if (facts.resourceVerified !== true || facts.checkIsFresh !== true) return 'personal';
  if (facts.visibility === 'public' && facts.anonymousReadable === true) return 'public';
  if (facts.visibility !== 'private') return 'personal';
  if (policy.privateMode !== 'explicit-channel-disclosure' || facts.postingUserMayDisclose !== true ||
      facts.postingUserCanRead !== true || facts.source !== 'conversations_history') return 'personal';
  if (typeof facts.workspaceId !== 'string' || !/^T[A-Z0-9]+$/.test(facts.workspaceId) ||
      typeof facts.repositoryId !== 'string' || !/^[1-9]\d*$/.test(facts.repositoryId) ||
      typeof facts.instanceOrigin !== 'string' || !facts.instanceOrigin.startsWith('https://')) return 'personal';
  const channel = facts.channel;
  if (!channel || typeof channel.id !== 'string' || !/^[CG][A-Z0-9]+$/.test(channel.id) || channel.isPrivate !== true || channel.isExternalShared !== false ||
      channel.isPendingExternalShared !== false || channel.isOrgShared !== false ||
      channel.isShared !== false || channel.metadataFresh !== true) return 'personal';
  const match = Array.isArray(policy.destinations) && policy.destinations.some(item =>
    item?.workspaceId === facts.workspaceId && item?.channelId === channel.id &&
    item?.repositoryId === facts.repositoryId && item?.instanceOrigin === facts.instanceOrigin &&
    item?.approvedToCopy === true);
  return match === true ? 'disclosed' : 'personal';
}

function plain(value, limit) {
  // At most two UTF-16 units per code point, plus a bounded lookahead for truncation.
  const safe = typeof value === 'string' ? value.slice(0, limit * 2 + 2).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/[\uD800-\uDBFF]$/, '') : '';
  // Strip again after code-point truncation: malformed metadata may contain an interior lone surrogate.
  return [...safe].slice(0, limit).join('').replace(/[\uD800-\uDBFF]$/, '');
}

/** Does not take metadata on purpose: denied/private/unknown must be indistinguishable. */
export function protectedCard(opaqueReference, link) {
  if (link && !parsedLinks.has(link)) throw new TypeError("A freshly validated original link is required");
  if (typeof opaqueReference !== 'string' || !/^[a-f0-9]{32,64}$/i.test(opaqueReference)) {
    throw new TypeError('Use an opaque server-held reference, never a token or title');
  }
  return {blocks: [
    {type: 'section', text: {type: 'plain_text', emoji: false,
      text: 'Forgejo preview. Public details are shown in Slack; protected details use your connected Forgejo account.'}},
    {type: 'actions', elements: [{type: 'button', action_id: 'forgejo_preview',
      text: {type: 'plain_text', text: 'Preview', emoji: false}, value: opaqueReference},
      ...(link ? [{type: 'button', action_id: 'forgejo_open_original',
        text: {type: 'plain_text', text: 'Open in Forgejo', emoji: false}, url: link.originalUrl}] : [])]},
  ]};
}

/** Rich text is built ONLY after an explicit server-side policy decision.
 * No raw Markdown, notification mentions, external images, or executable HTML.
 */
export function richCard({facts, policy, link, title, description, status}) {
  const decision = previewDecision(facts, policy);
  if (!['public', 'disclosed'].includes(decision)) throw new Error('Protected data cannot enter a channel card');
  if (!link || !parsedLinks.has(link)) throw new TypeError('A link freshly validated by parseForgejoLink is required');
  if (facts?.resourceUrl !== link.resourceUrl) throw new Error('Authorization proof belongs to another resource');
  const name = plain(title, 150) || 'Forgejo';
  const detail = plain(description, 400);
  const summary = [plain(status, 80), `${link.owner}/${link.repo}`,
    decision === 'disclosed' ? 'Shared copy • visible to this conversation' : 'Public'].filter(Boolean).join(' · ');
  return {blocks: [
    {type: 'header', text: {type: 'plain_text', text: name, emoji: false}},
    {type: 'context', elements: [{type: 'plain_text', text: summary, emoji: false}]},
    ...(detail ? [{type: 'section', text: {type: 'plain_text', text: detail, emoji: false}}] : []),
    {type: 'actions', elements: [{type: 'button', action_id: 'forgejo_open_original',
      text: {type: 'plain_text', text: 'Open in Forgejo', emoji: false}, url: link.originalUrl}]},
  ]};
}
