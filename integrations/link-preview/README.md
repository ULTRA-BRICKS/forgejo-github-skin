# Forgejo link-preview service

A read-only integration with separate native Slack and Open Graph presentations. The Forgejo UI skin is deployed independently through `glide-infra`.

## Slack presentation

[Native preview guide](../../docs/SLACK-NATIVE-PREVIEWS.md) documents supported link types, the action matrix, app installation, audience policy, settings, and browser acceptance. Native Work Objects use Task/File/Item entities, compact references and icons, direct source actions, status fields, refresh, and related conversations. Block Kit is the compatibility path.

A repository activity chart may supplement native fields. Other message clients receive the transparent PNG renderer. Missing or protected data produces no empty placeholder image. File excerpts are syntax-highlighted and their height is calculated from the number of displayed lines.

## Run and configure

Use Node.js 24+ with `node:sqlite` and the tested Playwright installation. Keep the configuration file mode `0600` and its directory `0700`. Back up the encryption key separately and never commit credentials.

```sh
npm run test:sharing
npm run test:preview-layout
FORGEJO_PREVIEW_CONFIG=/private/forgejo-preview/config.json npm run sharing:serve
```

The server listens on loopback behind the existing authorized HTTPS proxy. Same-origin configuration changes rebuild and atomically replace the runtime; issuer/key/origin identity changes require restart. Native feature activation uses `scripts/sharing/configure-native.mjs`, with explicit workspace/app/reader/owner identifiers, a dry-run, and a private backup.

## Authorization and privacy

Every Slack request is validated against its raw body signature, age, workspace, and app identity. OAuth uses one-use state, a secure browser cookie, PKCE, and a fixed callback. Encrypted account records are bound to their issuer/client and Slack viewer.

Public reads use anonymous access or an explicitly configured public-only reader. A fresh repository visibility declaration is checked before fetching protected objects. Image locators recheck that declaration before cache access; they retain a URL, not a private content snapshot.

Internal private summaries require an approved workspace/origin/owner, the sender's linked access, and fresh non-external channel metadata. Their schema contains identity, title, status and visibility only. Code, body, counts, authors and timestamps remain excluded. A conversation-visible summary is a deliberate shared copy; Slack's retained message history is not a revocation mechanism.

Forgejo OAuth may grant broader permissions than the integration uses. The integration only issues read requests. Account identity and source permissions are checked independently of administrative role.

## Recovery and verification

The SQLite store encrypts account/event values, deduplicates link events, leases jobs, and keeps exhausted jobs separate from successful completion. Up to three source resolutions run concurrently for a batch of five links. Failed links keep a direct-source card while successful companions render, and the batch retains bounded retry semantics.

Detail responses have a short processing lease. A transient Slack error receives one bounded retry; only successful delivery sets the completed marker. Failed attempts release the marker so a subsequent delivery or user refresh can try again.

The renderer has a bytes-only cache (32 entries, 8 MiB, 60 seconds), keyed by fresh verified public metadata. Each request validates access first. The deploy preflight exercises the same PNG renderer, checks real text bounds and alpha, and verifies the exact release health.

Run `npm run test:sharing`, `npm run test:preview-layout`, `npm run test:slack-ui`, and the published Storybook smoke check. Real-client acceptance is recorded separately from fixture tests. The existing service remains Mac-hosted until its separately gated `glide-infra` preview-service cutover is provisioned; the static Forgejo skin already uses the managed server deployment path.
