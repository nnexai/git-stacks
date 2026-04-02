---
phase: 54
plan: 2
title: "Env command registration and CLI integration"
subsystem: commands
tags: [cli, env, workspace-ops]
requires: [54-01]
provides: [git-stacks env command]
affects: [src/commands/workspace.ts]
tech-stack:
  added: []
  patterns: [Option constructor with .choices() for enum options, CWD auto-detection pattern]
key-files:
  modified:
    - src/commands/workspace.ts
decisions:
  - Used `new Option(...).choices(...)` pattern (consistent with existing list/paths/sync commands in the file)
  - env command auto-detects both workspace AND repo from CWD when no explicit args given
  - tasksDir passed to buildBaseEnv is workspace-scoped (join(getTasksDir(root), ws.name)) per the workspace env context
metrics:
  duration: 124s
  completed: "2026-04-02"
  tasks_completed: 3
  files_modified: 1
---

# Phase 54 Plan 2: Env Command Registration and CLI Integration Summary

**One-liner:** `git-stacks env [workspace]` wired to env formatting library with `--format` choices and CWD auto-detection for both workspace and repo.

## Tasks Completed

| Task | Title | Commit | Files |
|------|-------|--------|-------|
| 54-02-01 | Add env command to workspace commands | 6938ed4 | src/commands/workspace.ts |
| 54-02-02 | Add format choices to completion generator | 6938ed4 | src/commands/workspace.ts |
| 54-02-03 | Verify full CLI integration | 6938ed4 | — (verification only) |

## What Was Built

The `git-stacks env [workspace]` command was added to `src/commands/workspace.ts` inside `registerWorkspaceCommands()`. It:

1. Accepts an optional `[workspace]` positional arg; falls back to `detectWorkspaceFromCwd()` if omitted.
2. `--format <format>` option with `.choices(["table", "shell", "dotenv", "json"])` (default `"table"`) — enables tab completion and enforces valid values.
3. `--repo <name>` option to append repo-specific `GS_REPO_*` vars via `buildRepoEnv()`.
4. When CWD detection is used (no workspace arg), also runs `detectRepoFromCwd()` to automatically add repo vars.
5. Calls `buildBaseEnv(ws, tasksDir, "env")` then optionally `buildRepoEnv()`, then `formatEnv(env, format)` and `console.log`.
6. Clear error messages for: workspace not found, format invalid, repo not found.

## Decisions Made

- `new Option(...).choices(...)` pattern used (already established in `list`, `paths`, `sync` commands in same file)
- `tasksDir` passed to `buildBaseEnv` is the workspace-level tasks path: `join(getTasksDir(root), ws.name)` — this matches the `GS_WORKSPACE_PATH` semantics (the path to the workspace folder, not the generic tasks dir)
- CWD auto-detection cascades: if no `--repo` flag and no explicit workspace arg, also detect repo from CWD (convenience for developers running from inside a worktree)

## Deviations from Plan

None — plan executed exactly as written. Tasks 1 and 2 were combined into a single edit since the `addOption(new Option(...).choices(...))` pattern satisfies both requirements.

## Verification

```
bun run typecheck   # PASS
bun run src/index.ts env --help  # shows usage with --format choices and --repo
bun run src/index.ts --help      # env listed in commands
bun run test        # 472 unit + 37 integration files: all PASS
```

## Known Stubs

None.

## Self-Check: PASSED

- src/commands/workspace.ts: modified (git status confirmed)
- Commit 6938ed4: present in git log
- All tests pass
