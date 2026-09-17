# RFC draft: a stable, administrator-controlled skin contract for Forgejo

**Status:** internal draft; not submitted to maintainers. Acceptance is unknown. This is not a proposal to ship GitHub branding or replace Forgejo's default design.

## Existing capability and remaining gap

Forgejo already supports administrator-installed CSS themes, user appearance preferences, CustomPath assets and template hooks. We should not propose a second theme selector. The remaining problem is that deep customization depends on unstable CSS classes and template structure, making accessible UX extensions expensive to maintain.

## Smallest useful upstream change

1. Document semantic surface, foreground, border, focus, status and diff tokens and their stability expectations. Keep existing variable names as aliases where practical; a DTCG export could be optional, not a mandatory runtime dependency.
2. Add a small set of named extension slots and semantic identifiers for repository navigation, branch selection, file actions, clone controls, issue properties and diff controls. Prefer meaningful `data-ui` / `data-action` contracts to presentation classes.
3. Publish initialization/disposal events for partial page updates and appearance changes. Extensions must be idempotent and restore native DOM when disabled.

A later administrator-installed manifest can declare a skin's identifier, version, compatible UI contract, assets and optional enhancements. Only the administrator can install executable assets; a user can select an already approved skin. No arbitrary JavaScript upload, remote CDN execution, extra API authority or permissions bypass.

## Security and accessibility invariants

Server-rendered permissions, native forms, CSRF and session handling remain authoritative. A skin must preserve labels, focus order, keyboard operation, reduced-motion preferences and access to all allowed actions. Optional enhancements must fail back to native behavior. A broken skin must not block switching back to a native appearance.

## Contribution sequence

Start with a design discussion and concrete maintenance examples from this prototype. First PR: document the theme/hook boundary and compatibility policy. Second: a minimal semantic token/hook addition plus browser tests. Only after feedback consider the manifest and lifecycle interface. Do not begin with a large skin engine or complete template replacement.

## Expected objections and alternatives

Maintainers may reject the support burden, an implied stable frontend ABI, or GitHub imitation. Keep the proposal forge-neutral and useful for accessibility, high-contrast themes and institutional branding. If rejected, retain this external package, exact-version gates and automated smoke checks; upstream merging is not a deployment prerequisite.

## Validation requested from maintainers

Which slots and token names can be supported? What deprecation window is realistic? Is an event contract preferable to DOM identifiers? Should enhancements be separately opt-in? Which contribution channel and test coverage do maintainers prefer?

Sources: [Customization](https://forgejo.org/docs/latest/contributor/customization/), [UI configuration](https://forgejo.org/docs/latest/admin/config-cheat-sheet/), [DTCG format](https://www.designtokens.org/tr/2025.10/format/).
