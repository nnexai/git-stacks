# Phase 70: Extract Remaining Domain Modules and workspace-ops Facade - Research

**Researched:** 2026-04-05
**Domain:** TypeScript module refactoring — extract domain modules from a monolithic lib file
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Phase 70 updates runtime callers and test seams off `src/lib/workspace-ops.ts` for extracted status, git, and YAML runtime functions.
- **D-02:** After extraction, `src/lib/workspace-ops.ts` contains only lifecycle/orchestration responsibilities: `openWorkspace`, `closeWorkspace`, `cleanWorkspace`, `removeWorkspace`, `mergeWorkspace`, and `renameWorkspace`.
- **D-03:** `SyncRow`, `PushRow`, and `PullRow` may be re-exported temporarily only as type compatibility shims while callers are updated.
- **D-04:** `src/lib/workspace-status.ts` owns `getWorkspaceStatus`, `getDirtyWorktrees`, `getWorkspaceListInfo`, and `detectWorkspaceFromCwd`.
- **D-05:** Status logic must preserve current trunk/worktree behavior, ahead/behind aggregation, and deepest-path CWD matching covered by existing tests.
- **D-06:** `src/lib/workspace-git.ts` owns `syncWorkspace`, `pushWorkspace`, and `pullWorkspace`.
- **D-07:** `workspace-git.ts` exports its own mutable `_exec` seam where process spawning or shell execution belongs, following the established injectable-process pattern.
- **D-08:** `src/lib/workspace-yaml.ts` owns `editWorkspaceYaml`, `editTemplateYaml`, `editGlobalConfigYaml`, `editRegistryYaml`, and `openYamlInEditor()`.
- **D-09:** `workspace-yaml.ts` may expose low-level file/path/validation helpers that support template rename flows, but `renameTemplate()` itself remains higher-level template/workspace management behavior.
- **D-10:** `renameTemplate()` may call into `workspace-yaml.ts` helpers for file operations, but retains responsibility for the workspace-reference cascade and other orchestration behavior.
- **D-11:** New domain modules import low-level helpers directly and must not depend back on `src/lib/workspace-ops.ts`.
- **D-12:** The facade depends downward on extracted modules, never the reverse, so `madge --circular src/` remains clean.

### Claude's Discretion

- Whether `renameTemplate()` stays in `workspace-ops.ts` for this phase or moves to a better non-lifecycle home, as long as it remains orchestration logic and is not forced into `workspace-yaml.ts`.
- Exact caller migration order across commands, TUI, and tests, as long as the final runtime surface matches the phase boundary and all tests continue to pass.

### Deferred Ideas (OUT OF SCOPE)

- Observability and debug labeling remain Phase 71 work.
- Extraction-focused unit expansion and explicit circular-import verification artifacts remain Phase 72 work, even though Phase 70 must still pass `madge --circular src/`.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXTR-01 | workspace-ops.ts split into domain modules with workspace-ops.ts as re-export facade | Extraction map and caller update inventory below |
| EXTR-04 | workspace-git.ts extracted — sync/push/pull operations | Full function inventory below; `_exec` pattern documented |
| EXTR-05 | workspace-status.ts extracted — getWorkspaceStatus, getDirtyWorktrees, getWorkspaceListInfo | Full function inventory below; `detectWorkspaceFromCwd` classified under D-04 |
| EXTR-06 | workspace-yaml.ts extracted — YAML editors, detectWorkspaceFromCwd, rename support | Full function inventory below; `openYamlInEditor` `_exec` need documented |
| EXTR-07 | Each extracted module exports `_exec` object following lifecycle.ts pattern where it spawns processes | Only `workspace-yaml.ts` (editor spawn) and `workspace-git.ts` need `_exec`; workspace-status.ts uses git.ts directly, no own spawn |
| EXTR-08 | All existing tests pass after each extraction step (800+ tests, zero regressions) | Current baseline: 1275 passes, 0 failures; caller update inventory documented |
</phase_requirements>

