---
phase: 59-push
plan: 01
subsystem: git
tags: [git, push, remote, force-with-lease]

requires: []
provides:
  - "pushBranch git primitive with force/force-with-lease/set-upstream support"
  - "Structured push failure reasons for non-fast-forward, upstream, auth, and network cases"
  - "Git primitive tests covering success, up-to-date, divergence, force-with-lease, and upstream setup"
affects: [59-02, 59-03]

tech-stack:
  added: []
  patterns:
    - "pushBranch mirrors pullFFOnly: quiet non-throwing git invocation with stderr parsing"
    - "first-push commit count falls back to 0 when origin/<branch> does not exist yet"

key-files:
  created: []
  modified:
    - src/lib/git.ts
    - tests/lib/git.test.ts

key-decisions:
  - "Force-with-lease takes precedence over force when both flags are present"
  - "Interactive auth prompts stay disabled via GIT_TERMINAL_PROMPT=0"
  - "Common push failures are normalized into concise user-facing reasons"

requirements-completed: [PUSH-01]
completed: 2026-04-03
---

# Phase 59 Plan 01: pushBranch Summary

**Added a reusable `pushBranch` primitive with structured failure parsing and real git tests for success, divergence, and upstream setup**

## Accomplishments

- Added `pushBranch(repoPath, branch, opts)` to `src/lib/git.ts`
- Supports regular push, `--force`, `--force-with-lease`, and `-u/--set-upstream`
- Returns `{ ok: true, commits }` on success or `{ ok: false, reason }` on failure
- Parses non-fast-forward, missing upstream, authentication, and network-style failures into stable reasons
- Added real-repo tests for successful push, up-to-date push, non-fast-forward rejection, force-with-lease recovery, and upstream tracking

## Files Created/Modified

- `src/lib/git.ts` - added `pushBranch`
- `tests/lib/git.test.ts` - added push primitive coverage

## Deviations from Plan

- First-push commit counts intentionally report `0` when `origin/<branch>` does not exist yet, matching the planned safe fallback.

## Self-Check: PASSED

- FOUND: `src/lib/git.ts`
- FOUND: `tests/lib/git.test.ts`
