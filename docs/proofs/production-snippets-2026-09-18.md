# Production snippet acceptance — 2026-09-18

## Verified live behavior

The public endpoint passed the repeatable five-check HTTP acceptance run recorded in `production-http-2026-09-18.json`. Run it with:

```sh
node scripts/sharing/verify-production-http.mjs /tmp/production-http-proof.json
```

This checks live release readiness, HTTP-to-HTTPS original navigation, rejection of unsigned Slack events, neutral handling of unconfigured origins, and a valid PNG response. It uses no account credentials.

A fresh HTTP link posted to the dedicated private QA channel received an automatic app card with both preview and original-navigation actions:
https://glide-vc.slack.com/archives/C0C2X21ECTB/p1789759023914549

In the authorized Slack browser, the real Forgejo account connection completed. Reopening the task-cli card showed its actual description in a personal modal with an account-access check. Clicking its original-navigation action opened `https://git.hyperide.ai/ultrabricks/task-cli`.
The screenshot was captured on the operator machine and displayed in the user conversation; the full workspace screenshot is kept outside Git because it includes surrounding private channel names.

The original fixes are merged in PRs #15–18. Follow-up PRs #19–20 changed the preview label and image-error fallback; the HTTP proof identifies the exact live revision it checked. The personal-modal browser observation above preceded those follow-ups.

## Tests and remaining deployment boundary

The sharing suite passed 63 tests after the account-connection fixes. The earlier base suite passed 15 JavaScript and 18 Python tests. Browser observations and the HTTP script are separate evidence; a fresh Playwright CDP automation attempt timed out at connection and is not counted as a passing end-to-end test.

The public endpoint still runs under launchd on the Mac. The Nix server package built successfully on bread, and the supporting operator CLI changes were merged in `hyperide/glide-infra` PR #2. Server secrets were not provisioned and the dedicated server tunnel was not activated: local SOPS decryption lacked a matching identity, and the remote private-input import was blocked by the execution tool. The working Mac service remains active.

Server cutover requires provisioned SOPS entries, a consistent encrypted-state migration, deployment through `glide deploy`, and fresh Slack/browser acceptance with the Mac connector retired. Server readiness is not complete.
