# Phase 72: Extraction tests - Context

**Gathered:** 2026-04-05 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Focused unit tests for each extracted domain module (workspace-env, workspace-status, workspace-git) that run without real git repos, plus circular import detection verified across the codebase. This phase does not add new functionality, refactor module boundaries, or change observability behavior — it only adds test coverage for the extraction work completed in Phases 69-70.

</domain>

<decisions>
## Implementation Decisions

### workspace-status.ts & workspace-git.ts Test Strategy
- **D-01:** Tests for workspace-status.ts and workspace-git.ts use `mock.module()` to replace `git.ts` imports rather than `_exec` injection, because these modules call git.ts helpers directly (no _exec seam for git calls).
- **D-02:** Use `makeGitMock()` from `tests/helpers.ts` as the mock factory for git.ts, matching the pattern already used in dashboard integration tests.
- **D-03:** Import tested functions directly from their domain module (e.g., `workspace-git.ts`), not through the `workspace-ops.ts` facade.

### workspace-env.ts Test Strategy
- **D-04:** workspace-env.ts tests are mostly pure function unit tests. `mergeEnv`, `buildBaseEnv`, `buildRepoEnv` need no mocking — they are pure data transformations on workspace structures.
- **D-05:** `buildWorkspaceEnv` tests mock `secrets.ts` to avoid real keychain/env resolution. `writeEnvFiles` tests use `makeTmpDir()` for filesystem isolation.

### Test Runner Classification
- **D-06:** New test files using `mock.module()` are automatically classified as integration tests by the custom test runner and run in isolated Bun processes — no manual configuration needed.

### Circular Import Detection (TEST-04)
- **D-07:** Add `madge` as a devDependency and run `madge --circular src/` as a test assertion, matching the ROADMAP success criteria language. If madge has compatibility issues with Bun's module resolution or `@/*` aliases, fall back to a Bun-native dynamic import test.

### Claude's Discretion
- Exact test case selection and coverage depth per module, as long as the REQUIREMENTS test targets (TEST-01 through TEST-04) are satisfied.
- Whether workspace-yaml.ts gets its own test file in this phase or is deferred (not explicitly required by TEST-01 through TEST-04).
- Mock granularity for config.ts reads in workspace-status tests — may use `mock.module()` for config or `useIsolatedConfig()` pattern depending on what's cleaner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Definition
- `.planning/ROADMAP.md` §Phase 72 — Goal, success criteria (test file names, madge --circular, mock expectations).
- `.planning/REQUIREMENTS.md` — `TEST-01` (workspace-env), `TEST-02` (workspace-status), `TEST-03` (workspace-git), `TEST-04` (circular import detection).

### Prior Decisions
- `.planning/phases/69-extract-workspace-env-ts-and-workspace-lifecycle-ts/69-CONTEXT.md` — Env and lifecycle extraction decisions, _exec patterns, facade contract.
- `.planning/phases/70-extract-remaining-domain-modules-and-workspace-ops-facade/70-CONTEXT.md` — Status, git, yaml extraction decisions, dependency direction rules.
- `.planning/phases/71-observability/71-CONTEXT.md` — LogTape wiring decisions (tests should not conflict with logger bootstrap).

### Modules Under Test
- `src/lib/workspace-env.ts` — Env assembly helpers: mergeEnv, buildBaseEnv, buildRepoEnv, buildWorkspaceEnv, writeEnvFiles.
- `src/lib/workspace-status.ts` — Status queries: getWorkspaceStatus, getDirtyWorktrees, getWorkspaceListInfo, detectWorkspaceFromCwd.
- `src/lib/workspace-git.ts` — Git sync ops: syncWorkspace, pushWorkspace, pullWorkspace. Empty `_exec` — uses git.ts directly.

### Test Infrastructure
- `tests/helpers.ts` — `makeGitMock()` (line ~340), `makeTmpDir()`, `makeWorkspaceOpsMock()`, `useIsolatedConfig()`.
- `scripts/test-runner.ts` — Auto-classifies `mock.module(` files for process isolation.
- `.planning/codebase/TESTING.md` — Full testing patterns documentation.

### Existing Test Patterns
- `tests/lib/workspace-ops.test.ts` — Existing behavior tests that cover some env/lifecycle paths through the facade.
- `tests/lib/pull.test.ts` — Example of git operation testing with real repos (this phase tests WITHOUT real repos).
- `tests/tui/dashboard/integ-*.test.tsx` — Examples of `mock.module("@/lib/git", ...)` usage with `makeGitMock()`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `makeGitMock()` in `tests/helpers.ts` — pre-built mock factory returning all git.ts exports as jest-compatible mocks.
- `makeTmpDir()` / `cleanup()` in `tests/helpers.ts` — filesystem isolation for writeEnvFiles tests.
- `useIsolatedConfig()` pattern — redirects HOME to isolate config reads in tests.

### Established Patterns
- `mock.module("@/lib/git", ...)` at file top level — used by dashboard integration tests, auto-triggers process isolation.
- `_exec` object mocking — used for lifecycle.ts and workspace-yaml.ts subprocess injection. Not applicable for git.ts calls in workspace-status/workspace-git.
- Direct module imports in tests (not through facade) — `tests/lib/pull.test.ts` imports from `workspace-git.ts` directly.

### Integration Points
- workspace-status.ts depends on: git.ts (dirty/branch/ahead-behind), config.ts (readWorkspace/readAllWorkspaces), paths.ts (getTasksDir).
- workspace-git.ts depends on: git.ts (fetch/push/rebase/merge), config.ts (readWorkspace), workspace-status.ts (getDirtyWorktrees).
- workspace-env.ts depends on: config.ts (types), paths.ts (getTasksDir), secrets.ts (resolveWorkspaceEnvVars).

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — analysis stayed within phase scope.

</deferred>

---

*Phase: 72-extraction-tests*
*Context gathered: 2026-04-05*
