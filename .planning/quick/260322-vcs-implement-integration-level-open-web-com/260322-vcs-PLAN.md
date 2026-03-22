---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/integrations/forge-utils.ts
  - src/lib/integrations/github.ts
  - src/lib/integrations/gitlab.ts
  - src/lib/integrations/gitea.ts
autonomous: true
requirements: [OPEN-WEB]

must_haves:
  truths:
    - "User can open any forge repo's homepage in their browser via --web flag"
    - "User can print the forge repo URL to stdout without --web"
    - "Command works for both worktree-mode and trunk-mode repos"
    - "All three forges (GitHub, GitLab, Gitea) support the open command"
  artifacts:
    - path: "src/lib/integrations/forge-utils.ts"
      provides: "resolveForgeRepoAnyMode() function that accepts any repo mode"
      exports: ["resolveForgeRepoAnyMode"]
    - path: "src/lib/integrations/github.ts"
      provides: "open command using gh browse"
    - path: "src/lib/integrations/gitlab.ts"
      provides: "open command using glab repo view --web"
    - path: "src/lib/integrations/gitea.ts"
      provides: "open command using git remote URL parsing + xdg-open"
  key_links:
    - from: "src/lib/integrations/github.ts"
      to: "src/lib/integrations/forge-utils.ts"
      via: "import resolveForgeRepoAnyMode"
      pattern: "resolveForgeRepoAnyMode"
    - from: "src/lib/integrations/gitlab.ts"
      to: "src/lib/integrations/forge-utils.ts"
      via: "import resolveForgeRepoAnyMode"
      pattern: "resolveForgeRepoAnyMode"
    - from: "src/lib/integrations/gitea.ts"
      to: "src/lib/integrations/forge-utils.ts"
      via: "import resolveForgeRepoAnyMode"
      pattern: "resolveForgeRepoAnyMode"
---

<objective>
Add an `open` command to each forge integration (GitHub, GitLab, Gitea) that opens the repository's forge homepage in the browser (with `--web`) or prints the URL to stdout.

Purpose: Currently users can open PRs and issues, but there is no quick way to jump to the repo's main page on the forge. This fills that gap.
Output: Updated forge-utils.ts with any-mode resolver, updated github.ts/gitlab.ts/gitea.ts with `open` subcommand.
</objective>

<execution_context>
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/workflows/execute-plan.md
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/integrations/forge-utils.ts
@src/lib/integrations/github.ts
@src/lib/integrations/gitlab.ts
@src/lib/integrations/gitea.ts
@src/lib/config.ts (WorkspaceRepo type: has main_path, task_path, mode fields)

<interfaces>
<!-- Key types the executor needs -->

From src/lib/integrations/forge-utils.ts:
```typescript
export type ForgeRepoResolution = {
  ok: true
  workspace: Workspace
  repo: WorkspaceRepo
  repoPath: string       // repo.task_path — the CWD for forge CLI
  baseBranch: string
}

export type ForgeRepoResolutionError =
  | { ok: false; error: "workspace_not_found"; name: string }
  | { ok: false; error: "repo_required"; worktreeRepos: string[] }
  | { ok: false; error: "repo_not_found"; name: string }
  | { ok: false; error: "not_worktree_mode"; repo: string }
  | { ok: false; error: "forge_not_configured"; repo: string; expected: string; actual: ForgeType }
```

From src/lib/config.ts:
```typescript
export type WorkspaceRepo = {
  name: string
  repo: string           // registry name
  type: RepoType
  mode: "trunk" | "worktree"
  main_path: string      // always exists — real git clone
  task_path: string      // worktree path (same as main_path for trunk)
  base_branch?: string
  hooks?: { pre_open?: string[]; pre_clean?: string[] }
  files?: Files
}
```

From each forge _exec helper:
```typescript
// GitHub: _exec.run(args, cwd) -> spawns gh
// GitLab: _exec.run(args, cwd) -> spawns glab
// Gitea:  _exec.run(args, cwd), _exec.runCapture(args, cwd), _exec.openUrl(url)
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add resolveForgeRepoAnyMode to forge-utils.ts</name>
  <files>src/lib/integrations/forge-utils.ts</files>
  <action>
Add a new exported function `resolveForgeRepoAnyMode()` to forge-utils.ts. This is a variant of `resolveForgeRepo()` that:

1. Does NOT filter to worktree-mode repos only. It accepts any repo in the workspace.
2. Uses `repo.main_path` as `repoPath` (since main_path always points to a real git clone, regardless of mode). This is the correct CWD for forge CLI commands that just need a git repo context.
3. When `repoArg` is undefined and multiple repos exist, it should prefer worktree-mode repos (same as existing behavior) but fall back to any repo if there's only one total.
4. Validates forge configuration identically to `resolveForgeRepo()`.

New return type (reuse existing ForgeRepoResolution but with `repoPath` set to `main_path`):
```typescript
export function resolveForgeRepoAnyMode(
  workspaceName: string,
  repoArg: string | undefined,
  forge: string
): ForgeRepoResolution | ForgeRepoResolutionError
```

Resolution logic:
- If `repoArg` is given: find the repo by name (any mode), return error if not found.
- If `repoArg` is NOT given and workspace has exactly 1 repo: use it.
- If `repoArg` is NOT given and workspace has multiple repos: check if exactly 1 has the correct forge configured — if so, auto-select it. Otherwise return `repo_required` error listing ALL repo names (not just worktree ones).
- Always set `repoPath` to `repo.main_path` (not task_path).
- Skip the `not_worktree_mode` error entirely — this function accepts any mode.

Update the `ForgeRepoResolutionError` type: the `repo_required` variant should be reusable (its `worktreeRepos` field name is slightly misleading for any-mode, but keep it for backward compat — just populate it with all repo names).

Also update `formatForgeError()` — the `not_worktree_mode` case is never hit from `resolveForgeRepoAnyMode`, but the `repo_required` message should still work correctly. No changes needed to the formatter since it already handles all error types.

Place `resolveForgeRepoAnyMode` right after `resolveForgeRepo` in the file.
  </action>
  <verify>
    <automated>bun run typecheck</automated>
  </verify>
  <done>resolveForgeRepoAnyMode is exported, accepts any repo mode, uses main_path as repoPath, and type-checks cleanly.</done>
</task>

<task type="auto">
  <name>Task 2: Add open command to all three forge integrations</name>
  <files>src/lib/integrations/github.ts, src/lib/integrations/gitlab.ts, src/lib/integrations/gitea.ts</files>
  <action>
In each forge integration file, add a new `open` subcommand registered in the `commands()` method at the same level as `pr` and `issue`. Import `resolveForgeRepoAnyMode` from forge-utils.ts alongside the existing `resolveForgeRepo` import.

Command signature for all three:
```
parent.command("open <workspace> [repo]")
  .description("Open repository on <ForgeName> (--web opens in browser)")
  .option("--web", "Open in browser")
