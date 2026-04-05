# Phase 72: Extraction tests - Research

**Researched:** 2026-04-05
**Domain:** Bun test architecture for extracted workspace modules plus circular-dependency enforcement
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Tests for workspace-status.ts and workspace-git.ts use `mock.module()` to replace `git.ts` imports rather than `_exec` injection, because these modules call git.ts helpers directly (no _exec seam for git calls).
- **D-02:** Use `makeGitMock()` from `tests/helpers.ts` as the mock factory for git.ts, matching the pattern already used in dashboard integration tests.
- **D-03:** Import tested functions directly from their domain module (e.g., `workspace-git.ts`), not through the `workspace-ops.ts` facade.
- **D-04:** workspace-env.ts tests are mostly pure function unit tests. `mergeEnv`, `buildBaseEnv`, `buildRepoEnv` need no mocking — they are pure data transformations on workspace structures.
- **D-05:** `buildWorkspaceEnv` tests mock `secrets.ts` to avoid real keychain/env resolution. `writeEnvFiles` tests use `makeTmpDir()` for filesystem isolation.
- **D-06:** New test files using `mock.module()` are automatically classified as integration tests by the custom test runner and run in isolated Bun processes — no manual configuration needed.
- **D-07:** Add `madge` as a devDependency and run `madge --circular src/` as a test assertion, matching the ROADMAP success criteria language. If madge has compatibility issues with Bun's module resolution or `@/*` aliases, fall back to a Bun-native dynamic import test.

### Claude's Discretion
- Exact test case selection and coverage depth per module, as long as the REQUIREMENTS test targets (TEST-01 through TEST-04) are satisfied.
- Whether workspace-yaml.ts gets its own test file in this phase or is deferred (not explicitly required by TEST-01 through TEST-04).
- Mock granularity for config.ts reads in workspace-status tests — may use `mock.module()` for config or `useIsolatedConfig()` pattern depending on what's cleaner.

