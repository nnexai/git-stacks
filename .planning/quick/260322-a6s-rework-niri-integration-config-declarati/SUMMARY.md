---
status: complete
phase: 260322-a6s
plan: 01
subsystem: integrations/niri
tags: [niri, integration, declarative-config, column-layout, wayland]
dependency_graph:
  requires: [src/lib/niri.ts, src/lib/integrations/types.ts]
  provides: [niri declarative column layout]
  affects: [src/lib/integrations/niri.ts, tests/lib/integrations/niri.test.ts]
tech_stack:
  added: []
  patterns: [declarative column config like tmux panes, TDD red-green, snapshotWindowIds for window ID tracking]
key_files:
  created: []
  modified:
    - src/lib/integrations/niri.ts
    - tests/lib/integrations/niri.test.ts
decisions:
  - "source: windows use bag niriWindowIds directly — no re-spawn, already on compositor after Step 2 moves"
  - "app: vs command: distinction: app uses niriSpawn (no shell, argv array), command uses niriSpawnSh (shell, string)"
  - "repo: takes precedence over cwd: for resolving cwd in command: windows — matches tmux pane surface pattern"
  - "Workspace columns override global columns (not merged) — simpler and more predictable for users"
  - "Width applied after all windows placed in column, using first window's ID for focus target"
metrics:
  duration: 3min
  tasks_completed: 2
  files_modified: 2
  completed_date: "2026-03-22"
---

# Phase 260322-a6s Plan 01: Rework Niri Integration Config to Declarative Columns Summary

Rewrote niri integration from flat `commands: string[]` config to a declarative `columns` structure with `app:`, `command:`, and `source:` window types, plus column width and stacking via niri IPC.

## Objective

Match the declarative layout approach of tmux/cmux pane configs, giving users control over window arrangement in niri workspaces. Windows can spawn apps, run shell commands (with repo-resolved cwd), or reference prior integration windows (IDE/tmux) already in the ArtifactBag.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add 4 new niri.ts IPC wrappers and update NiriCommands | 596f10a | src/lib/niri.ts, tests/lib/niri.test.ts |
| 1 (TDD-RED) | Failing tests for declarative column config | bbd2b10 | tests/lib/integrations/niri.test.ts |
| 2 (TDD-GREEN) | Rewrite niri integration for declarative columns | 468d564 | src/lib/integrations/niri.ts |

Note: Task 1 (niri.ts wrappers + tests) was already committed as `596f10a` from a prior session — the 4 functions (`focusNiriWindow`, `setNiriColumnWidth`, `consumeOrExpelWindowLeft`, `niriSpawnSh`) and NiriCommands interface with 14 signatures were already complete. This plan executed Task 2 (integration rewrite) as TDD.

## Implementation Details

### New Config Schema (niri integration)

```typescript
columns: [
  {
    width: "60%",           // optional — focus first window, setNiriColumnWidth
    windows: [
      { source: "vscode" },                                    // from ArtifactBag
      { app: "ghostty", args: ["--window-title", "shell"] },   // niriSpawn (no shell)
      { command: "ghostty -e npm run dev", repo: "backend" },  // niriSpawnSh (shell, cd prepended)
      { command: "ghostty", cwd: "/tmp" },                     // niriSpawnSh (shell, literal cwd)
    ],
  }
]
```

### open() Processing Order

1. NIRI_SOCKET gate (early return if not running)
2. Create/reuse named niri workspace (focusNiriWorkspaceDown + setNiriWorkspaceName or focusNiriWorkspace)
3. Move all ArtifactBag window artifacts to the workspace via moveWindowToWorkspace
4. Process columns sequentially:
   - For each window: source/app/command dispatch
   - Stack windows 2+ via consumeOrExpelWindowLeft
   - Apply column width via focusNiriWindow + setNiriColumnWidth

### Config Precedence

Workspace settings `columns` override global config `columns` (not merged). If workspace has no columns, global config is used. This mirrors the existing tmux pane config approach.

## Deviations from Plan

None — plan executed exactly as written. Task 1 was already implemented; proceeded directly to Task 2 TDD.

## Test Coverage

| Test Group | Count | Status |
|------------|-------|--------|
| NIRI_SOCKET gate | 2 | Pass |
| Workspace creation | 3 | Pass |
| Window moves | 5 | Pass |
| Column config — app: windows | 2 | Pass |
| Column config — command: windows | 3 | Pass |
| Column config — source: windows | 3 | Pass |
| Column config — width and stacking | 4 | Pass |
| Column config — no-op | 2 | Pass |
| Column config — env var substitution | 3 | Pass |
| Column config — config precedence | 2 | Pass |
| Cleanup | 3 | Pass |
| Registration metadata | 1 | Pass |
| **Total** | **33** | **Pass** |

Full suite: 474 tests pass. Typecheck: clean.

## Known Stubs

None.

## Self-Check: PASSED

- src/lib/integrations/niri.ts: FOUND
- tests/lib/integrations/niri.test.ts: FOUND
- Commit 596f10a (task 1 wrappers): FOUND
- Commit bbd2b10 (TDD RED): FOUND
- Commit 468d564 (TDD GREEN): FOUND
