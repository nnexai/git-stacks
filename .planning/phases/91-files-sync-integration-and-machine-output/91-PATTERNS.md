# Phase 91: Files Sync Integration and Machine Output - Pattern Map

## PATTERN MAPPING COMPLETE

## Candidate Files and Roles

| File | Role | Closest Existing Pattern |
|------|------|--------------------------|
| `src/lib/files.ts` | Shared sync status/result/operation model and capped detail helpers | Existing `ApplyResult`, `processSyncList`, and Phase 90 planned status/pull/push helpers |
| `src/lib/workspace-lifecycle.ts` | Workspace creation lifecycle integration | Existing create/clean/remove lifecycle functions and `applyFileOpsForRepo`/`applyFileOpsForWorkspace` call sites |
| `src/lib/workspace-ops.ts` | `open` and missing-worktree recreation behavior | Existing `openWorkspace()` missing worktree recreation and file-op application |
| `src/commands/files.ts` | `files status|pull|push --json` command output | Existing `src/commands/workspace.ts` JSON output branches and Phase 90 command group |
| `src/index.ts` | Command registration | Existing command imports and `program.addCommand(...)` ordering |
| `src/lib/completion-generator.ts` | Shell completion output | Existing generated command/option lists |
| `README.md` | User workflow docs | Existing command sections for workspace operations, hooks, env, and integrations |
| `tests/commands/files.test.ts` | CLI contract tests | Existing `runCli()` command tests and Phase 90 planned command tests |
| `tests/lib/workspace-lifecycle-create.test.ts` | Create-time lifecycle tests | Existing real temp workspace creation assertions |
| `tests/lib/workspace-ops.test.ts` | Open/recreate lifecycle tests | Existing `openWorkspace()` mocks and integration checks |
| `tests/lib/completion-generator.test.ts` | Completion tests | Existing generated completion assertions |

## Data Flow

1. Workspace/template config provides `files.sync` entries.
2. Phase 90 helpers compare current source/target trees and plan pull/push operations.
3. Phase 91 lifecycle code calls pull/materialization behavior only when a target is newly created or missing.
4. Phase 91 command code maps status/pull/push results into JSON-safe objects.
5. Future TUI consumes CLI JSON later; Phase 91 does not add dashboard UI.

## Concrete Patterns to Reuse

- Use discriminated result unions from `src/lib/` and keep command modules focused on option parsing and formatting.
- Keep real filesystem behavior in temp-dir tests instead of low-level command wrapper assertions.
- For JSON mode, emit only JSON to stdout; use stderr for formatted errors and nonzero exit status on refusal/error.
- For capped details, return counts plus `details.truncated` and `details.omitted` style metadata rather than unbounded arrays.
- Preserve current file-op compatibility: copy/symlink existing-target skip behavior remains unchanged.

## Anti-Patterns to Avoid

- Do not refresh existing sync targets as part of normal `git-stacks open`.
- Do not add dashboard UI, TUI actions, or status widgets.
- Do not put full JSON examples in README.
- Do not add per-file baselines, mandatory manifests, `--merge`, or `--add-only` policy flags.
- Do not silently downgrade create-time sync failures into warnings.

