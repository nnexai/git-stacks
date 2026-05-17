# Phase 90: Files Command Surface and Conflict Policy - Pattern Map

## PATTERN MAPPING COMPLETE

## Source Files and Roles

| File | Role | Existing Pattern To Reuse |
|------|------|---------------------------|
| `src/lib/files.ts` | File sync comparison, safe pull/push policy, mirror application | Extend Phase 89 sync helpers and `ApplyResult`-style discriminated unions |
| `src/lib/config.ts` | Workspace/template schema source | Use `Workspace`, `WorkspaceRepo`, and `Files` types; do not add Phase 90 schema fields |
| `src/lib/workspace-status.ts` | CWD workspace detection | Reuse `detectWorkspaceFromCwd()` for omitted `[workspace]` |
| `src/lib/paths.ts` | Workspace root and path helpers | Reuse `getTasksDir()` and existing path expansion conventions |
| `src/commands/workspace.ts` | Command formatting and optional workspace patterns | Mirror `push`, `paths`, and `env` workspace resolution and `formatError()` failures |
| `src/index.ts` | Command registration | Add the new files command group near other command imports and `program.addCommand()` calls |
| `tests/lib/files.test.ts` | Filesystem helper tests | Add direct tests for compare, safe apply, force, and dry-run behavior |
| `tests/commands/workspace-execution-context.test.ts` | CLI CWD pattern | Reuse `runCli()` and real temp config/workspace fixtures for CWD behavior |
| `tests/helpers.ts` | Real test fixtures | Use temp directories, `makeWorkspaceFixture()`, `runCli()`, and `formatCliFailure()` |

## Data Flow

1. `git-stacks files <verb> [workspace]` resolves a workspace by explicit arg or CWD detection.
2. The command reads workspace YAML through existing config helpers.
3. Library helpers enumerate workspace-level and repo-level `files.copy`, `files.symlink`, and `files.sync` entries.
4. Status helpers compare current source/target trees for sync entries and materialized state for copy/symlink entries.
5. Pull/push helpers build a per-entry operation plan with writes, deletes, refusals, and unchanged paths.
6. Dry-run returns the plan without writes.
7. Default mode applies only safe additions and refuses conflicts/deletes.
8. Force mode mirrors the selected direction while keeping configured source/target boundaries.
9. Command code formats compact text rows and exits nonzero when operation results contain refusals or errors.

## Code Excerpts To Preserve

### Optional Workspace Resolution Pattern

`workspace.ts` resolves omitted workspace args in `push` with `detectWorkspaceFromCwd()` before failing with a formatted error. The files command should use the same user experience.

### Command Registration Pattern

`src/index.ts` imports command modules at top level and adds commands before completion registration. Add the files command before `createCompletionCommand(program)` so shell completion sees it.

### Fallible Helper Pattern

Expected failures should return typed results rather than throw. Command handlers convert `ok: false` into `formatError()` and nonzero exit.

## Landmines

- Do not add JSON output in Phase 90.
- Do not call status labels `changed since last sync`; no baseline exists.
- Do not print unbounded path lists in default output.
- Do not allow force mode to bypass containment or configured source/target roots.
- Do not propagate deletes in default pull or push.
- Do not fold lifecycle auto-sync from Phase 91 into this phase.

