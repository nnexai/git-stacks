# Phase 38: Multi-Repo Pull - Research

**Completed:** 2026-03-26
**Phase:** 38 — Multi-Repo Pull

## Research Objective

What do I need to know to PLAN this phase well? Investigate the existing codebase patterns for multi-repo git operations, command registration, CWD autodetection, and test infrastructure to produce a complete pull command implementation.

## 1. Existing Pattern: syncWorkspace

`syncWorkspace()` in `src/lib/workspace-ops.ts` (line 991) is the primary reference implementation. It demonstrates:

- **Parallel fetch, sequential apply**: Uses `Promise.all()` for parallel fetch with a `fetchFailures` Map tracking errors, then iterates repos sequentially for rebase/merge.
- **SyncRow type** (line 984): `{ repo, status, detail, conflicts }` with status union `"pending" | "fetching" | "rebasing" | "synced" | "skipped" | "failed"`.
- **SyncResult type** (line 977): `{ ok, synced: Array<{repo, commits}>, skipped: Array<{repo, reason}>, error? }`.
- **onProgress callback**: `(update: SyncRow) => void` — streams per-repo status updates.
- **formatSyncRow** (line 36 in workspace.ts): Formats `SyncRow` to `"label  repo  detail"` string.

Key differences for pull vs sync:
- Sync operates on **worktree repos only** (filters by `mode === "worktree"`). Pull must handle **both** worktree and trunk repos.
- Sync uses `rebaseBranch()` or `mergeBranchFF()` against `origin/{baseBranch}`. Pull uses `git pull --ff-only` against the repo's own upstream.
- Sync has conflict pre-check (`getMergeConflicts`). Pull with `--ff-only` doesn't need this — ff-only fails fast on divergence.

## 2. Git Operations Available

From `src/lib/git.ts`:
- `fetchOrigin(repoPath)` (line 111): Runs `git -C {repoPath} -c fetch.timeout=30 fetch origin`. Returns Promise<void>, throws on failure.
- `isRepoDirty(repoPath)` (line 32): Runs `git status --porcelain`, returns `true` if non-empty.
- `getCurrentBranch(repoPath)` (line 37): Returns current branch name via `rev-parse --abbrev-ref HEAD`.
- `getCommitsBehind(repoPath, base, head)` (line 193): Counts commits between refs via `rev-list --count`.

**Missing operation needed**: `git pull --ff-only`. This does not exist in git.ts yet. Needs to be added. The implementation should use Bun's `$` shell with `.quiet().nothrow()` pattern per project conventions, and return a discriminated union result.

## 3. Fetch Deduplication (PULL-04)

Per the context decision D-04: "Fetch deduplication groups repos sharing the same `main_path` so each remote is fetched once."

In the workspace schema, `WorkspaceRepo` has both `main_path` and `task_path`. For worktree repos, `task_path` is the worktree directory and `main_path` is the original clone. For trunk repos, `main_path` is the clone and `task_path` is typically the same or unused.

Fetch deduplication means: group all repos by `main_path`, fetch once per unique `main_path`. This avoids redundant network calls when multiple worktrees share the same underlying repo.

Implementation approach: Build a `Map<string, WorkspaceRepo[]>` keyed by `main_path`, fetch each unique `main_path` once in parallel, then pull each repo sequentially.

## 4. Pull Branch Selection (PULL-02)

Per context decision D-09:
- **Worktree repos**: Pull their workspace branch (stored in `workspace.branch`). The worktree is already checked out on this branch.
- **Trunk repos**: Pull their default branch (stored in `repo.base_branch` or fallback to `"main"`).

For the actual pull operation:
- Worktree: `git -C {task_path} pull --ff-only origin {workspace.branch}`
- Trunk: `git -C {main_path} pull --ff-only origin {base_branch}`

## 5. Command Registration Pattern

