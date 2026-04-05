---
phase: 64-schema-registry
plan: "01"
subsystem: config-schemas
tags: [schemas, zod, dir-mode, registry, backward-compat]
dependency_graph:
  requires: []
  provides: [dir-repo-schema-foundation]
  affects: [workspace-ops, workspace-wizard, lifecycle, git-guards, display]
tech_stack:
  added: []
  patterns: [zod-boolean-default, optional-transform-field]
key_files:
  created: []
  modified:
    - src/lib/config.ts
    - src/tui/workspace-wizard.ts
    - src/commands/repo.ts
    - src/tui/repo-wizard.ts
    - tests/lib/config.test.ts
decisions:
  - "task_path made optional in WorkspaceRepoSchema — downstream TypeScript errors in workspace-ops.ts and related files are expected and will be resolved in Phase 65"
  - "is_dir defaults to false in Zod schema (z.boolean().default(false)) ensuring backward compat for all existing registry YAML without the field"
  - "Registry entry literal construction sites (repo.ts, repo-wizard.ts, workspace-wizard.ts) require explicit is_dir: false since inferred type is non-optional"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-04T18:44:00Z"
  tasks_completed: 2
  files_modified: 5
---

# Phase 64 Plan 01: Extend Zod Schemas for Dir Repos Summary

**One-liner:** Added `is_dir` boolean flag to RepoRegistryEntrySchema and `"dir"` mode to TemplateRepoSchema/WorkspaceRepoSchema with optional task_path — foundational schema for non-git directory support.

## What Was Built

Extended three Zod schemas in `src/lib/config.ts` to support "dir" repos:

1. **RepoRegistryEntrySchema** — added `is_dir: z.boolean().default(false)`
2. **TemplateRepoSchema** — mode enum extended from `["trunk", "worktree"]` to `["trunk", "worktree", "dir"]`
3. **WorkspaceRepoSchema** — mode enum extended to `["trunk", "worktree", "dir"]`; `task_path` made optional

Updated `buildReposFromTemplate` in `src/tui/workspace-wizard.ts` to detect `regEntry.is_dir` and construct dir repos with `mode: "dir"`, `main_path` only — no `task_path`, no `base_branch`.

Added comprehensive test suite in `tests/lib/config.test.ts` covering all new schema paths and backward compatibility.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend Zod schemas for dir repos (TDD) | ac66a3c | src/lib/config.ts, tests/lib/config.test.ts |
| 2 | Update buildReposFromTemplate for dir repos | d6d8785 | src/tui/workspace-wizard.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Add is_dir to registry entry literals**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** Three files constructed `RepoRegistryEntry` literal objects without `is_dir`. Since `z.boolean().default(false)` makes the inferred TypeScript type have `is_dir: boolean` (non-optional), explicit literals fail the type check.
- **Fix:** Added `is_dir: false` to literal objects in `src/commands/repo.ts`, `src/tui/repo-wizard.ts`, and `src/tui/workspace-wizard.ts`
- **Files modified:** src/commands/repo.ts, src/tui/repo-wizard.ts, src/tui/workspace-wizard.ts
- **Commit:** 53c2fd8

## Test Results

- `bun test tests/lib/config.test.ts`: 79/79 pass (74 pre-existing + 5 new dir schema tests)
- `bun run test` integration suite: 39/39 pass
- Pre-existing unrelated failure: `FILES-11: ~/relative path expands to absolute using HOME` in tests/lib/files.test.ts (confirmed pre-existing, out of scope)

## TypeCheck Notes

`bun run typecheck` shows downstream errors in `workspace-ops.ts`, `workspace.ts`, `files.ts`, `env.ts`, and dashboard components — all `string | undefined` not assignable to `string` for `task_path` usages. These are expected per the plan and will be resolved in Phase 65 (lifecycle guards).

## Known Stubs

None — no UI rendering or data display paths modified in this plan.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what the plan's threat model covers.

## Self-Check: PASSED

Files exist:
- src/lib/config.ts — FOUND
- src/tui/workspace-wizard.ts — FOUND
- src/commands/repo.ts — FOUND
- src/tui/repo-wizard.ts — FOUND
- tests/lib/config.test.ts — FOUND

Commits exist:
- ac66a3c — FOUND (feat(64-01): extend Zod schemas for dir repos)
- d6d8785 — FOUND (feat(64-01): update buildReposFromTemplate for dir repos)
- 53c2fd8 — FOUND (fix(64-01): add is_dir field to registry entry literals)
