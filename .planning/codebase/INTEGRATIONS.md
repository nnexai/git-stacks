# External Integrations

**Analysis Date:** 2026-04-04

## Integration Plugin System

**Architecture:**
- Interface: `Integration` defined in `src/lib/integrations/types.ts`
- Registry: `src/lib/integrations/index.ts` exports `integrations` array (order matters for execution)
- Runner: `src/lib/integrations/runner.ts` orchestrates generate/open/cleanup lifecycle
- Config storage: Each integration's config under `globalConfig.integrations[id]` (Record<string, unknown>)
- Workspace overrides: `workspace.settings.integrations[id]` overrides global config
- Enabled resolution: workspace override > global config > `enabledByDefault` (via `resolveEnabled()`)

**Execution tiers (sorted by `order` field):**
- Tier 1 (10-19): Independent setup - vscode (10), intellij (11), tmux (12)
- Tier 2 (20-29): Partial side-effects - cmux (20)
- Tier 3 (30-39): Window management - niri (30), aerospace (31)
- Tier 5 (50-53): Forge/issue trackers - github (50), gitlab (51), gitea (52), jira (53)

**Window detection system:** Integrations returning `WindowArtifact` from `open()` participate in cross-integration window detection. Integrations with `windowDetector` property provide `begin()`/`resolve()` methods. Runner calls `begin()` before `open()`, then `resolve()` after to discover spawned window IDs. Results are merged into `artifact.windowIds`.

**To add a new integration:**
1. Create `src/lib/integrations/my-tool.ts` implementing `Integration`
2. Import and register in `src/lib/integrations/index.ts`
3. No other files need changes

## IDE Integrations

**VSCode:**
- Plugin: `src/lib/integrations/vscode.ts`
- Generator: `src/lib/vscode.ts` (generates `.code-workspace` JSON file)
- Config key: `integrations.vscode`
- Enabled by default: true
- Config options: `{ enabled: boolean, cmd: string }` (default cmd: `code-insiders`)
- Behavior: Generates `.code-workspace` file at `{tasksDir}/{workspace}/`, launches via configured binary
- CLI tools required: `code` or `code-insiders` (checked via `which`)
- Artifact: `WindowArtifact` with pid and app_id
- Injectable executor: `_exec` object for test isolation

**IntelliJ IDEA:**
- Plugin: `src/lib/integrations/intellij.ts`
- Generator: `src/lib/intellij.ts` (generates `.idea/` project directory)
- Config key: `integrations.intellij`
- Enabled by default: true
- Filter: `applies()` returns false when no Java repos present in workspace
- CLI tools required: `idea` (checked via `which`)
- Artifact: `WindowArtifact` with pid and app_id
- Injectable executor: `_exec` object for test isolation

## Terminal Multiplexer Integrations

**cmux:**
- Plugin: `src/lib/integrations/cmux.ts`
- Library: `src/lib/cmux.ts`
- Config key: `integrations.cmux`
- Enabled by default: true
- Config schema: `{ enabled?, panes?: [{ direction?, focus?, surfaces: [{ repo?, cwd?, command?, focus? }] }] }`
- Behavior: Creates/focuses cmux workspace, applies pane layout with surfaces on first creation
- Persists `cmux_workspace_id` in workspace YAML for reconnection
- Artifact: `CmuxArtifact` with workspaceRef

**tmux:**
- Plugin: `src/lib/integrations/tmux.ts`
- Library: `src/lib/tmux.ts`
- Config key: `integrations.tmux`
- Enabled by default: false
- Config schema: `{ enabled?, panes?: [{ direction?, focus?, surfaces: [{ repo?, cwd?, command? }] }] }`
- Behavior: Creates/focuses tmux session, applies pane layout, supports cleanup via `kill-session`
- CLI tools required: `tmux`
- Subcommands: `git-stacks integration tmux kill <workspace>`, `focus <workspace>`
- Artifact: `TmuxArtifact` with sessionName

## Window Manager Integrations