```

**GitHub (github.ts):**
- With `--web`: `_exec.run(["browse"], repoPath)` — `gh browse` opens the repo homepage in browser.
- Without `--web`: `_exec.run(["browse", "--no-browser"], repoPath)` — prints the URL to stdout.
- Uses `resolveForgeRepoAnyMode(workspaceName, repoArg, "github")`.

**GitLab (gitlab.ts):**
- With `--web`: `_exec.run(["repo", "view", "--web"], repoPath)` — opens repo in browser.
- Without `--web`: `_exec.run(["repo", "view", "--output", "json"], repoPath)` — prints repo info as JSON (includes web_url). Note: `glab repo view` with `--output json` includes a `web_url` field. Alternatively, for cleaner output, capture stdout and parse JSON to extract `web_url`, then print just the URL. However, for simplicity and consistency with existing pr/issue patterns that also dump JSON, just run with inherited stdio.
- Uses `resolveForgeRepoAnyMode(workspaceName, repoArg, "gitlab")`.

**Gitea (gitea.ts):**
- Gitea's `tea` CLI does NOT have a direct "open repo" command. Instead:
  1. Use `_exec.runCapture(["repos", "ls", "--output", "json"], repoPath)` to get repo list.
  2. Parse JSON, extract the `html_url` from the first repo that matches (or the only repo listed since CWD scopes `tea` to the current repo).
  3. Alternatively, simpler approach: use `_detect.gitRemoteUrl(repoPath)` from forge-utils.ts to get the remote URL, then convert SSH URL to HTTPS URL if needed. However, this adds complexity.
  4. Simplest approach: `tea` when run in a git repo directory is already scoped to that repo. Use `_exec.runCapture(["repos", "ls", "--output", "json", "--limit", "1"], repoPath)` — the output should include the current repo's `html_url`.
  5. If parsing fails or no URL found, fall back to constructing the URL from the git remote.
- With `--web`: print URL AND call `_exec.openUrl(url)`.
- Without `--web`: just print the URL.
- Uses `resolveForgeRepoAnyMode(workspaceName, repoArg, "gitea")`.

Place the `open` command registration BEFORE the `pr` command in each file (so the command order in help text is: open, pr, issue).

Error handling pattern (identical to existing pr/issue commands):
```typescript
const resolution = resolveForgeRepoAnyMode(workspaceName, repoArg, "<forge>")
if (!resolution.ok) {
  console.error(formatForgeError(resolution))
  process.exit(1)
}
const { repoPath } = resolution
```
  </action>
  <verify>
    <automated>bun run typecheck && bun run src/index.ts integration github --help 2>&1 | grep -q "open"</automated>
  </verify>
  <done>All three forge integrations register an `open` subcommand. `git-stacks integration github open`, `git-stacks integration gitlab open`, and `git-stacks integration gitea open` appear in CLI help. The commands use resolveForgeRepoAnyMode and work with both trunk and worktree mode repos.</done>
</task>

</tasks>

<verification>
- `bun run typecheck` passes with no errors
- `bun run src/index.ts integration github --help` shows `open` command
- `bun run src/index.ts integration gitlab --help` shows `open` command
- `bun run src/index.ts integration gitea --help` shows `open` command
- `grep -c "resolveForgeRepoAnyMode" src/lib/integrations/forge-utils.ts` returns at least 1
- `grep -c "resolveForgeRepoAnyMode" src/lib/integrations/github.ts` returns at least 1
</verification>

<success_criteria>
- resolveForgeRepoAnyMode exists in forge-utils.ts and is imported by all three forge files
- Each forge has an `open <workspace> [repo]` command with `--web` option
- Commands work with both trunk-mode and worktree-mode repos
- Type checking passes cleanly
- CLI help output shows the new command for each forge
</success_criteria>

<output>
After completion, create `.planning/quick/260322-vcs-implement-integration-level-open-web-com/260322-vcs-SUMMARY.md`
</output>
