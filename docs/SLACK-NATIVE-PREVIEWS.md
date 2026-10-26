# Native Forgejo previews in Slack

## Presentation

The integration publishes Slack Work Objects for repository, pull request, issue, commit, and immutable file links. Pull requests/issues use the Task entity, code files use File, and repositories/commits use Item. Source-native data drives the icon, compact reference, title, status, fields, and actions. Slack owns the final card layout, theme, standard copy/share actions, refresh, and related-conversation pane.

`slack-presentation.mjs` is the shared bounded model for the Work Object serializer, Block Kit compatibility serializer, and interactive Storybook. No source writes are performed; source actions navigate to Forgejo.

| Link | Primary actions | Additional actions |
| --- | --- | --- |
| Repository | Open repository, Issues | Pull requests, Branches, Preview settings |
| Pull request, including Files/Commits subpages | Open PR, Files | Commits, Repository, Preview settings |
| Issue, including comment anchors | Open issue | Repository, Preview settings |
| Commit | Open commit, Browse files | Repository, Preview settings |
| Immutable file and selected line range | Open file, Raw file | Blame, Commit, Repository, Preview settings |
| Organization (bare `/name`, or `/org/name/dashboard`) | Open organization, Repositories | Preview settings |

Every destination is built from the validated configured origin and resource. File ranges remain distinct external identities. Actions with URLs open directly. Settings are the only modal on new cards; previous personal-preview buttons remain readable for existing messages.

Slack detail events distinguish `entity_url` (the canonical resource) from
`app_unfurl_url` (the exact posted link). Refresh uses the posted link only after
both URLs parse to the same resource and kind, then checks the external identity.
This preserves immutable file line ranges without accepting a different file,
repository, or source. Files require a complete matching external identity. Missing
`app_unfurl_url` uses the entity URL; a missing or mismatched file-range identity
fails closed rather than silently showing another excerpt.

## Information density and images

Compact is the default: a short description and up to four useful fields. Detailed mode adds source fields such as reviewers/branches/author where available. PR change counts and checks are native fields, not duplicate images. Public File Work Objects may include a syntax-highlighted code-only image; text-only mode and Block Kit retain a native code excerpt. Private code is available only in a viewer-scoped personal window after a fresh source read with that person's linked identity, never through a public image URL.

A repository activity time series may add a supplemental image. Image locators retain only a source URL for up to 30 days, and every fetch rechecks current public visibility before the bytes-only cache. Protected code and private descriptions are never included in that image path. Ordinary Open Graph pages retain full PNG rendering for other messengers; missing/protected data produces no placeholder PNG.

## Source and audience rules

Public previews also work for users who have not connected Forgejo when an operator explicitly configures a linked public-only reader. Repository visibility is checked before fetching a private object, and only a positive public declaration can be shared through this reader.

An organization card never offers Pull requests or Issues actions. Forgejo has no public,
unauthenticated org-wide aggregate view for either — the whole `/org/{org}` route group,
including its dashboard, requires a signed-in session for every caller, members included —
so those two actions would silently fail for any non-member Slack recipient. Repositories
instead points at the bare organization page's own public "view all" reveal, which needs no
session.

A bare `/name` link is parsed as an organization name, but that same shape also matches a
public user profile, a typo, or a private organization no configured reader can see.
Forgejo's own organization API answers all three cases with an identical 404 (by design, to
avoid revealing which one it is), so this integration cannot tell them apart either. Rather
than showing a misleading "connect your account" card for content that may not be protected
at all, an organization link that does not resolve to a confirmed-public organization
produces no unfurl: Slack shows the plain link, exactly as it did before organization links
were supported. A genuine upstream failure (timeout, 5xx) is unaffected and still shows the
existing retryable "temporarily unavailable" card.

Private summaries require the posting user's linked access, an exact approved workspace/origin/owner rule, and freshly fetched channel flags that exclude externally shared, organization-shared, or pending Slack Connect conversations. They disclose title/status-level information only. Such a shared summary is a conversation-visible copy; it is not per-viewer access control or retroactive erasure. Detail-pane refresh follows the same audience policy because Slack may update the conversation card from that response.

Authentication, unavailable sources, expired settings, and access-denied states have direct source actions. A failed link does not suppress successful cards from the same event. Retry remains bounded and updates the existing attachment instead of adding messages.

## Installation and verification

The manifest enables `link_shared`, `entity_details_requested`, Work Object types Task/File/Item, and the existing interactivity endpoint. `channels:read` and `groups:read` are used for audience checks; `links:read`/`links:write` for previews. No general message-history or source-write scope is introduced.

