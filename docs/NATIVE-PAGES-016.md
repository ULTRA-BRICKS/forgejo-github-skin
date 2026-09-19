# Mobile repository pages and reliable skin refresh — 0.1.6

## Reproduced on the running instance

On the 0.1.5 release, the organization's Members and Teams appeared ahead of the repository list on mobile. The source uses a reversed stackable grid. The updated mobile layout keeps New repository / New migration first, lists repositories next and moves the supporting sections below them. Desktop order is unchanged.

The pull-request Conversation / Commits / Files changed tabs clipped on 320px and 440px screens. The mobile layout now allocates three bounded cells and retains each original link and count. The active repository destination stays visible after Code; less frequent destinations remain in Forgejo's existing overflow menu. Native keyboard/event handlers remain authoritative.

The live theme stylesheet returned `Cache-Control: public, max-age=21600`. Its URL is unversioned, while its imported skin path changes by release. A user could therefore receive a new JavaScript footer and stale CSS for six hours. The loaded module now adds one theme stylesheet URL pinned to its exact release. It preserves AppSubUrl, switches with the selected registered theme, disables itself for other themes and asks Forgejo's existing overflow components to recalculate after CSS loads.

## Expanded visual coverage

Storybook now includes interactive organization overview, public-only view, dark, loading and empty states; issue detail covers open, closed, no comments, long titles, dark, loading, access unavailable and source-error retry. Repository search/filter/sort, Follow, local discussion submission and retry are exercised with synthetic fixtures. Local comments never call Forgejo.

Pixel baselines cover Chromium at 320/390/440px and WebKit at 440px. Assertions check actual dark backgrounds, active mobile navigation, source-link preservation, no horizontal clipping, theme release refresh and native organization order. Baselines were inspected before acceptance; generating snapshots alone is not a pass.

## Deployment

The application build contains the versioned CSS/JS. `glide-infra` vendors the merged build byte-for-byte, then `glide deploy bread --on-target --skip-edge` installs it declaratively. Run `scripts/verify-native-skin.mjs` and `scripts/verify-native-pages.mjs` after rollout to check the real authenticated instance, including the version-pinned stylesheet.

These are regression and native layout checks, not a claim that all Forgejo pages are pixel-identical to GitHub. Product-specific controls and permissions are retained.
