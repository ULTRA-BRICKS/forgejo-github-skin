# Forgejo UI — experience contract and acceptance gates

**18 September 2026 · target behaviour, not a completed-feature checklist**

The canonical source remains `git.hyperide.ai/ultrabricks/forgejo-github-skin`.
This document defines what to implement and demonstrate there. The accompanying
supplemental code provides packaging, palette adaptation and part of the preview
security logic; it does not establish that all behaviours below already work.

## 1. Identity and visual hierarchy

Retain the genuine Forgejo mark. Use graphite/grey on light surfaces, a legible light
variant on dark surfaces, and the same silhouette in navigation, favicons, app icons
and share cards. Do not use the GitHub Octocat as our mark. Recolouring an existing
asset is not permission to replace its geometry with an invented lookalike.

The current package supplies a palette-only CSS/JS layer and a staging adapter for
old Storybook fixture logos. It deliberately needs the operator's original Forgejo
SVG. It does not contain a generated logo, modify reference screenshots, or install
new production favicons. Source-component consolidation and favicon/PNG derivatives
are additional work, to be reviewed at 16/32 pixels as well as larger sizes.

Keep GitHub-familiar hierarchy and density, not GitHub's logged-out marketing header.
The signed-in shell must contain repository/workspace navigation, real search and
account controls. No decorative action should pretend to navigate, save or approve.
Keep excluded product areas out of this skin's primary navigation without deleting
their underlying server features or stored data.

Use semantic tokens for surfaces, borders, selected/focus states, text, danger and
success. Support light, dark and OS-following mode. Do not represent status using
colour alone. Long repository names, branch names, translated labels and file paths
must wrap or truncate deliberately, with an accessible way to read the full value.

## 2. Complete keyboard operation is more than a shortcut table

GitHub's documented shortcuts are the starting vocabulary, not a complete acceptance
certificate.[1] Use the existing native Forgejo action whenever it has the same meaning.
A shortcut must never invent an action absent from the permission-rendered interface.

The source implementation should have ONE command registry containing intent, context,
key chord, target resolver, availability and help label. Dispatch, hints, a future
command palette and `?` help must consume that same registry. Use actual visibility,
interactivity and permission state, not just `querySelector` existence. A disabled
control may remain visible with an explanation, but must not be advertised as executable.

**Required navigation contract.** Tab/Shift+Tab reaches every ordinary control in a
predictable order; the first useful stop is a skip-to-content link. Menus support the
appropriate arrow/Home/End model, opening focus, selection and Escape restoration.
Dialogs trap focus only while modal and restore it to their invoker. Do not trap users
in an editor or steal keys from native browser/screen-reader commands. Browser Back
must restore route, filter, scroll and focus meaningfully where possible.

**Required command contract.** Repository navigation, search, file finder, line jump,
ref selector, immutable permalink, blame and edit must work under their real contexts.
Issue filters and issue/PR sidebars must open and finish their native selector flow,
not merely fire a click. Keyboard-only review must reach diff hunks, add/edit a comment,
select review type and explicitly submit without accidental approval or merge.

**Proposed enhancement:** a searchable command palette outside editors. `Cmd/Ctrl+K`
inside a Markdown editor belongs to native link insertion and must remain there.
The palette should expose only commands that actually work now, and show alternatives
for unavailable server features rather than navigate to a dead route. This palette is
an acceptance target, not implemented by the supplied handoff assets.

Character commands must respect the opt-out, native dialogs, focused editables,
contenteditable ancestors, IME composition, already-handled events and repeat. Clear
prefix sequences on modal opening, route changes, typing and timeout. Do not interpret
unassigned Shift+letter combinations as their lowercase command. Verify non-Latin
layouts explicitly; do not claim Cyrillic support from an English-keyboard test.

**Five end-to-end keyboard demonstrations:**

| Scenario | Required proof |
|---|---|
| Search → repository → branch → file → line | Correct routes, focus, selected line and preserved branch identity; escaped slash in a ref covered |
| Issue list → author/label filter → issue → comment | Open, operate and close native selectors; filter query preserved; one intentional submission |
| PR → Files changed → hunk → review comment → submit | Actual saved review visible to a second authorized account; no accidental approve/merge |
| Notifications → target item → read/unread | Correct item; no action behind a modal or while character shortcuts are disabled |
| Error/permission loss → recover → retry or cancel | Draft retained; useful error; no duplicate mutation; focus returns to the failed control |

## 3. Motion, feedback and small details

Use animation to explain state changes, not to delay work. Proposed budget: roughly
100–160 ms for colour/opacity and a subtle menu transition. Avoid bounce, large zoom,
layout-jumping table transitions and animated code while someone is reading it.
`prefers-reduced-motion` disables nonessential movement. The desired result must remain
understandable without animation.

For remote operations, distinguish idle, pending, succeeded, failed and retryable states.
Only announce success after confirmation. Loading must not remove the action's label
or jump its dimensions. Retain form content when requests fail; avoid infinite spinners.
Use a concise status/live-region message rather than repeated intrusive toasts.

