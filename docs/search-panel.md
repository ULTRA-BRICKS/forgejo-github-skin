# Universal search panel

The panel has one fixed query row, followed by status, optional coverage details and
one scrolling result list. The scope control sits on the left inside the query row.
It replaces the separate horizontal scope strip.

## Scope interaction

The button always names the active scope. Its dropdown lists only the contexts
available on the native page: the current repository, its organization, and
Everywhere. The repository option includes the canonical full repository name.
Long names wrap inside the menu and truncate only on the compact trigger.

Arrow keys, Home and End navigate the menu. Enter or Space selects the focused
choice, retains the query, replaces the outstanding request and returns focus to
the input. Escape first dismisses the scope menu; a subsequent Escape closes
search. Tab returns to the query and Shift+Tab returns to the trigger. A pointer
press outside the menu dismisses it without changing scope or the query.

The dropdown uses the browser popover layer so a short empty/error panel does not
clip it. Its position is clamped to the viewport and follows both window resizing and a
dialog that recenters as delayed results arrive. A dialog-size observer is active
only while the menu is open. Teardown
closes it and removes its listener with the owning search instance.

## Result geometry

Paths, repository metadata and snippets start at the same inset: 12 pixels on
mobile and 16 pixels on desktop. The result kind is secondary trailing metadata,
leaving the full row width available to a two-line code excerpt. The selected row
uses the existing subtle surface and a narrow leading indicator.

The query remains 16 pixels on phones. Focus is shown on the shared query row,
not as a second nested input frame. Forced-colors mode retains a system-color
outline for the query and scope menu choices instead of relying on box shadows. At the narrowest width, the decorative scope
icon gives way to the complete localized label. The scope trigger retains a visible label
and leaves at least 100 pixels for the input at the supported 320-pixel viewport.
The query row never shrinks when the results overflow. Theme colors come from the
existing token set.

## Contracts preserved

Page context, explicit query qualifier precedence, native permission checks,
NDJSON staging and cancellation, manual retry, and native search restoration stay
with the existing universal-search implementation. Styling does not determine
backend readiness or grant access to results.

`search-scope-menu.spec.mjs`, the native search fixtures and Storybook cover the
same production module. Screenshot changes are accepted specifically for this
layout, not as blanket updates to unrelated visual baselines.
