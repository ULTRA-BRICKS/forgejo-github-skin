# Danny — installing the Forgejo UI skin

18 September 2026. Release candidate 0.1.1. Do not change the production default yet.

## Working previews

- Storybook: https://forgejo-ui.vercel.app/ — static component/screen gallery hosted on Vercel. It does not depend on Alex's Mac.
- Real Forgejo: https://forgejo-ui-demo.hyperide.ai/demo-author/keyboard-lab — separate Forgejo 16.0.5 with synthetic files, issues and PR #3. Public browsing requires no account.
- The real demo currently runs on Alex's Mac behind a dedicated named Cloudflare tunnel. A LaunchAgent supervises the tunnel, but Mac sleep/offline still makes the demo unavailable. Move it to an always-on host for lasting availability.

The production installation at `git.hyperide.ai` has NOT been changed. The app retains Forgejo's actual logo; the skin only makes its palette monochrome. Storybook reconstructions are not evidence of full native UI parity. Inspect the real instance as well.

## 1. Pin and build the reviewed source

```sh
git clone https://git.hyperide.ai/ultrabricks/forgejo-github-skin.git
cd forgejo-github-skin
git checkout --detach FULL_REVIEWED_COMMIT_SHA
npm ci
npm run build
npm test
npm run test:browser
npm run storybook:build
```

Resolve the full reviewed SHA from the merged PR before deployment; do not use a moving branch as your release identity. Use normal Git credentials, not tokens embedded in commands. Build as an unprivileged user. No font binaries are shipped; font fallback can change exact text metrics.

## 2. Verify the actual running Forgejo version

The 0.1.1 package includes source audits for 16.0.3 and 16.0.5. The live demo uses **16.0.5**. Supporting the older UI contract is not a recommendation to expose an older security release. Do not upgrade production as an incidental part of this theme installation.

```sh
forgejo --version
python3 scripts/check-compat.py \
  --source-checkout /srv/forgejo-upstream-source \
  --version 16.0.5
```

The source checkout must match the actual binary release. A failed fingerprint check is a stop condition, not something to bypass. Restart and smoke-test on each supported update.

## 3. Back up configuration privately, then run the installer

Determine the effective CustomPath and app.ini from startup logs/service configuration. In the standard demo container both resolve under `/data/gitea`; do not guess this for a NixOS, rootless or package installation.

```sh
python3 scripts/install.py \
  --custom-path /ACTUAL/CUSTOM/PATH \
  --app-ini /ACTUAL/app.ini \
  --forgejo-version 16.0.5
# Inspect the dry-run plan, then repeat with --apply.
python3 scripts/install.py \
  --custom-path /ACTUAL/CUSTOM/PATH \
  --app-ini /ACTUAL/app.ini \
  --forgejo-version 16.0.5 --apply
```

Use the owning service account or an operator with the necessary file permissions. The installer adds the three themes and merges one managed footer block. It preserves the default and unrelated hooks/configuration. **Do not pass `--make-default` for the first canary.** Store backups outside the repository with restricted permissions. The installer keeps only immediate rollback preimages in memory, not a durable app.ini backup.

Restart through your existing service manager. Confirm versioned `/assets/hypergithub/0.1.1/` files load, then select Hypergithub in a canary account's Appearance settings. Check a native theme still works. Global JavaScript is loaded by the shared hook but acts only for the selected skin.

## 4. Real acceptance, not just screenshots

Verify login/logout; public and private repository permissions; branches; file and blame; issues; PR conversation and files; real comments; Escape/focus return; typing and IME guards; mobile code scrolling; native-theme fallback. The recorded public smoke test covers seven routes at desktop/mobile sizes, native `g i`, logo colour and code no-wrap. Separate real desktop checks cover `?`/Escape, `t`, `w`, `l`, `b`, `y` and opening a PR comment editor as a normal authenticated demo reviewer. It does **not** certify full authenticated keyboard/review workflows. Run your canary with representative ordinary and restricted accounts.

## 5. Always-on demo deployment

`ops/handoff/` contains the detailed Compose/Caddy staging guide and strict file validators. Copy that folder to a new deployment directory outside the Git checkout before staging; keep Compose, `.env` and `staging/` together there. The stager intentionally refuses output inside its source repository. Use a new persistent volume, separate DNS names and synthetic data only. The initial Compose config requires login and disables registration, mail and Actions; enable public browsing only after reviewing fixtures.

**Verified image-layout correction:** keep configuration writable at `/data/gitea/conf/app.ini` and set CustomPath to `/data/gitea`. Bind the staged `public/` and `templates/` directories individually read-only. Mounting the whole custom directory at another location without synchronizing the config path can accidentally start the installation wizard; the Compose example has been corrected accordingly.

Demo Forgejo image used: `codeberg.org/forgejo/forgejo@sha256:cf5f5ae6acf2ababca0ee3d255705b83a47f35b25e07fc931d694d60664053fe`. Verify architecture and version locally. No production backup, SSH keys or runner should be attached. `scripts/demo-local.py` and `scripts/seed-demo.py` reproduce Alex's isolated Mac fixture; they are not a production provisioning tool. The Mac Docker wrapper ignores `exec --user`; its seed script uses `su-exec git` explicitly. Standard Docker supports `--user git` normally.

**Demo without a search backend:** the header search expects HyperSearch at `/api/hypersearch`. An instance that deliberately has no such backend (the isolated demo) opts out explicitly with one inert tag in `custom/templates/custom/header.tmpl` (rendered inside `<head>`):

```html
<meta name="hypergithub-search" content="disabled">
```

The skin then never mounts the header search, never probes the backend and leaves native code/repository search fields and the `s`, `/`, `Ctrl/Cmd+K` and `Ctrl/Cmd+/` keys to Forgejo and the browser. Only that exact value in `<head>` opts out; a missing tag, any other value and backend 401/404/5xx responses keep the header search (a signed-out or failed search shows its own message). Never set it on an instance that has HyperSearch.

## 6. Rollback and upgrades

For a cosmetic issue, restore the canary account's native theme. If necessary remove only the managed footer include and restore affected UI config/custom assets from your private backup; restart normally. Do not roll back databases or delete volumes for a theme problem. Do not overwrite unrelated administrator edits with a stale full app.ini. Keep previous versioned assets until no browsers reference them.

For each Forgejo upgrade: source audit → staging → real smoke tests → theme install → restart → canary → wider use. `scripts/update-overlay.py` is an operator-invoked compatibility/install wrapper, not a hook automatically installed into your infrastructure's updater. Wire it into your existing deployment process only after review.

## 7. Slack and sharing

The imported `ops/handoff/slack/preview-core.mjs` is a tested policy/signature/card core, NOT an installed Slack app. Event receiver, OAuth account linking, protected credential storage, queue and worker still need integration. Private content must not appear in public Open Graph endpoints. Channel-rich previews require explicit channel/repository disclosure rules; anyone in the channel may see retained copies. Default to a neutral card plus a personal authorized view.

See `ops/handoff/slack/SECURITY-AND-INTEGRATION.md` and `ops/handoff/UX-ACCEPTANCE.md`. Do not mark Slack integration, all GitHub hotkeys or pixel-perfect UI as complete from the current gallery.

## Compact preview v2

See [PREVIEW-V2-ACCEPTANCE.md](PREVIEW-V2-ACCEPTANCE.md) for the native Open Graph adapter, direct original URLs, exact-origin multi-instance authorization, corrected local setup form, token-based shared renderer and explicit live verification limits. The new HTTP app settings have been saved and reinstallation consent completed, but runtime credentials and production OAuth are not configured yet.
