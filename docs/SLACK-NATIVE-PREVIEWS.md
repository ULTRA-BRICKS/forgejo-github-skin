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

Every destination is built from the validated configured origin and resource. File ranges remain distinct external identities. Actions with URLs open directly. Settings are the only modal on new cards; previous personal-preview buttons remain readable for existing messages.

## Information density and images

Compact is the default: a short description and up to four useful fields. Detailed mode adds source fields such as reviewers/branches/author where available. PR change counts and checks are native fields, not duplicate images. Code is native text; the Block Kit representation uses a preformatted block.

A repository activity time series may add a supplemental image. Image locators retain only a source URL for up to 30 days, and every fetch rechecks current public visibility before the bytes-only cache. Protected code and private descriptions are never included in that image path. Ordinary Open Graph pages retain full PNG rendering for other messengers; missing/protected data produces no placeholder PNG.

## Source and audience rules

Public previews also work for users who have not connected Forgejo when an operator explicitly configures a linked public-only reader. Repository visibility is checked before fetching a private object, and only a positive public declaration can be shared through this reader.

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
doc's "Composer unfurls" section.

**Observed local fact:** capturing this integration's own outgoing `chat.unfurl` payload
for a `source: "composer"` event under the default `format: "native"` preference shows it
currently sends only `metadata.entities` (Work Object) — no `unfurls` and no `preview`
field at all. Only accounts that have switched **Slack presentation** to **Block Kit** in
*Preview settings* currently produce an `unfurls[url].preview` payload for a composer
event. The app never rewrites the author's message text either way.

**Not verified — requires a real Slack workspace, which this repo has no path to:**
whether Slack's composer chip actually falls back to a generic link (no title/icon) when
only `metadata` is sent and no `preview` is present, or whether Slack derives an
equivalent composer preview from Work Object metadata by some other undocumented path.
Slack's own docs describe `unfurls` and `metadata` as separate parameters and never show
a combined example, so it is also unverified whether a single `chat.unfurl` call may
carry both together. Until a `format: "native"` account is tested pasting a link into a
real composer and the resulting chip is observed, no behavior change ships here —
converting this open question into code would be an unverified inference, not a fix.

## Official platform contracts

- [Work Objects implementation](https://docs.slack.dev/messaging/work-objects-implementation/): entity types, fields, actions, refresh, and access boundaries.
- [chat.unfurl](https://docs.slack.dev/reference/methods/chat.unfurl/): metadata form encoding, composer vs posted messages, and preview title/icon.
- [entity.presentDetails](https://docs.slack.dev/reference/methods/entity.presentDetails/): refresh, authentication, and structured error responses.
- [Work Object mention](https://docs.slack.dev/reference/block-kit/block-elements/work-object-mention-element/): compact references in app-authored rich text require a Slack-issued entity ID.
- [Block Kit overflow](https://docs.slack.dev/reference/block-kit/block-elements/overflow-menu-element/): URL actions and interaction acknowledgement.