### Deferred Ideas (OUT OF SCOPE)
None — analysis stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Unit tests for extracted workspace-env helpers without real git repos. | Pure-function coverage for `mergeEnv`, `buildBaseEnv`, and `buildRepoEnv`; no repo fixtures needed. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: src/lib/workspace-env.ts] |
| TEST-02 | Unit tests for extracted workspace-status query functions. | `mock.module()` plus `makeGitMock()` and config mocks match the current dependency seams. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: src/lib/workspace-status.ts] [VERIFIED: tests/helpers.ts] |
| TEST-03 | Unit tests for extracted workspace-git operations using `_exec` mocks. | The roadmap wording is stale; current code and locked context require mocking `@/lib/git` instead of `_exec`. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/ROADMAP.md] [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md] |
| TEST-04 | Circular import detection verified. | `madge` is the standard fit, the CLI works via `bunx`, and the current repo is not yet green because two dashboard cycles exist. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md] [VERIFIED: bunx madge --version] [VERIFIED: bunx madge --circular --extensions ts src/] |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Run the suite through `bun run test`; do not use `bun test tests/` because `mock.module()` contamination across files causes false failures. [VERIFIED: CLAUDE.md] [VERIFIED: scripts/test-runner.ts] [CITED: https://bun.sh/docs/test/mocks]
- Bun executes TypeScript directly and there is no build step for this repo. [VERIFIED: CLAUDE.md]
- `@/*` is a test-only alias; production code under `src/` must keep using relative imports. [VERIFIED: CLAUDE.md] [VERIFIED: tsconfig.json]
- Mock-heavy lib tests are already auto-isolated by `scripts/test-runner.ts`; Phase 72 should rely on that behavior instead of inventing new runner configuration. [VERIFIED: CLAUDE.md] [VERIFIED: scripts/test-runner.ts]
- Modules that spawn subprocesses use mutable `_exec` objects for test injection, but that convention only applies where the module actually owns the subprocess call. [VERIFIED: CLAUDE.md] [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: src/lib/workspace-yaml.ts]
- Existing YAML/config compatibility must be preserved; this phase should add tests and the smallest dependency-cleanup necessary for `TEST-04`, not alter user-facing config formats. [VERIFIED: CLAUDE.md]

## Summary

Phase 72 is primarily a testing phase, but it is not test-file-only: the repo already has broad integration-style coverage for env, status, push, and sync behavior inside `tests/lib/workspace-ops.test.ts`, while the roadmap still requires three focused module-level files that avoid real git repos and real workspace fixtures. [VERIFIED: tests/lib/workspace-ops.test.ts] [VERIFIED: .planning/ROADMAP.md]

The most important planning correction is `TEST-03`: `src/lib/workspace-git.ts` exports an empty `_exec` stub and delegates real work to `./git`, so `_exec.spawn` assertions are the wrong seam for this codebase today. The locked Phase 72 context is correct: tests must `mock.module("@/lib/git", ...)`, use `makeGitMock()`, and import `syncWorkspace` / `pushWorkspace` directly from `workspace-git.ts`. [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md] [VERIFIED: tests/helpers.ts]

`TEST-04` also has real scope impact because `bunx madge --circular --extensions ts src/` currently reports two circular dependencies in the dashboard entrypoint path, so the planner cannot assume the cycle gate will pass after only adding tests. A small dependency cleanup task is required inside Phase 72 unless the roadmap is formally narrowed. [VERIFIED: bunx madge --circular --extensions ts src/] [VERIFIED: src/tui/dashboard/run.tsx] [VERIFIED: src/tui/dashboard/App.tsx] [VERIFIED: src/tui/dashboard/hooks/useMessages.ts]

**Primary recommendation:** Add three focused module test files that mirror the extracted modules, extend `makeGitMock()` to cover all currently imported `git.ts` functions, add `madge@8.0.0` as a devDependency, and include a small dashboard IPC-state extraction task so the circular-dependency gate can actually pass. [VERIFIED: tests/helpers.ts] [VERIFIED: npm registry] [VERIFIED: bunx madge --circular --extensions ts src/]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bun:test` | Bun `1.3.10` installed; npm package latest `1.3.11` published `2026-03-18`. [VERIFIED: bun --version] [VERIFIED: npm registry] | Jest-compatible assertions, mocks, and `mock.module()` for dependency replacement. [CITED: https://bun.sh/docs/test] [CITED: https://bun.sh/docs/test/mocks] | The repo already uses `bun:test`, and the custom runner is built around its process-global mocking model. [VERIFIED: package.json] [VERIFIED: scripts/test-runner.ts] |
| `madge` | `8.0.0`, published `2024-08-05`. [VERIFIED: npm registry] | Circular-dependency detection with `--circular`; supports TypeScript resolution via `tsConfig` when needed. [CITED: https://github.com/pahen/madge] | This matches locked decision D-07 and already works against this repo through `bunx`. [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md] [VERIFIED: bunx madge --version] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tests/helpers.ts` mock factories | Repo-local helper module. [VERIFIED: tests/helpers.ts] | `makeGitMock()`, `makeConfigMock()`, `useIsolatedConfig()`, and `makeTmpDir()` keep tests small and consistent. [VERIFIED: tests/helpers.ts] | Use `makeTmpDir()` for isolated fs writes, `useIsolatedConfig()` when config-path evaluation matters, and module mock factories for `workspace-status` / `workspace-git`. [VERIFIED: tests/helpers.ts] |
| `scripts/test-runner.ts` | Repo-local runner. [VERIFIED: scripts/test-runner.ts] | Auto-classifies files containing `mock.module(` as isolated-process tests. [VERIFIED: scripts/test-runner.ts] | Use the normal repo scripts; do not add ad hoc runner flags or a second isolation mechanism. [VERIFIED: package.json] [VERIFIED: scripts/test-runner.ts] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `mock.module("@/lib/git", ...)` for `workspace-git.ts` / `workspace-status.ts` | `_exec` injection | Rejected because these modules call `git.ts` helpers directly; `_exec` does not own those calls today. [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: src/lib/workspace-status.ts] |
| `madge` gate | Bun-native import smoke test | Keep only as fallback if Madge resolution breaks; the locked context prefers Madge and the CLI already works here. [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md] [VERIFIED: bunx madge --version] |

**Installation:** [VERIFIED: package.json] [VERIFIED: npm registry]

```bash
bun add -d madge@^8.0.0
```

**Version verification:** `npm view madge version time --json` returned `8.0.0` with publish time `2024-08-05T07:49:35.718Z`. [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Project Structure

```text
tests/
├── helpers.ts                  # Shared mock factories and tmp-dir helpers
└── lib/
    ├── workspace-env.test.ts   # Pure helper tests; optional isolated fs tests for writeEnvFiles
    ├── workspace-status.test.ts# mock.module-based status/query tests
    └── workspace-git.test.ts   # mock.module-based sync/push tests
```

### Pattern 1: Pure Function Env Tests

**What:** Keep `mergeEnv`, `buildBaseEnv`, and `buildRepoEnv` as plain data-shape tests using inline `WorkspaceSchema.parse` / object literals and fake paths; do not create repos, temp clones, or config dirs for these three functions. [VERIFIED: src/lib/workspace-env.ts] [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md]

**When to use:** Use this pattern for `TEST-01` and for any future helper that only transforms workspace data into env maps. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: src/lib/workspace-env.ts]

**Example:** [VERIFIED: src/lib/workspace-env.ts]

```typescript
import { describe, expect, test } from "bun:test"
import { buildBaseEnv, buildRepoEnv, mergeEnv } from "../../src/lib/workspace-env"

test("buildRepoEnv layers repo-specific keys over base env", () => {
  const baseEnv = buildBaseEnv(
    { name: "ws", branch: "feat/x", created: "2026-04-05", repos: [] } as any,
    "/virtual/tasks/ws",
    "open"
  )

  const repoEnv = buildRepoEnv(baseEnv, {
    name: "api",
    mode: "worktree",
    main_path: "/virtual/main/api",
    task_path: "/virtual/tasks/ws/api",
  } as any)

  expect(repoEnv.GS_WORKSPACE_PATH).toBe("/virtual/tasks/ws")
  expect(repoEnv.GS_REPO_NAME).toBe("api")
  expect(repoEnv.GS_REPO_PATH).toBe("/virtual/tasks/ws/api")
})
```

### Pattern 2: Dynamic-Import Module Mocks for Status Queries

**What:** Set `mock.module()` factories at file scope, then dynamically import the module under test after the mocks are in place so the imported bindings see the replacement implementation. [CITED: https://bun.sh/docs/test/mocks] [VERIFIED: scripts/test-runner.ts]

**When to use:** Use this pattern for `getWorkspaceListInfo` and `getWorkspaceStatus`, because both depend on `config.ts`, `git.ts`, and `fs`-backed path existence checks rather than a dedicated `_exec` seam. [VERIFIED: src/lib/workspace-status.ts]

**Example:** [VERIFIED: tests/helpers.ts] [CITED: https://bun.sh/docs/test/mocks]

```typescript
import { describe, expect, mock, test } from "bun:test"
import { makeConfigMock, makeGitMock } from "../helpers"

const workspaces = [
  {
    name: "ws",
    branch: "feature/test",
    created: "2026-04-05T00:00:00.000Z",
    repos: [{ name: "api", mode: "worktree", main_path: "/main/api", task_path: "/tasks/ws/api", base_branch: "main" }],
  },
]

mock.module("@/lib/config", () => makeConfigMock({
  getRepoPath: mock((repo: any) => repo.task_path),
  isGitRepo: mock(() => true),
  isWorktreeRepo: mock((repo: any) => repo.mode === "worktree"),
  listWorkspaces: mock(() => workspaces),
}))

mock.module("@/lib/git", () => makeGitMock({
  isRepoDirty: mock(async () => true),
  getCurrentBranch: mock(async () => "feature/test"),
  getCommitsAhead: mock(async () => 2),
  getCommitsBehind: mock(async () => 1),
  isFetchStale: mock(async () => false),
}))

test("getWorkspaceListInfo aggregates dirty and ahead/behind state", async () => {
  const { getWorkspaceListInfo } = await import("../../src/lib/workspace-status")
  const info = await getWorkspaceListInfo(workspaces[0] as any)
  expect(info.dirtyRepos).toEqual(["api"])
  expect(info.ahead).toBe(2)
  expect(info.behind).toBe(1)
})
```

### Pattern 3: Direct Domain-Module Imports for Git Operations

**What:** Import `syncWorkspace` and `pushWorkspace` from `workspace-git.ts`, not the `workspace-ops.ts` facade, and drive their behavior entirely through mocked `config.ts` and `git.ts` dependencies. [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md] [VERIFIED: src/lib/workspace-git.ts]

**When to use:** Use this pattern for `TEST-03`, especially for verifying skipped trunks, dry-run counts, stash guard behavior, and progress callback rows without creating real repos. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: src/lib/workspace-git.ts]

**Example:** [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: tests/helpers.ts]

```typescript
import { expect, mock, test } from "bun:test"
import { makeConfigMock, makeGitMock } from "../helpers"

mock.module("@/lib/config", () => makeConfigMock({
  workspaceExists: mock(() => true),
  readWorkspace: mock(() => ({
    name: "ws",
    branch: "feature/test",
    repos: [{ name: "api", mode: "worktree", main_path: "/main/api", task_path: "/tasks/ws/api", base_branch: "main" }],
  })),
  isWorktreeRepo: mock((repo: any) => repo.mode === "worktree"),
}))

mock.module("@/lib/git", () => makeGitMock({
  pushBranch: mock(async () => ({ ok: true, commits: 3 })),
  getCommitsAhead: mock(async () => 3),
}))

test("pushWorkspace reports pushed commit counts from git.ts helper results", async () => {
  const { pushWorkspace } = await import("../../src/lib/workspace-git")
  const result = await pushWorkspace("ws", { setUpstream: true })
  expect(result.ok).toBe(true)
  expect(result.pushed).toEqual([{ repo: "api", commits: 3 }])
})
```

### Pattern 4: Dependency Gate as a First-Class Test Target

**What:** Treat the circular-dependency gate as an executable verification step, not a prose claim in the plan. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md]

**When to use:** Run it during implementation and again at phase gate because the current repo is already red. [VERIFIED: bunx madge --circular --extensions ts src/]

**Example:** [CITED: https://github.com/pahen/madge] [VERIFIED: bunx madge --circular --extensions ts src/]

```bash
bunx madge --circular --extensions ts src/
```

### Anti-Patterns to Avoid

- **Testing through `workspace-ops.ts`:** This reintroduces facade behavior and dilutes the point of extraction-specific tests. [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md] [VERIFIED: src/lib/workspace-ops.ts]
- **Real git repos for Phase 72’s new files:** Existing integration tests already cover real-repo paths; the missing value is fast, focused, seam-correct module tests. [VERIFIED: tests/lib/workspace-ops.test.ts] [VERIFIED: tests/lib/pull.test.ts]
- **Assuming `_exec` is the seam for `workspace-git.ts`:** Current code does not route git behavior through `_exec`, so these assertions would be structurally wrong. [VERIFIED: src/lib/workspace-git.ts]
- **Using `mock.module()` after importing the module under test without understanding side effects:** Bun updates live bindings, but the original module still evaluates if it was imported first. [CITED: https://bun.sh/docs/test/mocks]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Circular dependency detection | Custom `rg` or AST walker over `import` statements | `madge --circular --extensions ts src/` | Madge already solves graph walking and cycle reporting, and the repo has a real failing baseline it can expose today. [CITED: https://github.com/pahen/madge] [VERIFIED: bunx madge --circular --extensions ts src/] |
| Test-process isolation for `mock.module()` | Another homegrown runner or per-file shell script | Existing `scripts/test-runner.ts` classification | The repo already isolates any `tests/lib/*.test.ts` file containing `mock.module(`. [VERIFIED: scripts/test-runner.ts] |
| Git/test doubles for `workspace-git.ts` and `workspace-status.ts` | One-off inline stubs in each file | `makeGitMock()` plus targeted overrides | This matches existing dashboard integration tests and keeps exported-shape drift visible in one helper. [VERIFIED: tests/helpers.ts] [VERIFIED: tests/tui/dashboard/integ-wizard.test.tsx] |
| Full repo fixtures for env helper tests | Temp clones, config dirs, and worktrees | Plain object inputs and fake string paths | `mergeEnv`, `buildBaseEnv`, and `buildRepoEnv` are synchronous data transforms. [VERIFIED: src/lib/workspace-env.ts] |

**Key insight:** The expensive integration path already exists in `workspace-ops.test.ts`; Phase 72 should add seam-correct unit tests and a real dependency gate, not duplicate the same repository fixture setup in smaller files. [VERIFIED: tests/lib/workspace-ops.test.ts]

## Common Pitfalls

### Pitfall 1: Planning Against the Stale `_exec` Story

**What goes wrong:** The plan writes tests around `_exec.spawn` for `workspace-git.ts`, then discovers there is no subprocess call to observe. [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: .planning/ROADMAP.md]

**Why it happens:** `TEST-03` and the roadmap success criteria still describe `_exec` mocks, but the live module delegates to `git.ts` helpers and the Phase 72 context explicitly corrects that. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md]

**How to avoid:** Treat the context plus current code as authoritative and add a roadmap-mismatch note to the plan. [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md] [VERIFIED: src/lib/workspace-git.ts]

**Warning signs:** Planned assertions mention `_exec.spawn`, but the test fixture never mocks `@/lib/git`. [VERIFIED: src/lib/workspace-git.ts]

### Pitfall 2: Incomplete `makeGitMock()` Coverage

**What goes wrong:** A mock-based test imports `workspace-git.ts` or `workspace-status.ts` and hits `undefined` because the helper factory omits a newly used `git.ts` export. [VERIFIED: tests/helpers.ts] [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: src/lib/workspace-status.ts]

**Why it happens:** `makeGitMock()` currently lacks defaults for `pushBranch`, `getCommitsAhead`, `stashPush`, `stashPop`, `hasAutoStash`, and `isFetchStale`, all of which are imported by the extracted modules. [VERIFIED: tests/helpers.ts] [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: src/lib/workspace-status.ts]

**How to avoid:** Update `tests/helpers.ts` first or in the same change set as the new test files. [VERIFIED: tests/helpers.ts]

**Warning signs:** A mock-based test needs to override exports that the base factory does not define. [VERIFIED: tests/helpers.ts]

### Pitfall 3: Assuming the Cycle Gate Starts Green

**What goes wrong:** The plan treats `TEST-04` as “add a command to CI,” but the command already fails against current code. [VERIFIED: bunx madge --circular --extensions ts src/]

**Why it happens:** The extraction phases promised zero cycles, but no focused Phase 72 artifact had yet forced the codebase-wide check into this milestone’s execution path. [VERIFIED: .planning/phases/69-extract-workspace-env-ts-and-workspace-lifecycle-ts/69-CONTEXT.md] [VERIFIED: .planning/phases/70-extract-remaining-domain-modules-and-workspace-ops-facade/70-CONTEXT.md]

**How to avoid:** Plan a small refactor to move shared dashboard IPC state out of `run.tsx`, then add the `madge` gate. [VERIFIED: src/tui/dashboard/run.tsx] [VERIFIED: src/tui/dashboard/App.tsx] [VERIFIED: src/tui/dashboard/hooks/useMessages.ts]

**Warning signs:** `madge` output mentions `src/tui/dashboard/run.tsx > src/tui/dashboard/App.tsx`. [VERIFIED: bunx madge --circular --extensions ts src/]

### Pitfall 4: Mock Timing and Shared-Process Pollution

**What goes wrong:** Tests pass in isolation but fail or become flaky when run in the shared process. [VERIFIED: scripts/test-runner.ts] [CITED: https://bun.sh/docs/test/mocks]

**Why it happens:** `mock.module()` is process-global and Bun only prevents original-module evaluation side effects when the mock is loaded before import. [CITED: https://bun.sh/docs/test/mocks]

**How to avoid:** Keep `mock.module()` at file scope, dynamically import the subject after the mocks, and run through `bun run test`. [VERIFIED: CLAUDE.md] [VERIFIED: scripts/test-runner.ts] [CITED: https://bun.sh/docs/test/mocks]

**Warning signs:** The test file uses static imports of the module under test alongside `mock.module()`, or someone runs `bun test tests/`. [VERIFIED: CLAUDE.md] [VERIFIED: scripts/test-runner.ts]

## Code Examples

Verified patterns from official sources and this codebase:

### Module Mocking with Live Bindings

```typescript
// Source: https://bun.sh/docs/test/mocks
import { mock } from "bun:test"

mock.module("./module", () => ({ foo: "bar" }))
const { foo } = await import("./module")
```

This is the correct Bun pattern for `workspace-status.test.ts` and `workspace-git.test.ts`. [CITED: https://bun.sh/docs/test/mocks]

### Repo-Standard Git Mock Factory Usage

```typescript
// Source: tests/helpers.ts
mock.module("@/lib/git", () => makeGitMock({
  getCommitsAhead: mock(async () => 2),
  pushBranch: mock(async () => ({ ok: true, commits: 2 })),
}))
```

Dashboard integration tests already use the same module-mocking style against `git.ts`. [VERIFIED: tests/helpers.ts] [VERIFIED: tests/tui/dashboard/integ-action-menu.test.tsx]

### Cycle Check Command

```bash
# Source: https://github.com/pahen/madge
bunx madge --circular --extensions ts src/
```

This command currently reports two dashboard cycles in the repo. [CITED: https://github.com/pahen/madge] [VERIFIED: bunx madge --circular --extensions ts src/]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Broad extraction coverage lived inside `tests/lib/workspace-ops.test.ts` with real repos. [VERIFIED: tests/lib/workspace-ops.test.ts] | Add module-focused tests beside the extracted modules, using pure helpers or module mocks. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md] | Phase 72 requirement set on `2026-04-05`. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md] | Faster failure localization and no dependence on real git repos for the new coverage. [VERIFIED: .planning/ROADMAP.md] |
| “Subprocess module => `_exec` seam” was the dominant extraction story. [VERIFIED: CLAUDE.md] | `workspace-git.ts` and `workspace-status.ts` now require mocking `git.ts` because that is their actual dependency boundary. [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: src/lib/workspace-status.ts] | Phase 70 extraction landed on `2026-04-05`. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/STATE.md] | Test plans must follow the live dependency graph, not the older generalized convention. [VERIFIED: src/lib/workspace-git.ts] |
| Circular-import cleanliness was an extraction-phase expectation without a dedicated artifact. [VERIFIED: .planning/phases/69-extract-workspace-env-ts-and-workspace-lifecycle-ts/69-CONTEXT.md] [VERIFIED: .planning/phases/70-extract-remaining-domain-modules-and-workspace-ops-facade/70-CONTEXT.md] | Phase 72 turns it into an explicit executable gate with `madge`. [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md] | Locked in by D-07 on `2026-04-05`. [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md] | The phase now includes a dependency-cleanup task, not only new tests. [VERIFIED: bunx madge --circular --extensions ts src/] |

**Deprecated/outdated:**

- `_exec.spawn` assertions for `workspace-git.ts` are outdated for this phase’s actual code. [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md]

## Assumptions Log

No assumption-tagged claims were recorded during this research write-up. [VERIFIED: RESEARCH.md self-audit]

## Open Questions

1. **Should Phase 72 own the existing dashboard cycle fix, or should a follow-up decimal phase be inserted?**
   - What we know: The success criterion is codebase-wide zero cycles, and the current gate fails in dashboard files unrelated to the new workspace-module tests. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: bunx madge --circular --extensions ts src/]
   - What's unclear: Whether the planner should treat that cleanup as part of Phase 72 execution scope or pause for roadmap clarification. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md]
   - Recommendation: Keep it in Phase 72 unless the user explicitly narrows `TEST-04`, because otherwise the phase cannot reach its success criteria. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: bunx madge --circular --extensions ts src/]

2. **Should `writeEnvFiles` and `buildWorkspaceEnv` stay in `workspace-ops.test.ts`, or also get moved into `workspace-env.test.ts`?**
   - What we know: The locked context requires pure tests for `mergeEnv`, `buildBaseEnv`, and `buildRepoEnv`, and permits `buildWorkspaceEnv` / `writeEnvFiles` coverage using mocks or temp dirs. [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md]
   - What's unclear: Whether the planner wants only the required helper coverage or a fuller consolidation of env-module tests into one file. [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md]
   - Recommendation: Treat consolidation as optional after the required helper cases and cycle gate are secured. [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun runtime | `bun:test`, `bunx madge`, repo scripts | ✓ [VERIFIED: bun --version] | `1.3.10` [VERIFIED: bun --version] | — |
| Node.js | npm registry queries and helper tooling | ✓ [VERIFIED: node --version] | `v25.8.2` [VERIFIED: node --version] | — |
| npm | version verification and package metadata | ✓ [VERIFIED: npm --version] | `11.11.1` [VERIFIED: npm --version] | — |
| `madge` CLI | `TEST-04` dependency gate | ✓ via `bunx`; not yet declared in `package.json`. [VERIFIED: bunx madge --version] [VERIFIED: package.json] | `8.0.0` [VERIFIED: bunx madge --version] [VERIFIED: npm registry] | Bun-native dynamic import smoke test only if package integration breaks. [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md] |

**Missing dependencies with no fallback:**

- None for research or planning; the only missing piece is adding `madge` to devDependencies so the gate is repo-native instead of `bunx`-only. [VERIFIED: package.json] [VERIFIED: bunx madge --version]

**Missing dependencies with fallback:**

- Local `madge` dependency declaration is missing today, but the CLI is still runnable through `bunx` during implementation. [VERIFIED: package.json] [VERIFIED: bunx madge --version]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` on Bun `1.3.10`. [VERIFIED: package.json] [VERIFIED: bun --version] |
| Config file | `bunfig.toml`. [VERIFIED: bunfig.toml] |
| Quick run command | `bun run test` for repo-standard execution; direct single-file runs are acceptable for one new file, but `bun test tests/` is forbidden. [VERIFIED: package.json] [VERIFIED: CLAUDE.md] |
| Full suite command | `bun run test && bun run typecheck && bunx madge --circular --extensions ts src/`. [VERIFIED: package.json] [VERIFIED: bunx madge --circular --extensions ts src/] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Pure env-helper behavior for `mergeEnv`, `buildBaseEnv`, `buildRepoEnv` | unit | `bun test tests/lib/workspace-env.test.ts` | ❌ Wave 0 [VERIFIED: rg --files tests/lib] |
| TEST-02 | Mocked status/query behavior for `getWorkspaceListInfo` and `getWorkspaceStatus` | isolated module test | `bun test tests/lib/workspace-status.test.ts` | ❌ Wave 0 [VERIFIED: rg --files tests/lib] |
| TEST-03 | Mocked sync/push behavior through `git.ts` helper seams | isolated module test | `bun test tests/lib/workspace-git.test.ts` | ❌ Wave 0 [VERIFIED: rg --files tests/lib] |
| TEST-04 | Zero circular deps across `src/` | dependency smoke gate | `bunx madge --circular --extensions ts src/` | ❌ currently failing [VERIFIED: bunx madge --circular --extensions ts src/] |

### Sampling Rate

- **Per task commit:** Run the touched test file directly plus `bunx madge --circular --extensions ts src/` after any cycle-related edit. [VERIFIED: bunx madge --circular --extensions ts src/]
- **Per wave merge:** Run `bun run test && bun run typecheck && bunx madge --circular --extensions ts src/`. [VERIFIED: package.json] [VERIFIED: bunx madge --circular --extensions ts src/]
- **Phase gate:** Full suite green and zero Madge cycles before `/gsd-verify-work`. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: bunx madge --circular --extensions ts src/]

### Wave 0 Gaps

- [ ] `tests/lib/workspace-env.test.ts` — add the required pure env-helper coverage for `TEST-01`. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: rg --files tests/lib]
- [ ] `tests/lib/workspace-status.test.ts` — add isolated mock-based coverage for `TEST-02`. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: rg --files tests/lib]
- [ ] `tests/lib/workspace-git.test.ts` — add isolated mock-based coverage for `TEST-03`. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: rg --files tests/lib]
- [ ] `tests/helpers.ts` — extend `makeGitMock()` with defaults for `pushBranch`, `getCommitsAhead`, `stashPush`, `stashPop`, `hasAutoStash`, and `isFetchStale`. [VERIFIED: tests/helpers.ts] [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: src/lib/workspace-status.ts]
- [ ] `package.json` — add a repo-native dependency gate script once `madge` is installed. [VERIFIED: package.json] [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Not in scope for this phase’s extracted-module tests. [VERIFIED: .planning/ROADMAP.md] |
| V3 Session Management | no | Not in scope for this phase’s extracted-module tests. [VERIFIED: .planning/ROADMAP.md] |
| V4 Access Control | no | Not directly in scope; phase only adds tests plus dependency cleanup. [VERIFIED: .planning/ROADMAP.md] |
| V5 Input Validation | yes | Preserve path-boundary coverage around `writeEnvFiles` and schema-backed workspace fixtures. [VERIFIED: src/lib/workspace-env.ts] [VERIFIED: tests/lib/workspace-ops.test.ts] |
| V6 Cryptography | no | No cryptographic changes are required; keep using existing secret-resolution mechanisms without hand-rolled substitutes. [VERIFIED: src/lib/workspace-env.ts] [VERIFIED: CLAUDE.md] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `env_file` path traversal or symlink writes | Tampering | Keep the existing repo-root boundary tests and symlink-skip assertions in coverage. [VERIFIED: src/lib/workspace-env.ts] [VERIFIED: tests/lib/workspace-ops.test.ts] |
| Secret-resolution side effects in tests | Information Disclosure | Mock `secrets.ts` or use `skipSecrets`; never hit real keychain or host env unintentionally in unit tests. [VERIFIED: src/lib/workspace-env.ts] [VERIFIED: .planning/phases/72-extraction-tests/72-CONTEXT.md] |
| Cross-test module pollution from global mocks | Tampering | Use the repo’s isolated-process runner and per-file `mock.module()` setup. [VERIFIED: scripts/test-runner.ts] [CITED: https://bun.sh/docs/test/mocks] |

## Sources

### Primary (HIGH confidence)

- [Bun test docs](https://bun.sh/docs/test) - test runner behavior and built-in mocking/assertion support.
- [Bun mocks docs](https://bun.sh/docs/test/mocks) - `mock.module()`, live bindings, preload guidance, and original-module evaluation caveats.
- [Madge README](https://github.com/pahen/madge) - `--circular`, `--extensions`, and `tsConfig` support.
- `npm view madge version time --json` - current Madge version and publish date. [VERIFIED: npm registry]
- `bunx madge --circular --extensions ts src/` - current repository cycle status. [VERIFIED: bunx madge --circular --extensions ts src/]
- Repo code and planning artifacts: `src/lib/workspace-env.ts`, `src/lib/workspace-status.ts`, `src/lib/workspace-git.ts`, `src/tui/dashboard/run.tsx`, `src/tui/dashboard/App.tsx`, `src/tui/dashboard/hooks/useMessages.ts`, `tests/helpers.ts`, `tests/lib/workspace-ops.test.ts`, `scripts/test-runner.ts`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/phases/72-extraction-tests/72-CONTEXT.md`. [VERIFIED: codebase grep]

### Secondary (MEDIUM confidence)

- None. [VERIFIED: source review]

### Tertiary (LOW confidence)

- None. [VERIFIED: source review]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Bun and Madge usage were verified against official docs, npm registry metadata, and the live repo/toolchain. [CITED: https://bun.sh/docs/test] [CITED: https://bun.sh/docs/test/mocks] [CITED: https://github.com/pahen/madge] [VERIFIED: npm registry] [VERIFIED: bunx madge --version]
- Architecture: MEDIUM - The test-shape recommendations are strongly grounded in the current codebase, but the exact cycle-fix split for `TEST-04` still needs planner judgment. [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: src/tui/dashboard/run.tsx] [VERIFIED: bunx madge --circular --extensions ts src/]
- Pitfalls: HIGH - The seam mismatch, mock-factory gap, and failing cycle gate were all directly observed in-session. [VERIFIED: src/lib/workspace-git.ts] [VERIFIED: tests/helpers.ts] [VERIFIED: bunx madge --circular --extensions ts src/]

**Research date:** 2026-04-05. [VERIFIED: current_date 2026-04-05]
**Valid until:** 2026-05-05 for repo-local architecture; re-verify npm/Bun versions sooner if the phase is delayed. [VERIFIED: npm registry] [VERIFIED: bun --version]
