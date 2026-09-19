# Native preview review disposition

Tracking: issue #7. First reviewed source checkpoint: c5331e5. The staged source review found three issues; each is covered by a failing-before/passing-after regression.

1. Private summaries carried development counts and CI details despite the title/status contract. The serializer now has an explicit identity/status/visibility allowlist and suppresses private timestamps. The test inspects the complete serialized Work Object, not only a presentation fragment.
2. Five source links were resolved serially. Resolution now has a concurrency cap of three, preserves original ordering, and isolates failures; successful companions are delivered even when a retryable source fails. The delayed-client test asserts actual peak concurrency, not a fragile elapsed-time threshold.
3. A detail response was marked complete before Slack accepted it. Processing and completion are distinct; transient failures get one bounded retry and unsuccessful attempts release their marker. Tests cover overlapping duplicate delivery, transient recovery and subsequent retry after failure.

Actual browser acceptance also found a native-skin defect: Forgejo renders a hidden-dialog footer before its page footer. The logo enhancer now selects the page footer explicitly; the test reproduces both footers and asserts that the visible page footer receives the mark. The versioned skin is 0.1.5.

Public image locators preserve current-visibility checks. No private content is stored in a durable image snapshot. Old links are resolved through their source URL again before any cached bytes are returned.
