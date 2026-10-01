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

## Organization overview and repositories

- Overview shows viewer-visible statistics and activity before a ten-row repository preview (or all rows when fewer exist), one View all repositories link, then recent activity. Repository pagination is hidden on Overview.
- Profile activity loads once on the first Overview visit. The session-aware `/org/<name>/dashboard` supplies native activity markup and its embedded heatmap data; authenticated API tokens are neither requested nor stored. When that dashboard is inaccessible or redirects to login, the public activity endpoint supplies a clearly labelled public-only calendar bounded to the latest 100 events. Repository-only navigation requests neither source; unavailable calendar data does not discard usable activity links.
- `#repos` keeps native repository search, filters, sorting, links and pagination while hiding overview statistics, activity and sidebar. `#overview` restores context; browser Back/Forward does not duplicate native nodes.
- Native `q`, `page`, `sort`, `language`, `archived`, `fork`, `mirror`, `template` and `private` query parameters select the repository view when no hash is present. Tracking and Storybook parameters do not. An explicit overview hash takes precedence without discarding query state.

## Activity disclosure

- Organization and personal native activity keep their original order and links. Organization activity follows the repository preview; personal dashboards retain their native layout.
- Event icons are 16px. Comments overflowing the browser-resolved `3lh` preview receive Show more/Show less with `aria-expanded`; images, media and download attachments stay completely hidden while collapsed.
- Imported comment images use native lazy loading before insertion, retaining their original `src`/`srcset`, so collapsed screenshots do not download eagerly.
- Clipped or attachment-only interactive descendants, including linked-image-only comments with zero-height previews, are inert until expansion. Protection transfers when a native control moves between collapsed comments. Visible preview links stay usable; expansion and teardown restore original native controls.
- Re-enhancement decorates newly inserted or reinserted rows without resetting retained expanded comments or duplicating disclosures. A comment moved to another native row keeps its existing disclosure beside the body and retains its expanded state. Hidden comments are measured when shown; each body is observed so column-width changes also refresh initially short comments. Native details and layout, focusability or attachment attribute changes refresh clipping. Dirty rows are clamped together, measured together, then updated, without remeasuring unchanged rows on unrelated repository updates. Replaced bodies, removed rows and moved controls release their owned state; retired disclosures release their click handlers, and teardown restores original icon dimensions and focusability.
- Removing an activity feed disposes its observers and decorations without requiring another enhancement pass; unrelated document mutations do not remeasure retained rows.

## Compact pagination

- Only centered Previous/Next appear initially. Wings reserve their complete geometry but are invisible, inert and pointer-disabled; no hidden More pages tab stops exist.
- Pointer or keyboard-focus dwell reveals at 2000ms, not 1999ms. The countdown continues while either input remains inside; entering with another input does not restart it. Leaving with both inputs cancels; moving between controls preserves focus dwell. Touch long-press uses the same timer. Reveal changes visibility/opacity, never element rectangles or document height.
- A revealed tab session stays revealed. Revealing one classic region cancels outstanding dwell in sibling regions. The local habit counter increments once per genuine session reveal; after three sessions a new session reveals immediately on hover. Storage failures fall back to the shared document-local mirror.
- Current-page and duplicate destinations are omitted. The Vue adapter uses the current native page, active filtered count and configured native page size to recognize duplicate First/Last controls; it never invents totals when those inputs are unavailable. Delayed or corrected native counts refresh Last on the existing pager without resetting its reveal controller.
- Classic activity/history/list pages relocate native anchors; dashboard repository pagination decorates Vue anchors in place. Organization Overview hides the repository pager; focused repositories retain its sole native/enhanced owner.
- Dashboard `repo-search-*` queries select the focused repository view. When native Vue query updates replace the URL, an explicitly selected organization hash is retained in that same history entry without discarding filters or adding duplicate entries. A hashless view follows the updated native query on re-enhancement.
