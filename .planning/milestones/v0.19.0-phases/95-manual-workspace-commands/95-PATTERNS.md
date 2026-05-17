# Phase 95: Manual Workspace Commands - Pattern Map

## PATTERN MAPPING COMPLETE

## Source Files and Roles

| File | Role | Existing Pattern To Reuse |
|------|------|---------------------------|
| `src/lib/config.ts` | YAML schema source of truth | Add one shared optional string map and reuse it across template, workspace, and repo entries |
| `src/lib/composition.ts` | Template merge logic | Follow env/ports last-write-wins semantics for top-level command-name collisions |
| `src/lib/workspace-lifecycle.ts` | Saved workspace assembly | Extend `CreateWorkspaceInputs` and the in-memory `workspaceObj` pattern instead of writing ad hoc YAML in callers |
| `src/tui/workspace-wizard.ts` | Template-backed `new` snapshot flow | Mirror the existing `wsHooks`, `wsEnv`, `wsFiles`, `wsPorts` snapshot assignments |
| `src/tui/workspace-clone.ts` | Clone persistence flow | Preserve copied workspace fields by cloning the existing workspace object and only rewriting name/branch/task paths |
| `src/tui/dashboard/App.tsx` | Dashboard create flow | Mirror the template snapshot assignments used by CLI/TUI create so the dashboard does not lag behind |
| `src/lib/workspace-env.ts` | Workspace and repo env assembly | Reuse `buildWorkspaceEnv()` and `buildRepoEnv()`; do not reimplement ports/secrets logic in the command layer |
| `src/lib/lifecycle.ts` | Direct shell execution seam | Reuse `_exec.spawn` and inherited stdio behavior for streaming output |
| `src/commands/files.ts` | Standalone workspace-aware command family | Mirror `resolveWorkspace()` and `formatError()` patterns for optional `[workspace]` commands |
| `tests/commands/template-consumption.test.ts` | Template snapshot subprocess verification | Extend saved-YAML assertions instead of inventing a new create/clone fixture style |
| `tests/commands/workspace-execution-context.test.ts` | Real CLI cwd/env contract tests | Reuse `runCli()` and probe-script assertions for cwd, `GS_*`, and cross-directory invocation behavior |
| `tests/e2e-inventory.ts` | Canonical command coverage inventory | Add the new command family here or `verify:gates` will report drift |

## Data Flow

1. Template YAML defines `commands` maps at workspace level and on repo entries.
2. `src/lib/config.ts` validates those maps as string-to-string only.
3. `composeTemplates()` resolves included templates, merging workspace-level command-name collisions last-write-wins while leaving repo-level command maps attached to their repo definitions.
4. Template-backed `new`, dashboard create, and clone flows copy the resolved command maps into the saved workspace object.
5. A manual-command resolver reads the saved workspace YAML and collects command entries for `pre<name>`, `<name>`, and `post<name>`.
6. The resolver builds an ordered execution plan with workspace entries first, then matching repo entries in workspace repo order.
7. `buildWorkspaceEnv()` resolves env, ports, and secrets with `GS_TRIGGERED_BY=command:<name>`, and `buildRepoEnv()` adds repo-specific variables per entry.
8. A streamed execution helper runs each shell command in its resolved cwd until one fails or the sequence completes.
9. `src/commands/command.ts` formats either a hidden-pre/post list view or a full dry-run execution plan and exits with the library helper’s exact status.
10. `tests/e2e-inventory.ts` records the new command family so local verification keeps coverage drift visible.

## Code Excerpts To Preserve

### Template Snapshot Pattern

`workspace-wizard.ts` and `App.tsx` currently assign:

- `wsHooks = template.hooks ? JSON.parse(JSON.stringify(template.hooks)) : undefined`
- `wsEnv = template.env ? { ...template.env } : undefined`
- `wsFiles = template.files`
- `wsIntegrationSettings = template.integrations ? JSON.parse(JSON.stringify(template.integrations)) : undefined`

Phase 95 should add `wsCommands` beside these assignments rather than inventing a second persistence path.

### Saved Workspace Assembly Pattern

`createWorkspace()` constructs one in-memory `workspaceObj` and writes it only after tracked steps succeed. New copied workspace-level command maps should be added there so manual commands survive the same rollback boundary as hooks/env/files.

### Workspace Resolution Pattern

`src/commands/files.ts` resolves explicit `[workspace]` first, then falls back to `detectWorkspaceFromCwd()`, then prints a formatted usage error. Phase 95 should reuse this exact interaction for `command list` and `command run`.

### Execution Context Pattern

`buildWorkspaceEnv()` already merges:

- `GS_WORKSPACE_NAME`
- `GS_WORKSPACE_BRANCH`
- `GS_WORKSPACE_PATH`
- `GS_TRIGGERED_BY`
- resolved env vars and injected ports

`buildRepoEnv()` then adds:

- `GS_REPO_NAME`
- `GS_REPO_PATH`
- `GS_REPO_CLONE_PATH`

Manual command execution should use this stack directly instead of hand-building env objects.

### Streaming Shell Pattern

`runHooks()` and `_exec.spawn` already execute `["/bin/sh", "-c", cmd]` with inherited stdio. Preserve this direct terminal behavior for real runs; do not buffer or summarize output in Phase 95.

## Landmines

- Do not implement the old richer object shape from `ROADMAP.md`; `95-CONTEXT.md` is the locked contract.
- Do not extend `git-stacks run`; Phase 95 is explicitly a separate `git-stacks command` family.
- Do not dynamically resolve template commands at run time. Existing workspaces must remain snapshot-based.
- Do not hide `pre<name>` and `post<name>` from execution. They are ordinary runnable command names per D-11.
- Do not introduce JSON, `show`, `--repo`, or `--workspace-only` in this phase.
- Do not lose the failing exit status by routing everything through `runHooks()` unchanged.
- Do not forget `tests/e2e-inventory.ts`; the verification gate treats command inventory drift as a failure.