---

## Summary

`src/lib/workspace-ops.ts` is currently 1104 lines. Phase 69 already extracted `workspace-env.ts` and `workspace-lifecycle.ts` (re-exported via the facade at lines 56-58). Phase 70 extracts three remaining domains: status/CWD detection (`workspace-status.ts`), git sync/push/pull (`workspace-git.ts`), and YAML editing (`workspace-yaml.ts`). After extraction, `workspace-ops.ts` retains only `openWorkspace` and `renameWorkspace` as native functions, re-exports `closeWorkspace/cleanWorkspace/mergeWorkspace/removeWorkspace` from `workspace-lifecycle.ts`, and re-exports the three new modules until callers are updated (D-03 shim strategy applies to type and function exports alike).

The current test baseline is **1275 passes, 0 failures** across 37 unit files and 10 integration files. The `madge --circular src/` check already returns zero cycles. Both must be maintained across every extraction commit.

**Primary recommendation:** Extract in three sequential commits (status → git → yaml), updating all callers in the same commit as each extraction, never leaving workspace-ops.ts in a state where it has dangling imports from moved functions.

---

## Standard Stack

No new libraries are introduced. This is a pure refactoring phase using the project's existing stack.

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | ^6.0.2 | Strict mode; named exports, discriminated unions |
| Bun | latest | Runtime; `Bun.spawn` for editor spawn in workspace-yaml.ts |
| bun:test | (built-in) | Test runner |
| madge | 8.0.0 (via npx) | Circular import verification — already passing |

**_exec pattern source of truth:** `src/lib/lifecycle.ts` lines 29-48 — exports `const _exec = { spawn: (...) => SpawnHandle }`.

---

## Architecture Patterns

### Established _exec Injectable Pattern

`lifecycle.ts` defines a mutable `_exec` object. Tests replace `_exec.spawn` to verify subprocess call shapes without executing real processes. The object is exported by name and mutated by tests in place (works in ESM unlike re-assigning named exports).

```typescript
// Source: src/lib/lifecycle.ts (verified)
export const _exec = {
  spawn: (args: {
    cmd: string[]
    cwd: string
    env: Record<string, string>
    stdout: "inherit" | "pipe"
    stderr: "inherit" | "pipe"
  }): SpawnHandle => { ... }
}
```

`workspace-yaml.ts` needs this because `openYamlInEditor` calls `Bun.spawn([editor, path], ...)` directly. The `_exec` seam replaces that `Bun.spawn` call.

`workspace-git.ts` needs `_exec` per D-07. However, the current `syncWorkspace`, `pushWorkspace`, and `pullWorkspace` implementations all invoke git through `git.ts` functions (which use `$` shell), not via `Bun.spawn` directly. The `_exec` on `workspace-git.ts` should be present for forward compatibility and to satisfy EXTR-07, but it may be a minimal stub in this phase since no direct spawn happens in the git functions themselves.

`workspace-status.ts` has **no direct subprocess calls** — it calls `isRepoDirty`, `getCurrentBranch`, `getCommitsAhead`, `getCommitsBehind`, `isFetchStale` from `git.ts`. No `_exec` needed on this module.

### Re-export Facade Pattern

Already established in Phase 69:

```typescript
// Current lines 56-58 in workspace-ops.ts (verified)
export { buildBaseEnv, buildRepoEnv, buildWorkspaceEnv, mergeEnv, writeEnvFiles } from "./workspace-env"
export type { BuildWorkspaceEnvOptions } from "./workspace-env"
export { cleanWorkspace, closeWorkspace, getDirtyWorktrees, mergeWorkspace, removeWorkspace } from "./workspace-lifecycle"
```

The same pattern extends to all three new modules. Type-only re-exports use `export type { ... }`.

### Dependency Direction Rule (D-11, D-12)

