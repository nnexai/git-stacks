---
phase: 123-archived-workspaces-and-safe-removal
reviewed: 2026-07-16T08:16:30Z
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
  critical: 5
  warning: 0
  info: 0
  total: 5
status: issues_found
---

# Phase 123: Code Review Report

**Reviewed:** 2026-07-16T08:16:30Z
**Depth:** standard
**Files Reviewed:** 46
**Status:** issues_found

## Summary

The shared schemas and projection boundaries are appropriately strict, and the clients keep filesystem and terminal authority in the service/core tiers. The review nevertheless found five release-blocking correctness issues: terminal creation can cross a completed archive barrier, normal removal can force-delete changes made after its dirty check, stable workspace identity is dropped before core mutation, web confirmation can silently adopt a newer revision, and TUI batch removal now removes only one selected workspace.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Terminal creation can cross a completed lifecycle barrier

**Classification:** BLOCKER

**File:** `packages/service/src/web/terminal-manager.ts:141-166`

**Related:** `packages/service/src/policy/workspace-lifecycle-admission.ts:27-41`

**Issue:** `create()` awaits `resolveTerminalLaunch()` before performing the one-shot `assertTerminalAdmission()`. The lifecycle admission removes its target state when a lease is released. Therefore a create can resolve an active workspace, pause while archive acquires the lease, closes all enumerated sessions, persists the archive, reconciles, and releases, then resume and pass the assertion because the admission map is empty again. It subsequently spawns from the stale launch resolution. Archive can report success with `terminals_stopped: true` while a new service-owned PTY is alive for the archived workspace. The current test covers an assertion while a lease remains held, but not this completed-lifecycle ABA race.

**Fix:** Make terminal creation participate in admission for the whole resolve/spawn/register interval. For example, add a terminal-create token that fails while lifecycle is held and increments an in-flight count before resolution; lifecycle acquisition must wait for existing create tokens, and the token is released only after the session is registered (or spawn fails). Add a deterministic test that pauses launch resolution, completes archive, resumes creation, and proves no PTY is spawned.

### CR-02: Normal Remove force-deletes worktree changes made after inspection

**Classification:** BLOCKER

**File:** `packages/core/src/workspace-lifecycle.ts:402-478`

**Related:** `packages/core/src/git.ts:170-172`

**Issue:** `inspectWorkspaceRemoval()` records the dirty-worktree result once. `commitWorkspaceRemovalInternal()` checks only that stored array, then awaits pre-close/pre-clean/pre-remove hooks and integration cleanup before deleting worktrees. There is no fresh dirty check at the destructive boundary, and `removeWorktree()` always invokes `git worktree remove --force`. A hook, editor, agent, or other process can create changes after line 422; normal Remove then deletes those unconfirmed changes despite `allow_dirty` being false. This directly defeats the normal-versus-force safety boundary and is a data-loss risk.

**Fix:** Preserve force as an explicit commit property and make normal removal use non-force `git worktree remove`. Re-check dirtiness after all pre/close/integration hooks and immediately before the first destructive worktree call; return the fresh structured blocker list if anything changed. Add a test that makes a worktree dirty after inspection (including from a pre-remove hook) and proves normal commit performs zero destructive calls while Force Remove still uses the explicit force path.

### CR-03: Stable workspace identity is discarded before archive and deletion

**Classification:** BLOCKER

**File:** `packages/service/src/policy/workspace-lifecycle.ts:105-178`

**Related:** `packages/core/src/workspace-lifecycle.ts:402-478`, `packages/core/src/config.ts:427-440`

**Issue:** The coordinator correctly resolves a stable `workspace_id`, but then calls core archive/removal functions by `target.name` only. Removal stores `definitionPath` in its opaque plan but never uses it for commit; `commitCleanup()` ultimately calls `deleteWorkspace(name)`, which resolves the name again at deletion time. The in-memory admission lease coordinates only this service and does not exclude daemonless CLI or external YAML changes. If the original definition is renamed/replaced after catalog resolution or inspection, archive can mutate a different same-name workspace and removal can delete a newly recreated definition with a different ID, while also using stale repository paths from the old plan. This violates the stated rule that retries/concurrency must not affect unrelated or newly recreated state.

**Fix:** Carry the expected stable ID, resolved definition path, and an inspected definition fingerprint into the core mutation boundary. Under the definition-file mutation lease, re-read the exact path and require the same ID/name/fingerprint before archive or any destructive removal. Delete that validated path directly rather than resolving by name again. On any mismatch, return a conflict and perform no filesystem/Git mutation. Cover same-name replacement and rename-between-inspect-and-commit cases.

### CR-04: Web Remove confirmation silently adopts a newer revision

**Classification:** BLOCKER

**File:** `packages/web/src/app.ts:896-909`

**Related:** `packages/web/src/app.ts:985-1005`

**Issue:** The Remove modal captures an old `Workspace` object, but `submitWorkspaceLifecycle()` reads the mutable global `snapshot.revision` only when the user finally clicks Remove. If an event refreshes the snapshot while the modal is open, the old confirmation is submitted with the new authoritative revision and the server accepts it. A rename, repository change, or other catalog mutation can therefore be deleted without the required refresh-and-reconfirm cycle; the stale confirmation is effectively laundered through the latest revision.

**Fix:** Include `expectedRevision` in the lifecycle target when the action/modal is created and submit that captured value. A conflict should close the stale modal, reconcile, and require the user to invoke Remove again. Add a browser test that opens confirmation at revision 1, refreshes to revision 2 before click, and verifies the request still carries revision 1 and cannot delete until reconfirmed.

### CR-05: TUI batch Remove silently removes only the first selected workspace

**Classification:** BLOCKER

**File:** `packages/tui/src/App.tsx:1389-1399`

**Issue:** The existing batch action remains visible whenever multiple workspaces are selected, but the Phase 123 route takes only `[...selected()][0]` and opens a single-target confirmation. Previously, batch Remove passed `batch: true` and processed every selected name. The UI still reports the multi-selection through `BatchBar`, so pressing Remove with N selected workspaces now removes one arbitrary insertion-order target and silently leaves the rest selected/unprocessed. This is a user-visible regression and makes the confirmation scope disagree with the invoked batch action.

**Fix:** Either disable/hide Remove when more than one workspace is selected with explicit explanatory copy, or implement a safe sequential batch lifecycle flow with per-target inventory/confirmation and dirty-force handling. Do not collapse the selection implicitly. Add rendered coverage for two selected workspaces and assert the chosen behavior and request count.

---

_Reviewed: 2026-07-16T08:16:30Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
