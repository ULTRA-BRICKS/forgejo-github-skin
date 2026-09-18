# Sharing integration work plan

Request: rich chat snippets and real Slack previews of Forgejo content behind login, configured and demonstrated, not just a policy library.

## Acceptance gates

1. Public previews: anonymous-only Forgejo lookup, correct repository/issue/PR/commit metadata and raster social image; private/denied/nonexistent resources produce indistinguishable generic metadata. No public private-content cache.
2. Slack app: register only the intended forge domains; signed events/interactivity, fast acknowledgement, durable retry/dedup, strict workspace binding.
3. Account linking: identify the Slack viewer, link their Forgejo account through an authorization flow, encrypt credentials at rest, recheck source access on each private view. No admin universal-read token and no login-page scraping.
4. Channel preview: rich private copies only for explicit approved repository/channel disclosure. Default neutral card + personal authorized detail view. No composer/private data leakage, no external shared channels.
5. Demo: synthetic private repository, authenticated content retrieval proof, unauthorized denial proof and actual Slack message/unfurl. A message manually composed by ChatGPT is not proof that a link_shared event integration works.
6. Delivery: English operator guide, screenshots in repo/chat, tested code reviewed and merged. Keep current UI demo and production repositories unchanged except scoped installation explicitly required by this request.

## Current checkpoint

- Installed Glide app A0C2QBRV3NH with links:read, links:write, groups:read. Do not create another app.
- Runtime config `.sharing/config.json`: app ID present, signing secret and bot token absent. Tool safety checks blocked secret retrieval; do not try browser cookie/clipboard workarounds. User-local setup is the remaining credential handoff.
- Local setup `http://127.0.0.1:3191/` reopened on the Mac. It takes secrets privately, not through chat.
- Service is supervised at loopback 3190 through dedicated forgejo-links.hyperide.ai tunnel.
- Real OAuth, authorized private read, revoked-access denial, and independent browser isolation just passed (research/sharing-oauth-proof.json).
- Public metadata/PNG checks pass. An actual automatic classic Slack preview is now rendered and captured, including title and social image. It is NOT an authenticated app unfurl. Credentials/event delivery remain open.
- No production data or production login/API configured. Source remains isolated Forgejo demo.
- Next: source validation/regressions, concise URLs, real Slack screenshot, review/fix/commit/push. Record explicit pending credential blocker in delivery, not a generic future promise.

## Stable continuation commands

`npm run test:sharing`; `npm test`; `PLAYWRIGHT_MODULE=/absolute/playwright/index.mjs npm run sharing:verify`. Real OAuth proof: `scripts/sharing/verify-oauth-live.mjs`, synthetic fixture only. Do not create duplicate Slack apps or regenerate secrets. Current desired app manifest is a template, not proof of applied settings.
