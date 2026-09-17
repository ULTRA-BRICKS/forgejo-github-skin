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
