# Phase 86 — Pattern Map

**Created:** 2026-05-15
**Purpose:** Closest local analogs for the Phase 86 executor.

## Planned File Map

| Target file | Role | Closest analogs | Pattern to reuse |
|-------------|------|-----------------|------------------|
| `tests/commands/workspace-recreate.test.ts` | `open --recreate` CLI coverage | `tests/commands/workspace-create-clone.test.ts`, `tests/commands/workspace-lifecycle.test.ts` | Use `runCli`, direct YAML fixtures, and filesystem/YAML assertions instead of wizard prompts. |
| `tests/commands/workspace-clean-gone.test.ts` | `clean --gone` CLI coverage | `tests/commands/workspace-git-ops.test.ts`, `tests/commands/workspace-status-fetch.test.ts` | Use local bare remotes, peer branch deletion, real worktrees, and isolated git env. |
| `tests/commands/workspace-destructive-safety.test.ts` | destructive command safety smoke | `tests/commands/workspace-guards.test.ts`, `tests/commands/support-failures.test.ts` | Representative safety cases with non-mutating non-force paths, dry-run checks, and force side effects. |
| `tests/commands/workspace-wrapper-edges.test.ts` | wrapper option/cwd/no-op/error coverage | `tests/commands/workspace-json-contracts.test.ts`, `tests/commands/workspace-execution-context.test.ts` | Stable JSON parsing, explicit cwd runs, no broad prose snapshots. |
| `tests/e2e-inventory.ts` | canonical mapping updates | existing same file | Add concrete new test files to the workspace inventory entries; keep exclusions explicit. |

## Concrete Existing Patterns

### Real CLI subprocess harness

`tests/helpers.ts` exports `runCli(argv, opts)` and `formatCliFailure(result)`. Phase 86 tests should use that harness rather than hand-rolling `Bun.spawnSync` wrappers, so command, cwd, env, stdout, and stderr diagnostics remain consistent.

### Local git isolation

Use `makeBareRemote`, `makeRepoWithRemote`, `gitExecOptions`, and `applyTestGitEnv` for tests that mutate git state. These helpers isolate author identity, HOME-like git config, and bare remotes so tests do not depend on the developer's global git setup.

### Workspace fixture shape

`makeWorkspaceFixture(configDir, wsName, repos, opts)` writes real workspace YAML from repo fixtures. For cases requiring exact template/workspace drift, use `writeTemplateFixture` and `writeWorkspaceFixture` directly so the test can assert specific YAML fields before and after the command.

### Stable assertion style

Prefer these assertions:

- exit code equals success/failure expectation
- parsed JSON has required fields
- workspace/template YAML includes or omits expected keys
- filesystem paths exist or do not exist
- local git branch/remotes reflect the setup
- stderr/stdout contains safety-critical short messages

Avoid these assertions:

- spinner/progress wording snapshots
- full stdout snapshots
- prompt-driving through interactive UIs
- TUI rendering
- real IDE, window manager, or forge CLI execution

## Landmines

- Do not use `bun test tests/`; use targeted `bun test <file>` or repo scripts.
- Do not reopen `git-stacks edit` or `git-stacks template edit` editor-launching flows.
- Non-force destructive commands may stop at confirmation before lower-level dirty checks in non-interactive subprocesses; assert non-mutation for that branch and use `--force` for mutation paths.
- `status --fetch --json` can print progress before JSON; parse the JSON array from stdout rather than assuming stdout is only JSON.
- Keep Phase 87 integration contracts out of this phase except for template/workspace integration YAML drift in `open --recreate`.