**niri (Linux Wayland compositor):**
- Plugin: `src/lib/integrations/niri.ts`
- Library: `src/lib/niri.ts`
- Config key: `integrations.niri`
- Enabled by default: false
- Config schema: `{ enabled?, focus?, columns?: [{ width?, windows: [{ app?, source?, args?, repo?, cwd?, command?, focus? }] }] }`
- Behavior: Creates named niri workspace, spawns windows from column config, arranges windows, sets column widths, manages focus
- Can source windows from other integration artifacts (e.g., `source: vscode` reuses VSCode window)
- Provides `WindowDetector` for cross-integration window ID resolution via `niri msg windows`
- Cleanup: Unnames niri workspace on workspace clean/remove
- CLI tools required: `niri msg`
- Subcommands: `focus`, `rename`, `unname`

**AeroSpace (macOS tiling window manager):**
- Plugin: `src/lib/integrations/aerospace.ts`
- Library: `src/lib/aerospace.ts`
- Config key: `integrations.aerospace`
- Enabled by default: false
- Config schema: `{ enabled?, workspaces: [{ workspace, layout?, normalization?, flatten_before_open?, focus?, commands?: [{ app?, command?, source?, repo?, cwd?, args?, focus? }] }] }`
- Behavior: Creates AeroSpace workspaces, sets layouts, spawns app windows, moves windows to target workspaces
- Validates config: no duplicate workspace names, at most one `focus: true` entry
- Provides `WindowDetector` for window ID resolution via `aerospace list-windows`
- CLI tools required: `aerospace`
- Subcommands: `focus`, `flatten`

## Forge Integrations (Git Hosting)

Shared utilities: `src/lib/integrations/forge-utils.ts` (repo resolution, CWD detection), `src/lib/integrations/issue-utils.ts` (issue link/unlink, workspace detection from CWD)

**GitHub:**
- Plugin: `src/lib/integrations/github.ts`
- Config key: `integrations.github`
- Enabled by default: false
- CLI tool: `gh` (GitHub CLI)
- Subcommands:
  - `git-stacks integration github open [workspace] [repo]` - Open repo on GitHub (--web for browser)
  - `git-stacks integration github pr create|view|list|diff|checks` - PR management
  - `git-stacks integration github issue link|unlink|open` - Issue tracking
- Auth: Managed by `gh` CLI (OAuth token)
- CWD detection: Omit workspace arg to auto-detect from current directory

**GitLab:**
- Plugin: `src/lib/integrations/gitlab.ts`
- Config key: `integrations.gitlab`
- Enabled by default: false
- CLI tool: `glab` (GitLab CLI)
- Subcommands: Same structure as GitHub (`open`, `pr create|view|list|diff`, `issue link|unlink|open`)
- Note: `pr` commands translate to GitLab `mr` (merge request) subcommands internally

**Gitea:**
- Plugin: `src/lib/integrations/gitea.ts`
- Config key: `integrations.gitea`
- Enabled by default: false
- CLI tool: `tea` (Gitea CLI)
- Subcommands: Same structure as GitHub/GitLab
- Additional capability: `runCapture` for output parsing, `gitRemoteUrl` for URL resolution, `openUrl` for browser fallback

## Issue Tracker Integrations

**Jira:**
- Plugin: `src/lib/integrations/jira.ts`
- Config key: `integrations.jira`
- Enabled by default: false
- Config schema: `{ enabled?, open_cmd?: string }` (default: `"jira open $ISSUE_ID"`)
- Subcommands:
  - `git-stacks integration jira issue link [workspace] <issue-id>` - Link Jira issue to workspace
  - `git-stacks integration jira issue unlink [workspace]` - Remove issue link
  - `git-stacks integration jira issue open [workspace]` - Open linked issue via configured command
- Issue state stored in workspace YAML: `settings.integrations.jira.issue`
- Uses `sh -c` with `$ISSUE_ID` env var substitution for configurable open command

## Secret Resolution System

- Location: `src/lib/secrets.ts`
- Syntax: `${{ resolver:path }}` in workspace/template `env:` values
- Configured in global config: `secrets.resolvers: ["keychain", "env"]` (default if unset)

**Resolvers:**

| Resolver | ID | Platform | Mechanism | Timeout |
|----------|-----|----------|-----------|---------|
| Keychain | `keychain` | macOS | `security find-generic-password -s <service> -a <account> -w` | 10s |
| Keychain | `keychain` | Linux | `secret-tool lookup <key> <value> [<key> <value>...]` | 10s |
| Environment | `env` | All | `process.env[path]` | instant |
| Command | `cmd` | All | `sh -c <path>` (arbitrary shell command) | 10s |

**Keychain path syntax:**
- Legacy: `service/account` (maps to `-s service -a account`)
- New: `key=value,key=value` (arbitrary attribute pairs; Linux supports N attributes, macOS max 2)