```
workspace-ops.ts (facade + lifecycle orchestration)
    depends on:
        workspace-status.ts
        workspace-git.ts
        workspace-yaml.ts
        workspace-lifecycle.ts
        workspace-env.ts
    (never the reverse)

workspace-status.ts
    depends on: config, git, paths
    does NOT depend on: workspace-ops.ts, workspace-git.ts, workspace-yaml.ts

workspace-git.ts
    depends on: config, git, paths
    does NOT depend on: workspace-ops.ts, workspace-status.ts, workspace-yaml.ts

workspace-yaml.ts
    depends on: config, paths (for schema validation)
    does NOT depend on: workspace-ops.ts, workspace-git.ts, workspace-status.ts
```

---

## Extraction Map

### workspace-status.ts — Functions to Extract

| Symbol | Kind | Source Lines (approx) |
|--------|------|-----------------------|
| `WorkspaceListInfo` | type | 62-77 |
| `getWorkspaceListInfo` | function | 94-168 |
| `RepoStatus` | type | 170-178 |
| `getWorkspaceStatus` | function | 180-211 |
| `CwdDetectionResult` | type | 1066-1068 |
| `detectWorkspaceFromCwd` | function | 1078-1104 |
| `formatAge` | function (private) | 79-92 |
| `getDirtyWorktrees` | re-export from workspace-lifecycle | Already moved |

**Note:** `getDirtyWorktrees` is already in `workspace-lifecycle.ts` (line 23-31 of that file). It is currently re-exported from workspace-ops at line 58. Per D-04, it moves to `workspace-status.ts`. This means its home changes: remove it from workspace-lifecycle.ts, add it to workspace-status.ts, and update the workspace-ops re-export chain. Alternatively it stays in workspace-lifecycle.ts and workspace-status.ts re-exports it — either approach satisfies D-04 as long as `workspace-status.ts` is the public owner.

**Imports needed:** `existsSync` from `fs`; `resolve` from `path`; `isRepoDirty`, `getCurrentBranch`, `getCommitsAhead`, `getCommitsBehind`, `isFetchStale` from `./git`; `listWorkspaces`, `readWorkspace`, `getRepoPath`, `isGitRepo`, `isWorktreeRepo`, `type Workspace` from `./config`; `expandHome` from `./paths`.

### workspace-git.ts — Functions to Extract

| Symbol | Kind | Source Lines (approx) |
|--------|------|-----------------------|
| `SyncResult` | type | 521-527 |
| `SyncRow` | type | 529-534 |
| `PushResult` | type | 536-542 |
| `PushRow` | type | 544-548 |
| `PullRow` | type | 857-862 |
| `PullResult` | type | 863-870 |
| `pushWorkspace` | function | 550-643 |
| `syncWorkspace` | function | 645-853 |
| `pullWorkspace` | function | 871-969 |
| `_exec` | injectable seam | (new, per D-07/EXTR-07) |

**Imports needed:** `existsSync` from `fs`; `fetchOrigin`, `pushBranch`, `getCommitsAhead`, `rebaseBranch`, `mergeBranchFF`, `getCommitsBehind`, `getMergeConflicts`, `isRepoDirty`, `stashPush`, `stashPop`, `hasAutoStash`, `pullFFOnly` from `./git`; `readWorkspace`, `workspaceExists`, `getRepoPath`, `isGitRepo`, `isWorktreeRepo`, `type Workspace` from `./config`.

**_exec stub:** `openYamlInEditor` uses `Bun.spawn` directly; the git functions use `git.ts` primitives. The `_exec` for `workspace-git.ts` does not replace anything in the current implementations but satisfies EXTR-07. Keep it minimal — a no-op or identity wrapper is acceptable for this phase.

### workspace-yaml.ts — Functions to Extract

