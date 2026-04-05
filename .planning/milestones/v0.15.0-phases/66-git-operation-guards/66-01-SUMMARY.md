---
phase: 66-git-operation-guards
plan: "01"
subsystem: workspace-ops
tags: [git-guards, dir-mode, pull, fetch, tests]
dependency_graph:
  requires: [65-workspace-lifecycle]
  provides: [GIT-01, GIT-02, GIT-03, GIT-04, GIT-05, GIT-06]
  affects: [src/lib/workspace-ops.ts, tests/lib/workspace-ops.test.ts]
tech_stack:
  added: []
  patterns: [mode-filter-before-git-op, skipped-result-array]
key_files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - tests/lib/workspace-ops.test.ts
decisions:
  - "Dir repos filtered from pullWorkspace Phase 1 fetch dedup loop via gitRepos = repos.filter(r => r.mode !== 'dir') per D-04"
  - "git.ts left unmodified — all guards live in workspace-ops.ts per D-01"
  - "Six dedicated tests added inside existing describe('dir repo lifecycle') block per D-05"
metrics:
  duration: "~15 minutes"
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_changed: 2
requirements_satisfied: [GIT-01, GIT-02, GIT-03, GIT-04, GIT-05, GIT-06]
---

# Phase 66 Plan 01: Git Operation Guards Summary

**One-liner:** pullWorkspace fetch dedup loop now filters dir repos via `gitRepos.filter(r => r.mode !== "dir")` before fetchGroups construction, and six dedicated GIT-0x tests confirm all six guard requirements.

## What Was Done

### Task 1 — Fix pullWorkspace fetch dedup loop (commit e284bd23)

Added a single filter line at the top of `pullWorkspace`'s Phase 1 block in `src/lib/workspace-ops.ts`:

```typescript
const gitRepos = repos.filter(r => r.mode !== "dir")
const fetchGroups = new Map<string, typeof gitRepos>()
for (const repo of gitRepos) { ... }
```

This prevents `fetchOrigin` from being called on plain directories (non-git repos). The Phase 2 pull loop already had its dir guard (`if (repo.mode === "dir") { skipped.push(...) }`), so only Phase 1 needed the fix.

### Task 2 — Add six GIT-0x dir-mode guard tests (commit 2f44de1a)

Added `pullWorkspace` and `getDirtyWorktrees` to the import block, then appended six tests inside `describe("dir repo lifecycle")`:

- **GIT-01** `pushWorkspace skips dir repos implicitly` — dir repo absent from pushed/skipped/failed arrays
- **GIT-02** `pullWorkspace skips dir repos in mixed workspace` — dir repo in skipped with reason "dir", no "fetching" progress event emitted for it
- **GIT-03** `syncWorkspace skips dir repos implicitly` — dir repo absent from synced/skipped arrays
- **GIT-04** `mergeWorkspace skips dir repos implicitly` — merge completes without dir-related error
- **GIT-05** `getWorkspaceListInfo ahead/behind excludes dir repos` — dirCount=1, ahead/behind computed without crash
- **GIT-06** `getDirtyWorktrees excludes dir repos` — dir repo absent from dirty list even when files added

## Test Results

- 108 tests pass in `tests/lib/workspace-ops.test.ts` (102 pre-existing + 6 new)
- `src/lib/git.ts` unmodified (per D-01)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written, with one minor adjustment:

**Signature correction (not a deviation — plan had a typo):** The plan's GIT-02 test code used `pullWorkspace(wsName, {}, callback)` but the actual function signature is `pullWorkspace(nameOrWorkspace, onProgress?)` with no options argument. The test was written to match the real signature: `pullWorkspace(wsName, callback)`.

## Known Stubs

None — all six tests wire real fixture data and assert against real function behavior.

## Threat Flags

None — this plan modifies only internal array filter logic with no new external surfaces.

## Self-Check: PASSED

- `src/lib/workspace-ops.ts` exists and contains `const gitRepos = repos.filter(r => r.mode !== "dir")` at line 1518
- `tests/lib/workspace-ops.test.ts` exists and contains all six GIT-0x test names
- Commits verified:
  - e284bd23 — fix(66-01): filter dir repos from pullWorkspace fetch dedup loop
  - 2f44de1a — test(66-01): add six GIT-0x dir-mode guard tests
