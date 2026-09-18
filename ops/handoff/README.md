> Supplemental handoff. For the current verified version, image layout and live URLs, use [Danny installation guide](../../docs/DANNY-INSTALL.md). This file retains the earlier standalone-package context.

# Forgejo UI — deployment and privacy handoff

**Prepared: 18 September 2026. Supplemental candidate, not a live deployment.**

The canonical skin is `https://git.hyperide.ai/ultrabricks/forgejo-github-skin`.
This package does not contain or replace that repository. It consumes a separately
reviewed checkout and built release. No production files, DNS, accounts, repository
commits or Slack apps were modified from this package during this turn.

The remote computer was offline when checked. The previous Storybook URL was a
laptop-backed temporary Cloudflare tunnel, not persistent hosting. No replacement
public URL or screenshot is claimed here.

## Contents

- `DANNY-INSTALL.html` / `.md`: English administrator handoff, stable demo, canary and rollback.
- `compose.demo.yaml`, `Caddyfile`: dedicated standard-image Forgejo demo and static gallery.
- `scripts/stage_demo.py`: validates a clean reviewed checkout, stages assets in a NEW
  directory, preserves the supplied genuine Forgejo SVG, adds a palette-only layer,
  adapts the existing Storybook fixture logo, and writes a SHA-256 file manifest.
- `scripts/check_demo.py`: rejects placeholder/production hosts, floating image tags,
  configuration injection and staged-file drift. It does not attest binary security
  or prove compatibility with a claimed Forgejo version.
- `scripts/smoke-browser.mjs`: captures externally deployed gallery/login screenshots;
  it must be run after deployment and does not test full authenticated workflows.
- `slack/preview-core.mjs`: locally tested request-signature, URL, disclosure-policy and
  Block Kit formatting core. **Not an event server, OAuth flow or installed integration.**
- `slack/app-manifest.example.json`: private-view-mode starting manifest; example URLs
  deliberately cannot receive real events. Add channel-metadata scopes only when
  implementing and enabling the optional explicit-disclosure mode.
- `UX-ACCEPTANCE.md`, `slack/SECURITY-AND-INTEGRATION.md`: measurable acceptance and remaining work.
- `evidence/`: unit-test outputs; these prove only the supplemental code's local tests.

## Local verification

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/preview-core.test.mjs
```

Verified locally on Python 3.13.5 and Node.js 22.16.0: **32 Python + 48 Node tests pass**.
The optional `scripts/validate_static.py` also requires PyYAML; it checks selected
configuration invariants, not actual Docker Compose or Caddy execution.

These tests use synthetic files and facts. They are not screenshots, product E2E,
actual Slack messages, a Docker deployment, or a claim of “100% GitHub parity”.

No font binaries, account tokens, user data, production configuration or copied
private repositories are bundled. Keep upstream reference screenshots unchanged;
GitHub marks in reference evidence must not become the Forgejo product identity.