| Symbol | Kind | Source Lines (approx) |
|--------|------|-----------------------|
| `editWorkspaceYaml` | function | 971-988 |
| `openYamlInEditor` | function | 990-1005 |
| `editTemplateYaml` | function | 1007-1024 |
| `editGlobalConfigYaml` | function | 1026-1043 |
| `editRegistryYaml` | function | 1045-1062 |
| `_exec` | injectable seam | (new, wraps `Bun.spawn` in `openYamlInEditor`) |

**Note on D-09/D-10:** `renameTemplate` (lines 473-518) stays in `workspace-ops.ts` this phase. It references `listWorkspaces`, `readTemplate`, `writeTemplate`, `templateExists`, `templatePath`, `writeWorkspace` from `config.ts` — no file system helpers that need to move to `workspace-yaml.ts` beyond what config.ts already provides. The planner has discretion on whether to move it to a non-lifecycle home during this phase.

**Imports needed:** `readFileSync` from `fs`; `parse` from `yaml`; `workspacePath`, `templatePath`, `WorkspaceSchema`, `TemplateSchema`, `GlobalConfigSchema`, `RepoRegistrySchema` from `./config`; `GLOBAL_CONFIG_FILE`, `REGISTRY_FILE` from `./paths`.

**_exec seam for openYamlInEditor:**

```typescript
// Source: lifecycle.ts pattern (verified), adapted for yaml editor
export const _exec = {
  spawnEditor: (editor: string, path: string): { exited: Promise<number> } => {
    return Bun.spawn([editor, path], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
  }
}
```

---

## Caller Update Inventory