## Coding-Agent Signal Hooks

- Location: `src/lib/agent-hooks/`
- Manager: `src/lib/agent-hooks/integration-manager.ts`
- Terminal fallback: `src/lib/agent-hooks/terminal-session.ts`
- CLI: `src/commands/hooks.ts` - `git-stacks hooks status|install|update|uninstall`
- Providers: Codex, Claude Code, GitHub Copilot, and OpenCode

User-level hooks are installed only through an explicit provider-selected command. Update reconciles only git-stacks-owned integrations that already exist, and uninstall removes only owned entries/files. Normal terminal launch reads hook health and uses service-local process wrappers for absent providers without changing user configuration.

## File System Dependencies

**Config directory:** `~/.config/git-stacks/` (overridable via `GIT_STACKS_CONFIG_DIR` env var)
- `config.yml` - Global configuration
- `registry.yml` - Repo registry (flat list)
- `templates/{name}.yml` - Template definitions
- `workspaces/{name}.yml` - Workspace instances
- `messages/{workspace}.jsonl` - Notification messages
- `.ports.lock` - File-based port allocation lock (atomic O_EXCL create)

**Workspace filesystem:**
- Default root: `~/workspaces/` (configurable via `config.yml` `workspace_root`)
- Main clones: `{workspace_root}/main/{repo_name}/`
- Task worktrees: `{workspace_root}/tasks/{workspace_name}/{repo_name}/`

**Path constants:** All defined in `src/lib/paths.ts` as single source of truth.

## Process/Shell Dependencies

**Git operations (`src/lib/git.ts`):**
- All via Bun `$` shell with `.quiet().nothrow()` pattern
- `GIT_TERMINAL_PROMPT=0` set on network operations (fetch, push, ls-remote) to prevent credential prompts hanging
- `git worktree add|remove|list|prune` - Worktree lifecycle
- `git status --porcelain` - Dirty detection
- `git rev-parse` - Branch/ref resolution
- `git fetch origin` - Remote sync (with `fetch.timeout=30`)
- `git pull --ff-only` - Fast-forward pull
- `git push` - Push with `--force-with-lease` and `--set-upstream` support
- `git merge --no-ff` / `git rebase` - Merge strategies (auto-abort on failure)
- `git stash push|pop` - Auto-stash for sync operations
- `git rev-list --count` - Ahead/behind commit counting
- `git branch --set-upstream-to` - Upstream tracking configuration
- `git ls-remote --exit-code --heads` - Remote branch existence checks
- `git merge-tree --write-tree` - Conflict pre-detection without touching working tree

**Hook execution (`src/lib/lifecycle.ts`):**
- All hooks run via `sh -c <command>` through `Bun.spawn()`
- Two modes: `runHooks()` (inherited stdio) and `runHooksCaptured()` (piped output for TUI)
- Sequential execution; `abortOnFailure` flag controls whether to stop on non-zero exit

**Port allocation (`src/lib/ports.ts`):**
- File-based locking via `O_WRONLY | O_CREAT | O_EXCL` on `.ports.lock`
- Contiguous block allocation within configurable range (default 10000-65000)
- Cross-workspace conflict detection

## Notification / IPC

**Message system (`src/lib/messages.ts`):**
- JSONL file-based storage: `~/.config/git-stacks/messages/{workspace}.jsonl`
- Unix domain socket IPC: `/tmp/git-stacks.sock` for real-time push to running dashboard
- Commands: `git-stacks message send|list|clear`
- Used by agent hooks to notify dashboard of AI agent activity

## Environment Variable Injection

**Hook environment (`src/lib/workspace-ops.ts`):**
- `GS_WORKSPACE_NAME` - Workspace name
- `GS_WORKSPACE_BRANCH` - Branch name
- `GS_WORKSPACE_PATH` - Workspace tasks directory
- `GS_REPO_NAME` - Current repo name (per-repo hooks)
- `GS_TRIGGERED_BY` - What triggered the hook (e.g., "open", "create")
- Custom `env:` values from template/workspace YAML (merged, workspace wins)
- Secret references resolved before injection via `resolveSecrets()`

**Port injection:** Allocated port numbers injected as environment variables keyed by port name (e.g., `PORT_WEB=10042`).

---

*Integration audit: 2026-04-04*
