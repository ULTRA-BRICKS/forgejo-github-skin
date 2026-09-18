# Current release candidate: 0.1.1

Native Forgejo 16.0.5 demo seeded and scoped separately from production. Storybook published to Vercel. Genuine Forgejo logo retained and monochrome in the skin. See docs/DANNY-INSTALL.md for tested commands and ops/handoff/ for the imported 80-test deployment/Slack policy package.

The earlier Storybook pixel metrics below refer to reconstructions, not the actual native-instance screenshots now in research/screenshots/demo/. They must not be presented as native Forgejo fidelity scores. Full authenticated keyboard/review acceptance and a working Slack OAuth/events app remain open.

## Previous checkpoint (historical)

# Implementation status

Updated: 2026-09-16. This file is the operational map; requirements live in `requirements.md` and behavioral rules in `interaction-spec.md`.

## Readiness by layer

| Layer | Status | Evidence | Next gate |
|---|---|---|---|
| Measured GitHub references | 🟢 | desktop/mobile captures for repo, branches, files, commits, blame, issues, PR, search, Actions | authenticated-header/reference refresh |
| DTCG tokens | 🟢 | `tokens.json`, validator tests | component-level token audit |
| Forgejo external theme | 🟢 | light/dark/auto builds; no fork | canary on target instance |
| Update compatibility | 🟢 | Forgejo 16.0.3 source fingerprints | repeat on every Forgejo upgrade |
| Runtime keyboard UX | 🟢 | desktop/mobile browser contracts | compare-page multi-ref behavior |
| Storybook system | 🟢 | screens, components, feedback, micro-interactions | add remaining PR review states |
| Repository root fidelity | 🟢/🟡 | pixel loop active; geometry closely matched | content/font/icon refinement |
| File / blame fidelity | 🟡 | Storybook fixtures and GitHub refs | per-screen pixel loops |
| Issues / PR lists | 🟡 | Storybook fixtures and GitHub refs | per-screen pixel loops |
| PR review / merge UX | 🔴 | requirements only | fixture + native Forgejo mapping |
| Actions UX | 🟡 | references captured | Forgejo-runner-backed fixture |
| Production deployment | 🔴 | installer exists, no production mutation yet | canary + rollback smoke |

## Current visual metrics

Raw screenshot comparison is deliberately strict and includes text rasterization and changing content. Latest repository baseline before the next convergence pass: desktop MAE around 10/255 and mobile around 8/255. These are engineering diagnostics, not a claimed similarity percentage.

## Priority order

1. Land reviewed core/theme code and make the internal repository fully populated.
2. Land Storybook, requirements and the principal screenshot evidence.
3. Finish repository root/mobile convergence without regressing desktop.
4. Run the same measured loop on File → Blame → Issues → Pull Requests → Commits.
5. Add PR conversation/review/checks/merge-conflict/loading/error fixtures and native-control mapping.
6. Validate 320/360/390/430/768/1024/1440 widths, 200% zoom, reduced motion and forced colors.
7. Run a canary on `git.hyperide.ai`, capture production screenshots, then decide whether the skin may become the default.

## Definition of done for a screen

A screen is not “done” because its static screenshot looks similar. It needs: measured reference, desktop/mobile fixture, important hover/focus/pressed/disabled states, loading/empty/error/success behavior where relevant, keyboard/focus semantics, reduced-motion behavior, no document overflow, pixel evidence, and a smoke check against real Forgejo DOM.

## Known fidelity gaps

- Signed-in GitHub global header has not yet been captured as a trustworthy reference; public signed-out header is not treated as an authenticated-product spec.
- Dynamic avatars, timestamps and changing repository data add raw pixel noise and must not drive layout hacks.
- Mona Sans is used only in the development visual fixture; production currently relies on the measured fallback stack rather than distributing font binaries.
- Storybook is intentionally richer than production CSS: it can model future states, but production behavior is added only when a native Forgejo action/state can be identified safely.
