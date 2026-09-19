# Preview layout and repository header correction

Tracking: issue #28. Source baseline: 63d35b4.

## Reproduction

The previous preview height was changed from 224 to 136 logical pixels while code baselines remained 99, 115, 131, 147 and 163. The footer moved to 122, causing overlap and clipping. Repository activity and PR details also kept their old coordinates.

The new browser regression failed on the baseline: lines 15 and 16 extended outside the SVG viewBox. The earlier tests checked string fragments and dimensions, not the bounds of rendered content.

## Change

The SVG, raster viewport and Open Graph dimensions share one layout function. Standard fact cards are 480 × 136. Five-line file excerpts reserve 480 × 160; shorter excerpts remain compact. One SVG text run per line preserves whitespace and lets the browser lay out highlighted tokens. Unavailable/missing resources emit no placeholder image.

The repository header has 16px icons inside 32px controls, without a brand mark. The genuine Forgejo mark is in the footer. Native navigation and account controls retain their existing handlers and can be restored when the theme changes.

## Acceptance

`npm run test:preview-layout` exports real production PNGs, verifies text bounds, five code rows, a separate footer, PNG dimensions and alpha, and composites the exact same bytes onto light and dark backgrounds. This check runs before local preview release activation.

`npm run test:mobile` checks the header, footer, controls, native restoration, menus and pixel regressions in Chromium (320/390/440) and WebKit (440). `npm run storybook:test` checks the published story routes. PNG evidence is synthetic and safe for the public gallery.

The native skin deployment uses the existing `packages/forgejo-skin` installer and `glide deploy bread --on-target --skip-edge`. DNS and tunnel state do not change in this release. The previous OMP deployment session confirmed that this is the operator-supported route.

Post-deploy HTTP acceptance requires `FORGEJO_ACCEPTANCE_IMAGE_PATH` from a freshly published Slack test card. It checks the live PNG response, signature, dimensions and alpha channel in addition to the unavailable-resource 204 response. Zero recorded activity remains valid factual data.