All callers currently import from `../lib/workspace-ops` (or relative equivalents). After extraction, callers must import from the new domain modules directly (or from the facade shim until it's cleaned). The phase goal is to have **no dangling re-export shims** in workspace-ops at the end.

### commands/workspace.ts

Imports to redirect:

| Current import | New source |
|---------------|------------|
| `getDirtyWorktrees` | `../lib/workspace-status` |
| `getWorkspaceStatus` | `../lib/workspace-status` |
| `getWorkspaceListInfo` | `../lib/workspace-status` |
| `detectWorkspaceFromCwd` | `../lib/workspace-status` |
| `syncWorkspace` | `../lib/workspace-git` |
| `pushWorkspace` | `../lib/workspace-git` |
| `pullWorkspace` | `../lib/workspace-git` |
| `editWorkspaceYaml` | `../lib/workspace-yaml` |
| `openYamlInEditor` | `../lib/workspace-yaml` |
| `type SyncRow`, `PushRow`, `PullRow` | `../lib/workspace-git` |
| `buildWorkspaceEnv`, `buildRepoEnv` | `../lib/workspace-env` (already a re-export, can stay or direct) |
| Lifecycle ops (`closeWorkspace`, etc.) | Keep on `../lib/workspace-ops` — these remain |

### commands/template.ts

| Current import | New source |
|---------------|------------|
| `editTemplateYaml` | `../lib/workspace-yaml` |
| `openYamlInEditor` | `../lib/workspace-yaml` |
| `renameTemplate` | Stays in `../lib/workspace-ops` (D-09/D-10) |

### commands/repo.ts

| Current import | New source |
|---------------|------------|
| `editRegistryYaml` | `../lib/workspace-yaml` |
| `openYamlInEditor` | `../lib/workspace-yaml` |

### commands/config.ts

| Current import | New source |
|---------------|------------|
| `editGlobalConfigYaml` | `../lib/workspace-yaml` |
| `openYamlInEditor` | `../lib/workspace-yaml` |

### tui/dashboard/App.tsx

| Current import | New source |
|---------------|------------|
| `editWorkspaceYaml` | `../../lib/workspace-yaml` |
| `syncWorkspace` | `../../lib/workspace-git` |
| `pushWorkspace` | `../../lib/workspace-git` |
| `type SyncRow`, `SyncResult`, `PushRow` | `../../lib/workspace-git` |
| Lifecycle ops | Keep on `../../lib/workspace-ops` |

### tui/dashboard/hooks/useWorkspaces.ts

| Current import | New source |
|---------------|------------|
| `getWorkspaceStatus` | `../../../lib/workspace-status` |

### lib/integrations/issue-utils.ts

| Current import | New source |
|---------------|------------|
| `detectWorkspaceFromCwd` | `../workspace-status` |

### tui/workspace-wizard.ts and tui/workspace-clone.ts

These import only `openWorkspace`, which stays in `workspace-ops.ts`. No changes needed.

---

## Test Seam Update Inventory

### tests/helpers.ts

The `realEditTemplateYaml`, `realEditGlobalConfigYaml`, `realEditRegistryYaml`, `realRenameTemplate` captures (lines 473-478) currently import from `@/lib/workspace-ops`. After extraction these symbols move to new modules, but `workspace-ops.ts` re-exports them during the shim phase. The real module captures can stay pointing at `@/lib/workspace-ops` AS LONG AS the facade shims remain. Once shims are removed, the captures must update.

**The safe migration order:** Keep `tests/helpers.ts` captures pointing at `@/lib/workspace-ops` until ALL callers have been updated AND workspace-ops shims are removed, then update helpers.ts in the same commit that removes shims.

### tests/lib/workspace-ops.test.ts

Imports `getWorkspaceListInfo`, `getWorkspaceStatus`, `pushWorkspace`, `syncWorkspace` from `../../src/lib/workspace-ops` (line 37-43). These will continue to work while facade re-exports exist. After shim removal, they must import from the new modules.

### tests/lib/pull.test.ts

Imports `pullWorkspace` from `../../src/lib/workspace-ops` (line 10). Same — works during facade phase, must update when shims removed.

### tests/lib/detect-workspace-cwd.test.ts

Imports `detectWorkspaceFromCwd` from workspace-ops. Same lifecycle.

### makeWorkspaceOpsMock in tests/helpers.ts

The mock factory at lines 236-263 stubs all the symbols currently on workspace-ops. After extraction, tests that mock `@/lib/workspace-ops` will find the facade re-exports still work. Tests that need to mock the new modules (e.g., `@/lib/workspace-git`) will need new mock factories. For this phase, adding `makeWorkspaceGitMock`, `makeWorkspaceStatusMock`, `makeWorkspaceYamlMock` factories to `tests/helpers.ts` is recommended.

---

## Common Pitfalls

### Pitfall 1: getDirtyWorktrees Ownership Conflict

**What goes wrong:** `getDirtyWorktrees` currently lives in `workspace-lifecycle.ts` (line 23-31) AND is re-exported by the facade. D-04 says `workspace-status.ts` owns it, but D-02 says lifecycle module keeps cascade helpers.

**How to avoid:** Move `getDirtyWorktrees` from `workspace-lifecycle.ts` to `workspace-status.ts`. Update the workspace-lifecycle re-export at workspace-ops line 58 to not include it, and add it to workspace-status re-exports. Verify `workspace-lifecycle.ts` doesn't internally use `getDirtyWorktrees` — it does not (the function is exported but not called from within lifecycle).

### Pitfall 2: Silent mock.module path mismatch

**What goes wrong:** If a test file mocks `@/lib/workspace-ops` to stub `syncWorkspace`, but `syncWorkspace` has moved to `@/lib/workspace-git`, the mock never takes effect. The test runs real git operations silently.

**How to avoid:** For each extraction commit, grep for `mock.module("@/lib/workspace-ops"` and assess whether any mocked function has been moved. The `makeWorkspaceOpsMock` in helpers.ts should be audited.

**Warning signs:** Tests that previously passed without a real git repo suddenly fail or take much longer.

### Pitfall 3: Circular import from workspace-status back to workspace-lifecycle

**What goes wrong:** `workspace-status.ts` might import `getDirtyWorktrees` from `workspace-lifecycle.ts` if it's not moved, creating a sibling dependency. Not circular per se, but sloppy.

**How to avoid:** Move `getDirtyWorktrees` cleanly; don't leave cross-sibling imports between the new modules.

### Pitfall 4: _exec seam for workspace-yaml needs SpawnHandle compatible return

**What goes wrong:** If `_exec.spawnEditor` returns `Bun.SpawnOptions.SpawnedProcess` directly, tests can't mock it cleanly.

**How to avoid:** Follow lifecycle.ts pattern exactly — return a `{ exited: Promise<number> }` shaped object. The mock just returns `{ exited: Promise.resolve(0) }`.

### Pitfall 5: Type-only vs value re-exports at facade boundary

**What goes wrong:** `SyncRow`, `PushRow`, `PullRow`, `SyncResult`, `PullResult` are types. Using `export { SyncRow }` instead of `export type { SyncRow }` from the facade can cause issues in some TypeScript/Bun configurations.

**How to avoid:** All moved types must be re-exported with `export type { ... }` at the facade when they're pure types.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Circular import detection | Custom import graph walker | `npx madge --circular src/` (already configured, already passing) |
| Test process isolation | Manual env cloning | `useIsolatedConfig()` + `mock.module()` from `tests/helpers.ts` |
| Atomic YAML writes | `writeFileSync` directly | `writeWorkspace()`, `writeTemplate()` from `config.ts` (already atomic: tmp+fsync+rename) |
| Editor spawn in tests | Real editor launch | `_exec.spawnEditor` seam mock returning `{ exited: Promise.resolve(0) }` |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none — runner is `scripts/test-runner.ts` |
| Quick run command | `bun run test` |
| Full suite command | `bun run test` |

**Note:** Do NOT use `bun test tests/lib/` directly — mock pollution across files. Always `bun run test`.

### Current Baseline

- **1275 passes, 0 failures** (verified 2026-04-05)
- Phase 70 success criterion: 800+ passing (well above baseline), 0 failing

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | File | Status |
|--------|----------|-----------|------|--------|
| EXTR-04 | syncWorkspace / pushWorkspace / pullWorkspace moved | behavioral (existing) | `tests/lib/workspace-ops.test.ts`, `tests/lib/pull.test.ts` | Existing — update imports after extraction |
| EXTR-05 | getWorkspaceStatus / getWorkspaceListInfo moved | behavioral (existing) | `tests/lib/workspace-ops.test.ts` | Existing — update imports after extraction |
| EXTR-06 | detectWorkspaceFromCwd moved | behavioral (existing) | `tests/lib/detect-workspace-cwd.test.ts` | Existing — update imports after extraction |
| EXTR-07 | _exec seam present on workspace-git, workspace-yaml | structural | (verify via import shape) | Wave 0 — add minimal `_exec` shape test or verify via makeWorkspaceGitMock |
| EXTR-08 | Full suite passes | regression | all | `bun run test` must stay green after every commit |

### Wave 0 Gaps

- [ ] `tests/helpers.ts` — add `makeWorkspaceGitMock()`, `makeWorkspaceStatusMock()`, `makeWorkspaceYamlMock()` factories
- [ ] `tests/helpers.ts` — update real-capture exports when shims are removed from workspace-ops facade

*(If the planner keeps facade shims through this phase and only removes them in a final cleanup commit, Wave 0 for helpers.ts can be deferred to that commit.)*

---

## Project Constraints (from CLAUDE.md)

- **Runtime:** Bun — use `Bun.spawn`, `$` shell, `Bun.file`; no Node.js compat shims
- **Language:** TypeScript strict mode throughout; named exports only
- **Imports:** Production `src/` files use relative imports; `@/*` alias is test-only
- **Conventions:** `type` for data structures; discriminated unions for fallible ops; no barrel files (except `src/lib/integrations/index.ts`)
- **Test runner:** `bun run test` always, never `bun test tests/lib/` directly (mock pollution)
- **Atomic writes:** Use `writeWorkspace()` / `writeTemplate()` (tmp+fsync+rename); never `writeFileSync` on config paths
- **_exec pattern:** Export mutable `_exec` object (not named function export) so tests can replace the property; confirmed pattern from `lifecycle.ts`, `tmux.ts`, `niri.ts`
- **No breaking changes:** Existing workspace YAML files must continue to work — extraction is internal module boundary only

---

## Sources

### Primary (HIGH confidence — directly verified in codebase)

- `src/lib/workspace-ops.ts` (full read, 1104 lines) — complete function/type inventory, exact line numbers
- `src/lib/workspace-lifecycle.ts` (lines 1-80) — confirmed `getDirtyWorktrees` is here, no `_exec` present
- `src/lib/lifecycle.ts` (lines 1-49) — `_exec` pattern source of truth
- `src/commands/workspace.ts` (lines 1-80) — confirmed all imports from workspace-ops
- `src/tui/dashboard/App.tsx` (lines 1-54) — confirmed TUI imports
- `tests/helpers.ts` (full read) — confirmed real-captures structure, `makeWorkspaceOpsMock` inventory
- `tests/lib/workspace-ops.test.ts` (lines 1-69) — confirmed import paths
- `tests/lib/pull.test.ts` (lines 1-60) — confirmed import path
- `tests/lib/detect-workspace-cwd.test.ts` (lines 1-60) — confirmed import path
- `.planning/config.json` — confirmed `nyquist_validation: true`

### Verification Commands Run

- `bun run test` — baseline 1275 passes, 0 failures [VERIFIED]
- `npx madge --circular src/` — zero circular dependencies [VERIFIED]
- `wc -l src/lib/workspace-ops.ts` — 1104 lines [VERIFIED]
- `ls src/lib/workspace-*.ts` — confirmed `workspace-env.ts` and `workspace-lifecycle.ts` exist, new modules do not yet [VERIFIED]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `getDirtyWorktrees` is safe to move out of workspace-lifecycle.ts because it's not called internally from lifecycle | Pitfall 1 | If lifecycle calls it internally, moving it would break lifecycle module. Verify by reading workspace-lifecycle.ts completely before moving. |
| A2 | workspace-git.ts `_exec` stub will be empty/minimal because sync/push/pull all route through git.ts, not direct Bun.spawn | Architecture | If git.ts itself grows direct Bun.spawn calls in future, the seam is already present |

---

## Open Questions

1. **renameTemplate placement**
   - What we know: D-09/D-10 say it stays as orchestration; D-02 says workspace-ops keeps only lifecycle ops (open/close/clean/remove/merge/rename*Workspace*)
   - What's unclear: Does `renameTemplate` (which is template-not-workspace management) belong in workspace-ops.ts post-phase or should it move to a separate module?
   - Recommendation: Planner has discretion. Simplest safe choice for this phase: leave it in workspace-ops.ts. A future phase can extract a `template-ops.ts` if needed.

2. **makeGitMock completeness gap**
   - What we know: `makeGitMock` in helpers.ts stubs git functions but is missing `getCommitsAhead`, `pushBranch`, `stashPush`, `stashPop`, `hasAutoStash` — functions that workspace-git.ts will need to mock in unit tests
   - What's unclear: Whether existing tests rely on this mock being incomplete
   - Recommendation: When adding `makeWorkspaceGitMock()`, include all git.ts functions used by the three git workspace functions. Do not modify `makeGitMock` unless a test gap is found.

---

## Metadata

**Confidence breakdown:**
- Extraction map: HIGH — derived from direct source reads
- Caller update inventory: HIGH — confirmed via grep across all callers
- Test seam analysis: HIGH — read helpers.ts and all relevant test files
- _exec pattern: HIGH — read lifecycle.ts source of truth

**Research date:** 2026-04-05
**Valid until:** This research targets the current HEAD; valid until any further changes to workspace-ops.ts or its callers.
