# Phase 81: Workspace and Git Operation E2E Coverage - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the highest-risk workspace lifecycle and git-operation behavior through real CLI subprocess tests in isolated config homes and disposable repositories. This phase covers create/clone side effects, env/hooks/cwd/path handling, workspace status/open/run/output contracts, clean/remove/rename behavior, and real remote-backed merge/pull/sync/push guard logic.

This phase is about proving existing workspace and git behavior with real repos and real command execution. It is not about driving excluded interactive wizard UX directly, inventing a second test framework, or broadening coverage into non-workspace command families, TUI flows, or external integrations.

</domain>

<decisions>
## Implementation Decisions

### Create and clone proof strategy
- **D-01:** Create and clone coverage should use pre-built fixtures to bypass excluded interactive wizard UX while still verifying real side effects such as workspace YAML, branch starting points, task/main path persistence, and created worktree layout.
- **D-02:** Do not spend Phase 81 effort trying to brute-force interactive create/clone wizard flows in subprocess tests. Prove the resulting behavior instead.

### Scenario granularity
- **D-03:** Structure Phase 81 as smaller risk-focused scenarios grouped by behavior domain, not a few giant end-to-end workspace journeys.
- **D-04:** Inventory-to-test mapping should attach to those risk-focused flows (create/clone branch selection, env/hooks/cwd, status/open/run contracts, cleanup/rename/remove, remote-backed git operations) rather than exploding into one brittle mega-scenario.

### Git topology realism
- **D-05:** Merge, pull, sync, and push coverage must use disposable local bare remotes plus real clones/worktrees, not simplified single-repo approximations.
- **D-06:** Dir repos, dirty repos, missing remotes/upstreams, and branch-start assumptions must be proven against real filesystem and git state rather than mocks.

### Probes for hidden execution context
- **D-07:** Env, hook, cwd, and path behavior should be proven with probe scripts/hooks that write verifiable artifacts into temp dirs/repos.
- **D-08:** Prefer artifact-based proof over stdout-only assertions when validating hidden execution context.
- **D-09:** Reuse Phase 80 harness behavior for diagnostics: passing tests stay quiet by default; failures surface rich debug context with a curated, redacted env subset.

### Claude's Discretion
- Exact test file boundaries and grouping, as long as the suite stays risk-focused instead of becoming a monolithic journey suite.
- Exact helper names and whether new probe helpers live directly in `tests/helpers.ts` or in nearby test-support files that still extend the Phase 80 harness layer.
- Exact artifact formats and probe-script implementations used to prove cwd/env/hook/path behavior.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and upstream context
- `.planning/ROADMAP.md` §Phase 81 — goal and success criteria for workspace and git-operation E2E coverage.
- `.planning/REQUIREMENTS.md` `E2E-08` and `E2E-14` — required workspace-flow coverage and the highest-risk assumptions that must be falsified.
- `.planning/STATE.md` — milestone decisions about non-TUI scope, split test-runner architecture, shared helper direction, and the workspace/git assumptions this milestone targets.
- `.planning/phases/80-e2e-cli-harness-and-living-inventory/80-CONTEXT.md` — locked Phase 80 decisions about shared harness primitives, flow-level inventory IDs, and failure diagnostics.

### Existing test architecture and patterns
- `CLAUDE.md` — required test commands and the constraint to use the custom runner rather than `bun test tests/`.
- `.planning/codebase/TESTING.md` — current test-runner split, fixture/helper patterns, and isolated-process expectations.
- `tests/helpers.ts` — existing temp-dir, git-env, isolated-config, and repo fixture primitives that Phase 81 will extend.
- `tests/commands/run-parallel.test.ts` — current workspace command subprocess pattern across multiple repos.
- `tests/commands/status-json.test.ts` — current real workspace YAML + git repo fixture pattern for JSON contract assertions.
- `tests/commands/env.test.ts` — current env-sensitive CLI subprocess assertion pattern.
- `tests/commands/sync-json.test.ts` — current local-remote git fixture pattern relevant to remote-backed workspace git operations.

### Production surfaces under test
- `src/commands/workspace.ts` — command wiring and flag surface for workspace lifecycle and git operations.
- `src/lib/workspace-ops.ts` — workspace lifecycle behavior and side effects.
- `src/lib/workspace-git.ts` — sync/pull/push behavior and per-repo result handling.
- `src/lib/workspace-status.ts` — status/list/cwd-detection behavior relevant to CLI assertions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/helpers.ts` already provides `makeTmpDir`, `cleanup`, `getTestGitEnv`, `gitExecOptions`, `applyTestGitEnv`, `makeGitRepo`, and `useIsolatedConfig`, which cover most of the disposable filesystem and git-home setup this phase needs.
- Existing command tests already use real CLI subprocesses via `Bun.spawnSync(["bun", "run", "src/index.ts", ...])`; Phase 81 should extend that pattern, not replace it.
- `tests/commands/sync-json.test.ts` and similar command tests already demonstrate local git remote fixture setup that can be extended into richer merge/pull/sync/push scenarios.

### Established Patterns
- Command-level E2E-style tests live in `tests/commands/` and run in isolated per-file processes via the custom runner.
- Existing tests build real config directories and real workspace YAML fixtures on disk, then assert on stdout/stderr, JSON output, and filesystem side effects.
- The project already uses explicit env shaping (`GIT_STACKS_CONFIG_DIR`, isolated `HOME`, git config overrides) to keep subprocess tests hermetic.
- Local helper wrappers standardize process invocation, while assertions stay close to each test case.

### Integration Points
- `tests/helpers.ts` is the main extension point for reusable workspace/git E2E harness helpers and probe-script builders.
- `tests/commands/` is where the Phase 81 scenarios will land and where Phase 80 inventory IDs will start mapping to concrete coverage files.
- `src/commands/workspace.ts` is the user-facing command surface whose flag ordering, command routing, and output contracts the tests must exercise.
- `src/lib/workspace-ops.ts`, `src/lib/workspace-git.ts`, and `src/lib/workspace-status.ts` are the internal behavior layers whose side effects the subprocess tests must prove through the CLI.

</code_context>

<specifics>
## Specific Ideas

- Treat create/clone proof as fixture-driven side-effect verification, not wizard automation.
- Use real bare remotes and real repo state transitions wherever git assumptions are part of the behavior under test.
- Make hidden execution context observable through probe hooks/scripts that leave behind files or structured artifacts rather than relying on fragile console matching.
- Keep the suite sliced by risk domain so failures point to one assumption class at a time.

</specifics>

<deferred>
## Deferred Ideas

- Directly driving interactive `new`/`clone` wizard UX in subprocess E2E tests.
- A monolithic “full workspace journey” suite as the primary coverage model.
- Mock-heavy substitutes for remote-backed git operation proof.

</deferred>

---

*Phase: 81-workspace-and-git-operation-e2e-coverage*
*Context gathered: 2026-04-10*
