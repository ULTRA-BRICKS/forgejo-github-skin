# Product requirements — GitHub-familiar Forgejo skin

Status: living specification. Every visual or behavioral change must map to a requirement here and a Storybook or browser QA case where practical.

## Product boundary

- Preserve Forgejo as the server, permission model, forms, CSRF/auth, URLs, Git semantics and data source.
- Reproduce GitHub's repository UI/UX as closely as practical on desktop and mobile without GitHub branding or pretending to be GitHub.
- Exclude Projects, Releases and Wiki from primary navigation; do not destroy underlying data or routes.
- Prefer an external skin/extension package over a long-lived Forgejo fork. Full template overrides require an explicit justification.
- Remain removable: switching to a native Forgejo theme must restore native behavior and DOM ownership.

## Fidelity requirements

- Compare at fixed reference viewports: desktop 1440×1000 and mobile 390×844, plus responsive stress widths.
- Use screenshot → overlay → pixel-diff → correction loops, not visual memory.
- Match layout geometry, spacing, border radii, borders, background hierarchy, typography, icon geometry and control density.
- Dynamic content differences must be isolated from layout/style metrics where possible.
- Maintain a machine-readable pixel-diff report; never translate a raw pixel metric into a fake "percent identical" claim.
- Store principal reference/candidate/overlay images in `research/screenshots/` and keep the important current examples in the repository.

## Required screens

- Repository root and directory browsing.
- Branch list and branch switcher.
- File view, file history, blame and go-to-file.
- Commit list, commit detail and compare.
- Issues list/detail/search/filter states.
- Pull requests list/detail, commits, files changed, checks/review states.
- Actions list/run where Forgejo Actions is enabled.
- Empty, loading, error, success, permission-denied and no-results states for the above where applicable.

## Typography, icons and visual polish

- Use GitHub/Primer measurements captured from the browser where legally and technically appropriate.
- Font stack: prefer `Mona Sans VF` when already available on the client; otherwise use the measured system fallbacks. Do not bundle font binaries in this repository.
- Monospace stack follows the measured GitHub code stack and must preserve code alignment.
- Use Primer Octicons (package dependency) for reconstructed Storybook fixtures instead of Unicode approximations.
- In the live Forgejo skin, preserve Forgejo-provided SVG semantics where possible and restyle rather than replacing accessible server controls.
- Icons must align optically, not only geometrically: baseline, stroke/fill weight, hit target and adjacent label gap are acceptance criteria.
- Focus indicators must remain visible in light/dark themes and at 200% zoom.

## Interaction quality

- Hover, pressed, selected, disabled, focus-visible and loading states are all specified states, not incidental browser defaults.
- Menus close on Escape and outside click; focus returns to the invoking control after keyboard dismissal.
- Keyboard shortcuts never fire while typing, composing IME text, using modifier keys, or interacting with code editors.
- Preserve browser-native open-in-new-tab, copy-link, selection and Back/Forward behavior.
- Do not make entire rows JavaScript-only click targets when real anchors already exist.
- Destructive or mutating operations remain server-authoritative and are never inferred as successful before a confirmed response.
- Reduced-motion users receive state changes without non-essential movement.

## Loading and feedback

- Loading feedback appears near the region that is waiting; avoid blocking the whole page for a local request.
- Use stable layout placeholders or existing Forgejo indicators so loading does not cause avoidable content jumps.
- Success, info, warning and error feedback use icon + text + color, never color alone.
- Errors must preserve user input and expose a retry/recovery path where one exists.
- Timeout/unknown-result states must not be presented as success and must not automatically replay mutating operations.
- Empty states explain what is empty and provide the next available action when the user has permission.
- Copy-to-clipboard feedback is immediate, transient and screen-reader-announced.

## Motion and micro-interactions

