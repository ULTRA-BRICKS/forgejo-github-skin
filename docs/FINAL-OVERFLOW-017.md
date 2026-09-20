# Final native overflow and whole-Storybook verification — 0.1.7

The final post-deploy browser check caught one native edge case that the geometry-only fixture did not model: Forgejo's real overflow-menu reserves the full width of the Settings item, not just the More control. At 320px, the reserved 101px displaced the active Pull requests tab even though the visible Code + active label fitted. The new mobile-only 32px Settings control keeps its icon and accessible name while allowing Forgejo's own overflow algorithm to place the active destination. The item remains in the native overflow menu when appropriate; its links and event handlers are unchanged. A real authenticated 320px browser check reproduced the failure and verified the fix.

A separate sweep of every published Storybook story at 320px and desktop found two additional overflows: the compact-preview gallery's 320px minimum grid column, and the older Micro interactions sample's fixed-width popover. Both layouts now honor the available container width. No source preview image dimensions were reduced to mask these problems.

`storybook:test` now discovers every story in the built index and checks both 320px and 1280px, reporting every render/error/overflow rather than testing only selected families at 390px. The existing Chromium/WebKit pixel and interaction suites remain separate.

Versioned assets are regenerated and the final release is installed through the same declarative glide-infra workflow. Completion requires rerunning the native verification on the installed release and rerunning the complete Storybook sweep on the published alias.

The smoke sweep uses four concurrent pages with shared contexts/cache per width and waits for a rendered root plus bounded font/frame readiness instead of a network-idle delay. Image-only and SVG-only stories are valid. The Settings regression test reproduces both the old failed width reservation and the new visible active destination; final acceptance additionally runs against Forgejo’s actual custom element on the installed server.