After verifying app settings and the linked reader, run `node scripts/sharing/configure-native.mjs --config PRIVATE_CONFIG --team TEAM --app APP --reader USER --owner OWNER` for a safe dry-run; append `--apply` to activate. It preserves credentials, rejects mismatched app/workspace identities, makes a private backup, and atomically replaces the configuration. Each approved owner must be named explicitly.

`npm run test:sharing` covers data bounds, type schemas, per-source/audience authorization, preserved code fallback, partial-batch errors, form transport, preferences, and image visibility changes. `npm run test:slack-ui` checks the shared-payload Storybook with Chromium desktop/320/440 and WebKit, interaction tests, and pixel snapshots. The published Storybook smoke test includes every native Slack state. Real-client acceptance additionally checks the delivered Work Object, source navigation, settings, refresh, and composer behavior; Storybook alone does not prove a Slack deployment.

**Documented platform facts** (from Slack's own reference docs, see citations below):
the `unfurls[url].preview` field on `chat.unfurl` defines the compact title/icon reference
shown while a link is still being typed/pasted in the composer (`source: "composer"`);
that same `preview` field is explicitly ignored once a `chat.unfurl` call targets an
already-posted message. If the author leaves the link in and sends the message, Slack
dispatches a **separate**, later `link_shared` event with `source: "conversations_history"`
for the posted message — a distinct event from the composer one, per the
[unfurling-links-in-messages](https://docs.slack.dev/messaging/unfurling-links-in-messages/#unfurl_previews)
doc's "Composer unfurls" section. Neither `chat.unfurl` reference page states that `unfurls`
and `metadata` are mutually exclusive in a single call — only that at least one is required.

**Shipped fix:** for a `source: "composer"` event, `unfurl()` now sends `unfurls[posted.url]`
(carrying the classic `preview.title`/`icon_url`, keyed by the exact posted URL) **in the
same** `chat.unfurl` call as `metadata.entities` — never as a second, later call that could
be interpreted as replacing the first. `preview.title.text` is the compact reference
(`PR #23` / org name / `owner/repo`), not the long Work Object title. A
`source: "conversations_history"` (posted-message) event is untouched: it never includes
`unfurls`/`preview`, since Slack documents that field as ignored there anyway, and Work
Object registration for the posted card is driven by that separate later event, so this
change cannot affect it. Tests assert (a) the composer path is exactly one call with both
objects present, (b) `preview.title.text` is the compact reference, (c) a posted-message
event never has an `unfurls` key, and (d) the real form serializer (`SlackIntegration.call`)
JSON-encodes both `metadata` and `unfurls` correctly in the same `application/x-www-form-urlencoded` body.

**Real-client acceptance remains separate.** The documented composer preview is
an unfurl preview, not permission to rewrite the author's message text. Neither
`preview.title` nor Work Object metadata guarantees that a raw URL becomes an
inline titled mention in the editor. A Work Object mention is a separate
app-authored rich-text element requiring a Slack-issued entity ID; sending a bot
message containing `<url|title>` does not test raw-paste behavior.

In the authorized QA channel, paste a raw URL from a native-format account and
record the editor, composer preview, sent message, and refreshed Work Object
separately. Check both an issue/PR and a file line range. Preserve the two
`link_shared` event sources and the detail event's canonical/posted URL pair in
sanitized evidence. An API `ok` response, intercepted local payload, or Storybook
screenshot is not proof of Slack's resulting UI.

## Official platform contracts

- [Work Objects implementation](https://docs.slack.dev/messaging/work-objects-implementation/): entity types, fields, actions, refresh, and access boundaries.
- [chat.unfurl](https://docs.slack.dev/reference/methods/chat.unfurl/): metadata form encoding, composer vs posted messages, and preview title/icon.
- [entity.presentDetails](https://docs.slack.dev/reference/methods/entity.presentDetails/): refresh, authentication, and structured error responses.
- [entity_details_requested](https://docs.slack.dev/reference/events/entity_details_requested/): canonical entity URL, original posted URL, and external identity in detail events.
- [Work Object mention](https://docs.slack.dev/reference/block-kit/block-elements/work-object-mention-element/): compact references in app-authored rich text require a Slack-issued entity ID.
- [Block Kit overflow](https://docs.slack.dev/reference/block-kit/block-elements/overflow-menu-element/): URL actions and interaction acknowledgement.
