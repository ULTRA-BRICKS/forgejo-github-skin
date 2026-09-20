# Repository controls, highlighted code and personal source access — 2026-09-20

## User-visible changes

- Native repository controls keep the existing Forgejo forms/listeners. On a phone, Branch, Code and one File actions menu fit on one row. Secondary file actions and the keyboard-labelled Shortcuts action remain reachable in that menu. Desktop positions and native theme teardown restore the original controls.
- Watch/star/fork counters form one joined control, not overlapping partial badges. Search code, search type and submit form one bounded input group. Repository file rows have full-width separators.
- Slack private cards say `Private`, without a “shared summary” badge. Their menu explicitly offers Connect my account and View with my access. Connecting belongs to the acting Slack user, not the person who originally pasted the link.
- Native Work Object file cards use a compact highlighted code-only PNG (public source only), with the same renderer used in Storybook. Standard Block Kit uses `rich_text_preformatted.language` so selectable source can retain native syntax highlighting. All source URLs stay canonical and original navigation stays direct.

## Security and Slack surface boundaries

The Slack Work Objects documentation states that `entity.presentDetails` can refresh a conversation unfurl. Therefore protected descriptions/code **must not** be added to its shared metadata merely because the requesting user has permission.

Private flexpane requests check the requesting user's Forgejo access, then offer the original or a personal view. The explicit personal-view action opens a viewer-scoped modal; only that modal receives protected details. It uses the clicking user's own current OAuth token, and rechecks revocation. No private code image is exposed on the anonymous PNG endpoint. Public PNG locators retain only source URL and render variant, and revalidate public visibility before consulting the byte cache.

Official API references: [preformatted language](https://docs.slack.dev/reference/block-kit/block-elements/rich-text-preformatted-element/), [Work Object automatic refresh, fields and user authentication](https://docs.slack.dev/messaging/work-objects-implementation/).

## Verification

`tests/sharing/acceptance-020.test.mjs` covers actor isolation, explicit connection, revoked access, source-image revalidation, native code fields and image-cache separation. `tests/mobile/repository-controls.spec.mjs` tests joined-control geometry and original-node restoration. `tests/slack/access-code.spec.mjs` covers transparent code previews on dark/light surfaces, private access actions and reviewed screenshot states.

Use `scripts/verify-native-repository.mjs` for the actual authenticated repository. Candidate interception is explicit via `FJ_CANDIDATE=1`; only a run without interception is deployment acceptance. `scripts/verify-native-pages.mjs` and `scripts/verify-native-skin.mjs` cover the remaining production page matrix. Local/published Storybook pixel baselines are regression evidence, not a claim of pixel-identical GitHub implementation.

The native skin is deployed through `hyperide/glide-infra`. The existing Mac-hosted Slack receiver is a separate service; this release does not claim to finish its pending server-secret/cutover task.
