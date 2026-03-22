---
phase: quick-260322-m2k
plan: 01
subsystem: lifecycle/hooks
tags: [hook-env-vars, rename, breaking-change, lifecycle, niri, messaging]
dependency_graph:
  requires: []
  provides: [GS_prefix hook env vars, buildRepoEnv helper]
  affects: [workspace-ops, workspace-wizard, dashboard, niri-integration, install, message, tests, docs]
tech_stack:
  added: []
  patterns: [buildRepoEnv helper for DRY per-repo env construction]
key_files:
  modified:
    - src/lib/workspace-ops.ts
    - src/tui/workspace-wizard.ts
    - src/tui/dashboard/App.tsx
    - src/lib/integrations/niri.ts
    - src/commands/install.ts
    - src/commands/message.ts
    - tests/lib/workspace-ops.test.ts
    - tests/lib/integrations/niri.test.ts
    - CLAUDE.md
    - README.md
    - CHANGELOG.md
decisions:
  - buildRepoEnv exported helper added to workspace-ops.ts to eliminate inline per-repo env duplication
  - openWorkspace now uses buildBaseEnv (injects GS_TRIGGERED_BY=open) instead of bare inline object
  - workspace-wizard and dashboard create flows construct env manually (no Workspace object yet) with GS_TRIGGERED_BY=create
metrics:
  duration: "3 minutes"
  completed: "2026-03-22"
  tasks: 2
  files: 11
---

# Phase quick-260322-m2k Plan 01: Unify Hook Env Vars (GS_ prefix rename) Summary

**One-liner:** Renamed all 8 hook environment variables from WS_ prefix to GS_ prefix with consistent suffix conventions, extracted buildRepoEnv helper, and wired GS_TRIGGERED_BY into all lifecycle operations including open and create.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rename env vars in production code | 2284e1e | workspace-ops.ts, workspace-wizard.ts, App.tsx, niri.ts, install.ts, message.ts |
| 2 | Update tests and documentation | 0a75e2f | workspace-ops.test.ts, niri.test.ts, CLAUDE.md, README.md, CHANGELOG.md |

## Variable Mapping Applied

| Old | New |
|-----|-----|
| WS_WORKSPACE | GS_WORKSPACE_NAME |
| WS_BRANCH | GS_WORKSPACE_BRANCH |
| WS_TASKS_DIR | GS_WORKSPACE_PATH |
| WS_TRIGGERED_BY | GS_TRIGGERED_BY |
| WS_REPO_NAME | GS_REPO_NAME |
| WS_REPO_PATH | GS_REPO_PATH |
| WS_MAIN_PATH | GS_REPO_CLONE_PATH |
| WS_MERGED_BRANCH | GS_MERGED_BRANCH |

## Decisions Made

1. **buildRepoEnv exported helper** — extracted from inline duplication in `_executeClean` and `openWorkspace` into a shared exported function. Takes `baseEnv` + a `{ name, task_path, main_path }` repo-shaped object.

2. **openWorkspace now uses buildBaseEnv** — previously had its own inline `{ WS_WORKSPACE, WS_BRANCH, WS_TASKS_DIR }` without `GS_TRIGGERED_BY`. Now uses `buildBaseEnv(workspace, tasksDir, "open")` which injects `GS_TRIGGERED_BY=open`.

3. **Create flows construct env manually** — workspace-wizard and dashboard create flows cannot call `buildBaseEnv` because the `Workspace` object doesn't exist yet during create. They construct the `Record<string, string>` directly with all four GS_ keys including `GS_TRIGGERED_BY=create`.

4. **WS_CONFIG_DIR in paths.ts untouched** — internal config constant, not a hook env var, explicitly excluded from scope.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

1. `bun run typecheck` — PASSED (0 errors)
2. `bun test tests/` — PASSED (601 pass, 0 fail)
3. No WS_ hook env vars remain in src/ or scoped test files — CONFIRMED (grep returns empty)
4. WS_CONFIG_DIR in paths.ts untouched — CONFIRMED

## Known Stubs

None.

## Self-Check: PASSED

- 2284e1e commit confirmed in git log
- 0a75e2f commit confirmed in git log
- All 11 files modified and committed
- Full test suite passes (601/601)
- TypeScript compiles clean
