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
