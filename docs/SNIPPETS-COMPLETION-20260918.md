# Snippets completion checkpoint — 2026-09-18

Goal: working original Forgejo links, automatic Slack unfurls and authorized private views, with reproducible deployment and evidence.

## Observed, not inferred
- Canonical main: 01e67b4; isolated worktree fix/snippets-production-20260918.
- Existing sharing worktree has staged setup fixes from another task; preserve them.
- Slack connector identifies Ultra, not Danny.
- Bread is reachable over authorized SSH; Forgejo is active; preview service is absent on the server.
- Mac preview is listening on 3190 and health reports Slack configured.
- Runtime config file is 0644, which doctor/startup correctly reject.
- File config primary origin is git.hyperide.ai and instances repeats the same origin; Sources rejects duplicates.
- Live reload mutates config without rebuilding Sources/OAuth, permitting inconsistent runtime state.

## Work
1. Reproduce configuration, link and Slack delivery problems; inspect safe diagnostics.
2. Add regression tests and fix configuration/reload and link navigation.
3. Validate existing Slack app identity, callbacks and actual fresh-user link delivery.
4. Finish server deployment declaratively through glide-infra; protect secrets and existing data.
5. Run regression/live/browser checks; commit, review and merge; report exact remaining blockers.

Secrets: never print credentials, access browser cookie stores, or copy private content to unapproved channels. Reuse app A0C2QBRV3NH. Existing private demo channel C0C2X21ECTB is the synthetic QA destination.

## Verified implementation and canary

- Registered production OAuth client verified in the Forgejo UI; the primary configuration matched its Client ID and callback exactly. Existing credentials were preserved.
- Reconciled the duplicate production source through `scripts/sharing/reconcile-primary.mjs`, with a private backup and 0600 permissions.
- HTTP source links are upgraded to the exact configured HTTPS origin; arbitrary hosts, custom ports and traversal remain rejected.
- Neutral cards and all personal-view states provide a validated original link. Expired references open an explanatory modal.
- Persisted OAuth identities are bound to issuer and client. Previously linked accounts must reconnect once.
- Runtime reload validates and swaps the complete source/OAuth/Slack snapshot. Invalid updates preserve the last valid snapshot and appear in health.
- 62 sharing tests, 15 base JavaScript tests and 18 Python tests passed.
- Isolated real-config canary: production OAuth ready; HTTP navigation returns 302 to the HTTPS original; unsigned Slack requests return 401; private source PNG returns a neutral image.
- Local deployment is now a committed-release launchd workflow with isolated preflight and revision verification. A server-hosted deployment remains a separate acceptance gate.
