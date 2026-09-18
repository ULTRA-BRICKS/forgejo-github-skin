# Compact preview v2 — acceptance and deployment

## What is being accepted

The previous cards duplicated the title/body inside a large low-density image. The new image is a supplementary facts panel. Title and description remain native message text. The same pure SVG renderer is used by Storybook and the server PNG renderer. `DESIGN.md`, `tokens.json` and `tokens/preview.tokens.json` are authoritative; fixture statistics are explicitly synthetic.

Five object layouts are covered: repository, issue, pull request, commit and immutable file. Missing counts remain unknown. The repository chart reports its 28-day window and maximum per day; a capped commit sample is labelled. Author counts describe the fetched activity sample, not all collaborators. Actual organization branding is configurable, with the current instance mark as a small fallback. No giant avatars or generic FORGEJO banner.

## Evidence, with separate scopes

- `research/preview-v2-visual-proof.json`: seven variants at 360/480 CSS pixels, text bounds and metric separation, live browser redirect and 1440×672 PNG.
- `research/preview-renderer-parity.json`: five literal pixel comparisons between Storybook and the production renderer using identical fixtures. All five MAE values are zero. This is NOT a percentage of GitHub fidelity.
- `research/native-social-proof.json`: real native repository/issue/PR pages emit one title, one image and their original canonical URL; protected routes retain authorization.
- `research/setup-browser-proof.json`: reproduction of Origin:null/403 and successful fixed/legacy-CSRF native form posts using synthetic credentials.
- `research/setup-feedback-proof.json`: failed authentication retains form input; retry succeeds and clears password fields. The Slack auth endpoint is stubbed in this test.
- `research/slack-settings-v2-proof.json`: actual developer configuration read back after saving native instance domains and HTTP event/interaction endpoints. This alone is not a successful installation or event-delivery proof.

Actual Slack client screenshots and failures are stored separately. A manual Block Kit message or a classic crawler preview must never be labelled proof of an authenticated `link_shared` → `chat.unfurl` flow.

## Local setup correction

`Referrer-Policy: no-referrer` caused native Chromium form navigation to send `Origin: null`; the previous origin check rejected the form itself. The form now uses `same-origin`. A legacy null-origin request is accepted only with same-origin Fetch Metadata AND a live cookie-bound CSRF token. Cross-site requests, invalid tokens and host spoofing remain rejected. A second setup tab no longer destroys a first tab's token.

The new progressive form preserves entered values on failure, reports an accessible error and allows retry; it clears secrets only after the bot/workspace verification and atomic private-config write succeed. Keys are never logged or sent through chat. Existing browser history cannot recover values that were already discarded by the old form.

## Native public URLs — optional administrator installation

On the isolated demo, a small audited external Open Graph partial now supplies the facts image directly on ordinary Forgejo URLs. It keeps native title/description/canonical metadata and changes the image only for a non-private repository. It does not make protected data public. The image service always rechecks anonymous access. Production `git.hyperide.ai` has NOT had this template installed.

```sh
# Run in the reviewed skin checkout. The source checkout must be Forgejo 16.0.5.
python3 scripts/sharing/native-social.py \
  --source-checkout /srv/forgejo-source-16.0.5 \
  --custom-path /ACTUAL/FORGEJO/CUSTOM/PATH \
  --preview-origin https://forgejo-links.hyperide.ai
# Inspect the dry-run plan, then repeat with --apply and restart Forgejo normally.
```

The script pins the upstream partial hash, refuses to replace an administrator's different template, and supports `--remove --apply` for removal of its own exact output. An upstream change must be reviewed, not bypassed. The generated native override is independent of the skin's general CSS installer. Recheck it as part of each Forgejo update.

Old `/s/` and `/share` browser links immediately redirect to the validated source before any metadata lookup. `/inspect` is the explicit troubleshooting page. Original Forgejo URLs are the intended user-facing links; no special share URL is required when the native overlay or the authenticated Slack application is configured.

## Direct Slack domains and protected contents

The registered developer manifest now includes `git.hyperide.ai` and `forgejo-ui-demo.hyperide.ai`, `link_shared`, and the actual service HTTP Events/Interactivity endpoints. Socket Mode was turned off to match the running HTTP receiver. Reinstall after changing unfurl domains, then verify Slack's signed challenge and an actual new direct link in the test channel.

The runtime still requires the app's Signing Secret and Bot User OAuth Token. The production instance also requires its OWN authorization client and per-user link. Demo OAuth tokens cannot cross origins; source IDs are unique and bound to their own state/account namespace. `qa-cli` is recognized as an exact production URL, but the production API currently requires login even for publicly labelled repositories. It must not be fetched using the demo user's token.

Protected metadata is never put in a public image URL. Per-viewer modals recheck the clicking user's account; any channel-wide copy requires explicit approved disclosure and fresh non-shared-channel checks. Direct private Slack unfurls remain unaccepted until that real connection and revocation test pass.

## Supported routes and honest limits

Repository, issue, PR (including files/commits tabs), full-SHA commit and immutable file links are supported. Mutable branch file URLs, list screens and unrecognized routes are not guessed. Their expansion requires explicit tested ref resolution. The activity graph is a bounded fetched sample, not a repository-wide analytics API. The demo service is Mac-hosted; persistent DNS and a supervised tunnel do not provide uptime while the Mac sleeps.
