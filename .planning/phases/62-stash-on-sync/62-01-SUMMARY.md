---
phase: 62-stash-on-sync
plan: 01
subsystem: git
tags: [git, stash, sync]

requires: []
provides:
  - "git stash primitives for stash-on-sync"
  - "auto-stash detection guard"
  - "unit coverage for stash helpers"
affects: []

tech-stack:
  added: []
  patterns:
    - "Git primitives use Bun shell with .quiet().nothrow() and structured result unions"

key-files:
  created: []
  modified:
    - src/lib/git.ts
    - tests/lib/git.test.ts

key-decisions:
  - "Auto-stash entries use the fixed marker message `git-stacks auto-stash (sync)` for reliable detection"
  - "stashPop reports conflicts via structured `{ ok: false, conflict, error }` results instead of throwing"

requirements-completed: [STH-01, STH-02]
completed: 2026-04-03
---

# Phase 62 Plan 01: Git Stash Primitives Summary

**Added stash push/pop/detection helpers in the git layer and covered them with real-repo unit tests**

## Accomplishments

- Added `stashPush()` with `--include-untracked` support and an explicit "nothing to stash" error path
- Added `stashPop()` with structured conflict reporting
- Added `hasAutoStash()` to detect pre-existing `git-stacks auto-stash` entries
- Extended `tests/lib/git.test.ts` with tracked, untracked, conflict, and detection coverage

## Files Created/Modified

- `src/lib/git.ts`
- `tests/lib/git.test.ts`

## Self-Check: PASSED

- FOUND: `stashPush()`
- FOUND: `stashPop()`
- FOUND: `hasAutoStash()`
- FOUND: stash primitive test coverage
