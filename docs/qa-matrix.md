# QA matrix

Legend: ✅ automated/pass · 🟡 fixture/prototype only · 🔴 not yet covered.

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
