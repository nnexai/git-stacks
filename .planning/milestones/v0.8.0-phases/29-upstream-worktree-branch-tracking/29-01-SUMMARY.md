---
phase: 29-upstream-worktree-branch-tracking
plan: "01"
subsystem: git
tags: [git, upstream-tracking, tdd, worktree]
dependency_graph:
  requires: []
  provides: [checkRemoteTrackingRef, checkBranchExistsOnRemote, hasUpstreamTracking, ensureUpstreamTracking]
  affects: [src/lib/git.ts]
tech_stack:
  added: []
  patterns: [two-layer-detection, nothrow-pattern, git-C-flag]
key_files:
  created: []
  modified:
    - src/lib/git.ts
    - tests/lib/git.test.ts
decisions:
  - "Used bare git repo (git init --bare) for test origins instead of makeGitRepo to avoid push rejection from diverging histories"
  - "checkBranchExistsOnRemote uses fetch.timeout=10 to prevent hanging offline"
  - "ensureUpstreamTracking early-returns tracked:false (not true) when already tracking — skip path, not a new tracking action"
metrics:
  duration: "3m 43s"
  completed_date: "2026-03-24"
  tasks_completed: 2
  files_changed: 2
---

# Phase 29 Plan 01: Upstream Branch Tracking Detection and Setup Summary

Added 4 exported functions to `src/lib/git.ts` for detecting and configuring upstream branch tracking via TDD (RED then GREEN).

## Tasks Completed

| Task | Type | Description | Commit |
|------|------|-------------|--------|
| 1 | TDD RED | Failing tests for 4 upstream tracking functions | 6f08606 |
| 2 | TDD GREEN | Implement functions + fix test helper | 88780da |

## What Was Built

Four new exported functions in `src/lib/git.ts` under `// --- Upstream tracking ---`:

**`checkRemoteTrackingRef(repoPath, branch): Promise<boolean>`**
- Fast local check: `git rev-parse --verify origin/<branch>`
- Returns true when local remote-tracking ref exists (e.g. after a fetch)
- No network call required

**`checkBranchExistsOnRemote(repoPath, branch): Promise<boolean>`**
- Network call: `git -c fetch.timeout=10 ls-remote --exit-code --heads origin <branch>`
- Returns true when branch exists on origin
- Returns false on network failure (non-fatal via `.nothrow()`)

**`hasUpstreamTracking(repoPath, branch): Promise<boolean>`**
- Reads `branch.<name>.remote` git config
- Returns true when upstream tracking is already configured

**`ensureUpstreamTracking(repoPath, branch): Promise<{ tracked: boolean; source?: "local" | "remote" }>`**
- Orchestrates two-layer detection: local ref first, network fallback second
- Early return `{ tracked: false }` if already tracked (skip path)
- Sets tracking via `branch --set-upstream-to=origin/<branch> <branch>`
- Returns `{ tracked: true, source: "local" }` or `{ tracked: true, source: "remote" }`
- Returns `{ tracked: false }` for brand-new branches or network failures (non-fatal)

## Test Coverage

28 total tests pass (all previously passing tests + 16 new tests):

- `checkRemoteTrackingRef`: local ref exists / local ref missing
- `checkBranchExistsOnRemote`: on remote / not on remote / unreachable origin
- `hasUpstreamTracking`: tracking configured / not configured / brand-new branch
- `ensureUpstreamTracking`: local path / remote path / brand-new / already-tracked / offline

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test helper makeRepoWithOrigin used conflicting repo initialization**
- **Found during:** GREEN phase test run
- **Issue:** `makeGitRepo` creates a repo with an initial "init" commit. Using it as origin caused push rejection when the working repo also had its own "init" commit (diverging histories).
- **Fix:** Changed `makeRepoWithOrigin` to use `git init --bare` for origin (a true bare repo that accepts any push without requiring history alignment).
- **Files modified:** `tests/lib/git.test.ts`
- **Commit:** 88780da (part of GREEN commit)

**2. [Rule 1 - Bug] Test for "source: remote" actually got "source: local" because git push auto-updates remote-tracking refs**
- **Found during:** GREEN phase test run
- **Issue:** The test pushed the branch from `repoPath2` then expected no local remote-tracking ref. But `git push` always creates/updates the `origin/<branch>` local ref, so `checkRemoteTrackingRef` returned `true` and the result was `source: "local"`, not `"remote"`.
- **Fix:** Rewrote the test to simulate "colleague pushed" by creating the branch directly in the bare origin repo, then creating the same branch name locally without a push or fetch. This ensures no local `origin/feature-remote-only` tracking ref exists.
- **Files modified:** `tests/lib/git.test.ts`
- **Commit:** 88780da (part of GREEN commit)

## Known Stubs

None.

## Self-Check: PASSED

- `src/lib/git.ts` modified with 4 new exported functions: FOUND
- `tests/lib/git.test.ts` updated with 16 new tests: FOUND
- Commit 6f08606 (RED): FOUND
- Commit 88780da (GREEN): FOUND
- `bun test tests/lib/git.test.ts`: 28 pass, 0 fail
- `bun run typecheck`: clean
