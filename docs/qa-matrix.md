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
| Shortcut contracts | Real skin module on synthetic DOM | Preserved 12-case final guard GREEN, expanded to 26 passing cases covering history, HTMX, handled events, repeat cancellation, native modal/input ownership, focused-selector help, CSS-hidden menus and collapsed mobile/code actions; 64 generated-production browser contracts pass. Hidden/inert/disabled/absent create controls cannot invent a route. Not server permission or submission proof |
| Reference-region comparison | Mobile file code crop against measured GitHub reference | Overlay and crop coordinates retained; different content means pixel error is not a parity percentage |
| Gallery provenance | Repository and workflow groups | Explicitly named Reference reconstructions, with stable story IDs; shared production disclosure behavior and CSS are reused, not native server forms |
| Bounded native stress | Chromium/WebKit; light/dark, reduced/no-preference motion; 390 px and 1440 px with 200% CSS layout zoom | 8 passing candidate cases: internal native code scroller moves without document overflow, branch Escape restores visible focus, and help matches native file/directory actions before keyboard file-finder navigation. CSS zoom is not browser-toolbar zoom or a physical-device claim |
| Reference gallery smoke | 15 reconstruction stories at 320/1280 px, one browser worker | 30 passing renders, stable story IDs, no page errors or document overflow; long-name fixture included |

Run `node scripts/verify-native-parity.mjs --candidate` for the read-only native
interaction probe. Without `--candidate`, it tests the deployed assets. Evidence
defaults to `.qa/native-parity/`; override with `PARITY_EVIDENCE`.
Candidate cases record the locally fulfilled assets and require both `skin.mjs`
and `skin.css`. Missing assets abort rather than silently using production.
Review regressions include collapsed mobile help/action availability and visible
or fully collapsed 30,000-line files. Help avoids eager marker collection and
prunes hidden subtrees. Dismissal checks require actual menu invisibility and
focus return; author selection requires a nonempty native ID, native keyboard
highlight on the intended option before Enter, and a changed URL. Arrow-key
traversal is bounded by the visible option count rather than assuming an initial
highlight.
Native input consumers retain Escape ownership; shared disclosures act only on
unclaimed events. Native modal dialogs remain authoritative inside inert wrappers.
The browser suite and native probe honor the existing `PLAYWRIGHT_MODULE` loader.
Disclosure ownership and keyboard activation share the same rendered, hidden/inert
and disabled-control eligibility predicates. Interruption tests freeze the prefix
clock and observe native navigation attempts; a separate boundary check covers
999 ms versus 1,000 ms expiry. A missing-HTMX-handler counterexample passed the
old elapsed-time check but fails the frozen-clock contract.

The source release is 0.3.4 because the normal merge gate requires a version above
main's 0.3.3 for shippable changes. Earlier versioned assets remain unchanged.

The task's durable external evidence directory is
`/Users/ultra/.local/share/agent-ops/forgejo-goal-20261001/`.
The source-controlled test command is portable; the external directory is a
workstation evidence receipt, not an application dependency.

### Integrated native UI and streaming consumer (0.3.6)

The current integration release is 0.3.6. It incorporates the historical 0.3.5
streaming consumer, organization/disclosure/pagination updates and native search
layout corrections. All earlier versioned assets, including 0.3.5, remain
byte-for-byte unchanged. The imported `search-stream.mjs`
module ships in the build, installer and native-fixture allowlists; a test fails
if any local module import is missing from the installer asset set.

| Contract | Surface | Evidence in source |
|---|---|---|
| NDJSON v1 parser and reader | `tests/search-stream.test.mjs` with genuine `ReadableStream` byte fixtures | Every byte and Unicode split, CRLF, many records per chunk, fatal UTF-8, 2 MiB / 8 MiB / 256 caps, EOF without terminal, duplicate and misordered records, error after a withheld result, abort and cancel cleanup |
| Real chunked HTTP transport | `tests/mobile/universal-search-stream.spec.mjs`, Chromium and WebKit | Early `started` and heartbeats observable with no DOM churn, result staged until `done`, same-response JSON fallback, rejected Content-Type, 401/503, dropped connection, rapid replacement and close observed as a network abort, manual Retry, native mounted fallback |
| Stale and late work | Same spec with a controlled `fetchImpl` that ignores `AbortSignal` | Late fetch, late stream, late JSON decode and late failure are discarded and their bodies cancelled |
| Storybook parity | `tests/mobile/universal-search-stream-stories.spec.mjs` | Loading, result, interrupted, deadline, signed-out and Russian stories through the same production consumer at 320/440/1280 in light and dark |

The stream, stream-story and coverage specs set their own 320/440/1280 viewports, so
`playwright.mobile.config.mjs` runs them in the WebKit 440 and Chromium 440 projects
only; the extra Chromium viewport projects would repeat identical geometry.

Harness timing is not proxy timing: first-byte behaviour through the real ingress
with its 15 s idle timeout is a deployed acceptance gate, not a source claim.

### Gates that remain live-only

- Authenticated PR comment/review submission, confirmed saved state viewed by a
  second authorized account, restricted reviewer/member roles, and failed real
  submission requests with retained drafts. The existing synthetic demo returned
  Cloudflare 1033 during this audit; public production mutations are prohibited.
- Physical iPhone/Safari and screen-reader checks. WebKit is not a real iPhone.
- Deployment of the reviewed candidate followed by the same interaction proof.
  Neither a candidate asset override nor Storybook certifies deployed behavior.

### Integrated 0.3.6 review corrections

The 0.3.6 source includes the inherited stream consumer plus new organization and
pager ownership, readable search-kind/scopes, and an explicit demo capability.
Its generated `build.json`, footer, themes and package version identify the same
release. Historical versioned assets retain their original bytes.

Targeted browser regressions cover a readiness probe completing after a newer
interactive request, native `inert` changes while an activity body is clipped,
and the actual Forgejo `tw-flex { display:flex!important }` utility competing
with the ten-row Overview cap. These cases are run alongside the complete native
Chromium/WebKit suites; the two Chromium-CDP-only accessibility/touch contracts
remain explicitly separate from physical Safari acceptance.
