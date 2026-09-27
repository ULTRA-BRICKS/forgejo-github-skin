/** Real ultrabricks repositories (captured read-only from the public org profile page,
 * git.hyperide.ai/ultrabricks, 2026-09-27) — used only as realistic test-double/demo content for
 * organization-page.mjs (Storybook) and tests/mobile/organization.spec.mjs (Playwright); the
 * production `organization.mjs` enhancer never fabricates data itself. Single source so the two
 * consumers can't silently drift apart. Pure data, no DOM/CSS imports, safe to import from Node. */
export const REPOS = [
  ['ultrabricks/rig-cli', 'Python', 'Dev-environment umbrella driver: set up a repo from a committed rig.yaml — apply agent-tools skills, hooks, CI gates & MCP, reconcile drift', ['agents']],
  ['ultrabricks/forgejo-github-skin', 'JavaScript', 'GitHub-familiar UI/UX overlay for Forgejo: measured references, DTCG tokens, opt-in skin and compatibility checks', []],
  ['ultrabricks/forgejo-search', 'Python', 'Permission-aware hybrid file, symbol, text and AST search for Forgejo', []],
  ['ultrabricks/omp-accounts', 'TypeScript', 'Multi-account management extension for omp (Oh My Pi): list, pin, quota-aware rotation, per-model ceilings', []],
  ['ultrabricks/vecli', 'TypeScript', 'Standalone vecli vector DAG, parametric source and WASM backends; extracted with provenance', []],
  ['ultrabricks/agent-tools', 'Python', 'Portable agent skills, agent & git hooks, CI gates & MCP slots for AI coding agents', ['agents']],
  ['ultrabricks/oh-my-pi', 'TypeScript', 'Coding agent with the IDE wired in', []],
  ['ultrabricks/tg-cli', 'TypeScript', 'Simple Telegram CLI to send messages, photos & files — and a two-way agent bridge', ['agents']],
  ['ultrabricks/tasks-app', 'JavaScript', 'Task tracking application', []],
  ['ultrabricks/stt-cli', 'Python', 'Speech-to-text CLI for macOS: any audio/video to text, VAD-gated, hallucination-scrubbed', []],
  ['ultrabricks/dev-cli', 'Python', 'Project-scoped dev/e2e process runner', []],
  ['ultrabricks/pm-cli', 'Python', 'Process management CLI', []],
  ['ultrabricks/review-cli', 'Python', 'Agentic multi-model code-review board with priority-ordered failover, brainstorm/quorum, spec-web & dashboard', ['agents']],
  ['ultrabricks/harness-cli', 'Python', 'Harness orchestration CLI', []],
  ['ultrabricks/research-cli', 'Python', 'Multi-provider research CLI', []],
];