From `src/commands/workspace.ts`, the `sync` command at line 681:
```typescript
program
  .command("sync [name]")
  .description("Sync workspace branches with upstream base branches")
  .option("--all", "Sync all workspaces")
  .option("--strategy <strategy>", "Sync strategy: rebase (default) or merge", "rebase")
  .option("--best-effort", "Skip conflicting repos instead of aborting")
  .option("--json", "Output results as JSON")
  .action(async (name, opts) => { ... })
```

The pull command should follow the same pattern. It needs `[name]` as optional argument (for CWD autodetection). No strategy option needed (always --ff-only).

## 6. CWD Autodetection (PULL-06)

`detectWorkspaceFromCwd()` in `src/lib/workspace-ops.ts` (line 1212) handles this. It:
1. Lists all workspaces.
2. For each workspace, checks worktree repos' `task_path` against current directory.
3. Returns best match (longest path prefix wins).

Usage pattern from issue-utils.ts `resolveWorkspaceArg()` (line 99):
```typescript
const detection = detectWorkspaceFromCwd()
if (!detection.ok) { error message }
return detection.workspace.name
```

The pull command should: if `name` argument is provided, use it directly. If not, call `detectWorkspaceFromCwd()` and use the result. If detection fails, show error with usage hint.

## 7. Error Handling and Exit Codes (PULL-03, PULL-05)

Per context decisions:
- D-10: Command exits non-zero if any repo skipped or failed.
- D-06: Dirty repos show `skipped  {name}  (dirty)` on stderr.
- D-07: Diverged branches show `failed  {name}  (diverged: {branch})` on stderr.
- D-08: `--ff-only` always.

The result type should track pulled/skipped/failed repos. Exit with `process.exit(1)` when `skipped.length > 0 || failed.length > 0`.

## 8. Test Infrastructure

From `tests/helpers.ts` and `tests/lib/paths-command.test.ts`:
- `makeTmpDir(prefix)` creates isolated temp directories.
- `realWriteWorkspace` writes workspace YAML directly for test fixtures.
- Mock `@/lib/paths` to redirect config directories.
- `useIsolatedConfig()` from helpers.ts for config isolation.
- `makeGitRepo(path)` creates a bare git repo for testing.

For pull tests, we need:
- A real git repo with a remote (can use a local bare repo as origin).
- Worktrees set up with commits to pull.
- Tests for: successful pull, dirty skip, diverged fail, trunk vs worktree branch selection.

## 9. Output Format

Per context decisions D-05, D-06, D-07:
- Per-line status only, no summary.
- Success: `pulled  {name}  ({N} commits)` or `pulled  {name}  (already up to date)` on stdout.
- Skip: `skipped  {name}  (dirty)` on stderr.
- Fail: `failed  {name}  (diverged: {branch})` on stderr.

Follow the `formatSyncRow` pattern for consistency.

## Validation Architecture

### Requirement Coverage

| Requirement | Implementation Point | Verification |
|-------------|---------------------|--------------|
| PULL-01 | `pullWorkspace()` function + `pull` command registration | `git-stacks pull myws` succeeds on clean repos |
| PULL-02 | Branch selection in pull: worktree → workspace.branch, trunk → base_branch | Test with mixed-mode workspace |
| PULL-03 | `isRepoDirty()` check before pull; result.ok = false when skips | Test dirty repo skip + exit code |
| PULL-04 | Group by `main_path`, fetch once per group | Test with shared main_path repos |
| PULL-05 | `git pull --ff-only`; parse exit code for divergence | Test with diverged branch |
| PULL-06 | `detectWorkspaceFromCwd()` fallback when no name arg | Test CWD detection integration |

### Risk Areas

1. **Trunk repo pull target**: Must use `main_path` not `task_path` for trunk repos since trunk repos may not have a distinct `task_path`.
2. **Fetch deduplication correctness**: Fetching at `main_path` updates all worktrees' remotes since worktrees share the same `.git` objects.
3. **ff-only failure detection**: Need to parse git's exit code and stderr to distinguish "diverged" from other failures.

## RESEARCH COMPLETE
