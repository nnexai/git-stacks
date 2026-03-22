# Phase 27: Git Forge Integrations - Research

**Researched:** 2026-03-22
**Domain:** CLI forge integrations (gh, glab, tea), Integration plugin architecture, forge detection
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Forge Config Model**
- D-01: Add optional `forge` field to `RepoRegistryEntrySchema` — values: `"github" | "gitlab" | "gitea"`. No forge = no PR commands available for that repo.
- D-02: No URL parsing or auto-detection at PR-creation time. The forge CLIs resolve project context automatically when run inside the repo's working directory. git-stacks only needs to know which CLI to invoke.
- D-03: Self-hosted instances (GitHub Enterprise, GitLab self-managed, Gitea) are handled entirely by the forge CLIs' own auth/config. git-stacks does not store host URLs or credentials.

**Forge Detection at Repo Registration**
- D-04: Each forge integration exposes a detection hook that checks the repo's remote URL and whether the forge CLI tool is installed. Used by `repo add` and `repo scan` to suggest forge type.
- D-05: If exactly one forge integration claims a repo, suggest it as default. If multiple or none claim it, prompt the user to choose (same UX pattern as worktree-vs-trunk selection).

**Integration Architecture**
- D-06: Each forge is a full `Integration` plugin — reuse the existing interface. `open()` returns null (no-op), no `generate()`, no `cleanup()`. Commands registered via `commands?(parent)`. Future phases may add session-oriented behavior.
- D-07: Forge integrations appear in `git-stacks config` (enable/disable), TUI detail pane integration cascade, and repo detail views.
- D-08: Forge integrations follow the injectable `_exec` pattern for shell commands (forge CLI calls), consistent with niri/tmux/cmux.

**Command Surface**
- D-09: Per-forge subcommand tree registered under `git-stacks integration <forge>`:
  - `pr create <workspace> [repo]` — create PR/MR for a repo's workspace branch against its base branch
  - `pr open <workspace> [repo]` — output PR URL to stdout, open in browser if `--web` available
  - `pr status <workspace> [repo]` — pass through forge CLI status output
- D-10: `[repo]` is required when workspace has >1 worktree-mode repo. Auto-selected when exactly one worktree repo exists.
- D-11: GitLab uses `mr` terminology internally but the subcommand is still `pr` for consistency across forges. The integration translates to `glab mr create` etc.

**Execution Model**
- D-12: All forge CLI invocations use `stdio: "inherit"` — the user interacts directly with the forge CLI. git-stacks passes base branch (`--base` / `--target-branch` / equivalent) from workspace YAML's `repo.base_branch` when possible.
- D-13: CLI-only — forge commands are not available from the TUI dashboard. Interactive stdio is incompatible with OpenTUI rendering.
- D-14: If the forge CLI is not installed or the repo has no forge configured, the command errors immediately with a clear message.

### Claude's Discretion
- Detection hook implementation details (how to check remote URL for forge hints)
- Whether to add `--web` as a flag on `pr open` or always attempt browser open
- Exact flag mapping between git-stacks options and each forge CLI's flags
- Test strategy — likely unit tests with `_exec` injection mocking CLI calls

### Deferred Ideas (OUT OF SCOPE)
- Issue/task linking (GitHub Issues, GitLab Issues, Gitea Issues, Jira) — separate phase
- TUI-based PR actions using non-interactive flags (`gh pr create --fill`)
- PR status display formatted by git-stacks instead of raw CLI pass-through
- Cross-repo PR descriptions (workspace-level PR template applied to all repos)
</user_constraints>

## Summary

Phase 27 adds three forge integration plugins (GitHub/GitLab/Gitea) following the established Integration interface pattern already used by niri, tmux, cmux, vscode, and intellij. Each forge plugin is a thin orchestration layer: it resolves which repo to operate on within the workspace context, changes working directory to the repo's task_path, and delegates to the appropriate forge CLI binary with the correct flags.

The forge CLIs (gh, glab, tea) each resolve project context automatically from the git remote URL in the current working directory. git-stacks's only job is to (1) `cd` to the correct repo path, (2) pass the base branch flag when available, and (3) invoke the right CLI. This "pass-through" principle is established in D-02 and D-12.

