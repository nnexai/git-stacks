# Phase 65: Workspace Lifecycle - Research

**Researched:** 2026-04-04
**Domain:** workspace-ops.ts — dir-mode guards for create, open, close, clean, remove
**Confidence:** HIGH

## Summary

Phase 65 adds dir-mode awareness to the workspace lifecycle functions in `src/lib/workspace-ops.ts`. The schema changes from Phase 64 are already landed: `WorkspaceRepoSchema.mode` accepts `"dir"`, `task_path` is optional, and `buildReposFromTemplate` in `workspace-wizard.ts` already emits `mode: "dir"` entries with no `task_path`.

The work in this phase is purely defensive guards in workspace-ops.ts: every location that dereferences `repo.task_path` or calls a git API on a repo must first check `repo.mode !== "dir"`. No new abstractions are needed — the existing `mode === "worktree"` filter pattern already guards most git-heavy paths. A small number of call sites use `mode === "trunk"` comparisons or unconditionally dereference `task_path`; those need attention.

One type-level wrinkle: `buildRepoEnv` currently declares its parameter as `{ task_path: string }` (required). Dir repos have no `task_path`. The function must accept `task_path?: string` and fall back to `main_path` when constructing `GS_REPO_PATH` and `GS_REPO_CLONE_PATH`.

**Primary recommendation:** Add `mode !== "dir"` guards at each mode-discriminated filter site; widen `buildRepoEnv`'s parameter type to accept optional `task_path`; use `main_path` as the dir repo's effective path in hook/env context.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — infrastructure phase, all implementation choices at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key areas:
- How `workspace-ops.ts` handles dir repos in openWorkspace (skip git checkout, include in env/hooks)
- How close/clean/remove skip worktree deletion for dir repos (guard on mode !== "dir")
- How `workspace-wizard.ts` buildReposFromTemplate constructs the workspace YAML entry (already partially done in Phase 64)
- Whether `task_path` undefined propagation requires null guards in workspace-ops.ts functions

### Deferred Ideas (OUT OF SCOPE)
None — infrastructure phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIFE-01 | `git-stacks new` includes dir repos from template — references main_path directly, creates no worktree or branch | `buildReposFromTemplate` already implemented in Phase 64; workspace-wizard.ts worktree creation loop already filters `r.mode === "worktree"` |
| LIFE-02 | `git-stacks open` includes dir repos in env/hook context but skips git operations | `openWorkspace` has several mode-discriminated paths; dir repos need env inclusion + skip of worktree recreation, upstream tracking, trunk checkout, and file-ops loops |
| LIFE-03 | `git-stacks close`/`clean`/`remove` skip worktree deletion for dir repos (nothing to delete) | `_executeClean` already filters `r.mode === "worktree"` for worktree removal; `getWorkspaceListInfo` and `getWorkspaceStatus` need null guards for `task_path` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Runtime: Bun — use Bun APIs (`$`, `spawn`, `Bun.file`)
- TypeScript strict mode throughout — no implicit `any`, no unsafe `!` on optional fields
- Discriminated unions `{ ok: true } | { ok: false; error: string }` for fallible ops
- Named exports only; relative imports in src/ (not `@/*` alias)
- Error handling: git ops use `.quiet().nothrow()` + exit code checks — never throw for expected failures
- Test isolation: use `bun run test`, never `bun test tests/` directly (mock pollution)
- `_exec` injectable pattern for subprocess testing

## Standard Stack

### Core (this phase touches these files only)
| File | Role | Notes |
|------|------|-------|
| `src/lib/workspace-ops.ts` | Primary target — all lifecycle functions | Large file; edit surgically |
| `src/lib/config.ts` | Schema already updated in Phase 64 | Read-only this phase |
| `src/tui/workspace-wizard.ts` | `buildReposFromTemplate` already handles dir | Verify only — no edits expected |

No new npm dependencies. No installation step.

## Architecture Patterns

### Existing Mode-Guard Pattern
All existing guard sites already use one of two forms:

```typescript
// Form A — filter at list construction
const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")

// Form B — inline ternary for path resolution
const repoPath = repo.mode === "worktree" ? repo.task_path : repo.main_path
```

Dir repos must be excluded from Form A filters that feed git operations. Form B ternaries that only distinguish `"worktree"` vs `"trunk"` will silently use `main_path` for dir repos, which is correct — but `task_path` may be `undefined` and TypeScript strict mode will flag it if accessed directly.

### Effective Path Convention for Dir Repos
For hooks and env injection, a dir repo's effective working path is `main_path`. This matches the `task_path ?? main_path` fallback pattern used throughout the file for trunk repos.