- Use measured GitHub motion tokens as references: fast hover around 80–100 ms; state changes around 200 ms; enter around 300 ms where motion adds orientation.
- Animate color, opacity and small transforms; avoid animating large layout dimensions, code rows or diff geometry.
- Menus should feel anchored to their trigger, with no perceptible jump after opening.
- Pressed buttons must have a distinct active state in addition to hover.
- Tooltips appear only when the label is otherwise missing/ambiguous and do not cover the target being explained.
- Loading indicators should begin quickly enough to acknowledge the action but avoid flashing for instantaneous responses.
- No animation may delay access to content or acknowledgement of errors.

## Responsive behavior

- Mobile keeps repository identity, active section, current ref and primary actions visible without horizontal page scrolling.
- Wide code and diffs scroll inside their own region rather than widening the page.
- Touch targets added by this skin target at least 44×44 CSS px when space allows.
- Responsive overflow menus must preserve every permitted action; hiding is not a substitute for overflow navigation.
- Test 320, 360, 390, 430, 768, 1024 and 1440 px widths plus 200% zoom.

## Accessibility and performance

- Keyboard, screen reader labels, focus order, reduced motion and forced-colors behavior are release criteria.
- Skin JS must not continuously scan the full growing DOM on unrelated mutations.
- Native-theme users should pay negligible runtime cost for the optional skin.
- Runtime skin assets make no third-party network requests.
- Storybook is development-only and must not be part of the production Forgejo asset payload.

## Delivery requirements

- `DESIGN.md` is the visual rationale; this file is the normative requirement index.
- `docs/interaction-spec.md` defines interaction state machines and feedback.
- `docs/qa-matrix.md` records coverage and remaining gaps.
- Storybook stories serve as reproducible component/screen fixtures; screenshots are generated from them automatically.
- Each mergeable change requires tests, browser smoke checks and the repository review gate.
- Production installation must have an explicit canary and rollback procedure and must not leak `app.ini` secrets into skin-owned backups.

## GitHub keyboard parity

- `docs/hotkeys.md` is the normative parity matrix against current GitHub keyboard documentation.
- Every GitHub shortcut whose intent has a safe Forgejo equivalent should use the same key chord and activate an existing native same-origin link/control.
- Page-specific `?` help must be generated from controls actually available on that page and under the current permissions; unavailable commands are not advertised as working.
- `S` and `/` focus the best visible native search; `Cmd/Ctrl+/` focuses issue/PR list search where that GitHub shortcut applies.
- Repository `G` sequences include Code, Issues, Pull requests, Actions, Notifications and Actions workflow source where Forgejo exposes the destination.
- File shortcuts include finder, line, ref selector, permalink, blame and edit when the server renders permission for the action.
- Issue/PR filter and detail shortcuts must open the existing author/label/milestone/assignee/reviewer controls instead of reimplementing their logic.
- Actions shortcuts must reuse the native workflow link and log settings menu; notification shortcuts must reuse native read/unread actions.
- Editor formatting and quick-submit shortcuts already supplied by Forgejo remain native and must not be shadowed by the skin.
- GitHub commands without equivalent Forgejo semantics remain explicit gaps rather than dangerous approximations: github.dev, Discussions/Security tabs in Forgejo 16.0.3, notification Done/unsubscribe, and product-excluded Wiki/Projects.

## 2026-09-18 delivery requirements

- Retain the genuine Forgejo mark; graphite/gray palette only, no GitHub logo in candidate screens. Historical GitHub references stay unchanged.
- Static Storybook must not depend on a temporary laptop tunnel. Native demo is a separate synthetic instance, not Storybook pretending to be a server.
- Publish actual native desktop/mobile screenshots and distinguish them from reference reconstructions and synthetic contract tests.
- Provide Danny an English, pinned-source, dry-run-first installation and rollback guide.
- Do not send font binaries in handoff bundles. Use installed/system fallbacks; disclose impact on pixel matching.
- Native demo must use a current security-patched release, isolated data, no mail, registration or production runner.
- Private Slack previews are not safe merely because the sender can read the repository. Channel disclosure needs explicit policy; default to a personal authorized view.
- A real Slack app and full keyboard-operated review workflows remain required and are not certified by passing policy/DOM tests.
