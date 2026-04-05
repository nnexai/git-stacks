---
phase: 67-status-display-health
verified: 2026-04-04T22:30:00Z
status: passed
score: 7/7 must-haves verified
gaps: []
deferred: []
human_verification: []
---

# Phase 67: Status, Display & Health Verification Report

**Phase Goal:** Users can see dir repos represented correctly in CLI output and TUI — labeled as "dir" with no git metrics
**Verified:** 2026-04-04T22:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `git-stacks status` shows dir repos with a "dir" label and no ahead/behind/dirty columns | VERIFIED | `modeLabel` ternary in workspace.ts:409 returns `"[dir]"` for `repo.mode === "dir"`; test "status human-readable shows [dir] label" passes |
| 2 | `git-stacks list` includes workspaces containing only dir repos without git aggregation errors | VERIFIED | `r.mode !== "dir"` guard in workspace.ts:363 prevents fetchOrigin on non-git dirs; test "list --json includes dirCount for workspace with dir repos" asserts `dirCount: 1` and passes |
| 3 | TUI dashboard workspace detail shows dir repos with a "dir" indicator and no git badges | VERIFIED | WorkspaceDetail.tsx:66 ternary chain includes `repo.mode === "dir" ? "[dir]"`; WorkspaceRow.tsx has `drCount` and `countsText` includes `${dir}dir`; 4 WorkspaceDetail tests (D1-D4) all pass |
| 4 | `git-stacks doctor` skips git health checks for dir repos and instead validates that the directory exists and is accessible | VERIFIED | `findMissingMainClones` has `repo.mode !== "dir"` guard at line 152; `findInvalidDirRepos` validates path existence and type; wired into `allIssues` at line 384; 4 doctor tests pass |
| 5 | CLI `status --fetch` does not call fetchOrigin on dir repos | VERIFIED | `r.mode !== "dir"` guard in `--fetch` filter at workspace.ts:363 |
| 6 | Doctor reports missing or invalid dir repo paths with dir-specific messages | VERIFIED | `findInvalidDirRepos` emits "dir repo '...' path missing:" and "path is not a directory:" issue messages; tests for both cases pass |
| 7 | TUI dashboard marks workspaces with missing dir paths as hasMissing | VERIFIED | useWorkspaces.ts:88 extended to `(r.mode === "worktree" || r.mode === "dir")` in hasMissing predicate |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/commands/workspace.ts` | Dir mode label in status display, dir guard in --fetch path | VERIFIED | Contains `repo.mode === "dir" ? "[dir]"` at line 409; `r.mode !== "dir"` at line 363 |
| `src/commands/doctor.ts` | `findInvalidDirRepos` function, dir guard on `findMissingMainClones` | VERIFIED | `findInvalidDirRepos` at line 166; `repo.mode !== "dir"` guard at line 152; `statSync` imported at line 2; `...invalidDirRepos` in allIssues at line 384 |
| `tests/commands/status-json.test.ts` | Dir repo status tests with `mode.*dir` pattern | VERIFIED | `describe("dir repo display")` at line 182; 4 tests covering JSON mode assertion, `[dir]` label, no arrows, dirCount |
| `tests/commands/doctor-json.test.ts` | Dir repo doctor tests with `dir repo` pattern | VERIFIED | `describe("dir repo health checks")` at line 144; 4 tests covering healthy path, missing path, file-not-dir, no double-reporting |
| `src/tui/dashboard/WorkspaceDetail.tsx` | Dir mode label rendering | VERIFIED | `repo.mode === "dir" ? "[dir]"` at line 66 |
| `src/tui/dashboard/WorkspaceRow.tsx` | Dir count in countsText | VERIFIED | `const drCount = () => ws().repos.filter((r) => r.mode === "dir").length` at line 22; countsText includes `${dir}dir` when dir > 0 |
| `src/tui/dashboard/hooks/useWorkspaces.ts` | hasMissing includes dir repos | VERIFIED | `r.mode === "worktree" || r.mode === "dir"` at line 88 |
| `src/tui/dashboard/types.ts` | mode union includes "dir" | VERIFIED | Line 8: `mode: "trunk" | "worktree" | "dir"` |
| `tests/tui/dashboard/WorkspaceDetail.test.tsx` | Dir mode rendering test | VERIFIED | `describe("WorkspaceDetail dir repo rendering")` at line 259; 4 tests (D1-D4) cover [dir] label, no ahead/behind badges, green/red icon |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `workspace.ts:409 modeLabel ternary` | `getWorkspaceStatus repo.mode` | `repo.mode === "dir"` check | WIRED | Ternary extended: `worktree → dir → trunk` |
| `workspace.ts:363 --fetch filter` | `fetchOrigin` call | `r.mode !== "dir"` guard | WIRED | Dir repos excluded before fetchOrigin is invoked |
| `doctor.ts findInvalidDirRepos` | `allIssues` array | `...invalidDirRepos` spread at line 384 | WIRED | Called at line 315, spread into allIssues at line 384 |
| `doctor.ts findMissingMainClones` | dir repos | `repo.mode !== "dir"` guard at line 152 | WIRED | Dir repos route exclusively to findInvalidDirRepos, not the generic clone-missing check |
| `WorkspaceDetail.tsx:66 modeLabel` | `[dir]` in render output | `repo.mode === "dir" ? "[dir]"` | WIRED | Ternary chain includes dir before trunk fallback |
| `WorkspaceRow.tsx drCount` | `countsText` memo | `drCount()` read in createMemo | WIRED | `const dir = drCount()` at line 42, included in string when > 0 |
| `useWorkspaces.ts hasMissing` | StatusIndicator red state | `r.mode === "dir"` OR-chain | WIRED | hasMissing now triggers for dir repos with missing paths |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `workspace.ts status display` | `repos` from `getWorkspaceStatus(ws)` | `workspace-ops.ts:getWorkspaceStatus` — returns real `RepoStatus[]` including mode field | Yes — returns `{ mode: "dir", ahead: 0, behind: 0, ... }` for dir repos | FLOWING |
| `doctor.ts findInvalidDirRepos` | `workspaces` from `listWorkspaces()` | YAML config read from disk; iterates real workspace repos | Yes — `existsSync` + `statSync` on real `main_path` | FLOWING |
| `WorkspaceDetail.tsx modeLabel` | `repo.mode` from `entry.status.repos[]` | `useWorkspaces.ts` hooks returning status from `getWorkspaceStatus` | Yes — mode flows from data layer through hook to component | FLOWING |
| `WorkspaceRow.tsx drCount` | `ws().repos` array | Workspace object from entry prop; filtered by mode | Yes — reactive derivation over real repo array | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Status tests pass (8 tests including 4 dir-specific) | `bun test tests/commands/status-json.test.ts` | 8 pass, 0 fail | PASS |
| Doctor tests pass (9 tests including 4 dir-specific) | `bun test tests/commands/doctor-json.test.ts` | 9 pass, 0 fail | PASS |
| TUI WorkspaceDetail tests pass (16 tests including 4 dir-specific) | `bun test tests/tui/dashboard/WorkspaceDetail.test.tsx` | 16 pass, 0 fail | PASS |
| Full test suite passes | `bun run test` | All pass, 0 fail | PASS |
| Typecheck (pre-existing errors only) | `bun run typecheck` | 4 errors in phase 67 modified files — all in pre-existing code at lines 134 (doctor.ts), 105/112/766 (workspace.ts); none in code added or modified by this phase | INFO |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DISP-01 | 67-01-PLAN.md | `git-stacks status` shows dir repos with a "dir" label and no git metrics | SATISFIED | `[dir]` modeLabel in workspace.ts:409; test "status human-readable shows [dir] label" passes |
| DISP-02 | 67-01-PLAN.md | `git-stacks list` includes workspaces with dir repos without git aggregation errors | SATISFIED | `r.mode !== "dir"` guard prevents fetchOrigin; `dirCount` field in list JSON output verified by test |
| DISP-03 | 67-02-PLAN.md | TUI dashboard shows dir repos with "dir" indicator, no git badges | SATISFIED | WorkspaceDetail renders `[dir]`; WorkspaceRow shows dir count; no ahead/behind badge for dir repos (gated on `mode === "worktree"`) |
| HLTH-01 | 67-01-PLAN.md | `git-stacks doctor` skips git health checks for dir repos | SATISFIED | `repo.mode !== "dir"` guard in `findMissingMainClones` at line 152; dir repos do not trigger generic clone-missing check |
| HLTH-02 | 67-01-PLAN.md | `git-stacks doctor` validates dir repo paths exist and are accessible directories | SATISFIED | `findInvalidDirRepos` emits fail issues for missing paths and for paths that are files not directories |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/commands/doctor.ts` | 134 | `existsSync(repo.task_path)` — `task_path` typed as `string \| undefined` | INFO | Pre-existing TS error in `findMissingWorktrees`; not introduced by phase 67; does not affect dir repo logic |
| `src/commands/workspace.ts` | 105, 112 | `existsSync(resolvedPath)` / string use — `task_path` may be undefined | INFO | Pre-existing TS error in path resolution function; not introduced by phase 67 |
| `src/commands/workspace.ts` | 766 | `cwd = found.task_path` — `task_path` typed as `string \| undefined` | INFO | Pre-existing TS error in `cd` command; not introduced by phase 67 |

All anti-patterns are pre-existing TypeScript strictness issues in code not modified by phase 67. No new anti-patterns introduced. No TODOs, placeholders, or stub patterns found in phase 67 additions.

### Human Verification Required

None.

### Gaps Summary

No gaps. All seven observable truths are verified against the actual codebase. All five requirement IDs (DISP-01, DISP-02, DISP-03, HLTH-01, HLTH-02) are implemented with substantive logic and passing tests. All artifacts exist, are wired, and have data flowing through them. The full test suite passes with zero failures.

The typecheck failures flagged by `bun run typecheck` are pre-existing errors (confirmed by git history showing the same code existed before commit 4e636f38) and are not regressions from phase 67.

---

_Verified: 2026-04-04T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
