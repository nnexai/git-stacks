---
phase: 123-archived-workspaces-and-safe-removal
reviewed: 2026-07-16T09:19:16Z
depth: standard
files_reviewed: 46
files_reviewed_list:
  - packages/client/src/presentation.ts
  - packages/core/src/config.ts
  - packages/core/src/workspace-archive.ts
  - packages/core/src/workspace-lifecycle.ts
  - packages/core/src/workspace-pins.ts
  - packages/protocol/src/service.ts
  - packages/protocol/src/web.ts
  - packages/service/src/main.ts
  - packages/service/src/policy/client.ts
  - packages/service/src/policy/core-contract.ts
  - packages/service/src/policy/core-state.ts
  - packages/service/src/policy/operations.ts
  - packages/service/src/policy/snapshot.ts
  - packages/service/src/policy/workspace-lifecycle-admission.ts
  - packages/service/src/policy/workspace-lifecycle.ts
  - packages/service/src/secure/router.ts
  - packages/service/src/snapshot-adapter.ts
  - packages/service/src/web/projection.ts
  - packages/service/src/web/terminal-manager.ts
  - packages/tui/src/ActionMenu.tsx
  - packages/tui/src/App.tsx
  - packages/tui/src/ArchivedWorkspacesDialog.tsx
  - packages/tui/src/WorkspaceRemovalDialog.tsx
  - packages/tui/src/hooks/useWorkspaces.ts
  - packages/tui/src/types.ts
  - packages/web/src/app.css
  - packages/web/src/app.ts
  - tests/commands/workspace-destructive-safety.test.ts
  - tests/commands/workspace-lifecycle.test.ts
  - tests/fixtures/service-v1/workspace-snapshot.json
  - tests/lib/service/operations.test.ts
  - tests/lib/service/snapshot.test.ts
  - tests/lib/service/workspace-lifecycle-operations.test.ts
  - tests/lib/workspace-archive.test.ts
  - tests/lib/workspace-lifecycle.test.ts
  - tests/lib/workspace-ops.test.ts
  - tests/lib/workspace-pins.test.ts
  - tests/service-node/secure-contract-runtime.test.mjs
  - tests/service-node/secure-remote-runtime.test.mjs
  - tests/service/operations.test.ts
  - tests/service/web-presentation.test.ts
  - tests/service/web-projection.test.ts
  - tests/service/web-terminal.test.ts
  - tests/tui/dashboard/ActionMenu.test.tsx
  - tests/tui/dashboard/integ-action-menu.test.tsx
  - tests/tui/dashboard/integ-workspace-archive-remove.test.tsx
findings:
  critical: 1
  warning: 1
  info: 0
  total: 2
status: issues_found
---

# Phase 123: Code Review Report

**Reviewed:** 2026-07-16T09:19:16Z
**Depth:** standard
**Files Reviewed:** 46
**Status:** issues_found

## Summary

CR-01 through CR-06 and WR-01 are closed by the six fix commits: terminal creation is serialized and bounded, normal removal rechecks fresh dirtiness without force, stable definition identity survives to the destructive boundary, browser/TUI confirmations remain revision-bound, multi-selection is not collapsed, and already-archived requests execute the terminal barrier truthfully. The capped final review found one release-blocking cancellation defect and one retry robustness defect in the same lifecycle/terminal scope.

Focused deterministic coordinator/core/browser checks passed, as did the TUI lifecycle integration under its required `@opentui/solid/preload` harness. The findings below are uncovered state-machine paths rather than failures contradicted by those tests.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-07: A cancelled queued removal can still delete the workspace and finish as cancelled

**Classification:** BLOCKER

**File:** `packages/service/src/policy/operations.ts:291-296,325-347`

**Related:** `packages/service/src/policy/workspace-lifecycle.ts:97-219`, `packages/service/src/policy/workspace-lifecycle-admission.ts:57-67`

