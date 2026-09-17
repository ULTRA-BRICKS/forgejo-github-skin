# Interaction and feedback specification

This document turns UI polish into explicit behavior. Native Forgejo permissions and server responses always win over decorative state.

## Universal control states

| State | Visual | Behavior |
|---|---|---|
| Rest | Primer-like border/background/text | Stable hit target |
| Hover | Short color/border transition | Pointer-only enhancement |
| Focus-visible | 2 px accent outline with separation | Keyboard location is unambiguous |
| Active | Darker/pressed surface, no layout shift | Fires once per activation |
| Disabled | Reduced emphasis, not just lower opacity | No activation or misleading tooltip |
| Loading | Spinner/progress near label; stable width | Prevent accidental duplicate submit when required |
| Error | Danger icon + concise text | Preserve context/input; retry if safe |
| Success | Check icon + concise confirmation | Only after authoritative success |

## Repository tabs

- Active tab uses icon, label weight and underline; hover never masquerades as active.
- Keyboard activation follows ordinary anchor semantics.
- On mobile, first-level tabs scroll/overflow predictably; selected tab remains visible.
- Route changes retain repository/ref context and native browser history.

## Code / clone disclosure

1. Trigger is a green `Code` button with chevron and accessible expanded state.
2. Opening keeps the panel visually attached to the trigger; initial focus remains sensible for pointer and keyboard users.
3. Existing protocol tabs, clone URL, copy action and download actions remain native Forgejo controls.
4. Escape closes the panel and restores focus to the trigger. Outside click closes without submitting anything.
5. Copy success announces `Copied` transiently; copy failure displays an actionable error without changing the URL field.
6. On mobile the panel may use a bottom-sheet geometry, but it must remain reversible and not trap the user unexpectedly.

## Branch / ref switcher

- `w` invokes the native branch control only when it is visible and enabled.
- Opening exposes search immediately; arrow keys and Enter remain native component behavior.
- Loading remote branch data shows progress inside the popover, not as a page-level blocker.
- Empty search says that no branch/tag matches; creation actions appear only when the server says creation is allowed.
- Changing ref updates breadcrumbs/file content without losing the ability to go Back.

## File browser and source view

- File rows retain independent anchors for filename and commit metadata.
- Hover can highlight the row; keyboard focus belongs to actual links/buttons.
- `t` goes to the native file finder; `b` and `e` only act when server-rendered links exist.
- `l` opens go-to-line; invalid/nonexistent lines keep the dialog open and show a live status message.
- Source and diff regions own horizontal scrolling. The document must not widen.
- Long operations use skeleton/indicator rows with stable heights rather than blank disappearing panels.

## Issues and pull requests

- Filter/search submissions show local progress and keep entered query text.
- No-results states show active filters and a clear way to reset them.
- Comment submission disables duplicate submission while in flight, preserves the draft on failure and only clears after confirmed success.
- Reactions, labels, assignees and review actions show pending/error states without optimistic lies.
- PR tabs (Conversation / Commits / Checks / Files changed) keep counts and current selection stable across reloads.
- Diff file collapse/expand, viewed state and line comments must not lose scroll position unnecessarily.

## Mutating operations

- Merge, close/reopen, delete, rerun, cancel and permission changes are never implemented by the skin itself unless a native Forgejo control already exposes the action.
- A network timeout is an `unknown` outcome; do not auto-retry mutations.
- Error copy distinguishes permission denial, validation errors, conflict/state changes and connectivity failures when Forgejo exposes that distinction.
- Destructive confirmation dialogs identify the object/action and make Cancel the safe escape path.
