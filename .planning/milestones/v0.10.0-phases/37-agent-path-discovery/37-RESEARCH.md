# Phase 37: Agent Path Discovery - Research

**Researched:** 2026-03-26
**Status:** Complete

## Research Question

What do we need to know to plan the `git-stacks paths` command well?

## Findings

### 1. Command Registration Pattern

All workspace-level commands are registered in `src/commands/workspace.ts` via `registerWorkspaceCommands(program)`. The `paths` subcommand follows the same pattern as `cd`, `status`, `list`, etc. Commander.js `.command()` / `.description()` / `.option()` / `.action()` chain.

Shell completion is auto-generated from the Commander tree by `src/lib/completion-generator.ts` -- no manual completion work needed. The new `paths` command with its options will be picked up automatically.

### 2. CWD Auto-Detection

`detectWorkspaceFromCwd()` in `src/lib/workspace-ops.ts` (line 1212) handles workspace detection from the current working directory. It iterates all workspaces, matches `task_path` values against `process.cwd()`, and returns the best (longest path) match.

For the `paths` command, we should NOT use the issue-utils `resolveWorkspaceArg()` because that function is coupled to issue tracker error messages (`git-stacks integration ${tracker} issue ${action}`). Instead, we should use `detectWorkspaceFromCwd()` directly and provide `paths`-specific error messages.

### 3. Workspace Repo Data Model

`WorkspaceRepoSchema` (config.ts line 99) defines:
- `name: string` -- repo display name
- `repo: string` -- registry name
- `type: RepoTypeSchema` -- java/typescript/other
- `mode: "trunk" | "worktree"`
- `main_path: string` -- path to the main git clone
- `task_path: string` -- path to the worktree (or same as main_path for trunk)

Key PATH-04 decision: worktree repos emit `task_path`, trunk repos emit `main_path`. Missing `task_path` repos are skipped with stderr warning.

### 4. Output Format Requirements

From CONTEXT.md decisions:
- D-01: One path per line on stdout, no quoting
- D-02: `--prefix` is space-separated from path (e.g., `--add-dir /path/a`)
- D-04: `--filter worktree|trunk` flag to narrow by repo mode
- D-06: Worktree repos emit `task_path`, trunk repos emit `main_path`
- D-07: Missing `task_path` repos skipped with stderr warning (non-fatal)
- D-08: Autodetect workspace from cwd using existing detection pattern

### 5. Existing Analogous Commands

The `cd` command (workspace.ts line 450-472) is the closest analog. It also outputs paths to stdout. Key difference: `cd` outputs a single repo's path or the workspace root; `paths` outputs ALL repo paths.

The `list --json` command outputs structured workspace data but is too heavy for simple path injection.

### 6. Testing Patterns

From `detect-workspace-cwd.test.ts`:
- Tests use `makeTmpDir`, redirect `WORKSPACES_DIR` via `mock.module("@/lib/paths")`
- Write real workspace YAML files via `realWriteWorkspace`
- Mock paths to isolate from real config directory

For the `paths` command, we need:
- Unit tests: test the path resolution logic (worktree vs trunk mode selection, missing task_path handling, filter, prefix)
- Integration tests are optional since the logic is simple function composition

### 7. File Structure

The implementation is small enough for a single plan:
1. Add `paths` subcommand to `src/commands/workspace.ts`
2. Add tests to `tests/lib/`

No new library files needed. The logic is straightforward: read workspace -> iterate repos -> resolve path per mode -> format output.

### 8. Exit Code Strategy

From CONTEXT.md (Claude's Discretion): exit 0 on success, non-zero on errors/all-skipped.
- Exit 0: at least one path emitted
- Exit 1: workspace not found, or all repos skipped (all had missing task_paths)

### 9. Stderr Warning Format

For skipped repos (missing task_path): `warning: skipping '${repo.name}' — task_path not found: ${repo.task_path}`
This follows the `console.error()` pattern used elsewhere.

## Validation Architecture

### Testable Claims
1. `git-stacks paths myws` outputs one path per line for all repos in workspace "myws"
2. Worktree repos emit `task_path`, trunk repos emit `main_path`
3. `--prefix "--add-dir"` prepends each path with `--add-dir ` (space-separated)
4. `--filter worktree` only emits worktree repo paths
5. `--filter trunk` only emits trunk repo paths
6. Missing `task_path` repos are skipped with stderr warning
7. CWD auto-detection works when no workspace argument given
8. Exit code is 0 when paths are emitted, non-zero when workspace not found or all skipped

### Test Strategy
- Unit test the path resolution function directly (extracted for testability)
- Integration-style test using real workspace YAML files in a temp directory
- Mock `detectWorkspaceFromCwd` for CWD detection tests

---

## RESEARCH COMPLETE

*Phase: 37-agent-path-discovery*
*Researched: 2026-03-26*
