---
phase: 123-archived-workspaces-and-safe-removal
fixed_at: 2026-07-16T09:11:34Z
review_path: .planning/phases/123-archived-workspaces-and-safe-removal/123-REVIEW.md
iteration: 2
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 123: Code Review Fix Report

**Fixed at:** 2026-07-16T09:11:34Z
**Source review:** `.planning/phases/123-archived-workspaces-and-safe-removal/123-REVIEW.md`
**Iteration:** 2

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### CR-06: An already-archived request reports terminal shutdown without closing terminals

**Files modified:** `packages/service/src/policy/workspace-lifecycle.ts`, `tests/lib/service/workspace-lifecycle-operations.test.ts`
**Commit:** `7591bee1`
**Applied fix:** Archive convergence now skips only the idempotent YAML mutation. It still runs the terminal close barrier under the lifecycle lease and reports `terminals_stopped: true` only after confirmed cleanup. Deterministic coverage exercises successful stale-revision convergence and cleanup failure while proving the archived definition and revision remain unchanged.
**Verification status:** fixed; logic is covered deterministically and remains available for milestone-end human verification.

### WR-01: A stalled terminal launch resolution can indefinitely block workspace lifecycle

**Files modified:** `packages/service/src/web/terminal-manager.ts`, `packages/service/src/policy/snapshot.ts`, `tests/service/web-terminal.test.ts`
**Commit:** `92f2719f`
**Applied fix:** Terminal launch resolution now has a 10-second service deadline, receives an `AbortSignal` through the snapshot adapter, and releases terminal admission on timeout. A late resolver settlement is ignored before PTY allocation or registration. Injected timer/deferred coverage proves lifecycle acquisition, no late spawn, and successful retry without reopening the CR-01 admission race.
**Verification status:** fixed; logic is covered deterministically and remains available for milestone-end human verification.

## Verification Evidence

- `bun test tests/lib/service/workspace-lifecycle-operations.test.ts`: 17 passed, 0 failed.
- `bun test tests/service/web-terminal.test.ts -t "times out a stalled launch"`: 1 passed, 0 failed.
- `bun test tests/lib/service/operations.test.ts tests/service/operations.test.ts`: operation coverage passed in the focused run.
- `bun test tests/lib/service/snapshot.test.ts`: 15 passed, 0 failed in the focused run.
- `npm run typecheck --workspaces --if-present`: all seven workspaces passed.
- `bun run test:deps`: package architecture passed.
- `npm run tui:build && npm test`: exit 0; Vitest 136 files / 1800 tests passed, Node runtime 42 / 42 passed, and the full TUI batch passed.
- Isolated-worktree note: the first full run lacked the optional HTTP/3 native artifact because fresh-install postinstall scripts were blocked. The rerun used the repository's already-built identical dependency artifact; the first clean TUI run also required the repo-defined ignored-artifact prerequisite `npm run tui:build`.

---

_Fixed: 2026-07-16T09:11:34Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 2_
