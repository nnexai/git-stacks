---
phase: 55
plan: 1
title: "Copilot hook plugin and registry update"
subsystem: agent-hooks
tags: [agent-hooks, copilot, plugin, notification]
dependency_graph:
  requires: []
  provides: [copilot-hook-plugin, updated-plugin-registry]
  affects: [src/lib/agent-hooks/index.ts, src/commands/install.ts]
tech_stack:
  added: []
  patterns: [AgentHookPlugin interface, inline bash hooks, stdin toolName filtering]
key_files:
  created:
    - src/lib/agent-hooks/copilot.ts
  modified:
    - src/lib/agent-hooks/index.ts
    - tests/lib/agent-hooks.test.ts
decisions:
  - "Inline bash commands in hook entries (no separate .sh files) — avoids chmod issues"
  - "preToolUse/postToolUse use stdin grep/cut toolName filter for AskUserQuestion equivalence"
  - "Copilot plugin owns git-stacks.json entirely — overwrite on install, delete on remove"
  - "GS_WORKSPACE_NAME and GS_FROM baked into env field of each entry (no built-in env vars in Copilot)"
metrics:
  duration_seconds: 130
  completed_date: "2026-04-02"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 2
---

# Phase 55 Plan 1: Copilot Hook Plugin and Registry Update Summary

**One-liner:** GitHub Copilot AgentHookPlugin generating `.github/hooks/git-stacks.json` with inline bash commands, Copilot event name mapping, stdin toolName filtering, and env var injection.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 55-01-01 | Create Copilot hook plugin | 5757625 | src/lib/agent-hooks/copilot.ts (created) |
| 55-01-02 | Register Copilot plugin in index | fe2ba92 | src/lib/agent-hooks/index.ts |
| 55-01-03 | Add Copilot plugin unit tests | 9f444a3 | tests/lib/agent-hooks.test.ts |

## What Was Built

The GitHub Copilot `AgentHookPlugin` implementation in `src/lib/agent-hooks/copilot.ts` mirrors the claude-code plugin structure and generates `.github/hooks/git-stacks.json` in the Copilot hooks format:

- **Event mapping:** Claude Code events → Copilot events (`Stop` → `sessionEnd`, `PreToolUse` → `preToolUse`, `UserPromptSubmit` → `userPromptSubmitted`, `PostToolUse` → `postToolUse`)
- **stdin toolName filtering:** Since Copilot lacks per-tool matchers, `preToolUse`/`postToolUse` entries wrap the command in a bash snippet that parses stdin JSON with `grep`/`cut` to check `toolName` before executing
- **Env injection:** `GS_WORKSPACE_NAME` and `GS_FROM=copilot` baked into each entry's `env` field (Copilot provides no built-in env vars)
- **timeoutSec: 10** on all entries (notification hooks should be fast)
- **Idempotent install:** Overwrites `git-stacks.json` entirely each time (plugin owns the file)
- **Clean remove:** Deletes file and removes empty `.github/hooks/` directory

The plugin registry in `index.ts` now exports both `claudeCodePlugin` and `copilotPlugin` in the `agentHookPlugins` array.

## Verification Results

- `bun run typecheck` passes (no type errors)
- `bun test tests/lib/agent-hooks.test.ts` passes 18/18 tests
- 7 new copilot plugin tests cover: id/label, generateHookEntries, install format, toolName filter, idempotency, remove, no-op remove
- Registry test updated to assert both plugins present (length 2)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all plugin methods are fully implemented.

## Self-Check: PASSED

Files created:
- /home/nnex/dev/prj/git-stacks/src/lib/agent-hooks/copilot.ts — FOUND
- /home/nnex/dev/prj/git-stacks/.planning/phases/55-copilot-hook-support/55-01-SUMMARY.md — FOUND

Commits:
- 5757625 feat(55-01): create Copilot hook plugin — FOUND
- fe2ba92 feat(55-01): register copilot plugin in agent hook index — FOUND
- 9f444a3 test(55-01): add copilot plugin unit tests and update registry test — FOUND
