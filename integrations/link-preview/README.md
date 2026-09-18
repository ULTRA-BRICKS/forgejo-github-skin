# Forgejo link-preview service

A separate, read-only integration server. It does not replace Forgejo login or
reuse Slack/browser cookies. UI skin deployment is independent of this service.

## Verified and pending

- Live preview service: `https://forgejo-links.hyperide.ai/` (Mac-hosted, not an always-on deployment).
- Anonymous HTML metadata and PNG social images: verified against a real public issue.
- Protected/absent objects: generic metadata and image, no protected content.
- Real Forgejo OAuth login, access recheck after revocation, and independent-browser denial: verified on synthetic data.
- Glide app `A0C2QBRV3NH` is installed with `links:read`, `links:write`, `groups:read`.
- **Slack runtime secrets/event delivery remain unconfigured.** Installing the app is not a working unfurl integration.
- Channel `C0C2X21ECTB` (`forgejo-preview-demo`) contains synthetic test links.
  A classic automatic Slack web preview has now been visually verified (research/sharing-slack-web-proof.json). This remains separate from app-authenticated previews.

## Start and configure

Use Node.js 24+ with `node:sqlite`, Python 3 and Pillow (tested with 12.1.1).
Copy `config.example.json` to a private directory, fill the reviewed values and
set `FORGEJO_PREVIEW_CONFIG` to that absolute path. Keep the file mode `0600` and
its directory `0700`; back up the encryption key separately. Never commit it.

```sh
npm run test:sharing
FORGEJO_PREVIEW_CONFIG=/private/forgejo-preview/config.json npm run sharing:serve
```

The server binds loopback. Put an authorized HTTPS reverse proxy in front of it;
no client-supplied destination, redirect, token or origin is trusted.

## Slack setup and final acceptance

1. Add the exact Forgejo hostname as an unfurl domain, subscribe to `link_shared`,
   and set Events URL to `/slack/events` on the service origin.
2. Enable Interactivity with `/slack/interactions` on the same origin.
3. Keep only the required bot scopes. `groups:read` is needed here to check the
   approved private channel is not Slack Connect/shared before copying contents.
4. Reinstall after changing scopes or domains. Add the bot to the synthetic test
   channel. Do not enable production domains until their own OAuth source and
   ordinary-user access tests have passed.
5. Put this app's signing secret and bot token in the private config; the service reloads a valid same-origin update automatically. Identity/key changes require a restart. The local-only setup page at `127.0.0.1:3191` lets the
   operator enter credentials without giving them to an assistant or a chat.
6. Verify Slack's signed challenge, then post a **new** real source URL as a user.
   Require receipt/dedup/processed counters plus the actual resulting Slack card.
7. Open “View privately”, authorize an ordinary Forgejo account, and retry the
   personal view. Revoke source access and verify it is refused on the next open.
8. Only the explicitly configured demo author/channel/repository combination may
   produce a channel-wide protected copy. All other cases use personal views.

Slack sends events for registered domains, not arbitrary links or login pages.
Domain changes require reinstall; composer events lack a real audience and must
not disclose private contents. See the official [unfurl guide](https://docs.slack.dev/messaging/unfurling-links-in-messages/)
and [link_shared payload](https://docs.slack.dev/reference/events/link_shared/).
The service binds the exact workspace and app ID and verifies raw request bytes.

## Security boundaries

Public `/share` and `/image` never use a user credential. Every request rechecks
anonymous source access, and returns `Cache-Control: no-store`. A chat platform
may nevertheless retain a previously fetched **public** card after visibility
changes: remote message caches are not access control and cannot be recalled.

Account credentials are encrypted with AES-256-GCM, bound to each database key.
OAuth uses random one-use state, an HttpOnly/Secure/SameSite browser cookie, PKCE,
and a fixed callback. Source access is checked on every private read. SQLite
stores encrypted events, retry leases and deduplication, not private-card caches.
Errors do not log raw requests, credentials or protected content.

Forgejo OAuth tokens are not read-only scoped tokens; this version grants broader
account access. Use an ordinary account on an isolated demo. Production should
prefer repository-limited read tokens or an independently reviewed token broker
when this broad permission is unacceptable. See [Forgejo OAuth](https://forgejo.org/docs/latest/user/authentication/oauth2-provider/).

Private channel previews are **deliberate disclosed copies**, visible to readers
of that channel, not ACL-protected per viewer. They require exact destination
policy, a linked permitted sender and fresh channel metadata; shared/external
channels and composer previews fail closed to a neutral card. Personal modals
check the clicking viewer instead. No production data is used in this demo.

## Recovery and limitations

`SHARING-WORK-PLAN.md` records checkpoints. Interrupted deliveries retry from the
durable queue; completed payloads are erased. Exhausted retries are retained as distinct dead-letter metadata with protected payloads erased, not marked successful. A crash after successful Slack
submission may repeat the same idempotent unfurl update, not a new message.
Five links per queued batch, bounded response bodies and two PNG renderers limit
resource use. This is a single-process service; do not run concurrent workers
against the same store without adding renewed leases/coordination.

## Rendering and supported links

Supports repository, issue/PR, full-SHA commit and immutable file links (up to 50 lines). Mutable branch URLs and other unrecognized routes fail closed rather than guessing refs. Clean public share URLs use `/s/owner/repository/issues/number`; direct Forgejo links require the separately completed Slack domain/event integration.

Every public HTML/image request still rechecks anonymous source access. Only the final rendered PNG bytes are cached (bounded 32 entries / 8 MiB / 60 seconds), keyed by the newly verified metadata, never by URL or an old permission result. An access change resolves to generic metadata before that lookup; private-card metadata is rejected by the public render cache. Queue claim and expiry lookups are indexed.

## Compact preview v2

See [the current acceptance and deployment guide](../../docs/PREVIEW-V2-ACCEPTANCE.md) for the native Open Graph adapter, direct original URLs, exact-origin multi-instance authorization, corrected local setup form, token-based shared renderer and explicit live verification limits. The new HTTP app settings have been saved and reinstallation consent completed, but runtime credentials and production OAuth are not configured yet.
