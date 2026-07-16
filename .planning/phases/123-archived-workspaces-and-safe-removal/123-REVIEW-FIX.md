---
phase: 123-archived-workspaces-and-safe-removal
fixed_at: 2026-07-16T09:28:05Z
review_path: .planning/phases/123-archived-workspaces-and-safe-removal/123-REVIEW.md
iteration: 3
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 123: Code Review Fix Report

**Fixed at:** 2026-07-16T09:28:05Z
**Source review:** `.planning/phases/123-archived-workspaces-and-safe-removal/123-REVIEW.md`
**Iteration:** 3

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### CR-07: A cancelled queued removal can still delete the workspace and finish as cancelled

**Files modified:** `packages/service/src/policy/operations.ts`, `packages/service/src/policy/workspace-lifecycle-admission.ts`, `packages/service/src/policy/workspace-lifecycle.ts`, `tests/lib/service/workspace-lifecycle-operations.test.ts`
**Commit:** `0825eead`
**Applied fix:** Durable operations now carry an abortable cancellation context into lifecycle execution. Per-workspace admission removes and rejects an aborted waiter, and the coordinator checks cancellation immediately after lease acquisition. The first terminal or filesystem mutation atomically seals the safe-cancellation boundary, so a pre-boundary cancellation performs no terminal/core mutation while a late cancellation is ignored and the durable operation records its truthful succeeded or failed result. A deterministic queued-removal regression proves waiter removal, zero terminal/filesystem calls, preserved target state, and a durable cancelled terminal state; existing target-scoped concurrency coverage remains green.
**Verification status:** fixed; the state-machine logic is covered deterministically and remains available for milestone-end human verification.

### WR-02: A transient terminal cleanup failure is permanently cached for later archive retries

**Files modified:** `packages/service/src/web/terminal-manager.ts`, `tests/service/web-terminal.test.ts`
**Commit:** `96311332`
**Applied fix:** `closePromise` remains shared only while a close attempt is in flight. Settlement clears the cached promise when the session remains `cleanup_failed`, while confirmed successful exit stays terminal and is finalized normally. A fake PTY regression proves the first TERM/KILL cycle can fail, a later `closeWorkspace()` starts a fresh TERM attempt, that retry succeeds, and the session is removed.
**Verification status:** fixed; retry and concurrent-settlement behavior are covered deterministically and remain available for milestone-end human verification.

## Verification Evidence

- `npm run test:vitest -- --run tests/lib/service/operations.test.ts tests/lib/service/workspace-lifecycle-operations.test.ts tests/service/web-terminal.test.ts`: 3 files, 36 tests passed.
- `npm run typecheck`: all seven workspace typechecks passed.
- `npm run test:deps`: package architecture passed.
- `npm run tui:build`: TUI distribution built successfully before the final full run.
- `npm test`: exit 0 after isolated-worktree dependency wiring was corrected; package builds passed, Vitest passed 136 files / 1802 tests, Node runtime passed 42 / 42 tests, and the complete TUI batch passed.
- `git diff --check`: clean for both fix commits.

## Skipped Issues

None.

---

_Fixed: 2026-07-16T09:28:05Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 3_