The key implementation challenges are: resolving the workspace+repo context from CLI args (D-09/D-10), the `_exec` injectable pattern for test isolation (D-08), remote URL detection for forge suggestion at registration (D-04), and the `pr open` command for tea (which lacks a native `--web` flag unlike gh and glab).

**Primary recommendation:** Each forge is a separate `src/lib/integrations/{forge}.ts` file implementing `Integration`. A shared `src/lib/integrations/forge-utils.ts` handles the common `resolveForgeRepo()` logic (lookup workspace, validate repo arg, resolve to task_path). The `_exec` object in each forge file wraps `Bun.spawn` with `stdio: "inherit"`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| gh (GitHub CLI) | system-installed | Create/view/status GitHub PRs | Official GitHub CLI, auto-resolves project from CWD |
| glab (GitLab CLI) | system-installed | Create/view/status GitLab MRs | Official GitLab CLI, auto-resolves project from CWD |
| tea (Gitea CLI) | system-installed (dev: `tea@development`) | Create/list Gitea PRs | Official Gitea CLI (tea is the only first-party Gitea CLI) |
| Bun `$` / `spawn` | existing | Fork CLI subprocesses with `stdio: "inherit"` | Already used in niri/tmux/cmux via `_exec` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| xdg-open (Linux) / open (macOS) | system | Open PR URL in browser for `pr open` in tea | tea lacks `--web` flag — must get URL from `tea pulls ls --output json` then open it manually |
| Zod | existing | Config schema for forge field | Already used throughout |

### No New Package Installs Required
All forge CLIs are system-installed external tools. No npm dependencies are added. The integration pattern is purely CLI invocation.

## Architecture Patterns

### Recommended Project Structure
```
src/
  lib/
    integrations/
      github.ts         # GitHub forge integration plugin
      gitlab.ts         # GitLab forge integration plugin
      gitea.ts          # Gitea forge integration plugin
      forge-utils.ts    # Shared: resolveForgeRepo(), resolveWorkspaceForForge()
      index.ts          # Register three new integrations
tests/
  lib/
    integrations/
      github.test.ts    # _exec injection tests for gh CLI commands
      gitlab.test.ts    # _exec injection tests for glab CLI commands
      gitea.test.ts     # _exec injection tests for tea CLI commands
      forge-utils.test.ts # Unit tests for resolveForgeRepo, URL detection
```

### Pattern 1: Integration Plugin Skeleton (Forge Variant)

Each forge integration follows the niri/tmux pattern exactly. The key differences from those integrations are:

- `open()` always returns `null` (forge integrations are not session-integrations, no artifact produced)
- `cleanup()` is absent (no forge state to clean up on workspace removal)
- `applies(workspace)` filters to only workspaces that contain at least one repo with `forge === this.id`
- `commands(parent)` is the primary value-add — registers `pr create`, `pr open`, `pr status`

```typescript
// Source: src/lib/integrations/github.ts (pattern from niri.ts + tmux.ts)
export const _exec = {
  run: async (args: string[], cwd: string): Promise<{ exitCode: number }> => {
    const proc = Bun.spawn(["gh", ...args], {
      cwd,
      stdio: ["inherit", "inherit", "inherit"],
    })
    return { exitCode: await proc.exited }
  },
}

export const githubIntegration: Integration = {
  id: "github",
  label: "GitHub",
  hint: "create and manage GitHub PRs via gh CLI",
  enabledByDefault: false,
  order: 50, // tier 5 — forge integrations (no visual session setup)

  applies: (workspace) =>
    workspace.repos.some((r) => /* registryForge(r.repo) === "github" */),

  isEnabled: (ctx) => resolveEnabled("github", false, ctx),

  open: async (_ctx, _artifact, _bag) => null,

  configurePrompt: async (_current) => ({ enabled: true }),

  commands(parent: Command): void {
    const pr = new Command("pr").description("Manage GitHub pull requests")
    pr.command("create <workspace> [repo]")
      .description("Create a GitHub PR for a workspace branch")
      .action(async (workspace: string, repo?: string) => { ... })
    pr.command("open <workspace> [repo]")
      .description("Open PR in browser")
      .option("--web", "Open in browser")
      .action(async (workspace: string, repo?: string, opts: { web?: boolean }) => { ... })
    pr.command("status <workspace> [repo]")
      .description("Show PR status")
      .action(async (workspace: string, repo?: string) => { ... })
    parent.addCommand(pr)
  },
}
```

