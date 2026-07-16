---
phase: 123-archived-workspaces-and-safe-removal
fixed_at: 2026-07-16T08:39:00Z
review_path: .planning/phases/123-archived-workspaces-and-safe-removal/123-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 123: Code Review Fix Report

**Fixed at:** 2026-07-16T08:39:00Z  
**Source review:** `.planning/phases/123-archived-workspaces-and-safe-removal/123-REVIEW.md`  
**Iteration:** 1

**Summary:**

- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Terminal creation can cross a completed lifecycle barrier

**Status:** fixed: requires human verification  
**Files modified:** `packages/service/src/policy/workspace-lifecycle-admission.ts`, `packages/service/src/web/terminal-manager.ts`, `packages/service/src/secure/router.ts`, `tests/lib/service/workspace-lifecycle-operations.test.ts`, `tests/service/web-terminal.test.ts`  
**Commit:** `510485de`  
**Applied fix:** Terminal creation now holds a per-workspace admission token across launch resolution, PTY spawn, and session registration. A queued lifecycle request blocks later creates and waits for an already-admitted create, so archive/remove can close the registered terminal before completing. A deterministic paused-resolution regression test proves the ordering and zero-admission behavior while lifecycle is held.

### CR-02: Normal Remove force-deletes worktree changes made after inspection

**Status:** fixed: requires human verification  
**Files modified:** `packages/core/src/git.ts`, `packages/core/src/workspace-lifecycle.ts`, `packages/service/src/policy/workspace-lifecycle.ts`, `tests/lib/workspace-lifecycle.test.ts`, `tests/lib/service/workspace-lifecycle-operations.test.ts`  
**Commit:** `64dbd5c3`  
**Applied fix:** Normal removal now performs a fresh dirty-worktree check after pre-remove and integration cleanup, immediately before the destructive boundary, and invokes Git without `--force`. Only an explicit dirty-authorized Force Remove passes `force: true`. Fresh blockers return the structured repository list with Force Remove eligibility and perform zero destructive calls.

### CR-03: Stable workspace identity is discarded before archive and deletion

**Status:** fixed: requires human verification  
**Files modified:** `packages/core/src/persistence.ts`, `packages/core/src/config.ts`, `packages/core/src/workspace-archive.ts`, `packages/core/src/workspace-lifecycle.ts`, `packages/service/src/policy/workspace-lifecycle.ts`, `tests/lib/workspace-archive.test.ts`, `tests/lib/workspace-lifecycle.test.ts`, `tests/lib/service/workspace-lifecycle-operations.test.ts`  
**Commit:** `64dbd5c3`  
**Applied fix:** The catalog stable ID now reaches archive, unarchive, and removal inspection. Core captures the exact definition path, name, stable ID, and raw-content SHA-256 fingerprint, revalidates them under the definition mutation lease, holds that lease across destructive removal, and deletes the validated path directly. Same-name replacement, same-ID edits, rename-after-inspection, and boundary conflicts abort without following name lookup to recreated state.

### CR-04: Web Remove confirmation silently adopts a newer revision

**Status:** fixed: requires human verification  
**Files modified:** `packages/web/src/app.ts`, `tests/service/web-presentation.test.ts`  
**Commit:** `c1f7d4aa`  
**Applied fix:** Browser lifecycle targets capture `expectedRevision` when the action or modal is created, and submission uses that immutable value. Force confirmation also rejects any revision drift observed during its identity refresh, closes the stale modal, and requires a fresh invocation.

### CR-05: TUI batch Remove silently removes only the first selected workspace

**Status:** fixed: requires human verification  
**Files modified:** `packages/tui/src/App.tsx`, `tests/tui/dashboard/integ-workspace-archive-remove.test.tsx`  
**Commit:** `8f2bfa8e`  
**Applied fix:** Remove is unavailable when more than one workspace is selected, and the batch bar states that removal must be done one workspace at a time. Rendered two-selection coverage proves the shortcut submits no lifecycle request and opens no single-target dialog.

## Verification Evidence

- `npm run typecheck` — passed for all workspaces.
- `npm run test:deps` — passed (`Package architecture: OK`).
- `npm test` — passed after building the ignored TUI distribution artifact required by the published-launcher test: 136 Vitest files / 1,798 tests, 42 Node tests, and the complete TUI suite.
- `bun test tests/service/web-terminal.test.ts --test-name-pattern='terminal barrier contract|in-flight terminal resolve'` — 2 passed.
- `bun test tests/service/web-presentation.test.ts` — 9 passed.
- `bun test --preload @opentui/solid/preload tests/tui/dashboard/integ-workspace-archive-remove.test.tsx --test-name-pattern='multi-workspace Remove'` — 1 passed.
- `bun test tests/lib/workspace-lifecycle.test.ts` — 8 passed.
- `bun test tests/lib/workspace-archive.test.ts` — 5 passed.
- `bun test tests/lib/service/workspace-lifecycle-operations.test.ts` — 16 passed.
- `bun test tests/lib/git.test.ts` — 60 passed.

---

_Fixed: 2026-07-16T08:39:00Z_  
_Fixer: the agent (gsd-code-fixer)_  
_Iteration: 1_
