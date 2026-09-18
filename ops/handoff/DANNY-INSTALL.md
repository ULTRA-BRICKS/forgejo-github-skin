> Supplemental handoff. For the current verified version, image layout and live URLs, use [Danny installation guide](../../docs/DANNY-INSTALL.md). This file retains the earlier standalone-package context.

# Danny — Forgejo UI installation, demo and rollback guide

**18 September 2026 · deployment candidate, not a production release certificate**

## 1. What this changes — and what it does not

Keep Forgejo's identity, authentication, authorization, repository data and native
forms. The GitHub-familiar skin is an opt-in presentation layer. Do not replace the
Forgejo logo with the GitHub Octocat, and do not copy GitHub's marketing navigation
into the signed-in developer experience.

The supplied branding layer recolours the genuine Forgejo mark without redrawing
its geometry. It does not touch user avatars. A demo-only adapter removes the old
GitHub mark from the existing Storybook reconstruction fixtures. Reference screenshots
remain unchanged. This adapter is not a substitute for consolidating branding in the
repository's source components before the final production release.

Forgejo supports named themes, but custom resources and template changes are explicitly
maintenance-sensitive. Revalidate them against the exact running binary before any
upgrade. See the official [customization guidance][1] and [developer instructions][2].

**Current evidence boundary.** Previous conversation work reported PRs 3–5 merged;
its last observed main was `a31858e`. That is historical context, not a current release
pin. The server and checkout could not be accessed in this turn. Resolve and review
the current full commit hash yourself. Previous target version 16.0.3 is likewise not
proof of the currently installed version or a recommendation to expose an outdated
binary. Select a supported, security-reviewed release and run the skin's compatibility
gate before exposing it.

This supplemental package has local unit tests. Its Docker stack, TLS, real user
flows and Slack installation have **not** been executed here.

## 2. Separate three deliverables

**Static gallery:** a production Storybook build on an always-on host. It demonstrates
components and states, not repository permissions or working git operations.

**Real demo:** a separate Forgejo installation with its own database, repositories,
accounts and domains. Use synthetic demo data only. Initially require login, disable
self-registration, email and Actions execution. Open public demo browsing only after
reviewing every visible fixture. Do not import production backups to “make it realistic”.

**Production canary:** install the reviewed theme as an additional appearance option
on the existing instance. Keep the current default theme until the canary passes.

Use two distinct DNS names you control for the gallery and real demo. Names such as
`forgejo-ui.example.com` and `forgejo-demo.example.com` below are examples, not existing
URLs. A local process plus a temporary tunnel is not the permanent hosting solution.

## 3. Build from one reviewed revision

On a trusted build host, using the Node version required by the checkout's package metadata:

```sh
git clone https://git.hyperide.ai/ultrabricks/forgejo-github-skin.git /srv/forgejo-skin-source
cd /srv/forgejo-skin-source
git checkout --detach FULL_REVIEWED_COMMIT_SHA
npm ci
npm run build
npm test
npm run test:browser
npm run storybook:build
git rev-parse HEAD
```

Use the normal authorized Git credential flow. Do not put tokens in clone URLs,
terminal output or this handoff. Run build tools as an unprivileged build user.
Review the package scripts before running them. Do not regenerate reference token
captures during release packaging: that is a separate reviewed source change.

Confirm `dist/public/assets/css/theme-hypergithub-{light,dark,auto}.css`, the versioned
`skin.mjs` and `core.mjs`, the custom footer and `storybook-static/{index.html,iframe.html,index.json}` exist.
The supplementary staging script refuses missing artifacts and modified tracked files.

Before staging, inspect and execute the canonical repository's compatibility checks:

```sh
python3 scripts/check-compat.py --help
python3 scripts/install.py --help
```

Use the real options from that checkout. The current installer implementation was
not readable in this turn, so no guessed `--apply` or compatibility-bypass flag is
provided here. A version label alone is insufficient: check the upstream template/
source fingerprints required by the repository's manifest.

## 4. Stage the real demo and gallery

Download or export the original Forgejo SVG from the reviewed distribution. An
existing instance normally serves its logo at `/assets/img/logo.svg`; the official
customization guide documents the asset family.[2] For example:

```sh
curl --fail --proto '=https' --tlsv1.2 \
  https://git.hyperide.ai/assets/img/logo.svg \
  --output /srv/forgejo-logo.svg
```

Verify that it is the actual Forgejo mark, not an HTML login/error page or a custom
third-party logo. The script checks self-contained SVG syntax but cannot certify
visual brand identity from the filename.

Unpack this handoff into a separate folder, then run there:

```sh
python3 scripts/stage_demo.py \
  --repo /srv/forgejo-skin-source \
  --output ./staging \
  --logo-svg /srv/forgejo-logo.svg \
  --expected-sha FULL_REVIEWED_COMMIT_SHA \
  --reviewed-forgejo-version EXACT_REVIEWED_VERSION
```

`staging` must not exist. For subsequent releases use a new release directory rather
than overwriting the running release. The staging tool does not install, start a
container, edit app.ini, verify image security or approve the version you enter.
It records file hashes and the operator-supplied reviewed version for later checks.
It intentionally accepts only the currently expected custom-footer template layout;
a future distribution with more overrides must be reviewed before widening the allowlist.

## 5. Configure permanent hosting

This Compose example uses the **standard, non-rootless official Forgejo image**,
with `/data` persisted. Rootless images use a different layout and require a separately
reviewed Compose file. Forgejo supports `FORGEJO__section__key` configuration in the
container; `FORGEJO_CUSTOM` explicitly points to this demo's custom directory.[3]

Copy `.env.example` to `.env`. Set the real demo/gallery DNS hosts and administrator
ACME email. Set both `FORGEJO_IMAGE` and `CADDY_IMAGE` to reviewed official image digests,
not floating `latest` tags. Confirm that the chosen Forgejo digest has the version and
layout you reviewed; a digest string is not evidence of that by itself.

Point DNS to the always-on host. Permit incoming 80/443 for the chosen TLS setup.
Ensure no existing service already owns those ports. Where an existing reverse proxy
is in use, integrate the two virtual hosts there rather than starting a competing
public listener. Caddy can obtain and renew certificates when its automatic-HTTPS
requirements are met.[4]

```sh
python3 scripts/check_demo.py --env .env --staging staging
docker compose --env-file .env -f compose.demo.yaml config --quiet
docker compose --env-file .env -f compose.demo.yaml run --rm --no-deps \
  caddy caddy validate --config /etc/caddy/Caddyfile
```

Compose config validation checks the resolved configuration without starting services.[5]
The package's validator additionally rejects the production hostname, placeholder
hosts, malformed DNS names and modified/missing/extra staged files. Do not circumvent
those checks by deploying this demo configuration over the production instance.

## 6. Bootstrap without exposing an installation form

Start Forgejo alone first; its HTTP port is not published to the host:

```sh
docker compose --env-file .env -f compose.demo.yaml up -d forgejo
docker compose --env-file .env -f compose.demo.yaml exec -T --user git forgejo \
  forgejo --config /data/gitea/conf/app.ini --version
```

Confirm the actual version, healthy startup and correct custom path. Create a dedicated
demo administrator, using the CLI's random-password option and a real administrator
email. Preserve its generated password only in a private file; do not publish it with
the gallery. The following is for a **new** demo account, not a password reset:[6]

```sh
umask 077
mkdir -p credentials
chmod 700 credentials
set -C  # refuse to overwrite an existing credential file
docker compose --env-file .env -f compose.demo.yaml exec -T --user git forgejo \
  forgejo --config /data/gitea/conf/app.ini admin user create \
  --username demo-admin --email REAL_ADMIN_EMAIL --admin \
  --random-password --random-password-length 32 --must-change-password=true \
  > credentials/demo-admin.txt 2> credentials/bootstrap-errors.txt
set +C
```

Read the result privately and change the password on first login. Never distribute
the administrator account as the public demo login. Create separate ordinary accounts
and grant only the repository permissions needed for testing.

Now start the front end:

```sh
docker compose --env-file .env -f compose.demo.yaml up -d caddy
docker compose --env-file .env -f compose.demo.yaml ps
```

Create a synthetic repository, two issues, one draft/open PR, a committed source file,
a rename and a small diff. Include a second repository inaccessible to the visitor.
Keep an explicit fixture checklist. Do not claim the demo is seeded until those objects
exist and their URLs have been verified. The supplied package does not automate seeding.

Actions are deliberately disabled in this initial demo. Testing actual run logs needs
a separately isolated runner and reviewed jobs. Do not attach a privileged production
runner to a demo anyone else can write to.

## 7. Prove availability — a 200 response is not sufficient

Check the new gallery and demo from a separate network/device. Verify that the browser
loads JS/CSS/images and does not show a Storybook error overlay. Run the provided smoke
script with the Playwright package installed by the reviewed source checkout:

```sh
PLAYWRIGHT_MODULE=/srv/forgejo-skin-source/node_modules/@playwright/test/index.mjs \
STORYBOOK_URL=https://YOUR_STORYBOOK_HOST \
FORGEJO_DEMO_URL=https://YOUR_DEMO_HOST \
node scripts/smoke-browser.mjs
```

