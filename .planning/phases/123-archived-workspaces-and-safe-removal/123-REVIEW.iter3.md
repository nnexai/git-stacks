---
phase: 123-archived-workspaces-and-safe-removal
reviewed: 2026-07-16T08:53:30Z
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

**Reviewed:** 2026-07-16T08:53:30Z
**Depth:** standard
**Files Reviewed:** 46
**Status:** issues_found

## Summary

The five findings from the previous review are closed: terminal creation now participates in lifecycle admission through registration, normal removal rechecks dirtiness at the destructive boundary, definition identity and fingerprint are guarded through mutation, web confirmation retains its original revision, and TUI multi-selection no longer collapses into a single-target removal. The fresh review found one release-blocking archive correctness defect and one lifecycle robustness issue.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-06: An already-archived request reports terminal shutdown without closing terminals

**Classification:** BLOCKER

**File:** `packages/service/src/policy/workspace-lifecycle.ts:109-133`

**Related:** `tests/lib/service/workspace-lifecycle-operations.test.ts:160-168`

**Issue:** The coordinator returns early whenever an archive transition is already satisfied, including the stale-revision convergence path. Both early returns hard-code `terminals_stopped: true` but bypass `terminals.closeWorkspace()`. This is reachable when the authoritative definition was archived outside this coordinator while the service still owns a terminal, and it violates the locked contract that every Archive request closes and confirms every workspace terminal. The current test cements the incorrect behavior by asserting that the close call never occurs. The operation can therefore report successful terminal cleanup while an archived workspace still has a live PTY.

**Fix:** Keep archive state mutation idempotent, but do not make terminal cleanup conditional on the archive bit. For every `workspace.archive` request, close and confirm the target's service terminals under the lifecycle lease before returning success; if the state is already archived, skip only the core archive mutation. Report `terminals_stopped: true` only after a successful close result, and add deterministic coverage for an already-archived target with a live terminal and for close failure in that state.

## Warnings

### WR-01: A stalled terminal launch resolution can indefinitely block workspace lifecycle

**Classification:** WARNING

**File:** `packages/service/src/web/terminal-manager.ts:147-154`

**Related:** `packages/service/src/policy/workspace-lifecycle-admission.ts:57-78`

**Issue:** The terminal-create admission token is held across `await snapshot.resolveTerminalLaunch()`, but that call is neither bounded nor cancellable from the router. A launch resolution that never settles leaves `terminalCreates` above zero forever. A subsequent archive or removal queues indefinitely in `acquire()`, while later terminal creates are rejected because a lifecycle waiter exists. The CR-01 fix correctly closes the creation ABA window, but without cancellation it turns a hung snapshot/Git resolution into a permanent per-workspace lifecycle deadlock.

**Fix:** Give terminal launch resolution a bounded cancellation contract. Pass an `AbortSignal` through the snapshot adapter, enforce a service-side timeout, and guarantee the admission token is released when resolution aborts or times out. Add a deterministic never-settling-resolution test that proves lifecycle either acquires after cancellation or fails within the documented bound and that later operations can recover.

## Previous Finding Closure

- **CR-01 closed:** `admitTerminal()` is acquired before launch resolution and released only after PTY spawn/session registration or failure; queued lifecycle work blocks later creates, and the paused-resolution test exercises the barrier.
- **CR-02 closed:** normal removal performs a fresh dirty-worktree check under the definition lease immediately before destructive worktree removal and passes `force: false`; only force removal passes `force: true`.
- **CR-03 closed:** archive, unarchive, and removal carry the stable ID into core, capture the exact definition path and raw-content fingerprint, revalidate under the mutation lease, and delete the guarded path directly.
- **CR-04 closed:** web lifecycle targets capture an immutable `expectedRevision`, and force confirmation rejects revision drift before dispatch.
- **CR-05 closed:** TUI Remove exits for multi-selection, shows explicit one-at-a-time copy, and rendered two-selection coverage proves no dialog or request is produced.

---

_Reviewed: 2026-07-16T08:53:30Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