### buildRepoEnv Signature Fix
Current signature [VERIFIED: workspace-ops.ts line 199]:
```typescript
export function buildRepoEnv(
  baseEnv: Record<string, string>,
  repo: { name: string; task_path: string; main_path: string }
): Record<string, string>
```

Must become:
```typescript
export function buildRepoEnv(
  baseEnv: Record<string, string>,
  repo: { name: string; task_path?: string; main_path: string }
): Record<string, string> {
  const repoPath = repo.task_path ?? repo.main_path
  return {
    ...baseEnv,
    GS_REPO_NAME: repo.name,
    GS_REPO_PATH: repoPath,
    GS_REPO_CLONE_PATH: repo.main_path,
  }
}
```

This is backward-compatible: worktree and trunk repos pass `task_path`; dir repos omit it and fall back to `main_path`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mode dispatch | Custom type discriminant system | Extend existing `mode === "worktree"` filter pattern | Already used throughout; consistent, readable |
| Optional task_path access | `repo.task_path!` non-null assertion | `repo.task_path ?? repo.main_path` | Strict mode forbids `!` on optional; fallback is semantically correct |

## Detailed Call-Site Inventory

[VERIFIED: workspace-ops.ts — full grep of `task_path` and mode-guarded sections]

### Sites that are already correct (no change needed)

| Line range | Code | Why correct |
|-----------|------|-------------|
| ~391–416 | `_executeClean` per-repo loop | Filters `r.mode === "worktree"` before accessing `task_path` |
| ~317–320 | `getDirtyWorktrees` | Filters `r.mode === "worktree"` |
| ~880–912 | `openWorkspace` — worktree recreation, upstream tracking | Both filter `r.mode === "worktree"` |
| ~947–962 | `openWorkspace` — per-repo file ops | Filters `r.mode === "worktree"` |
| ~253–301 | `writeEnvFiles` | Filters `r.mode === "worktree"` |

### Sites that need dir-mode guards or null guards

| Location | Issue | Fix |
|----------|-------|-----|
| `getWorkspaceListInfo` ~103–107 | `repo.task_path` dereferenced for worktree path; `repo.mode === "worktree" ? repo.task_path : repo.main_path` — task_path may be undefined for dir repos (TypeScript will error); also `repoCount` in return value only counts worktree+trunk | Add `"dir"` exclusion from ahead/behind computation; treat dir repos like trunk for path resolution (use `main_path`); exclude from `repoCount` or add `dirCount` |
| `getWorkspaceListInfo` ~120–143 | Ahead/behind loop — no mode check; will call `getCurrentBranch` on a plain dir | Exclude `mode === "dir"` repos from the ahead/behind computation (same pattern as LIFE-02/GIT skip pattern in Phase 66, but `getWorkspaceListInfo` is called from Phase 65 code paths) |
| `getWorkspaceStatus` ~326–354 | Calls `isRepoDirty`, `getCurrentBranch`, `getCommitsAhead/Behind` on ALL repos including dir | Skip git calls for `mode === "dir"` repos; return a fixed status `{ branch: "—", dirty: false, ahead: 0, behind: 0 }` |
| `buildRepoEnv` ~197–206 | Parameter type requires `task_path: string` (non-optional) | Widen to `task_path?: string`, use `task_path ?? main_path` |
| `openWorkspace` ~936–942 | `repoHooks` filter does not exclude dir repos; calls `buildRepoEnv(baseEnv, repo)` and then `execHooks([cmd], repo.task_path, ...)` — crashes if dir repo has pre_open hook and no task_path | After `buildRepoEnv` signature fix, the cwd for dir repo hook execution must be `repo.task_path ?? repo.main_path` |
| `openWorkspace` ~978–1003 | Trunk checkout logic: `for (const repo of wsWithPorts.repos.filter(r => r.mode === "trunk"))` — already correct, dir repos excluded | No change needed |
| `renameWorkspace` ~1076–1078 | `if (repo.task_path.includes(...))` — unconditional dereference on optional field | Add `if (repo.task_path && repo.task_path.includes(...))` guard |

### RepoStatus type

`RepoStatus` currently defines `mode: "trunk" | "worktree"` [VERIFIED: workspace-ops.ts line 309]. `getWorkspaceStatus` returns `RepoStatus[]` and is consumed by `git-stacks status` display. For Phase 65 this should be widened to include `"dir"` — or the return type can be left as-is and dir repos can be emitted with `mode: "dir"` by casting (which will fail TypeScript strict). The correct fix is to widen the `RepoStatus.mode` type to `"trunk" | "worktree" | "dir"`.

