---
phase: quick-260322-8sf
verified: 2026-03-22T00:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Quick Task 260322-8sf: Fix Niri Integration Verification Report

**Task Goal:** Fix niri integration: use snapshotWindowIds for window matching, create new workspace instead of renaming current, add unsetNiriWorkspaceName, remove named niri workspace on cleanup/remove
**Verified:** 2026-03-22
**Status:** passed
**Re-verification:** No — initial verification

Additional pre-verified facts provided by caller:
- `bun run typecheck` passes with zero errors
- `bun test tests/` passes: 441 tests, 0 failures
- `bun test tests/lib/integrations/niri.test.ts` passes: 16 tests, 0 failures

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Niri integration matches spawned windows by niri window ID (from snapshotWindowIds), not by PID | ✓ VERIFIED | `niri.ts` integration `open()` iterates `artifact.niriWindowIds` (line 61-63); no PID-based `listNiriWindows` call present |
| 2   | On first open, niri creates a NEW workspace (focus-workspace-down), names it, and moves windows there | ✓ VERIFIED | `!alreadyNamed` branch calls `focusNiriWorkspaceDown()` then `setNiriWorkspaceName(workspaceName)` (lines 53-55) |
| 3   | On re-open, niri focuses the existing named workspace without creating a new one | ✓ VERIFIED | `alreadyNamed` branch calls only `focusNiriWorkspace(workspaceName)` (line 49); `focusNiriWorkspaceDown` not called |
| 4   | cleanWorkspace and removeWorkspace unset the niri workspace name via integration cleanup | ✓ VERIFIED | Both call `runIntegrationCleanup(ctx)` at lines 246, 316 in `workspace-ops.ts`; `mergeWorkspace` also calls it at line 413 |
| 5   | unsetNiriWorkspaceName function exists in niri.ts using positional REFERENCE arg (not --workspace flag) | ✓ VERIFIED | Function at lines 179-187: uses `["action", "unset-workspace-name", String(workspaceRef)]` — positional, not `--workspace` flag |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/lib/niri.ts` | unsetNiriWorkspaceName function + NiriCommands interface entry | ✓ VERIFIED | `unsetNiriWorkspaceName` exported at line 179; in `NiriCommands` interface at line 53; `focusNiriWorkspaceDown` also present at lines 57, 170 |
| `src/lib/integrations/types.ts` | WindowArtifact with niriWindowIds, Integration with cleanup method | ✓ VERIFIED | `niriWindowIds?: number[]` at line 19; `cleanup?(ctx: IntegrationContext): Promise<void>` at line 71 |
| `src/lib/integrations/runner.ts` | runIntegrationCleanup function | ✓ VERIFIED | Exported at lines 35-48; iterates integrations, calls `cleanup` if present, non-fatal catch |
| `src/lib/integrations/niri.ts` | Fixed open() with new workspace creation and niriWindowIds matching, cleanup() implementation | ✓ VERIFIED | `focusNiriWorkspaceDown` + `setNiriWorkspaceName` on first open (lines 53-55); niriWindowIds loop (lines 59-70); `cleanup()` at lines 93-100 |
| `src/lib/integrations/vscode.ts` | snapshotWindowIds usage for niri window capture | ✓ VERIFIED | Import at line 7; usage at line 43 inside `niriActive` branch |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `src/lib/integrations/vscode.ts` | `src/lib/niri.ts` | snapshotWindowIds import | ✓ WIRED | `import { isNiriRunning, snapshotWindowIds } from "../niri"` at line 7; `snapshotWindowIds(async () => { ... })` called at line 43 |
| `src/lib/integrations/niri.ts` | `WindowArtifact.niriWindowIds` | artifact bag window matching | ✓ WIRED | `artifact.niriWindowIds?.length` guard at line 61; `for (const windowId of artifact.niriWindowIds)` loop at line 62 |
| `src/lib/workspace-ops.ts` | `src/lib/integrations/runner.ts` | runIntegrationCleanup call in cleanWorkspace/removeWorkspace | ✓ WIRED | `import { runIntegrations, runIntegrationCleanup }` at line 29; called at lines 246 (clean), 316 (remove), 413 (merge) |
| `src/lib/integrations/niri.ts cleanup()` | `src/lib/niri.ts` | unsetNiriWorkspaceName import | ✓ WIRED | `unsetNiriWorkspaceName` imported at line 16; called in `cleanup()` at line 98 |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| BUG-niri-pid | PID matching fails for Electron apps — use snapshotWindowIds | ✓ SATISFIED | vscode.ts and intellij.ts both use `snapshotWindowIds` when niri is active; niri integration matches by `niriWindowIds` not PID |
| BUG-niri-workspace-create | Integration renames current workspace instead of creating a new one | ✓ SATISFIED | `focusNiriWorkspaceDown()` creates new workspace before naming; existing workspace branch uses `focusNiriWorkspace` (re-open path) |
| BUG-niri-cleanup | No cleanup on workspace remove/clean | ✓ SATISFIED | `runIntegrationCleanup` wired into `cleanWorkspace`, `removeWorkspace`, and `mergeWorkspace`; niri `cleanup()` calls `unsetNiriWorkspaceName` |

### Anti-Patterns Found

No blockers or stubs detected. All reviewed files contain substantive implementations:

- No `TODO`/`FIXME`/placeholder comments in modified files
- No empty return stubs — `cleanup()` has real guard logic and calls niri IPC
- `niriWindowIds` flows from `snapshotWindowIds` capture through to `moveWindowToWorkspace` — not hardcoded empty

Minor note: `NiriCommands` interface comment at line 46 in `niri.ts` says "8 functions" but the interface now has 10 (`unsetNiriWorkspaceName` and `focusNiriWorkspaceDown` added). This is a stale comment — no behavioral impact. Info-level only.

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `src/lib/niri.ts` | 46 | Comment says "8 functions" but interface has 10 | ℹ️ Info | None — doc-only, no behavioral effect |

### Human Verification Required

None. All goal behaviors are verifiable statically:
- Workspace creation path (focusNiriWorkspaceDown vs focusNiriWorkspace) is covered by 3 deterministic tests
- Cleanup path covered by 3 tests (exists, not running, name not found)
- niriWindowIds matching covered by 5 tests (single, multiple, missing, empty, failure-resilience)
- Integration wired into clean/remove/merge — all three call sites present in workspace-ops.ts

### Gaps Summary

No gaps. All five observable truths are verified, all four artifacts pass existence + substantive + wiring checks, all four key links are wired, and all three bug requirements are satisfied. The 16-test niri integration suite (caller-verified passing) exercises every new behavior path.

---

_Verified: 2026-03-22_
_Verifier: Claude (gsd-verifier)_
