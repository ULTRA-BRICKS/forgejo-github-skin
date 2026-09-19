# Native Slack and Forgejo acceptance — 19 September 2026

## Verified deployment

The native skin 0.1.5 was installed on bread through glide-infra PR #8, merged revision `368eef2e2ad10730599e5bbc2e96579f5ab4a8b4`, using `glide deploy bread --on-target --skip-edge`. The public script, systemd installer result and authenticated browser all identify 0.1.5. Light/dark mobile and desktop checks confirm the logo only in the visible global footer, 16px navigation icons and working native list controls.

## Slack acceptance and additional entry point

A real paste into the authorized Slack browser converted the Forgejo PR URL into an icon and labeled reference before sending. Open PR and Files navigate to their actual source pages. The ordinary pasted message opens Preview settings; saving Detailed, reopening and restoring Compact passed.

A different case is reproducible: on a message sent using the ChatGPT connector, Slack's own `blocks.actions` request returns `cannot_fetch_function_execution` before our signed receiver is called. The source URL actions work. App Home provides a permanent per-user configuration entry independent of that message execution context. It preserves the existing preview settings and requires no additional bot scopes.

The App Home event is authenticated, coalesced by user and handled by a separate bounded dispatcher. Home refresh bursts cannot fill or delay the durable link queue. Home is derived state and is refreshed when reopened. Opening other tabs does not publish a Home view. Settings submissions are bound to the user and expire; successful Home submissions refresh that user's view. Runtime source credentials never appear in the view.

## Visual coverage

The local Home renderer consumes the exact production `homeView` and `settingsView` payloads. Connected, disconnected, connection-error and dark states have screenshot baselines at mobile and desktop sizes. The active Issues tab now remains visible on phones, and all destinations are reachable through More.

The existing native skin and Slack interaction suites were rerun before changes: 76 mobile checks, 96 Slack checks, 121 sharing tests and 62 rendered Storybook stories passed. New checks and final public deployment receipts are recorded separately after release.

## Primary API references

- https://docs.slack.dev/surfaces/app-home/
- https://docs.slack.dev/reference/events/app_home_opened/
- https://docs.slack.dev/reference/methods/views.publish/

Private Slack screenshots and session data stay in the operator's ignored `.qa/final` directory. Published fixtures contain synthetic content only.
