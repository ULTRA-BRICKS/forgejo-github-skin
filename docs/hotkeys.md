# GitHub keyboard parity

Reference: GitHub Docs `Keyboard shortcuts`, checked 2026-09-18. This matrix is normative for the skin. `?` must describe the shortcuts that actually work on the current page; it must not advertise unavailable commands.

Legend: ✅ skin/native equivalent works · ↪ Forgejo already provides the behavior · 🟡 equivalent exists but parity is still being implemented · — deliberately excluded/no equivalent server feature.

## Site and repository

| GitHub | Intent | Forgejo skin |
|---|---|---|
| `?` | Page-specific shortcut help | ✅ |
| `S` or `/` | Focus search | ✅ focus the best visible native search field |
| `G N` | Notifications | ✅ when the signed-in notification link exists |
| `G C` | Code | ✅ |
| `G I` | Issues | ✅ |
| `G P` | Pull requests | ✅ |
| `G A` | Actions | ✅ when Actions exists |
| `G G` | Discussions | — Forgejo 16.0.3 has no repository Discussions surface |
| `G S` | Security and quality | — no equivalent repository tab in Forgejo 16.0.3 |
| `G W` | Wiki | — product scope explicitly excludes Wiki |

Projects shortcuts are out of product scope. GitHub Releases has no shortcut in the referenced table and Releases are also out of scope.

## Code browsing and editing

| GitHub | Intent | Forgejo skin |
|---|---|---|
| `T` | File finder | ✅ native Forgejo link |
| `L` | Go to line | ✅ accessible dialog + existing line ids |
| `W` | Branch/tag switcher | ✅ native Forgejo selector; ambiguous dual selectors do not guess |
| `Y` | Canonical/permalink URL | ✅ native Forgejo permalink when rendered |
| `B` | Blame | ✅ native Forgejo blame link |
| `E` | Edit file | ✅ only when server rendered edit permission |
| `I` | Toggle diff comments | 🟡 pending exact native control mapping |
| `A` | Toggle diff annotations | 🟡 pending exact native control mapping |
| `.` / `>` | github.dev editor | — no equivalent Forgejo web IDE yet; do not send code to github.dev |
| `Cmd/Ctrl+B`, `I`, `K` in editor | Markdown formatting | ↪ native Forgejo ComboMarkdownEditor already binds bold/italic/link |
| `Cmd/Ctrl+Enter` in comment editor | Submit | ↪ native Forgejo editor handles quick submit |

GitHub's code-cursor shortcuts (`Shift+J`, line menu, symbol selection) depend on GitHub's interactive blob cursor. Forgejo's source viewer does not expose an equivalent cursor model yet, so they remain 🟡 rather than being emulated with fragile DOM state.

## Issue / pull-request lists

| GitHub | Intent | Forgejo skin |
|---|---|---|
| `C` | Create issue | ✅ on issue lists when native New issue exists |
| `Cmd/Ctrl+/` | Focus issue/PR search | ✅ |
| `U` | Filter by author | ✅ opens native author filter |
| `L` | Filter labels | ✅ opens native label filter |
| `M` | Filter milestones | ✅ opens native milestone filter |
| `A` | Filter assignee | ✅ opens native assignee filter |
| `O` / `Enter` | Open selected issue/PR | 🟡 only acts when focus is already inside a concrete row; no invented selection model |

## Issue / pull-request detail

| GitHub | Intent | Forgejo skin |
|---|---|---|
| `Q` | Request reviewer | ✅ opens native reviewer selector when permitted |
| `M` | Milestone | ✅ native selector |
| `L` | Labels | ✅ native selector |
| `A` | Assignee | ✅ native selector |
| `X` | Link issue/PR | — Forgejo dependency UI is not semantically identical, so we do not mis-map it |
| `Cmd/Ctrl+Shift+P` | Write / Preview | 🟡 preserve native behavior where the editor exposes it |

## Actions and notifications

| GitHub | Intent | Forgejo skin |
|---|---|---|
| `G F` on Actions run | Workflow file | ✅ uses Forgejo workflow source URL |
| `T` / `Shift+T` | Toggle log timestamps | ✅ via native Actions gear menu |
| `F` / `Shift+F` | Full-screen logs | ✅ via native Actions gear menu |
| `Esc` | Exit full-screen logs | ✅ |
| `Shift+I` on notifications | Mark read | ✅ on the focused/hovered notification when native action exists |
| `Shift+U` on notifications | Mark unread | ✅ on the focused/hovered notification when native action exists |
| `E` mark done / `Shift+M` unsubscribe | GitHub notification state | — Forgejo 16.0.3 has no equivalent per-item states |

## Safety rule

A shortcut may activate only an existing same-origin link or existing native Forgejo control. If permissions, page state, or server features remove that control, the shortcut is a no-op and help marks it unavailable. The skin never fabricates a mutation endpoint, never retries an uncertain mutation, and never steals character keys while the user is typing, composing IME text, or using an editor.

## Native focus and interruption regression coverage

The skin cancels a pending `G` sequence on Escape, editable/modal focus, composition,
modified or already-handled keys, repeated keys, hash/history navigation, native
HTMX swaps and any pointer press (mouse, touch or pen). The press is observed in the
capture phase only, so the native control it hits keeps its handler, default action
and focus; this matters for a native file-line click, which only calls
`history.pushState` and fires neither `hashchange` nor `popstate`. Keyboard-activated
controls already end the sequence through their own key.

Modified `?` is not a help command. Escape does not override composition,
an event already handled before capture or a native modal, including a modal opened
inside an inert wrapper. Native input Escape handlers run before the skin's dismissal
fallback; closing an inner filter keeps the outer disclosure open. Deferred focus
repair preserves usable native focus choices, but restores the trigger when focus
is left on the body or in the closed menu—even when native branch Escape cancels
the key. Help and `W` both resolve a focused branch selector, or the sole usable
selector when there is no focused one; an ambiguous unfocused pair is unavailable.
Dropdown ownership and shortcut activation share the same rendered, hidden/inert
and disabled-control eligibility rules, so a CSS-hidden inner menu cannot prevent
Escape from closing the outer disclosure.

Creating an issue requires the server-rendered, usable New issue link. The skin never
derives `/issues/new` from the Issues tab. Help excludes hidden, inert and disabled
controls, including disabled ancestor fieldsets.
Go-to-line is available only when a rendered line is usable. A hidden or collapsed
destination keeps the line form open with an unavailable-line message rather than
claiming successful navigation.

`scripts/verify-native-parity.mjs --candidate` exercises the real public Forgejo
branch and author selectors with this worktree's skin assets. It selects a slash
containing branch and an author through the native keyboard model, preserves the
filter query, and checks Escape closure and focus return. This is read-only native
candidate proof, not a deployed result or authenticated comment/review proof.
Collapsed mobile file actions remain listed when their native links are usable;
opening help does not leave the disclosure open. Hidden, inert or disabled links
remain unavailable. The candidate probe fails closed on missing skin assets and
requires both `skin.mjs` and `skin.css` to be locally fulfilled for every case.

The script's default dataset is this repository's `rig/tracked-files-task-route` branch and
`alex-mextner` author. `PARITY_BASE` and `PARITY_EVIDENCE` select the endpoint and
artifact directory; an alternate endpoint must expose the same synthetic/read-only
test data. It never submits comments, reviews, approvals or merges.
