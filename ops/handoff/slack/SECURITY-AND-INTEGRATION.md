# Slack + Forgejo: protected link previews

**18 September 2026 · implementation specification and locally tested core**

No app was installed, no private repository was read or published, and no Slack
message was sent in this turn. `preview-core.mjs` is a small policy/formatting library,
not an event receiver or running integration.

## 1. The non-negotiable distinction

Slack channel unfurls are visible to the conversation. Authenticating the person who
pasted a link does **not** create a per-viewer permission boundary around the resulting
card. Slack explicitly documents this property for authenticated unfurls.[1]

Reading a repository and being allowed to disclose its content to another service or
audience are different permissions. A private Slack channel is not automatically the
same access group as a private Forgejo repository. A membership check made once cannot
make an already copied card safe for future members or people retaining a copy.

Use these three modes:

| Mode | Conversation receives | Required authorization |
|---|---|---|
| Public | Rich public card | Fresh proof the exact resource is anonymously readable |
| Personal (default for private/unknown) | Generic “Forgejo link — view privately” button | Protected details only after each clicking user's current Forgejo access check |
| Explicit channel disclosure (optional) | Rich card labelled “Shared copy” | Fresh read and disclosure permission, administrator-approved destination mapping and current nonshared private-channel metadata |

The personal card does not confirm that an unknown object exists. An authorized viewer
can see the details in a personal modal/view after authentication; an unauthorized
viewer receives a generic failure. The original pasted URL may itself reveal names
chosen by the sender, but the integration must not add new protected metadata.

Do not claim remote deletion or access revocation erases screenshots, notifications,
exports or already retained Slack copies. Strict ongoing ACL requirements mean personal
views, not rich channel copies. Even personal display transfers content to Slack and
its processing/storage boundary; obtain organizational approval where required.

## 2. Intended architecture

Receive a signed Slack link event → validate envelope/app/workspace/origin → enqueue
idempotently → acknowledge promptly → resolve entity with fresh source authorization
→ evaluate preview policy → call `chat.unfurl` with the original URL as its key.
Slack describes the `link_shared` and `chat.unfurl` flow and cautions against delaying
acknowledgement while the unfurl is generated.[1]

For a private-view button, verify the new interaction signature → resolve its opaque
server-side reference → authenticate the **clicking** Slack user → recheck the exact
resource in Forgejo → show a bounded personal result. Do not reuse the posting user's
access token or privileges for other readers. The unfurl API supports interactive
blocks and user-authentication prompts; UI success must depend on actual API results.[2]

Use a dedicated service with persistent storage and an operator-owned deployment.
Do not ship OAuth tokens or the Slack signing secret in browser bundles, Storybook,
PR screenshots, query strings or this handoff. No privileged production runner is
required for link previews.

## 3. Identity and authorization

Link an authenticated `(Slack workspace ID, Slack user ID)` to `(Forgejo instance,
immutable user ID)` through a reviewed OAuth flow. Never infer identity from an email,
username or display name. Bind OAuth state to the initiating user, session, instance
and intended return action; require expiry, one-time consumption and CSRF protection.
Use PKCE where supported by the selected provider/client configuration. Encrypt stored
tokens, restrict storage access and support disconnect/revocation.

Read the actual repository and requested entity as the viewer. Repository visibility
alone is insufficient proof that a particular file, PR, comment or related status is
readable. A service administrator token must not become universal end-user authority.
Cache content separately from authorization; do a fresh access check before serving
protected data. Key any protected cache by instance and immutable resource identity,
with a bounded TTL and an explicit revocation/invalidating strategy.

Facts passed to `previewDecision` must be constructed inside the trusted backend after
those checks. `resourceVerified`, `checkIsFresh`, `postingUserCanRead` and
`postingUserMayDisclose` are **not** claims accepted from a browser, an arbitrary URL,
a Slack message body or the external event payload itself. `resourceUrl` binds a rich
card's authorization facts to the parser's canonical resource URL.

## 4. Optional rich private-channel copies

This is a conscious sharing policy, not an ACL-preserving preview. Leave it disabled
until the workspace owner and repository owner approve it.

Allow only an exact mapping:

`Forgejo instance origin + repository ID → Slack workspace ID + channel ID`

Require fresh source-read permission, a separate disclosure permission and a verified
posted-message context. The conservative core requires a private channel with all
shared/external/pending-external/org-shared flags explicitly false. Missing flags,
stale metadata or absent permissions fail closed. Resolve those facts through the
appropriate Slack API rather than trusting an event's display name.[3]

Composer previews may not have the final conversation identity.[1] The supplied core
therefore never produces rich private metadata for composer events. Re-evaluate only
when a posted-message event supplies the real conversation and the backend verifies it.
Block Slack Connect and unknown audiences by default. Future multi-workspace support
needs a separately reviewed policy rather than weakening these checks.

Checking current channel members through `conversations.members` may inform policy,
but is not a guarantee about historical content shown to future members.[4] Use an
explicit “this content may be shared with this channel” policy when a rich copy is
needed. Explain that disclosure in the UI before enabling it and label the card.

## 5. URL and content boundary