**Issue:** A lifecycle operation consists of one `workspace.lifecycle` step, and that step starts by awaiting the per-workspace admission lease. `OperationRegistry.cancel()` only records the cancellation flag; it does not abort a running step or its admission waiter. The registry checks the flag before entering the step and again only after the whole step returns. Therefore, if operation B is queued in `admission.acquire()` behind operation A and B is cancelled while waiting, B remains in the FIFO. When A releases, B acquires the lease, closes terminals, and can archive or irreversibly remove the workspace. Only afterward does the registry observe the cancellation flag and persist B as `cancelled`. Because the terminal state is not `succeeded`, the managed-service observer also does not publish the normal snapshot invalidation. A caller can thus request cancellation before B crosses any destructive boundary, yet B later performs the destructive action and records a false terminal outcome.

**Fix:** Make the queued lifecycle admission cancellable before the terminal/destructive barrier. Pass an operation cancellation signal into `WorkspaceLifecycleAdmission.acquire()`, remove and reject an aborted waiter, and check cancellation immediately after lease grant and before `closeWorkspace()`. Once terminal shutdown or filesystem mutation begins, reject/ignore late cancellation so the operation reaches a truthful succeeded/failed result (including `snapshot_changed`) instead of being relabeled cancelled. Add a deterministic two-operation test: hold A's lease, queue B removal, cancel B, release A, and assert B performs zero terminal/core mutations, is removed from the waiter queue, and reaches the documented terminal state.

## Warnings

### WR-02: A transient terminal cleanup failure is permanently cached for later archive retries

**Classification:** WARNING

**File:** `packages/service/src/web/terminal-manager.ts:316-347`

**Issue:** `closeSession()` stores the first close attempt in `session.closePromise` so concurrent callers share settlement. When SIGTERM/SIGKILL confirmation fails or killing throws, `closeConfirmed()` sets `state = "cleanup_failed"` and returns, but the settled `closePromise` is never cleared. Every later archive/removal retry calls `closeSession()` and immediately receives that old failed result without sending another signal. Unless the process independently exits or the service restarts, one transient cleanup failure permanently prevents that workspace from being archived or removed, despite the lifecycle contract keeping the active definition intact specifically so the user can retry safely.

**Fix:** Retain `closePromise` only while a close attempt is in flight. Clear it when the attempt settles in `cleanup_failed` (while preserving shared settlement for concurrent callers), so a later explicit retry performs a new TERM/KILL confirmation cycle. Add a deterministic fake-PTY test whose first close attempt fails and second succeeds, then prove a second `closeWorkspace()` retries signals and returns `ok: true`.

## Previous Finding Closure

- **CR-01 closed:** `admitTerminal()` covers resolution through PTY registration, lifecycle waiters block later creates, and launch resolution now has a 10-second abortable deadline whose timeout releases admission and ignores late settlement.
- **CR-02 closed:** normal removal rechecks Git dirtiness after hooks under the guarded definition lease and passes `force: false`; only typed Force Remove passes `force: true`.
- **CR-03 closed:** archive/unarchive/removal carry the stable ID, exact definition path, and raw-content fingerprint to guarded mutation/deletion; definition drift returns a conflict before destructive work.
- **CR-04 closed:** browser lifecycle targets capture an immutable revision at confirmation creation, submit that revision, and refresh/reconfirm on conflict; Force Remove also checks revision and exact current name before dispatch.
- **CR-05 closed:** TUI multi-selection does not open a single-target removal dialog and explicitly renders `Remove one workspace at a time`.
- **CR-06 closed:** already-archived convergence skips only the YAML mutation; it still closes and confirms terminals, and cleanup failure leaves the archived definition and revision unchanged.
- **WR-01 closed:** terminal launch resolution receives an `AbortSignal`, is bounded by the service deadline, releases terminal admission on timeout, and cannot allocate a PTY after late resolution.

---

_Reviewed: 2026-07-16T09:19:16Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
