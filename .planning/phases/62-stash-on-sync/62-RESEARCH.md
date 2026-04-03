# Phase 62: Stash on Sync — Research

**Researched:** 2026-04-03
**Status:** Complete

## Objective

Research the technical approach for adding `--stash` flag to `git-stacks sync` that auto-stashes dirty worktree repos before sync, pops in reverse order after, with double-stash guard and conflict recovery UX.

## Current State Analysis

### syncWorkspace() Flow (src/lib/workspace-ops.ts, line 1027)

The current `syncWorkspace` function:
1. Reads workspace and filters worktree repos
2. Resolves base branches per repo
3. Parallel fetch all repos (tracks fetch failures)
4. Dry-run conflict check in parallel via `getMergeConflicts`
5. Sequential rebase/merge per repo (skips conflict repos, fetch failures, missing paths)
6. Returns `SyncResult { ok, synced[], skipped[], error? }`

**Key finding:** `syncWorkspace` has NO dirty check. It relies on git's own refusal to rebase/merge with uncommitted changes. When git rebase fails due to dirty state, the repo is added to `skipped` with the git error message. This means stash integration wraps cleanly around the existing flow.

### SyncResult Type (line 1013)

```ts
export type SyncResult = {
  ok: boolean
  synced: Array<{ repo: string; commits: number }>
  skipped: Array<{ repo: string; reason: string }>
  error?: string
}
```

The type needs extension for stash pop failures — these are different from sync failures (sync succeeded but workspace is in inconsistent state).

### SyncRow Type (line 1020)

```ts
export type SyncRow = {
  repo: string
  status: "pending" | "fetching" | "rebasing" | "synced" | "skipped" | "failed"
  detail: string
  conflicts: string[]
}
```

New status values needed: `"stashing"` and `"popping"` for TUI progress display.

### TUI Sync Flow (src/tui/dashboard/App.tsx, line 344)

`executeSync()` calls `syncWorkspace(name, { strategy: "rebase", bestEffort: true }, onProgress)`. It creates initial rows from workspace repos and updates via `setSyncRows`. The `SyncProgressView` component renders rows with spinners for active states.

**Integration point for TUI:** Per decision D-01, TUI should auto-stash when dirty repos are detected — equivalent to always passing `stash: true`.

### Git Primitives (src/lib/git.ts)

Existing relevant functions:
- `isRepoDirty(repoPath)` — checks `git status --porcelain` (line 50)
- All git ops use `$\`git -C ...\`.quiet().nothrow()` pattern

No stash functions exist yet. Need: `stashPush`, `stashPop`, and a `hasAutoStash` guard function.

### Test Patterns (tests/lib/git.test.ts)

Uses `makeTmpDir`, `makeGitRepo` from helpers. Real git commands via `execSync` for setup, then calls actual git functions. No mocking of git — tests use real repos.

For workspace-ops tests, the pattern uses `setupWorkspaceFixture` helper that creates a real git repo, registers it, and creates a workspace pointing to it.

## Technical Approach

### New Git Primitives