Accept only configured HTTPS instance origins and base paths. Do not trust Slack's
registered-domain matching as your network allowlist: rebuild the permitted Forgejo
API route from validated components, not by fetching an arbitrary submitted URL.
Disable redirects or revalidate every redirect and its resolved network destination.
Do not follow cross-origin avatars, images or issue-body URLs to generate the preview.

The current parser supports repository, issue, PR, full-SHA commit and immutable file
links. It bounds line ranges to 50 lines, rejects traversal/encoded separators, URL
credentials and query strings. A branch URL is intentionally not fetched by this core;
obtain an immutable permalink. Keep the original URL for Slack matching and the user
navigation destination. Keep canonical resource identity separate from that display URL.

The rich-card formatter uses plain-text fields. Titles or descriptions containing
`<!channel>`, `<@USER>`, HTML or Markdown are not instructions or notification requests.
Do not interpolate untrusted text into a URL or action identifier. Initial scope is
read-only previews: no approve/merge/close/re-run buttons.

Neutral private cards take only an opaque, random server-held reference, not repository
metadata. Bind stored references to permitted app/workspace context and recheck the
clicker at use time. They are lookup keys, not transferable authorization tokens.

No protected title, code or status goes into anonymous Open Graph HTML, public image
URLs, crawler-specific bypass routes or CDN caches. Authenticate HTML and image access
independently. An unguessable image URL is not repository authorization.

## 6. Request validation and replay handling

Slack request verification uses the **raw body bytes** and signature/timestamp headers,
not a re-serialized parsed object. The supplied helper uses HMAC-SHA256, constant-time
comparison and a five-minute timestamp window, following Slack's signing procedure.[5]
It also caps accepted bodies at 256 KiB; oversized events need an intentional generic
failure path and metrics, not a silent weakening of verification.

Signature freshness is not idempotency. Deduplicate delivery using app/workspace/event
identity and persist processing state. Bound retries; obey rate-limit retry guidance;
recheck permissions before retrying a protected operation. Handle uninstallation,
revoked tokens, stale OAuth and partial API failure without posting private fallback
text. Avoid logging full event bodies, tokens, titles or private URLs. Record opaque
correlation IDs, decisions, durations and redacted failure categories.

Validate event type, app ID, installation/workspace ownership and supported payload
shape after signature verification. Verify URL-challenge requests through the same
trusted signing path. Respond to interactive triggers promptly; load longer results
asynchronously without silently converting a personal view to a channel message.

## 7. App configuration and scopes

`app-manifest.example.json` is intentionally non-live. Replace its `.invalid` endpoints
with the deployed backend URL only after the receiver and interactivity handlers exist.
Register the exact Forgejo domain under `features.unfurl_domains`; that is the manifest
field used for app unfurls.[6]

The starting bot scopes are `links:read` and `links:write`. Subscribe to `link_shared`
and configure the interactivity endpoint. These are the core permissions documented
for custom unfurls.[1] A working private-view implementation also needs its verified
Forgejo OAuth/authorization path; the manifest alone does not provide that.

Only the optional channel-disclosure mode needs additional conversation-metadata
access for its policy: review `groups:read` and, where relevant, `channels:read` against
the selected conversation types and methods.[3] Do not request channel history or
`chat:write` automatically just to expand the scope. Add permissions only for a tested
feature that needs them, then reinstall/approve the app as required by Slack.

## 8. Remaining implementation and live acceptance

| Component | This package |
|---|---|
| HMAC, timestamp and body bounds | Implemented and unit tested |
| Route parser, immutable range limits and origin allowlist | Implemented and unit tested |
| Fail-closed public/personal/disclosed policy | Implemented and unit tested with synthetic backend facts |
| Generic/rich Block Kit formatting | Implemented and unit tested |
| HTTPS receiver and interactive handlers | Not implemented |
| Durable queue, database and replay deduplication | Not implemented |
| Slack installation state and encrypted credentials | Not implemented |
| Forgejo OAuth linking and per-viewer API authorization | Not implemented |
| Personal modal rendering and consent UI | Not implemented |
| Public OG/image renderer | Not implemented |
| Real Slack installation, messages and access-revocation tests | Not executed |

Mandatory integration tests: public link; authorized private clicker; denied clicker;
forged/stale request; duplicate event; revoked source permission; uninstalled app;
composer without audience; shared/Slack Connect channel; renamed repository;
wrong-workspace button reference; malicious Markdown; inaccessible avatar/image;
poster's read-only-but-not-disclose permission; backend outage; API throttling.

Capture actual Slack screenshots using synthetic data and both allowed/denied users.
Do not call this integration complete on the basis of the 48 pure-core tests alone.

## Sources

[1]: https://docs.slack.dev/messaging/unfurling-links-in-messages/
[2]: https://docs.slack.dev/reference/methods/chat.unfurl/
[3]: https://docs.slack.dev/reference/methods/conversations.info/
[4]: https://docs.slack.dev/reference/methods/conversations.members/
[5]: https://docs.slack.dev/authentication/verifying-requests-from-slack/
[6]: https://docs.slack.dev/reference/app-manifest/