## Common Pitfalls

### Pitfall 1: TypeScript Optional Chaining on task_path
**What goes wrong:** `repo.task_path` is `string | undefined` after Phase 64. Any code that passes `repo` to a function expecting `task_path: string` will fail at compile time. Any code using `repo.task_path` without a guard will produce a TypeScript error in strict mode.
**Why it happens:** `WorkspaceRepoSchema` now marks `task_path` as `.optional()`, making it `string | undefined` in the inferred type.
**How to avoid:** Use `repo.task_path ?? repo.main_path` wherever a fallback path is needed. Filter out dir repos before any git operation.
**Warning signs:** `tsc --noEmit` errors mentioning `task_path` being possibly undefined.

### Pitfall 2: existsSync on undefined
**What goes wrong:** `existsSync(repo.task_path)` where `task_path` is undefined throws a runtime error (or returns false silently depending on Bun version — behavior is undefined for undefined input).
**Why it happens:** Several locations call `existsSync(repo.task_path)` without a mode guard.
**How to avoid:** Pattern: `existsSync(repo.task_path!)` must become `repo.task_path ? existsSync(repo.task_path) : false`, or exclude dir repos earlier in the pipeline with a filter.
**Warning signs:** Tests for close/clean/remove crashing with `TypeError: path must be a string`.

### Pitfall 3: getWorkspaceListInfo ahead/behind on dir repos
**What goes wrong:** `getCurrentBranch(repoPath)` called on a plain directory (not a git repo) returns an error or garbage output. `getCommitsAhead/Behind` similarly fail.
**Why it happens:** `getWorkspaceListInfo` was written before dir repos existed; it maps over `workspace.repos` without a mode guard.
**How to avoid:** Filter `r.mode !== "dir"` from the ahead/behind computation entirely. Dir repos contribute nothing to these counts.

### Pitfall 4: repoCount excludes dir repos silently
**What goes wrong:** `getWorkspaceListInfo` returns `repoCount: worktreeCount + trunkCount` which omits dir repos. Phase 67 display code may show incorrect counts.
**Why it happens:** The count was computed before dir mode existed.
**How to avoid:** Either include dir repos in `repoCount` or add a separate `dirCount` field. Since Phase 67 handles display, the conservative fix for Phase 65 is to add `dirCount` to the return type and include it. This prevents Phase 67 from having to patch the type retroactively.
**Recommendation:** Add `dirCount: number` to `WorkspaceListInfo` and include dir repos in total count exposed as `repoCount: worktreeCount + trunkCount + dirCount`.

## Code Examples

### Pattern: mode guard before git operation
```typescript
// Source: existing workspace-ops.ts pattern (VERIFIED)

// Already correct (close/clean):
for (const repo of workspace.repos.filter(r => r.mode === "worktree")) {
  await removeWorktree(repo.main_path, repo.task_path!)
}

// Fix for git status calls:
if (repo.mode === "dir") {
  return { name: repo.name, exists: existsSync(repo.main_path), dirty: false, branch: "—", mode: "dir", ahead: 0, behind: 0 }
}
```

### Pattern: safe task_path access
```typescript
// Source: existing trunk pattern in workspace-ops.ts (VERIFIED)
const repoPath = repo.mode === "worktree" ? repo.task_path! : repo.main_path

// For all three modes including dir:
const repoPath = repo.task_path ?? repo.main_path
```

### Pattern: hook execution for dir repos
```typescript
// Dir repo pre_open hook — use main_path as cwd
const hookCwd = repo.task_path ?? repo.main_path
await execHooks([cmd], hookCwd, buildRepoEnv(baseEnv, repo))
```

