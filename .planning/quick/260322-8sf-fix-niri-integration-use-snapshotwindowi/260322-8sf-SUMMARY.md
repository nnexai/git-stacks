---
phase: quick
plan: 260322-8sf
subsystem: niri-integration
tags: [bug-fix, niri, integrations, window-management]
dependency_graph:
  requires: []
  provides: [niri-cleanup, niri-snapshot-window-ids, niri-new-workspace-flow]
  affects: [src/lib/niri.ts, src/lib/integrations/niri.ts, src/lib/integrations/vscode.ts, src/lib/integrations/intellij.ts, src/lib/integrations/types.ts, src/lib/integrations/runner.ts, src/lib/workspace-ops.ts]
tech_stack:
  added: []
  patterns: [snapshot-diff window tracking, integration cleanup lifecycle]
key_files:
  created: []
  modified:
    - src/lib/niri.ts
    - src/lib/integrations/types.ts
    - src/lib/integrations/runner.ts
    - src/lib/integrations/niri.ts
    - src/lib/integrations/vscode.ts
    - src/lib/integrations/intellij.ts
    - src/lib/workspace-ops.ts
    - tests/lib/integrations/niri.test.ts
    - tests/lib/integrations/artifacts.test.ts
decisions:
  - "focusNiriWorkspaceDown creates a NEW empty workspace on first open — does not rename current user workspace"
  - "niriWindowIds matching replaces PID matching to fix Electron fork issue"
  - "unset-workspace-name uses positional REFERENCE arg, not --workspace flag"
  - "cleanup() is non-fatal — errors logged as warnings, execution continues"
metrics:
  duration: "5 minutes"
  completed: "2026-03-22"
  tasks: 3
  files: 9
---

# Quick Task 260322-8sf: Fix Niri Integration — Use snapshotWindowIds Summary

**One-liner:** Fixed four niri integration bugs: PID matching replaced with snapshotWindowIds for Electron compatibility, new workspace creation via focusNiriWorkspaceDown instead of renaming current workspace, added unsetNiriWorkspaceName with positional arg, and wired integration cleanup into cleanWorkspace/removeWorkspace/mergeWorkspace.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add niri.ts unset function, extend types, wire cleanup plumbing | c4e3848 | niri.ts, types.ts, runner.ts, workspace-ops.ts |
| 2 | Fix vscode/intellij window capture and niri open/cleanup behavior | 06daee1 | vscode.ts, intellij.ts, niri.ts (integration) |
| 3 | Update tests for new behavior (TDD) | 4d5830d | niri.test.ts, artifacts.test.ts |

## What Was Built

### Bug 1: PID Matching Fails for Electron Apps (FIXED)
VSCode and IntelliJ integrations now call `isNiriRunning()` before spawning. When niri is active, they use `snapshotWindowIds(async () => { spawn(...) })` to diff window IDs before/after launch. The resulting IDs are stored in `WindowArtifact.niriWindowIds`. The niri integration then matches windows by these IDs instead of polling by PID.

### Bug 2: Renames Current Workspace Instead of Creating New One (FIXED)
The niri `open()` method now distinguishes first open vs. re-open:
- **First open** (workspace not in niri): calls `focusNiriWorkspaceDown()` to create a new empty workspace at the end of the list, then `setNiriWorkspaceName(name)` to name it.
- **Re-open** (workspace already named): calls `focusNiriWorkspace(name)` to focus the existing workspace.

### Bug 3: Missing `unsetNiriWorkspaceName` Function (FIXED)
Added to `src/lib/niri.ts` with the correct positional argument syntax: `niri msg action unset-workspace-name <ref>` (NOT `--workspace` flag). Also added `focusNiriWorkspaceDown()` for the new workspace creation flow.

### Bug 4: No Cleanup on Workspace Remove/Clean (FIXED)
- Added optional `cleanup?(ctx: IntegrationContext): Promise<void>` to the `Integration` interface
- Added `runIntegrationCleanup()` to `runner.ts` (non-fatal, logs warnings and continues)
- Wired into `cleanWorkspace()`, `removeWorkspace()`, and `mergeWorkspace()` in `workspace-ops.ts`
- Niri integration's `cleanup()` finds the named workspace and calls `unsetNiriWorkspaceName(name)`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed artifacts.test.ts timeout when NIRI_SOCKET is set**
- **Found during:** Task 3 (full test suite run)
- **Issue:** `artifacts.test.ts` runs `vscodeIntegration.open()` with `sh` as the cmd. After Task 2 changes, the vscode integration now calls `isNiriRunning()`. Since the host machine runs niri (`NIRI_SOCKET` is set), `isNiriRunning()` returned `true` and `snapshotWindowIds()` was invoked. The `sh` process doesn't create a niri window, so snapshotWindowIds polled for 5 seconds until the test timeout.
- **Fix:** Added `mock.module("@/lib/niri", ...)` to `artifacts.test.ts` with `isNiriRunning` returning `false`. This prevents snapshotWindowIds from being called in non-niri-specific tests.
- **Files modified:** `tests/lib/integrations/artifacts.test.ts`
- **Commit:** 4d5830d (included in Task 3 commit)

## Known Stubs

None — all functionality is fully wired.

## Self-Check: PASSED

- niri.ts: FOUND
- integrations/niri.ts: FOUND
- Commit c4e3848 (Task 1): FOUND
- Commit 06daee1 (Task 2): FOUND
- Commit 4d5830d (Task 3): FOUND
