# QA matrix

Legend: ✅ automated/pass · 🟡 fixture/prototype only · 🔴 not yet covered.

The historical checkmarks below include synthetic DOM contracts and reconstructed
Storybook screens. They are not a certificate of authenticated native workflows.
Use the source-specific evidence section for native acceptance.

| Area | Desktop | Mobile | Keyboard | Loading/error | Pixel diff |
|---|---:|---:|---:|---:|---:|
| Repository root | ✅ | ✅ | ✅ | 🟡 | ✅ |
| Branch switcher | ✅ | ✅ | ✅ | 🔴 | 🟡 |
| Directory browse | 🟡 | 🟡 | 🟡 | 🔴 | 🔴 |
| File view | 🟡 | 🟡 | ✅ | 🟡 | 🔴 |
| File history | 🟡 | 🟡 | 🟡 | 🔴 | 🔴 |
| Blame | 🟡 | 🟡 | ✅ | 🟡 | 🔴 |
| Commits | 🟡 | 🟡 | 🟡 | 🟡 | 🔴 |
| Commit detail / compare | 🟡 | 🟡 | 🟡 | 🟡 | 🔴 |
| Issues list/detail | 🟡 | 🟡 | 🟡 | 🟡 | 🔴 |
| Pull requests | 🟡 | 🟡 | 🟡 | 🟡 | 🔴 |
| PR review / merge | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| Actions | 🟡 | 🟡 | 🟡 | 🟡 | 🔴 |
| Theme switch teardown | ✅ | ✅ | ✅ | n/a | n/a |
| Reduced motion | ✅ | ✅ | n/a | n/a | n/a |
| No document horizontal overflow | ✅ | ✅ | n/a | n/a | ✅ |

## Release gates

- Unit/integration tests green.
- Browser contracts green in Chromium desktop/mobile fixtures.
- Storybook builds from a clean dependency install.
- `npm audit` has no known high/critical runtime or dev-server vulnerabilities accepted silently.
- Primary reference screenshots and current candidates exist in the repository.
- Pixel-diff report is regenerated for each screen under active tuning.
- Exact Forgejo source compatibility check passes for the deployment version.
- Canary smoke test succeeds before production-wide default-theme changes.

## Keyboard parity coverage

| Group | Desktop | Mobile | Notes |
|---|---:|---:|---|
| Repository `G C/I/P/A/N` | ✅ | ✅ | Existing same-origin destinations only |
| Search `S` / `/` | ✅ | ✅ | Best visible native search |
| File `T/L/W/Y/B/E` | ✅ | ✅ | Permission-rendered controls; line dialog is skin-owned |
| Issue-list `Cmd/Ctrl+/`, `C`, `U/L/M/A` | ✅ | ✅ | Native search/filter/create controls |
| Issue/PR detail `Q/M/L/A` | ✅ | ✅ | Native reviewer/milestone/label/assignee controls |
| Actions `G F`, `T`, `F` | ✅ | ✅ | Native workflow source and gear-menu commands |
| Notifications `Shift+I/U` | ✅ | ✅ | Native read/unread buttons; focused/hovered item only |
| Native Markdown `Cmd/Ctrl+B/I/K`, quick submit | ↪ | ↪ | Supplied by Forgejo editor, deliberately not intercepted |
| GitHub-only / excluded features | — | — | Explicit in `docs/hotkeys.md`; no fake mutations |

## Native parity evidence — 2026-10-01

Tracked by [native parity](https://git.hyperide.ai/ultrabricks/forgejo-github-skin/issues/6)
and [keyboard focus and interruption safety](https://git.hyperide.ai/ultrabricks/forgejo-github-skin/issues/67).

| Evidence | Scope | Result / limitation |
|---|---|---|
| Public production captures | Repository, directory, file, blame, history, issue list/detail, PR conversation/files, Actions; Chromium/WebKit at 390 and 1440 px | 40 HTTP 200 captures, no document-wide overflow; unchanged production assets |
| Native candidate interaction checks | Branch open/select/Escape and author open/select/Escape; Chromium/WebKit at 390 and 1440 px | 16 passing cases using native server JavaScript with local candidate skin assets; query and slash-containing ref preserved |
| Focus visibility | Native author-filter trigger after Escape | Shared focus token applied to native tabindex dropdowns; inner filter dismissal does not close the outer mobile options panel |
| Shortcut contracts | Real skin module on synthetic DOM | RED-first coverage for interrupted prefixes, unusable create/help controls, modifiers and Escape guards; not server permission or submission proof |
| Reference-region comparison | Mobile file code crop against measured GitHub reference | Overlay and crop coordinates retained; different content means pixel error is not a parity percentage |
| Gallery provenance | Repository and workflow groups | Explicitly named Reference reconstructions, with stable story IDs; shared production disclosure behavior and CSS are reused, not native server forms |

Run `node scripts/verify-native-parity.mjs --candidate` for the read-only native
interaction probe. Without `--candidate`, it tests the deployed assets. Evidence
defaults to `.qa/native-parity/`; override with `PARITY_EVIDENCE`.

The task's durable external evidence directory is
`/Users/ultra/.local/share/agent-ops/forgejo-goal-20261001/`.
The source-controlled test command is portable; the external directory is a
workstation evidence receipt, not an application dependency.

### Gates that remain live-only

- Authenticated PR comment/review submission, confirmed saved state viewed by a
  second authorized account, restricted reviewer/member roles, and failed real
  submission requests with retained drafts. The existing synthetic demo returned
  Cloudflare 1033 during this audit; public production mutations are prohibited.
- Physical iPhone/Safari and screen-reader checks. WebKit is not a real iPhone.
- Deployment of the reviewed candidate followed by the same interaction proof.
  Neither a candidate asset override nor Storybook certifies deployed behavior.