### Pattern: renameWorkspace task_path guard
```typescript
// Current (will crash for dir repos):
if (repo.task_path.includes(join(tasksDir, oldName))) {
  repo.task_path = repo.task_path.replace(...)
}

// Fixed:
if (repo.task_path && repo.task_path.includes(join(tasksDir, oldName))) {
  repo.task_path = repo.task_path.replace(...)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| mode: "trunk" \| "worktree" | mode: "trunk" \| "worktree" \| "dir" | Phase 64 | All mode-discriminated code now has a third case |
| task_path: string (required) | task_path?: string (optional) | Phase 64 | TypeScript will surface every unsafe dereference |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Dir repos should be excluded from `getWorkspaceListInfo` ahead/behind computation entirely (not just returning 0) | Detailed Call-Site Inventory | Low — no semantic difference for phase 65; if Phase 67 needs dir repos counted differently the type can be extended |
| A2 | `GS_REPO_PATH` for dir repos should use `main_path` (same as trunk) | buildRepoEnv Signature Fix | Low — hooks receive the correct path; no git op is implied |

## Open Questions (RESOLVED)

1. **Should `WorkspaceListInfo.repoCount` include dir repos?**
   - What we know: Currently `repoCount = worktreeCount + trunkCount`. Dir repos are legitimate workspace members.
   - What's unclear: Phase 67 display may want to distinguish dir repos from git repos.
   - RESOLVED: Add `dirCount` field and set `repoCount = worktreeCount + trunkCount + dirCount` for this phase. Phase 67 can render them differently.

2. **Should `RepoStatus.mode` be widened to include `"dir"` now?**
   - What we know: `getWorkspaceStatus` returns `RepoStatus[]`. Phase 67 renders status output.
   - What's unclear: Widening now vs in Phase 67.
   - RESOLVED: Widen now in Phase 65 — cheaper to fix the type here than patch display code that casts it.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure TypeScript code edits to an existing file).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Jest-compatible API) |
| Config file | none — scripts/test-runner.ts orchestrates isolation |
| Quick run command | `bun run test 2>&1 \| grep -E "(PASS\|FAIL\|workspace-ops)"` |
| Full suite command | `bun run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIFE-01 | `git-stacks new` with dir repo produces workspace YAML with `mode: "dir"`, no `task_path`, no worktree created | unit | `bun test tests/lib/workspace-ops.test.ts` | Wave 0 gap — new test cases needed |
| LIFE-02 | `openWorkspace` with dir repo: env/hooks include dir repo, no git ops called | unit | `bun test tests/lib/workspace-ops.test.ts` | Wave 0 gap — new test cases needed |
| LIFE-03 | `closeWorkspace`/`cleanWorkspace`/`removeWorkspace` with dir repo: succeeds, no worktree removal attempted | unit | `bun test tests/lib/workspace-ops.test.ts` | Wave 0 gap — new test cases needed |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/workspace-ops.test.ts`
- **Per wave merge:** `bun run test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] New test cases in `tests/lib/workspace-ops.test.ts` — dir repo fixture + LIFE-01/02/03 assertions
- [ ] No new test file needed — extend existing `workspace-ops.test.ts`

The existing `setupWorkspaceFixture` helper creates worktree repos. New dir-repo fixture variant needed:
```typescript
// Pattern (mirrors existing fixture, but for dir repos):
function setupDirRepoWorkspaceFixture(tmp: string, wsName: string) {
  const wsRoot = join(tmp, "workspaces")
  const tasksDir = join(wsRoot, "tasks")
  const mainDir = join(wsRoot, "main")
  mkdirSync(join(mainDir, "shared-configs"), { recursive: true })  // plain dir, no .git

  writeGlobalConfig({ workspace_root: wsRoot, integrations: {} })
  writeWorkspace(WorkspaceSchema.parse({
    name: wsName,
    branch: "feature/test",
    created: new Date().toISOString(),
    repos: [{
      name: "shared-configs",
      repo: "shared-configs",
      type: "other",
      mode: "dir",
      main_path: join(mainDir, "shared-configs"),
      // no task_path
    }],
  }))
  return { tasksDir, dirPath: join(mainDir, "shared-configs") }
}
```

## Security Domain

This phase introduces no new attack surfaces. No user input handling, no network calls, no secret access. Security domain is not applicable.

## Sources

### Primary (HIGH confidence)
- `/home/nnex/dev/prj/git-stacks/src/lib/workspace-ops.ts` — full file read, all `task_path` and mode-filter sites identified
- `/home/nnex/dev/prj/git-stacks/src/lib/config.ts` — schema definitions confirmed (Phase 64 changes landed)
- `/home/nnex/dev/prj/git-stacks/src/tui/workspace-wizard.ts` — `buildReposFromTemplate` dir branch confirmed implemented
- `/home/nnex/dev/prj/git-stacks/tests/lib/workspace-ops.test.ts` — test fixture patterns confirmed
- `/home/nnex/dev/prj/git-stacks/tests/helpers.ts` — `setupWorkspaceFixture`, `useIsolatedConfig` patterns

### Secondary (MEDIUM confidence)
- CONTEXT.md, REQUIREMENTS.md, STATE.md — project context

## Metadata

**Confidence breakdown:**
- Call-site inventory: HIGH — verified by reading workspace-ops.ts in full
- Fix patterns: HIGH — derived from existing patterns already present in the codebase
- Test fixture pattern: HIGH — derived from existing test helpers

**Research date:** 2026-04-04
**Valid until:** Stable — this is an internal code audit, not ecosystem research