Small details are part of acceptance:

- Copy buttons report success only after clipboard completion, expose a selectable
  fallback on failure, and never silently lose the selected line/range or immutable SHA.
- “Copy link” offers the appropriate stable permalink. A ref name containing `/`, an
  encoded path, an issue comment or a multiline selection must not change meaning.
- Unsaved comments survive failed submits and route-change confirmation. Shared-device
  draft persistence needs an explicit retention policy; private content is not silently
  retained forever in local storage.
- Hovercards/tooltips also open by focus, dismiss by Escape and do not obstruct a target.
  Disabled controls explain why. Changing theme does not lose text or selected rows.
- Back from an issue/PR returns to the same filtered list and useful position. Selected
  files, counts and review state reflect server truth, not optimistic decorative numbers.
- Touch targets aim for 44×44 CSS pixels where appropriate. Tables/code may scroll
  within their container; the entire mobile page must not acquire horizontal overflow.

## 4. Link previews: public metadata and protected content are different products

**Public-card design target:** useful entity title; repository; object type/number;
status when available; a short human-readable excerpt; original destination; consistent
Forgejo identity. A proposed PNG share image is 1200×630 with generous margins and
readable type, never a scaled screenshot of an entire application. Plain text must
remain useful when an image is absent.

The metadata must be present in the initial HTTP HTML, not inserted only by browser JS.
Use escaped Open Graph/Twitter title, description, URL and image fields. Classic Slack
previews use crawler-readable metadata; app unfurls are a separate event/API flow.[2]
Define expected behaviour for repository, issue, PR, commit and immutable file links.
A displayed status is a snapshot unless a tested update mechanism actually maintains it.

A general HTTP crawler does not receive the `#fragment` portion of a URL.[3] Therefore
`#L12-L20` alone cannot make an ordinary server-rendered OG image line-specific. Keep
ordinary public file previews generic, or introduce a separately reviewed explicit
public share route carrying a validated immutable SHA and bounded range. A Slack app
can parse the full link it receives, subject to authorization and URL validation.

**Private-card rule:** no private title, author, repository description, filename, code,
diff, status or image may become anonymously retrievable. Do not “solve” bot access by
making a private image endpoint public, adding bearer tokens to a URL or bypassing auth
for a crawler user agent. A login response itself must have generic metadata.

The supplied parser intentionally accepts only configured HTTPS origins and reviewed
route shapes, rejects query-bearing/credential-bearing URLs, and bounds file excerpts
to 50 lines. Branch links currently require an immutable permalink; Actions/wiki/release
previews are not implemented by that parser. Additional routes require tests, not a
catch-all arbitrary URL fetch. See `slack/SECURITY-AND-INTEGRATION.md`.

## 5. Acceptance matrix before a “ready” claim

| Gate | Concrete evidence | Current handoff status |
|---|---|---|
| Original Forgejo brand | Real header/favicon/share-card captures in both themes | Palette adapter only; no production capture |
| Stable gallery | External browser renders, assets load, survives service/host restart | Deployment files and smoke script; not deployed |
| Real Forgejo demo | Actual repository, issues and PR, separate database and accounts | Compose candidate; Docker runtime not executed |
| Keyboard-only product flows | All five scenarios above on real server with persisted effects | Must run; synthetic prior tests are not this proof |
| Browser and viewport coverage | Chromium, Firefox, WebKit; 320/390/768/1440; actual iPhone check | Must run |
| Accessibility | Visible focus, names, modal focus return, reduced motion, screen-reader smoke | Target and manual/automated gates; not certified |
| Permission correctness | Visitor, member, reviewer, admin and a denied account | Must run on dedicated demo |
| No-script fallback | Repository links and native forms remain usable without skin JS | Must run on dedicated demo |
| Public previews | Initial HTML plus real messenger-rendered cards, no duplicate/conflicting OG tags | Design target; not implemented by this package |
| Private Slack personal view | Clicker auth, fresh access check, no channel metadata leak | Pure core tested; backend and workspace test outstanding |
| Deliberate private channel copy | Approved tuple, consent, no Slack Connect, disclosure label | Policy core tested; mode disabled by default |
| Upgrade/rollback | Exact-binary compatibility and native-theme restore without data loss | Operator procedure; live proof outstanding |

Track tests against the release commit, image digest and source fingerprints. Keep
screenshots and replay steps next to the PR. Raw pixel matching against a different
repository's changing content is not a percentage of product completion.

“Better than GitHub” should mean demonstrably fewer mistakes and friction in these
workflows: discoverable commands, no focus traps, no lost drafts, predictable share
permissions, good mobile density and stable deployment. No comparative performance or
usability advantage has been measured in this handoff.

## Sources

[1]: https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts
[2]: https://docs.slack.dev/messaging/unfurling-links-in-messages/
[3]: https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment
