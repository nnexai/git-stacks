# Phase 90: Files Command Surface and Conflict Policy - Research

## RESEARCH COMPLETE

**Phase:** 90 - Files Command Surface and Conflict Policy
**Date:** 2026-05-16
**Requirement IDs:** FSYNC-04, FSYNC-05, FSYNC-06, FSYNC-07, FSYNC-08

## Executive Summary

Phase 90 should add the user-facing `git-stacks files status|pull|push` surface as a thin command layer over reusable `src/lib/files.ts` behavior. Phase 89 owns schema, initial source-to-target materialization, target containment, tracked target refusal, and local git excludes. Phase 90 should preserve those safety boundaries while adding current-tree comparison, explicit refresh, explicit sync-back, dry-run previews, and force-only delete/overwrite behavior.

The safest plan is to split the work into three layers:

- current-tree status and comparison helpers that do not require a manifest;
- pull/push planning and application helpers that refuse conflicts/deletes by default and mirror only under `--force`;
- a new `files` command group registered in `src/index.ts`, with focused command tests for CWD workspace detection and output contracts.

## Existing Patterns

### Workspace Resolution

Existing workspace commands use optional `[workspace]` arguments plus `detectWorkspaceFromCwd()` for omitted workspace names in commands such as `push`, `paths`, and `env`. Phase 90 should use the same behavior for `git-stacks files status|pull|push [workspace]`.

### Command Layer

The command layer in `src/commands/workspace.ts` validates the workspace, dispatches to `src/lib/` helpers, formats compact user-facing text, and exits nonzero on failed operation results. A new `src/commands/files.ts` is better than growing the large workspace command file because `git-stacks files ...` is a separate command group, but it should keep the same Commander.js style and `formatError()` failure behavior.

### File Operation Layer

`src/lib/files.ts` is the right home for file sync comparison and policy. Phase 89 plans already add `files.sync` support, strict target containment, source resolution, real-file materialization, and repo-level `git_exclude`. Phase 90 should extend those helpers rather than duplicating path traversal, copy, delete, and containment rules in the command layer.

### Test Strategy

The project favors real temp directories and CLI subprocess tests for behavior that crosses filesystem, config, and command boundaries. Phase 90 should use:

- `tests/lib/files.test.ts` for pure comparison and policy helpers;
- real temp directory fixtures for file/directory pull and push semantics;
- `tests/commands/files.test.ts` for command registration, CWD detection, text output, dry-run, refusal, and force behavior;
- `bun run typecheck` and `bun run verify:gates` as final gates.

## Implementation Strategy

### Plan 1: Status and Comparison

Add a file-entry status model and sync tree comparison in `src/lib/files.ts`. `copy` and `symlink` entries only need materialized/missing/error state. `sync` entries need source-only, target-only, differing, equal, and error counts from current tree comparison. No baseline or per-file manifest should be introduced.

Status output should be compact by default and list paths only under `--verbose`, capped with an omitted-count message for large trees.

### Plan 2: Pull and Push Policy

Add a planning/apply layer for sync entries:

- pull compares `source` to `target` and applies source-to-target;
- push compares `target` to `source` and applies target-to-source;
- default pull refuses target-only or differing paths;
- default push refuses source-only or differing paths;
- deletes never propagate without `--force`;
- `--force` uses mirror semantics by replacing destination contents with the selected source;
- `--dry-run` returns planned writes/deletes/refusals without filesystem mutation.

This layer should return discriminated result unions with per-entry rows and operation-level `ok`.

### Plan 3: Command Surface

Create `src/commands/files.ts` and register it from `src/index.ts` as `program.addCommand(filesCommand)`. Add subcommands:

- `files status [workspace] [--verbose]`;
- `files pull [workspace] [--force] [--dry-run]`;
- `files push [workspace] [--force] [--dry-run]`.

Keep machine-readable output out of Phase 90. JSON/status stability stays Phase 91.

## Validation Architecture

| Behavior | Test Type | Recommended Command |
|----------|-----------|---------------------|
| Current-tree sync comparison counts | Unit + real filesystem | `bun test tests/lib/files.test.ts` |
| Copy/symlink materialized/missing/error state | Unit + real filesystem | `bun test tests/lib/files.test.ts` |
| Safe pull/push refusal and dry-run planning | Unit + real filesystem | `bun test tests/lib/files.test.ts` |
| Force mirror/delete semantics | Unit + real filesystem | `bun test tests/lib/files.test.ts` |
| CLI command registration and CWD detection | CLI subprocess | `bun test tests/commands/files.test.ts` |
| User-facing text output contracts | CLI subprocess | `bun test tests/commands/files.test.ts` |
| Type and repo gates | Project gate | `bun run typecheck && bun run verify:gates` |

## Risks and Constraints

- Status labels must not imply history; without a baseline, they are current tree differences only.
- Large sync trees must not dump thousands of paths by default.
- Pull/push must reuse Phase 89 target boundary checks and avoid any path outside configured source/target roots.
- Default push is the risky direction: it must refuse source-only and differing paths unless `--force`.
- Force mirror semantics can delete files, so dry-run output and tests must prove delete counts and unchanged filesystem under `--dry-run`.
- Do not add lifecycle integration, JSON output, or TUI hooks in Phase 90.

