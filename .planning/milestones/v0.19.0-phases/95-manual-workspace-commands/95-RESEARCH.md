# Phase 95: Manual Workspace Commands - Research

## RESEARCH COMPLETE

**Phase:** 95 - Manual Workspace Commands
**Date:** 2026-05-17
**Requirement IDs:** WCMD-01, WCMD-02, WCMD-03, WCMD-04

## Executive Summary

Phase 95 should introduce a separate `git-stacks command` family backed by a narrow string-valued `commands` map in template, workspace, and repo YAML. The locked decisions in `95-CONTEXT.md` intentionally narrow the earlier roadmap wording: do not plan object-valued entries, per-command cwd/repo/env metadata, JSON output, or selective execution. Planning must follow D-01 through D-25, not the older roadmap text.

The safest split is:

1. Extend config and composition so `commands` can exist in templates, workspaces, and repo entries, with template-level command names merged last-write-wins and persisted through workspace creation inputs.
2. Wire all template-backed creation paths to snapshot those command maps into workspace YAML, including clone and dashboard creation flows.
3. Add a reusable resolver/executor layer that builds the ordered `pre<name>` / `<name>` / `post<name>` execution plan, reuses workspace env/secrets/ports and cwd helpers, and preserves the first failing exit status.
4. Add the user-facing `git-stacks command list|run` surface plus test inventory updates so `verify:gates` stays aligned.

## Existing Patterns

### Schema and Snapshot Patterns

`src/lib/config.ts` is the single source of truth for YAML shape. `TemplateSchema`, `WorkspaceSchema`, and `WorkspaceRepoSchema` already share `files`, hooks, env, and ports across template and workspace surfaces. `src/lib/composition.ts` already merges template-level hooks additively and env/ports last-write-wins. Workspace creation paths snapshot template-derived hooks, env, env files, files, integrations, and ports into saved workspace YAML in:

- `src/tui/workspace-wizard.ts`
- `src/tui/workspace-clone.ts`
- `src/tui/dashboard/App.tsx`
- `src/lib/workspace-lifecycle.ts` (`CreateWorkspaceInputs`)

Phase 95 should extend this existing snapshot pattern rather than introducing dynamic template lookup at command-run time.

### Command Group Pattern

`src/commands/files.ts` is the closest top-level command-family analog. It:

- lives in its own file instead of enlarging `workspace.ts`;
- resolves optional `[workspace]` with `detectWorkspaceFromCwd()`;
- uses `formatError()` and `process.exit(1)` for user-facing failures;
- registers from `src/index.ts` before shell completion wiring.

Phase 95 should follow this pattern with a new `src/commands/command.ts`.

### Execution Context Pattern

`src/lib/workspace-env.ts` already builds the exact environment surface this phase needs:

- `buildWorkspaceEnv()` resolves workspace env, ports, and secrets with optional `skipSecrets`;
- `buildRepoEnv()` layers repo-specific variables and cwd paths;
- `GS_TRIGGERED_BY` is already part of the contract.

`src/lib/lifecycle.ts` already streams direct terminal output through `_exec.spawn`, but `runHooks()` throws a generic error on failure and does not expose the failing exit code. Phase 95 should reuse the streaming/spawn seam while adding a helper that preserves the actual exit status required by D-21.

### Test and Gate Pattern

Relevant existing tests and gates:

- `tests/commands/template-consumption.test.ts` proves template-backed `new` and `clone` snapshot workspace YAML content.
- `tests/commands/workspace-execution-context.test.ts` proves cwd and env contracts across real CLI subprocesses.
- `tests/commands/run-parallel.test.ts` shows how subprocess command execution is asserted from the CLI layer.
- `tests/e2e-inventory.ts` and `scripts/verify-gates.ts` require new command families to be added to the canonical inventory with mapped tests.

If Phase 95 adds a new top-level command and does not update the inventory, `bun run verify:gates` will fail on command drift.

## Implementation Strategy

### Plan 01: Schema, Composition, and Workspace Persistence Contract

Add a shared string-map schema such as `CommandMapSchema` to templates, workspaces, and repo entries. Extend template composition so workspace-level command names merge last-write-wins while repo-level command maps stay attached to repo entries. Extend `CreateWorkspaceInputs` and saved workspace assembly so template-backed creation flows have a stable place to pass copied workspace commands.

### Plan 02: Template Snapshot Wiring Across Create Surfaces

Update template-backed `new`, `clone`, and dashboard create flows to snapshot template-level and repo-level command maps alongside hooks/env/files/ports. Clone should preserve already-copied commands from the source workspace while only changing the name, branch, and worktree paths.

### Plan 03: Resolved Command Engine

Create a dedicated library module for manual command resolution and execution. It should:

- resolve `pre<name>`, `<name>`, and `post<name>` buckets in D-10 order;
- treat `pre*` and `post*` as runnable command names themselves per D-11;
- build dry-run rows that show bucket, workspace/repo scope, cwd, and shell command;
- build workspace env once with `triggeredBy: command:<name>`, then derive repo envs with `buildRepoEnv()`;
- reuse lifecycle-style direct terminal streaming and stop on the first non-zero exit, returning that exit code.

### Plan 04: CLI Surface and Gate Alignment

Add `git-stacks command list [workspace]` and `git-stacks command run [workspace] <command>` as a standalone command group. `list` hides `pre*` and `post*` by default and `--all` reveals them. `run --dry-run` is the only inspection surface; do not add `show`, JSON, or repo selectors. Update `tests/e2e-inventory.ts` so the new command family remains in-scope and mapped.

## Validation Architecture

| Behavior | Test Type | Recommended Command |
|----------|-----------|---------------------|
| String-map schema acceptance and object-value rejection | Unit | `bun test tests/lib/config.test.ts` |
| Template command merge and collision semantics | Unit | `bun test tests/lib/composition.test.ts` |
| Workspace persistence of copied commands during creation | Unit | `bun test tests/lib/workspace-lifecycle-create.test.ts` |
| Template-backed create and clone snapshot command maps | CLI subprocess | `bun test tests/commands/template-consumption.test.ts` |
| Resolved bucket ordering, dry-run plan shape, and direct pre/post execution | Unit | `bun test tests/lib/workspace-command.test.ts` |
| Streaming execution and first-failure exit status | Unit | `bun test tests/lib/lifecycle.test.ts tests/lib/workspace-command.test.ts` |
| CLI list/run behavior, cwd detection, and `--skip-secrets` | CLI subprocess | `bun test tests/commands/command.test.ts` |
| Canonical inventory alignment | Local gate | `bun run verify:gates` |
| Final type safety | Project gate | `bun run typecheck` |

## Risks and Constraints

- The feature intentionally runs user-authored shell from YAML. The mitigation is not sandboxing; it is keeping the surface explicit, manually triggered, inspectable via `--dry-run`, and narrow in schema.
- The current roadmap success criteria mention richer per-command metadata. That wording must not override locked decisions D-01 through D-25.
- Do not extend `git-stacks run`; its second positional argument already means repo name and would conflict with manual-command lookup.
- `runHooks()` does not preserve exact exit codes today. Phase 95 needs a library helper that keeps the existing streaming pattern without flattening every failure to exit code 1.
- The feature must remain human-first in this phase: no JSON output, no selective repo execution, and no TUI surfacing.
- `verify:gates` inventory drift is part of the implementation boundary because the project treats user-facing command coverage as a maintained contract.