It writes real browser screenshots and a result manifest under `artifacts/external-smoke`.
It tests deployed gallery rendering and the native login screen only. Full authenticated
flows, Safari/Firefox, permissions and Slack remain separate acceptance gates in
`UX-ACCEPTANCE.md`. Verify availability again after restarting the containers and host.
`restart: unless-stopped` is not a complete uptime monitor or self-healing guarantee.

Send Alex the exact working URLs, source commit, image digest/version, screenshots and
test results. Never label a gallery mockup as the working Forgejo instance.

## 8. Install the production canary only after the demo passes

Determine the effective CustomPath and app.ini paths from the deployment configuration,
not from a guessed distro path. Preserve the existing proxy, authentication, CSRF, root
URL, themes and footer/header additions. Forgejo resolves CustomPath using command-line,
environment and deployment defaults.[7]

Take the normal operator-controlled backup/snapshot of configuration and custom files,
with private permissions and a tested restore path. Do not copy app.ini into this source
repository or a public artifacts folder. Keep database backups private as well.

Use the canonical reviewed installer with its actual `--custom-path`, `--app-ini` and
`--forgejo-version` options, first in dry-run mode. Inspect its plan. Only then invoke
the application mode documented by that specific checked-out installer. Do not overwrite
an existing custom header/footer with the fresh-demo versions from this package.

For the canary, **append** these themes to the existing `[ui] THEMES` list:

```ini
hypergithub-auto,hypergithub-light,hypergithub-dark
```

Leave `[ui] DEFAULT_THEME` unchanged. Keep the native themes. The optional branding
header and footer includes must be merged into the existing custom hooks, not copied
over them wholesale. Preserve `{{AppSubUrl}}` for instances installed under a subpath.
Do not rely on the version number `0.1.0` as a cache identity for different bytes:
version the final release assets or invalidate old paths deliberately.

Restart/reload using the instance's existing operating procedure, then have only the
canary accounts select the skin in appearance settings. Theme selection does not by
itself restrict delivery of custom JS to those accounts: the shared hooks must remain
safe on every page, and behaviour must be gated by the selected theme.

No site-wide branding file replacement, default-theme switch, server upgrade or Slack
permission expansion should be bundled into the same first canary operation.

## 9. Rollback

For a display problem, switch the canary account back to its previous native theme.
If JavaScript prevents access, remove only the newly added managed module/CSS includes,
restore the prior custom files and restart Forgejo using the established procedure.
Restore configuration by comparing the affected keys, not by overwriting unrelated
administrator edits from a stale complete app.ini.

Keep the last known-good static gallery release and switch its root/mount back when
needed. Keep previously deployed asset versions until browsers no longer reference
them. A UI rollback must not delete repositories, attachments or databases.

To stop the isolated demo while preserving data:

```sh
docker compose --env-file .env -f compose.demo.yaml down
```

Do **not** append `-v`: it deletes the demo's persistent volumes. If the underlying
Forgejo binary was upgraded and migrated its database, do not simply run an older
binary against that database; follow the separately tested upgrade/restore plan.

## 10. Slack is a separate backend integration

Incoming repository webhooks are not enough to unfurl an arbitrary pasted private link.
Use a registered Slack app, link events and the unfurl API.[8] The supplied policy module
is ready for integration work but does not provide an event receiver, durable queue,
OAuth account linking, token storage or a running worker.

Default private mode: a neutral card in the conversation, with a **View privately**
button. Authenticate the clicking user and recheck their access before showing protected
content in a personal modal or view. Return the same neutral result for denied,
nonexistent and undisclosed resources. No title, filename, author, diff or build status
should leak through a public metadata/image endpoint.

An alternative rich private card in an approved team channel is an **explicit shared
copy**, visible to that conversation. Slack authentication does not make an unfurl
visible only to authorized repository users.[8] Require separate administrator and
user disclosure policy; do not equate read access with permission to broadcast. Block
Slack Connect/unknown audiences by default. Account for later members and retained
copies. See `slack/SECURITY-AND-INTEGRATION.md` before enabling this mode.

## References

[1]: https://forgejo.org/docs/latest/admin/advanced/customization/
[2]: https://forgejo.org/docs/latest/contributor/customization/
[3]: https://forgejo.org/docs/latest/admin/installation/docker/
[4]: https://caddyserver.com/docs/automatic-https
[5]: https://docs.docker.com/reference/cli/docker/compose/config/
[6]: https://forgejo.org/docs/latest/admin/command-line/
[7]: https://forgejo.org/docs/latest/admin/config-cheat-sheet/
[8]: https://docs.slack.dev/messaging/unfurling-links-in-messages/
