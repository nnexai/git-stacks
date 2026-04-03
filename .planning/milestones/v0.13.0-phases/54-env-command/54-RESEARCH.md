# Phase 54: Env Command - Research

**Researched:** 2026-04-02
**Status:** Complete

## Research Question

What do we need to know to plan the `git-stacks env` command well?

## Existing Env Computation Functions

### `mergeEnv(workspace)` — `src/lib/workspace-ops.ts:108`
Produces a flat `Record<string, string>` from:
1. `workspace.env` — user-defined env vars from workspace YAML
2. `workspace.ports` — resolved port allocations (number values stringified)

### `buildBaseEnv(workspace, tasksDir, triggeredBy)` — `src/lib/workspace-ops.ts:122`
Returns `Record<string, string>` with:
- `GS_WORKSPACE_NAME` — workspace name
- `GS_WORKSPACE_BRANCH` — workspace branch
- `GS_WORKSPACE_PATH` — tasks directory path
- `GS_TRIGGERED_BY` — lifecycle trigger (e.g., "open", "remove")
- ...spread of `mergeEnv(workspace)` — user env + ports

### `buildRepoEnv(baseEnv, repo)` — `src/lib/workspace-ops.ts:136`
Extends base env with:
- `GS_REPO_NAME` — repo name
- `GS_REPO_PATH` — task_path (worktree path)
- `GS_REPO_CLONE_PATH` — main_path (clone path)

### `detectWorkspaceFromCwd(cwd?)` — `src/lib/workspace-ops.ts:1358`
- Returns `{ ok: true, workspace: Workspace }` or `{ ok: false, error: "no_match" }`
- Only considers worktree-mode repos
- Does NOT return which repo matched — just the workspace
- For D-11 (auto-detect repo from CWD), we need repo detection logic

## Repo Detection Gap

`detectWorkspaceFromCwd` returns the workspace but not the matched repo. For the env command's D-11 (auto-detect repo from CWD), we need to either:
1. Extend `detectWorkspaceFromCwd` to return the matched repo (breaking change to return type)
2. Write a parallel detection function that also returns the repo
3. Inline the CWD-to-repo matching in the env command

**Recommendation:** Option 2 — write a small helper `detectRepoFromCwd(workspace, cwd?)` that matches CWD against a known workspace's repos. This avoids changing the existing function signature used by 5+ call sites.

## Command Registration Pattern

Workspace commands are registered in `src/commands/workspace.ts` via `registerWorkspaceCommands(program)` which calls `program.command(...)` for each. The `env` command should follow this same pattern:

```
program
  .command("env [workspace]")
  .description("Show environment variables for a workspace")
  .option("--format <format>", "Output format", "table")
  .option("--repo <name>", "Include repo-specific variables")
  .action(async (workspace, opts) => { ... })
```

This registers at the top level (not under a subgroup), same as `status`, `paths`, `list`, etc.

## Output Format Patterns

The command needs 4 output formats:

1. **table** (default) — Aligned KEY VALUE columns, human-readable
2. **shell** — `export KEY=value` lines (source-able in bash)
3. **dotenv** — `KEY=value` lines (redirect to .env file)
4. **json** — `{"KEY": "value"}` JSON object

### Value Quoting Rules (D-06)
- dotenv/shell: Quote values containing spaces, `"`, `'`, `$`, backtick, newline, `#`
- json: Standard JSON string escaping (handled by `JSON.stringify`)
- table: No quoting needed

## `triggeredBy` Parameter

`buildBaseEnv` requires a `triggeredBy` string. For the `env` command, this is a preview — not an actual lifecycle event. Options:
- Use `"env"` as the trigger value to make it clear this is an inspection
- This means `GS_TRIGGERED_BY=env` in the output, which accurately represents the context

## `tasksDir` Parameter

`buildBaseEnv` needs `tasksDir`. This is computed via `getTasksDir()` from `src/lib/paths.ts`, then joined with the workspace name:

```typescript
const globalConfig = readGlobalConfig()
const tasksDir = join(getTasksDir(globalConfig), workspace.name)
```

This pattern is used consistently in `openWorkspace`, `removeWorkspace`, etc.

## Test Strategy

Unit tests should cover:
1. **Table output** — verify aligned columns with known env vars
2. **Shell output** — verify `export KEY=value` format with proper quoting
3. **Dotenv output** — verify `KEY=value` format with proper quoting
4. **JSON output** — verify valid JSON object
5. **Repo-specific vars** — verify `--repo` adds GS_REPO_* vars
6. **CWD detection** — verify workspace auto-detection from cwd

Existing test pattern: `tests/lib/workspace-ops.test.ts` uses `useIsolatedConfig` and real filesystem helpers. The env command test can follow the same pattern for the formatting logic, and mock for the detection/config reading.

## Validation Architecture

### What to validate
- Output format correctness (each format produces expected syntax)
- All env sources included (GS_* + user env + ports)
- CWD detection falls back correctly
- Error messages for invalid workspace/repo names

### How to validate
- Unit tests for format functions (pure functions, no mocking needed)
- Integration test: create workspace, run env command, verify output
- CLI test: invoke `bun run src/index.ts env --format json` and parse output

---

## RESEARCH COMPLETE

*Phase: 54-env-command*
*Researched: 2026-04-02*