**stashPush** — `git stash push --include-untracked -m "git-stacks auto-stash (sync)"`
- Returns `{ ok: true, stashRef: "stash@{0}" }` or `{ ok: false, error: string }`
- The `stashRef` comes from parsing `git stash list` after push (git stash push doesn't output a ref reliably across versions)
- Uses `--include-untracked` per D-07 to capture new files

**stashPop** — `git stash pop`
- Returns `{ ok: true }` or `{ ok: false, conflict: boolean, error: string }`
- Conflict detection: exit code != 0. Check stderr for "CONFLICT" to distinguish conflict from other errors
- Per D-04/D-05: failure preserves stash, continues for other repos

**hasAutoStash** — `git stash list` grepped for marker
- Returns boolean: true if `git-stacks auto-stash` appears in stash list output
- Per D-02/D-03: if found, abort entire sync before any stashing

### syncWorkspace Modification

Add `stash?: boolean` to opts. The flow becomes:

```
Phase 0 (new): Guard — check for existing auto-stash entries
Phase 1 (new): Stash all dirty worktree repos, record which were stashed
Phase 2 (existing): Fetch + conflict check + rebase/merge
Phase 3 (new): Pop stashes in reverse order
```

**Pop failure handling:** Each pop failure adds to a `stashPopFailures` array on SyncResult. The overall `ok` is set to `false` if any pop fails (per D-04). The recovery message includes `git -C <path> stash pop` per D-06.

### SyncResult Extension

```ts
export type SyncResult = {
  ok: boolean
  synced: Array<{ repo: string; commits: number }>
  skipped: Array<{ repo: string; reason: string }>
  stashPopFailures?: Array<{ repo: string; error: string }>
  error?: string
}
```

The `stashPopFailures` field is optional — only present when `--stash` was used and pop failures occurred.

### SyncRow Extension

Add two new status values to support TUI progress:
- `"stashing"` — during the stash push phase
- `"popping"` — during the stash pop phase

These need to be added to both the `SyncRow` type in workspace-ops.ts and the `SyncRow` type in `SyncProgressView.tsx` (which is a duplicate type — both need updating).

### CLI Integration

Add `--stash` option to the `sync` command in `src/commands/workspace.ts`. Pass through to `syncWorkspace`. Incompatible with `--dry-run` (error). `--force` takes precedence (harmless).

### TUI Integration

In `App.tsx` `executeSync()`, check dirty repos before calling `syncWorkspace`. If any are dirty, pass `stash: true` automatically per D-01. Show stash/pop progress via existing `SyncProgressView` with new status values.

### Options Interaction

Per D-09:
- `--stash` + `--dry-run`: Error, abort early
- `--stash` + `--force`: Redundant but harmless — `--force` skips dirty check, stash has nothing to stash
- `--stash` + `--all`: Works naturally — stash applies per-workspace

## Validation Architecture

### Critical Paths
1. **Happy path**: dirty repo → stash → sync → pop → clean state
2. **Pop conflict**: dirty repo → stash → sync (changes same files) → pop fails → stash preserved, error reported
3. **Double-stash guard**: existing auto-stash → refuse entire sync
4. **No dirty repos**: --stash passed but nothing dirty → sync runs normally (no-op stash phase)
5. **Stash push failure**: git stash fails → abort sync for that workspace

### Edge Cases
- Repo with only untracked files (no modified tracked files) — `--include-untracked` handles this
- Mixed dirty/clean repos — only dirty ones get stashed, clean ones sync directly
- Partial pop failure — one repo conflicts, others pop fine (per D-05)
- `--best-effort` + `--stash` — stash dirty repos, best-effort on conflicts during sync, pop all stashed

### Test Strategy
- Unit tests for `stashPush`, `stashPop`, `hasAutoStash` in git.test.ts using real git repos
- Integration test for `syncWorkspace` with `stash: true` — create dirty repo, sync, verify clean state after
- Double-stash guard test — pre-existing stash entry blocks sync
- Pop failure test — create a scenario where pop would conflict (harder to set up reliably; may need staged conflict)

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/git.ts` | Add `stashPush`, `stashPop`, `hasAutoStash` functions |
| `src/lib/workspace-ops.ts` | Extend `SyncResult`, `SyncRow`, modify `syncWorkspace` for stash flow |
| `src/commands/workspace.ts` | Add `--stash` option to sync command |
| `src/tui/dashboard/App.tsx` | Auto-stash in TUI sync, pass `stash: true` |
| `src/tui/dashboard/SyncProgressView.tsx` | Handle new `stashing`/`popping` statuses |
| `tests/lib/git.test.ts` | Tests for stash primitives |
| `tests/lib/workspace-ops.test.ts` | Integration tests for stash-on-sync flow |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `git stash pop` conflict detection varies by git version | Pop failure misreported | Use exit code as primary signal; stderr "CONFLICT" as supplementary |
| Stash push on empty dirty state (git stash push returns 1 when nothing to stash) | False failure | Check `isRepoDirty` before attempting stash, skip if clean |
| TUI auto-stash surprises users who didn't expect stash | User confusion | Stash/pop progress is clearly visible in SyncProgressView |

## RESEARCH COMPLETE