### Pattern 2: Shared Forge Utilities (`forge-utils.ts`)

The workspace+repo resolution logic is identical across all three forge integrations. Extract to avoid duplication:

```typescript
// Source: pattern derived from workspace-ops.ts + commands/workspace.ts

export type ForgeRepoResolution = {
  workspace: Workspace
  repo: WorkspaceRepo         // the resolved repo
  repoPath: string            // task_path (worktree CWD for forge CLI)
  baseBranch: string          // repo.base_branch ?? registry entry default_branch ?? "main"
}

export type ForgeRepoResolutionError =
  | { ok: false; error: "workspace_not_found"; name: string }
  | { ok: false; error: "repo_required"; worktreeRepos: string[] }
  | { ok: false; error: "repo_not_found"; name: string }
  | { ok: false; error: "not_worktree_mode"; repo: string }

export function resolveForgeRepo(
  workspaceName: string,
  repoArg: string | undefined,
  forge: string
): ForgeRepoResolution | ForgeRepoResolutionError
```

**Resolution rules (from D-09/D-10):**
1. Load workspace from YAML — error if not found
2. Filter to worktree-mode repos (trunk repos don't have isolated branches)
3. If `repoArg` provided: find by name — error if not found
4. If `repoArg` omitted and exactly one worktree repo: auto-select
5. If `repoArg` omitted and multiple worktree repos: error with list (user must specify)

### Pattern 3: Forge Detection Hook

Each forge integration implements a `detect(repoPath: string): Promise<boolean>` function used during `repo add` and `repo scan`:

```typescript
// Source: patterns from doctor.ts checkBinary() + git.ts getCurrentBranch()

export async function detectGitHubForge(repoPath: string): Promise<boolean> {
  // Step 1: Check binary is installed
  const ghInstalled = await $`which gh`.quiet().nothrow()
  if (ghInstalled.exitCode !== 0) return false

  // Step 2: Check remote URL contains "github.com"
  const remote = await $`git -C ${repoPath} remote get-url origin`.quiet().nothrow()
  if (remote.exitCode !== 0) return false
  return remote.text().trim().includes("github.com")
}
```

Detection logic per forge:
- **GitHub**: remote URL contains `github.com` AND `gh` is installed
- **GitLab**: remote URL contains `gitlab.com` OR `gitlab.` (self-hosted) AND `glab` is installed
- **Gitea**: tea's configured login hostnames are matched against the remote URL AND `tea` is installed — tea stores login config at `$XDG_CONFIG_HOME/tea` with host URLs

GitLab self-hosted detection is best-effort: matching `gitlab.` in the URL covers common naming but is not exhaustive. The fallback for unmatched remotes is to show all available forges and let the user choose (D-05).

### Pattern 4: `_exec` Injectable for Forge CLIs

Following the tmux.ts/cmux.ts pattern exactly:

```typescript
// Source: src/lib/tmux.ts lines 11-18 (proven pattern)

export type ForgeCmdResult = { exitCode: number }

export const _exec = {
  run: async (bin: string, args: string[], cwd: string): Promise<ForgeCmdResult> => {
    const proc = Bun.spawn([bin, ...args], {
      cwd,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    return { exitCode: await proc.exited }
  },
}
```

Tests mutate `_exec.run` directly after cache-busting import:
```typescript
const forgeModule = await import("@/lib/integrations/github?forge-test")
const { _exec } = forgeModule
_exec.run = mock(async (bin, args, cwd) => ({ exitCode: 0 }))
```

### Pattern 5: `pr open` — tea Has No `--web` Flag

**gh:** `gh pr view [branch] --web` — opens browser directly, outputs nothing to stdout. MEDIUM confidence (verified via https://cli.github.com/manual/gh_pr_view)

**glab:** `glab mr view [branch] --web` — opens browser directly. MEDIUM confidence (verified via https://docs.gitlab.com/cli/mr/view/)

**tea:** No `--web` or browser-open flag on any `tea pulls` subcommand. The `tea open` command opens the repo home page, not a specific PR. To open a specific PR:
1. Run `tea pulls ls --output json --state all` in the repo's CWD
2. Filter the JSON array for an entry where `head` matches the workspace branch
3. Extract the `url` field
4. Print to stdout (always useful for scripting)
5. Open with `xdg-open $URL` (Linux) or `open $URL` (macOS) when `--web` flag given

This makes `--web` a flag on `pr open` (not always-open) — correct per Claude's Discretion guidance.

### Flag Mapping Table

| Command | GitHub (gh) | GitLab (glab) | Gitea (tea) |
|---------|------------|---------------|-------------|
| pr create | `gh pr create --base <branch>` | `glab mr create --target-branch <branch>` | `tea pulls create --base <branch>` |
| pr open (no browser) | `gh pr view [branch] --json url --jq .url` | `glab mr view [branch] --output json \| jq .web_url` | `tea pulls ls --output json` + filter by head |
| pr open (browser) | `gh pr view [branch] --web` | `glab mr view [branch] --web` | (see Pattern 5 above) |
| pr status | `gh pr status` | `glab mr status` | `tea pulls ls --state open` |

**Verified sources:**
- gh: https://cli.github.com/manual/gh_pr_create, https://cli.github.com/manual/gh_pr_view (HIGH confidence)
- glab: https://docs.gitlab.com/cli/mr/create/, https://docs.gitlab.com/cli/mr/view/ (HIGH confidence)
- tea: `tea --help`, `tea pulls create --help`, `tea pulls --help` — live CLI (HIGH confidence)

### Anti-Patterns to Avoid

- **Parsing forge CLI stdout**: Don't parse `gh pr create` output to extract PR URL. Use `gh pr view [branch] --json url --jq .url` separately if needed.
- **Hardcoding base branch**: Always use `repo.base_branch ?? registryEntry.default_branch ?? "main"`, never hardcode `main`.
- **Running forge CLI from main_path**: Always run from `repo.task_path` (the worktree) — the forge CLI must see the workspace branch as HEAD.
- **Blocking on trunk repos**: Trunk-mode repos share the main clone; creating a PR from a trunk repo is ambiguous. Only operate on worktree-mode repos.
- **Single `_exec.run` for all three forges**: Each forge file needs its own `_exec` object so tests can mock one forge without affecting the others.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PR creation UX (title, body, reviewers) | Custom interactive prompts | Pass through to `gh pr create` / `glab mr create` / `tea pulls create` with `stdio: "inherit"` | Each CLI has its own interactive UX; duplicating it is wasted effort |
| PR URL lookup for GitHub | Manual API call | `gh pr view --json url --jq .url` | gh handles auth, API rate limiting, SSH vs HTTPS |
| PR URL lookup for GitLab | Manual API call | `glab mr view --output json` then parse | glab handles auth and project resolution |
| Forge auth/credentials | Credential storage | Each CLI manages its own auth (`gh auth login`, `glab auth login`, `tea login add`) | Security, token refresh, SSH key handling |
| Context resolution (owner/repo from CWD) | Remote URL parsing | Run CLI in repo CWD — all three CLIs auto-resolve from `git remote get-url origin` | All forge CLIs handle GitHub Enterprise, self-hosted GitLab, custom Gitea hosts |

**Key insight:** The forge CLIs are designed for exactly this use case — running from within a git working directory to operate on the current repo. git-stacks's value is workspace context (which repo, which branch, which base), not forge API orchestration.

## Common Pitfalls

### Pitfall 1: Running Forge CLI from Wrong Directory
**What goes wrong:** `gh pr create` run from the main clone path creates a PR from the wrong branch (main/master HEAD, not the workspace branch).
**Why it happens:** git-stacks has two paths per workspace repo: `main_path` (the bare clone) and `task_path` (the worktree with the workspace branch checked out).
**How to avoid:** Always `cd` to `repo.task_path` before invoking any forge CLI. Verify with a check: `git -C task_path rev-parse --abbrev-ref HEAD === workspace.branch`.
**Warning signs:** PR created for wrong branch, or forge CLI reports "no upstream tracking branch."

### Pitfall 2: tea Context Resolution with Self-Hosted Gitea
**What goes wrong:** `tea pulls ls` fails with "no Gitea login found for this remote" even though `tea login list` shows a login.
**Why it happens:** tea matches the remote URL against configured login hostnames. If the remote uses IP address (`ssh://192.168.50.166:22222/...`) but the login was registered as `192.168.50.166`, it should match. However if HTTPS port differs from standard 443, the match may fail.
**How to avoid:** The detection hook should check that `tea pulls ls` succeeds (exitCode 0) in the repo's CWD, not just that `which tea` succeeds.
**Warning signs:** `tea pulls ls` exits non-zero with "no Gitea login" despite forge being configured.

### Pitfall 3: `applies()` Requires Registry Lookup
**What goes wrong:** `applies(workspace)` is called with a `Workspace` object, but the `forge` field is on `RepoRegistryEntry` (not on `WorkspaceRepo`). Workspace YAML stores `repo.repo` (registry name) not the forge field directly.
**Why it happens:** The forge field is a registry-level property (D-01 adds it to `RepoRegistryEntrySchema`), not copied into workspace YAML at creation time.
**How to avoid:** `applies()` must read the registry and resolve registry entries for each `workspace.repos[n].repo` (registry name) to check their `forge` field. Or alternatively — store the resolved forge in `WorkspaceRepo` when workspace is created (simpler, but adds a field). Recommend: read registry in `applies()` since it's a cheap in-memory read.
**Warning signs:** All forge integrations report `applies() = false` for all workspaces.

### Pitfall 4: GitLab Self-Hosted Detection False Positives
**What goes wrong:** `remote.includes("gitlab.")` matches non-GitLab hosts that happen to have "gitlab" in their hostname.
**Why it happens:** GitLab self-hosted is deployed on arbitrary domains; there's no canonical URL pattern.
**How to avoid:** Only match `gitlab.com` (the SaaS instance) with HIGH confidence. For other URLs, treat detection as LOW confidence and always fall through to user selection (D-05). The detection hook should return `true` only for `github.com` / `gitlab.com` exactly; all self-hosted cases get offered to the user.
**Warning signs:** User with Gitea instance at `git.mycompany.com` gets GitLab suggested.

### Pitfall 5: Missing `--web` Flag in Shell Completion
**What goes wrong:** `git-stacks integration github pr open --web` works but `--web` does not appear in shell completions.
**Why it happens:** `COMMAND_FLAG_COMPLETIONS` table (added in Phase 26) only covers top-level commands. The `integration <forge> pr open --web` flag path needs to be registered.
**How to avoid:** The completion generator walks the entire commander tree; as long as `--web` is declared as an option on the `pr open` subcommand, it appears automatically. No manual registration needed.

### Pitfall 6: `pr status` Scope Varies Per Forge CLI
**What goes wrong:** `gh pr status` returns status for all PRs associated with the repo (not just the workspace branch). `glab mr status` has similar broad scope.
**Why it happens:** These commands are designed for the current repo context, not a specific branch filter.
**How to avoid:** For `pr status`, pass-through is the correct behavior (D-09 says "pass through forge CLI status output"). git-stacks passes base branch for `create` only — no branch filtering for `status`. Document this in command description.

## Code Examples

### Schema Change: Adding `forge` to `RepoRegistryEntrySchema`

```typescript
// Source: src/lib/config.ts lines 41-48 (current schema)
export const ForgeTypeSchema = z.enum(["github", "gitlab", "gitea"]).optional()
export type ForgeType = z.infer<typeof ForgeTypeSchema>

export const RepoRegistryEntrySchema = z.object({
  name: z.string(),
  schema_version: z.string().default("1"),
  local_path: z.string(),
  default_branch: z.string().default("main"),
  type: RepoTypeSchema.default("other"),
  forge: ForgeTypeSchema,   // NEW: optional, no default
})
```

Backward compatible: `forge` is optional, existing registry files without this field parse cleanly.

### Detection Function (GitHub Example)

```typescript
// Source: doctor.ts checkBinary() pattern + git.ts remote pattern
export async function detectGitHubForge(repoPath: string): Promise<boolean> {
  const ghResult = await $`which gh`.quiet().nothrow()
  if (ghResult.exitCode !== 0) return false
  const remoteResult = await $`git -C ${repoPath} remote get-url origin`.quiet().nothrow()
  if (remoteResult.exitCode !== 0) return false
  const remoteUrl = remoteResult.text().trim()
  return remoteUrl.includes("github.com")
}
```

### Shared Repo Resolution (forge-utils.ts)

```typescript
// Source: pattern derived from workspace-ops.ts and commands/workspace.ts
export function resolveForgeRepo(
  workspaceName: string,
  repoArg: string | undefined
): ForgeRepoResolution | ForgeRepoResolutionError {
  if (!workspaceExists(workspaceName)) {
    return { ok: false, error: "workspace_not_found", name: workspaceName }
  }
  const workspace = readWorkspace(workspaceName)
  const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")

  let repo: WorkspaceRepo
  if (repoArg !== undefined) {
    const found = worktreeRepos.find((r) => r.name === repoArg)
    if (!found) return { ok: false, error: "repo_not_found", name: repoArg }
    repo = found
  } else if (worktreeRepos.length === 1) {
    repo = worktreeRepos[0]
  } else {
    return { ok: false, error: "repo_required", worktreeRepos: worktreeRepos.map((r) => r.name) }
  }

  const registry = readRegistry()
  const registryEntry = registry.find((r) => r.name === repo.repo)
  const baseBranch = repo.base_branch ?? registryEntry?.default_branch ?? "main"

  return { ok: true, workspace, repo, repoPath: repo.task_path, baseBranch }
}
```

### Command Action: `pr create` (GitHub)

```typescript
// Source: niri.ts commands() pattern + tmux.ts _exec pattern
pr.command("create <workspace> [repo]")
  .description("Create a GitHub PR for the workspace branch")
  .action(async (workspaceName: string, repoArg?: string) => {
    const resolution = resolveForgeRepo(workspaceName, repoArg)
    if (!resolution.ok) {
      console.error(formatForgeError(resolution))
      process.exit(1)
    }
    const { repoPath, baseBranch } = resolution
    const result = await _exec.run("gh", ["pr", "create", "--base", baseBranch], repoPath)
    if (result.exitCode !== 0) process.exit(result.exitCode)
  })
```

### Command Action: `pr open` (tea — no --web flag)

```typescript
// Source: tea CLI behavior verified directly
pr.command("open <workspace> [repo]")
  .description("Output PR URL; open in browser with --web")
  .option("--web", "Open in browser")
  .action(async (workspaceName: string, repoArg?: string, opts: { web?: boolean } = {}) => {
    const resolution = resolveForgeRepo(workspaceName, repoArg)
    if (!resolution.ok) { console.error(formatForgeError(resolution)); process.exit(1) }
    const { repoPath, workspace } = resolution

    // tea has no --web flag; get PR URL from JSON output
    const result = await _exec.runCapture(
      "tea", ["pulls", "ls", "--output", "json", "--state", "all"], repoPath
    )
    const prs = JSON.parse(result.stdout)
    const pr = prs.find((p: any) => p.head.split(":").pop() === workspace.branch)
    if (!pr) { console.error(`No PR found for branch '${workspace.branch}'`); process.exit(1) }

    console.log(pr.url)
    if (opts.web) {
      const opener = process.platform === "darwin" ? "open" : "xdg-open"
      await _exec.run(opener, [pr.url], repoPath)
    }
  })
```

Note: `_exec.runCapture` is a second method on the `_exec` object for captured (piped) output, separate from `_exec.run` (inherit stdio). This follows the SpawnHandle pattern in lifecycle.ts.

### Forge Detection in `repo add` / `repo scan`

In `src/commands/repo.ts` `add` action and `src/tui/repo-wizard.ts` scan flow:

```typescript
// After determining localPath, before writeRegistry:
const suggestions = await detectForgeForRepo(localPath)
// suggestions: Array<"github" | "gitlab" | "gitea"> (those whose detect() returned true)

let forge: "github" | "gitlab" | "gitea" | undefined
if (suggestions.length === 1) {
  forge = suggestions[0]
  p.log.info(`Detected forge: ${forge}`)
} else if (suggestions.length > 1 || suggestions.length === 0) {
  const choice = await p.select({
    message: "Select forge for this repo (or skip)",
    options: [
      { value: "none", label: "None" },
      { value: "github", label: "GitHub" },
      { value: "gitlab", label: "GitLab" },
      { value: "gitea", label: "Gitea" },
    ],
    initialValue: suggestions[0] ?? "none",
  })
  forge = choice === "none" ? undefined : choice as ForgeType
}
// Include forge in registry entry (undefined = no forge)
```

The `detectForgeForRepo(repoPath)` function calls each forge integration's detection function and collects those that return `true`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `mock.module()` for all integrations | `_exec` injectable pattern for lib-level shell calls | Phase 24 | Tests now use direct injection; cache-busting import required |
| Separate tool-specific files (vscode.ts, tmux.ts in root lib/) | Integration plugin pattern in `integrations/` subdirectory | Phase 16-18 | All IDE/terminal tools follow Integration interface |
| No `commands()` on integrations | `commands?(parent: Command)` optional hook | Phase 16-18 | niri.ts registers `focus-workspace`; forge integrations use this for `pr *` subcommands |

**Deprecated/outdated:**
- Global `mock.module("@/lib/tmux", ...)` in forge integration tests: use `_exec` injection instead — forge integration tests import `{ _exec }` from each forge module and replace `_exec.run` directly.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Jest-compatible API) |
| Config file | none — Bun auto-discovers `*.test.ts` |
| Quick run command | `bun test tests/lib/integrations/github.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map

Phase 27 has no formal requirement IDs assigned yet. Based on CONTEXT.md decisions:

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| `RepoRegistryEntrySchema` accepts optional `forge` field | unit | `bun test tests/lib/config.test.ts` | ✅ exists — add cases |
| `RepoRegistryEntrySchema` parses without `forge` (backward compat) | unit | `bun test tests/lib/config.test.ts` | ✅ exists — add cases |
| `resolveForgeRepo`: auto-selects repo when exactly one worktree repo | unit | `bun test tests/lib/integrations/forge-utils.test.ts` | ❌ Wave 0 |
| `resolveForgeRepo`: errors when >1 worktree repos and no repo arg | unit | `bun test tests/lib/integrations/forge-utils.test.ts` | ❌ Wave 0 |
| `resolveForgeRepo`: errors when workspace not found | unit | `bun test tests/lib/integrations/forge-utils.test.ts` | ❌ Wave 0 |
| GitHub `pr create` invokes `gh pr create --base <branch>` in task_path | unit | `bun test tests/lib/integrations/github.test.ts` | ❌ Wave 0 |
| GitLab `pr create` invokes `glab mr create --target-branch <branch>` | unit | `bun test tests/lib/integrations/gitlab.test.ts` | ❌ Wave 0 |
| Gitea `pr create` invokes `tea pulls create --base <branch>` | unit | `bun test tests/lib/integrations/gitea.test.ts` | ❌ Wave 0 |
| GitHub `pr open --web` invokes `gh pr view --web` | unit | `bun test tests/lib/integrations/github.test.ts` | ❌ Wave 0 |
| Gitea `pr open` fetches URL from `tea pulls ls --output json` | unit | `bun test tests/lib/integrations/gitea.test.ts` | ❌ Wave 0 |
| `integrationCommand` has `github`, `gitlab`, `gitea` subcommands | unit | `bun test tests/lib/integration-commands.test.ts` | ✅ exists — add assertions |
| Detection: `detectGitHubForge` returns true for github.com remote | unit | `bun test tests/lib/integrations/forge-utils.test.ts` | ❌ Wave 0 |
| Detection: `detectGitHubForge` returns false when `gh` not installed | unit | `bun test tests/lib/integrations/forge-utils.test.ts` | ❌ Wave 0 |
| Doctor lists `gh`, `glab`, `tea` in binary checks | unit | `bun test tests/lib/...` (no direct doctor unit test) | manual-only |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/integrations/` (forge integration suite)
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/integrations/forge-utils.test.ts` — resolveForgeRepo unit tests
- [ ] `tests/lib/integrations/github.test.ts` — GitHub integration command tests with `_exec` injection
- [ ] `tests/lib/integrations/gitlab.test.ts` — GitLab integration command tests
- [ ] `tests/lib/integrations/gitea.test.ts` — Gitea integration command tests (includes tea JSON URL parsing)

## Open Questions

1. **Should `forge` be stored in `WorkspaceRepo` at workspace creation time?**
   - What we know: `applies()` is called with a `Workspace` object, so it must either (a) read registry to look up forge, or (b) have forge stored on `WorkspaceRepo`
   - What's unclear: Cost of registry read in `applies()` vs. schema addition and migration complexity
   - Recommendation: Store forge in `WorkspaceRepo` at creation time (same pattern as `type` which is already copied from registry). This avoids registry I/O in `applies()` and avoids pitfall #3.

2. **Does tea `pulls ls --output json` filter by head branch reliably?**
   - What we know: tea's `pulls ls` fields include `head` — but the format of the `head` field in JSON is not yet confirmed (could be `user:branch` or just `branch`)
   - What's unclear: Exact JSON field structure for `head` in tea's output
   - Recommendation: In the gitea integration, test `tea pulls ls --output json` with a real PR and confirm the `head` field format before finalizing the URL extraction logic.

3. **Order value for forge integrations?**
   - What we know: existing tiers are 10-19 (setup), 20-29 (side-effects), 30-39 (window management). Forge integrations have `open()` as no-op.
   - What's unclear: Whether order matters for no-op `open()` integrations
   - Recommendation: Use order 50 (tier 5 — forge utilities). Since `open()` is a no-op, the exact value doesn't affect behavior, only display order in `git-stacks config`.

## Sources

### Primary (HIGH confidence)
- `src/lib/integrations/types.ts` — Integration interface (verified via Read tool)
- `src/lib/integrations/niri.ts` — _exec pattern reference (verified via Read tool)
- `src/lib/tmux.ts` — `_exec.run` injectable pattern (verified via Read tool)
- `src/lib/config.ts` lines 41-48 — `RepoRegistryEntrySchema` for forge field addition (verified via Read tool)
- `src/lib/lifecycle.ts` — SpawnHandle pattern for captured output (verified via Read tool)
- `src/commands/doctor.ts` lines 31-34 — `checkBinary()` pattern (verified via Read tool)
- `https://cli.github.com/manual/gh_pr_create` — gh pr create flags including `--base` (verified via WebFetch)
- `https://cli.github.com/manual/gh_pr_view` — gh pr view `--web` flag (verified via WebFetch)
- `https://docs.gitlab.com/cli/mr/create/` — glab mr create `--target-branch` flag (verified via WebFetch)
- `https://docs.gitlab.com/cli/mr/view/` — glab mr view `--web` flag (verified via WebFetch)
- tea CLI direct invocation — `tea pulls create --help`, `tea open --help` (verified via Bash tool — tea@development installed)

### Secondary (MEDIUM confidence)
- `tests/lib/integrations/tmux.test.ts` — test pattern for integration plugins with `_exec` injection (verified via Read tool)
- `tests/lib/integration-commands.test.ts` — test pattern for integration command structure (verified via Read tool)

### Tertiary (LOW confidence)
- WebSearch: forge CLI flag information (cross-verified with official docs above, elevated to HIGH/MEDIUM)
- tea JSON `head` field format: not directly verified — needs live test against a real Gitea PR

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — forge CLIs verified via `which`/`--help`; Integration interface verified in codebase
- Architecture: HIGH — patterns directly derived from existing niri.ts/tmux.ts implementations
- Pitfalls: HIGH — pitfall #3 (applies() registry lookup) verified against schema; others verified via CLI testing
- Flag mapping: HIGH for gh/glab (official docs verified); HIGH for tea (live CLI verified)
- tea pr open JSON path: LOW — `head` field format not confirmed

**Research date:** 2026-03-22
**Valid until:** 2026-09-22 (stable forge CLI flags; tea version is `development` build so monitor for API changes)
