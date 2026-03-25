---
plan: 33-03
phase: 33-name-based-identity
status: complete
completed: 2026-03-25
---

# Plan 33-03 Summary: D-12 Corrupt-YAML Regression Fix

## What Was Built

Single-line fix restoring the D-12 malformed-YAML recovery path in `removeWorkspace`.

**Root cause:** scan-based `workspaceExists` skips corrupt YAML files (safeParse fails), so it returned `false` for a workspace whose `.yml` exists on disk but is malformed. This made the D-12 try/catch block at line 428 unreachable — `removeWorkspace` returned "not found" instead.

**Fix:** Changed the guard from `if (!workspaceExists(name))` to `if (!workspaceExists(name) && !existsSync(workspacePath(name)))`. If the file exists on disk but the scan can't parse it, execution falls through to the existing D-12 try/catch block.

## Key Files

- `src/lib/workspace-ops.ts` — line 424: added `&& !existsSync(workspacePath(name))` fallback

## Test Results

- 60/60 workspace-ops tests pass (was 58/60 before fix)
- Both D-12 tests restored: `removeWorkspace --force with malformed YAML succeeds` and `removeWorkspace without --force and malformed YAML returns error`

## Self-Check: PASSED
