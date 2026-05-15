---
status: complete
phase: quick-260321-u1l
plan: "01"
subsystem: agent-hooks
tags: [agent-hooks, claude-code, install-command, plugin-system]
dependency_graph:
  requires: []
  provides: [agent-hook-plugin-system, install-command]
  affects: [src/index.ts]
tech_stack:
  added: []
  patterns: [plugin-registry, idempotent-json-merge, cwd-workspace-detection]
key_files:
  created:
    - src/lib/agent-hooks/types.ts
    - src/lib/agent-hooks/claude-code.ts
    - src/lib/agent-hooks/index.ts
    - src/commands/install.ts
    - tests/lib/agent-hooks.test.ts
  modified:
    - src/index.ts
decisions:
  - claudeCodePlugin filters existing git-stacks hooks by command.includes("git-stacks") for idempotency — avoids matcher-based deduplication complexity
  - detectWorkspaceFromCwd() defined in install.ts (not workspace-ops.ts) per plan — install-specific logic, not general workspace operation
  - install --remove removes all plugins (no plugin multi-select) for simplicity — uninstall is all-or-nothing
metrics:
  duration_seconds: 119
  completed_date: "2026-03-21T20:43:26Z"
  tasks_completed: 2
  files_created: 5
  files_modified: 1
---

# Quick Task 260321-u1l: git-stacks install hooks agent framework Summary

**One-liner:** Extensible agent hook plugin system with `git-stacks install --hooks` command that installs Claude Code notification hooks into workspace worktree repos via idempotent JSON merge.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 (RED) | Add failing tests for agent hook plugin system | f76c2cc | Done |
| 1 (GREEN) | Implement agent hook plugin system and Claude Code plugin | f1015bc | Done |
| 2 | Add install command with workspace detection and registration | c88a7fb | Done |

## What Was Built

### Agent Hook Plugin System (`src/lib/agent-hooks/`)

- `types.ts`: `HookEntry` type (event, optional matcher, command) and `AgentHookPlugin` interface (id, label, generateHookEntries, install, remove)
- `claude-code.ts`: `claudeCodePlugin` implementing the interface — generates 4 hook entries (Stop/PreToolUse/UserPromptSubmit/PostToolUse) that invoke `git-stacks message send/clear`; install merges into `.claude/settings.json` with idempotency; remove strips only git-stacks entries
- `index.ts`: Plugin registry array `agentHookPlugins = [claudeCodePlugin]`; re-exports types

### Install Command (`src/commands/install.ts`)

- `git-stacks install --hooks`: Detects workspace from cwd path segments or `WS_WORKSPACE` env variable; falls back to `p.select()` prompt when cwd is not inside a tasks directory
- Multi-select agent frameworks via `p.multiselect()`; iterates worktree-mode repos and calls `plugin.install(repo.task_path, workspace.name)`
- `--remove` flag: removes all plugin hooks from all worktree repos without prompting for plugin selection
- Registered in `src/index.ts` before the completion command

## Verification Results

- `bun test tests/lib/agent-hooks.test.ts`: 9 pass, 0 fail
- `bun run typecheck`: clean (no errors)
- `bun run src/index.ts install --help`: shows command with --hooks and --remove options

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

Files exist:
- src/lib/agent-hooks/types.ts: FOUND
- src/lib/agent-hooks/claude-code.ts: FOUND
- src/lib/agent-hooks/index.ts: FOUND
- src/commands/install.ts: FOUND
- tests/lib/agent-hooks.test.ts: FOUND

Commits exist:
- f76c2cc: FOUND
- f1015bc: FOUND
- c88a7fb: FOUND
