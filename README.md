# git-stacks

Git worktree workspace manager — repo registry, templates, and multi-repo orchestration.

**Why?** Switching between tasks (tickets, features, experiments) across multiple repos means juggling branches, IDE windows, and terminal sessions. `git-stacks` creates isolated worktrees for each task and opens everything in one shot. An interactive TUI dashboard lets you manage everything without leaving the terminal.

## Installation

**Requires [Bun](https://bun.sh) runtime.**

```bash
# Run directly (no install)
bunx git-stacks --help

# Install globally
bun add -g git-stacks
```

## Concepts

**Repo Registry** — a flat list of local git repos and directories with names, paths, types, and default branches. Stored at `~/.config/git-stacks/registry.yml`. Managed via `git-stacks repo add|scan|list|show|remove|rename`.

**Template** — a named set of repos (by registry name) with modes and branch patterns, used to stamp out workspaces. Stored at `~/.config/git-stacks/templates/{name}.yml`. Looked up by the name field inside the YAML, not by filename. Managed via `git-stacks template new|list|show|edit|clone|rename|remove`.

**Workspace** — a task/ticket-scoped instance created from a template. Each workspace has a branch; repos can be in `worktree` mode (isolated git worktree at `{workspace_root}/tasks/{workspace_name}/{repo_name}`), `trunk` mode (references the main clone directly), or `dir` mode (references a non-git directory — no branches, no worktrees, no git operations). Stored at `~/.config/git-stacks/workspaces/{name}.yml`. Looked up by the name field inside the YAML, not by filename.

## Quick Start

```bash
# Register repos from an existing directory
git-stacks repo scan ~/dev/myproject

# Create a template from registered repos (interactive)
git-stacks template new

# Create a new workspace (interactive)
git-stacks new my-feature

# Open a workspace (launches integrations in order: VSCode/IntelliJ → tmux → cmux → niri)
git-stacks open my-feature

# Merge branches back and clean up
git-stacks merge my-feature
```

## Repo Registry

```bash
git-stacks repo add <path>           # Register a local git repo
git-stacks repo scan <dir>           # Scan directory for git repos and register them
git-stacks repo list                 # List all registered repos
git-stacks repo show <name>          # Show repo details
git-stacks repo remove <name>        # Remove a repo from registry
git-stacks repo rename <old> <new>   # Rename a registered repo
git-stacks repo --yaml               # Open registry.yml in $EDITOR
```

## Dir Repos

Non-git directories can be registered and included in workspaces alongside regular git repos. Use this for shared config directories, documentation folders, or any path you want available in your workspace without git operations.

```bash
# Register a plain directory
git-stacks repo add ~/shared/config

# Scan also discovers non-git directories
git-stacks repo scan ~/dev/myproject
```

In templates, dir repos behave like any other repo entry. In workspaces, they use `mode: "dir"` with `main_path` only — no worktree is created and no branch is set. All git-aware commands (`push`, `pull`, `sync`, `merge`, status tracking) silently skip dir repos. `git-stacks open` still injects dir repo paths into hook and env context, so hooks can reference them. `git-stacks doctor` validates that dir repo directories exist and are accessible instead of running git health checks.

```bash
# Status shows dir repos with a [dir] label and no git metrics
git-stacks status my-workspace
#   shared-config  [dir]  ~/shared/config

# Doctor validates directory existence
git-stacks doctor
#   ✓ shared-config: directory exists
```

## Templates

```bash
git-stacks template new [name]          # Create a new template interactively
git-stacks template list                # List all templates
git-stacks template show <name>         # Show template details
git-stacks template edit <name>         # Edit a template interactively, or --yaml to open raw YAML in $EDITOR
git-stacks template clone <name> <new>  # Clone a template under a new name
git-stacks template rename <old> <new>  # Rename a template
git-stacks template remove <name>       # Remove a template
```

Templates support composition via `includes:` — declare building-block templates that merge their repos:

```yaml
# ~/.config/git-stacks/templates/full-stack.yml
name: full-stack
includes: [api, frontend]    # Merges repos from both templates
repos: []                     # Can add additional repos on top
```

Ad-hoc composition on the command line: `git-stacks new my-feature --template api --template frontend`. When the same repo appears in multiple templates, worktree mode wins over trunk. Hooks concatenate in include order with the top-level template's hooks running last.

## Workspaces

```bash
git-stacks new [name]              # Create a workspace interactively
git-stacks clone <source>          # Clone a workspace with a new name and branch
git-stacks open <name>             # Open a workspace (VSCode, IntelliJ, cmux, tmux)
git-stacks list                    # List all workspaces with aggregated ahead/behind status
git-stacks status [name]           # Show per-repo dirty state, ahead/behind, and worktree health
git-stacks rename <old> <new>      # Rename a workspace
git-stacks sync [name]             # Sync branches with upstream base branches (--stash for dirty repos)
git-stacks run <name> [repo]       # Run a command or shell inside a workspace
git-stacks merge <name>            # Merge branches into base branches, then clean
git-stacks close <name>            # Close integration sessions (tmux, niri) without removing worktrees
git-stacks clean [name]            # Remove worktrees + folder (config kept), or --gone to remove all with deleted remote branches
git-stacks remove <name>           # Permanently remove worktrees + config (--force handles corrupt YAML)
git-stacks edit <name>             # Edit workspace interactively, or --yaml to open raw YAML in $EDITOR
git-stacks cd <name> [repo]        # Print path — use via shell function
git-stacks paths [workspace]       # Output repo paths (one per line) for agent CLI injection
git-stacks pull [workspace]        # Pull latest for all repos (--ff-only, skips dirty)
git-stacks push [name]             # Push workspace branches to remote (parallel, skips trunk)
git-stacks label <action> <ws>     # Manage workspace labels (add/remove/list/clear)
git-stacks env [workspace]         # Show merged env vars that would be injected at open time
```

### Shell `cd` integration

Add to your shell config so `git-stacks cd` actually changes directory:

**bash/zsh:**
```bash
wcd() { cd "$(git-stacks cd "$@")"; }
```

**fish:**
```fish
function wcd; cd (git-stacks cd $argv); end
```

## Agent Path Discovery

Query workspace repo paths for injection into agent CLI tools:

```bash
# List all repo paths in a workspace (one per line)
git-stacks paths my-feature

# Prepend each path with a CLI flag for piping into an agent command
git-stacks paths my-feature --prefix "--add-dir"
# Output:
#   --add-dir /home/user/workspaces/tasks/my-feature/api
#   --add-dir /home/user/workspaces/tasks/my-feature/frontend
#   --add-dir /home/user/workspaces/main/shared-lib

# Inject directly into an agent CLI invocation
claude $(git-stacks paths my-feature --prefix "--add-dir")

# Filter by repo mode
git-stacks paths my-feature --filter worktree   # Only worktree repos
git-stacks paths my-feature --filter trunk       # Only trunk repos

# Autodetects workspace when run inside a worktree directory
cd ~/workspaces/tasks/my-feature/api
git-stacks paths    # same as: git-stacks paths my-feature
```

Worktree repos emit their task path; trunk repos emit their main clone path. Repos with missing task directories are skipped with a stderr warning.

## Multi-Repo Pull

Pull latest commits for all repos in a workspace:

```bash
# Pull all repos in a workspace
git-stacks pull my-feature

# Autodetects workspace from current directory
git-stacks pull
```

Worktree repos pull their workspace branch; trunk repos pull their default branch. Uses `--ff-only` for safety — diverged branches produce a clear error identifying the repo and branch. Dirty repos (uncommitted changes) are skipped with a warning. Exit code is non-zero if any repo was skipped or failed.

## Ahead/Behind Tracking

See how far workspace branches have drifted from their base branch:

```bash
# Aggregated ahead/behind across worktree repos
git-stacks list

# Per-repo ahead/behind for one workspace
git-stacks status my-feature

# Refresh remotes before computing ahead/behind
git-stacks status my-feature --fetch
```

`git-stacks list` shows workspace-level `↑N` / `↓N` indicators aggregated across worktree repos. `git-stacks status` shows per-repo ahead/behind counts, and stale fetch data is marked with `?` so outdated values are never mistaken for fresh state. The dashboard surfaces the same data in workspace rows and the workspace detail pane.

## Push

Push workspace branches to remote:

```bash
# Push all worktree repos in parallel
git-stacks push my-feature

# Auto-detect workspace from current directory
git-stacks push

# Safe force-push (fails if remote has new commits)
git-stacks push my-feature --force-with-lease

# Hard force-push
git-stacks push my-feature --force

# Preview what would be pushed
git-stacks push my-feature --dry-run

# Structured output for scripting
git-stacks push my-feature --json
```

Worktree repos push their workspace branch to `origin`; trunk repos are skipped. Per-repo progress is reported inline: `pushed api (3 commits)` / `skipped shared (trunk)` / `FAILED frontend: non-fast-forward`. Exit code is non-zero if any repo fails.

The TUI dashboard includes a push action (`p` key in the action menu) with live per-repo progress display.

### Stash on Sync

Use `git-stacks sync --stash` to auto-stash dirty worktree repos before sync and pop stashes in reverse order after. A double-stash guard prevents stashing when a previous `git-stacks auto-stash` entry already exists. Stash pop failures preserve the stash entry and emit recovery commands (`git -C <path> stash pop`). The TUI dashboard auto-stashes dirty repos during sync without prompting.

## Env Inspection

Inspect all environment variables that a workspace would inject when opened:

```bash
# Show all env vars for a workspace (table format)
git-stacks env my-feature

# Auto-detect workspace from current directory
git-stacks env

# Output as sourceable shell exports
git-stacks env my-feature --format shell
# Output: export GS_WORKSPACE_NAME=my-feature
#         export GS_WORKSPACE_BRANCH=my-feature
#         export API_PORT=10000
#         ...

# Output as dotenv file (redirectable)
git-stacks env my-feature --format dotenv > .env

# Output as JSON object
git-stacks env my-feature --format json

# Include per-repo vars for a specific repo
git-stacks env my-feature --repo backend-api
```

Shows GS_* injected vars, user-defined `env:` from workspace YAML, resolved port vars, and resolved secret refs using the same resolver pipeline as `open`. If a secret cannot be resolved, `env` fails with the same error you would hit during `open`, so the preview stays faithful to runtime behavior. When run inside a repo worktree without `--repo`, the repo is auto-detected and its vars are included.

## Local Verification

Run the full local maintainer gate before release prep:

```bash
bun run verify
```

`bun run verify` refreshes coverage artifacts, checks the E2E inventory and mapped test files, then runs the existing test, dependency, and typecheck commands. To debug an individual step, run the underlying commands directly:

```bash
bun run verify:prereqs
bun run verify:gates
bun run coverage
bun run test
bun run test:deps
bun run typecheck
```

The gate is local-only. Coverage validation checks that `.coverage/coverage-final.json`, `.coverage/coverage-summary.json`, and `.coverage/lcov.info` exist and parse; it does not enforce numeric coverage thresholds.

## Debug Output

Use the canonical `GS_DEBUG` selector when you want full debug output or module-specific filtering without changing normal command output. `GIT_STACKS_DEBUG=1` remains available as a legacy all-module compatibility alias:

```bash
# Canonical all-module debug output
GS_DEBUG=1 git-stacks status my-feature

# Filter to specific modules (comma-separated)
GS_DEBUG=lifecycle,git git-stacks status my-feature

# Machine-readable stdout remains valid JSON
GS_DEBUG=status git-stacks status my-feature --json 2>debug.log

# Legacy all-module debug output
GIT_STACKS_DEBUG=1 git-stacks status my-feature
```

`GS_DEBUG` accepts `1`, `true`, or a comma-separated module list. Short names such as `lifecycle`, `git`, `status`, `env`, and `yaml` map to the corresponding internal modules (`workspace-lifecycle`, `workspace-git`, `workspace-status`, `workspace-env`, and `workspace-yaml`). Debug lines are emitted to `stderr` with the logical category plus key/value fields, for example:

```text
[workspace-status] op=getWorkspaceListInfo module=status msg=completed ms=12
[workspace-git] op=debug module=git msg=checking branch state
```

Timing lines use `op=... module=... msg=... ms=...`; trace-only lines use `op=debug module=... msg=...`.

The debug channel is `stderr` only, so you can redirect or discard it without affecting normal output. `git-stacks manage` explicitly silences debug logging before the alternate-screen dashboard starts, preventing trace output from corrupting the TUI surface.

## Labels

Tag workspaces for organization and filtering:

```bash
# Add labels to a workspace
git-stacks label add my-feature backend sprint:14

# Remove labels
git-stacks label remove my-feature sprint:14

# List labels on a workspace
git-stacks label list my-feature

# Clear all labels
git-stacks label clear my-feature

# Filter workspace list by label (AND logic with multiple flags)
git-stacks list --label backend
git-stacks list --label backend --label sprint:14

# Add labels to a template
git-stacks template label add starter backend docs

# Remove labels from a template
git-stacks template label remove starter docs

# List or clear template labels
git-stacks template label list starter
git-stacks template label clear starter

# Filter templates by label (AND logic with multiple flags)
git-stacks template list --label backend
git-stacks template list --label backend --label starter

# Set labels at creation time
git-stacks new my-feature --label backend --label sprint:14
```

Labels support namespacing with colons (`sprint:14`, `client:acme`, `type:bugfix`). Template labels use the same syntax as workspace labels, can be managed through the `template label` subcommands shown above, and can be used to narrow `git-stacks template list` results with `--label`.

When you create a workspace from a template, the template's labels are snapshot-copied onto the new workspace and unioned with any `git-stacks new --label ...` values you pass at creation time. Workspace clones keep the copied label set as part of that snapshot.

In the TUI dashboard, label tags render after the branch name, the `/` filter matches against labels, and the `g` key toggles a group-by-label view with an `[unlabeled]` section for untagged workspaces.

## Workspace Notifications

AI agents and hook scripts can send notifications to workspaces:

```bash
# Send a notification (auto-detects workspace from GS_WORKSPACE_NAME env var)
git-stacks message send "Build complete"

# Send with an explicit sender name (useful for multi-agent setups)
git-stacks message send "Tests passed" --from ci-bot

# Target a specific workspace
git-stacks message send "Deploy done" --workspace my-feature --from deploy-bot

# List notifications for current workspace
git-stacks message list

# Clear all notifications for current workspace
git-stacks message clear

# Clear notifications from a specific sender only
git-stacks message clear --from ci-bot
```

Messages persist in `~/.config/git-stacks/messages/{workspace}.jsonl`. When the TUI dashboard is running, messages appear in real time via Unix socket — no manual refresh needed.

## Dashboard

```bash
git-stacks manage    # Interactive TUI dashboard (default when run with no args)
```

The dashboard is a tabbed interface with **Workspaces | Templates | Repos** tabs:

- Switch tabs with `1` / `2` / `3` or `[` / `]`
- Each tab shows a split list + detail pane — detail updates as you move the cursor
- All dialogs render as centered overlays with dimmed backgrounds
- **Workspaces tab**: open, rename, sync, merge, run, clean, remove, edit YAML; notification previews in list rows; full message history in detail pane; aggregated `↑N` / `↓N` badges in list rows plus per-repo ahead/behind badges in detail view, with `?` on stale data
  - `s` — sync workspace (per-repo progress with 30s fetch timeout)
  - `m` — open full-screen message overlay for selected workspace
  - `c` — clear messages from a sender in the detail pane
  - `r` — reload data from disk
- **Templates tab**: create workspace from template (`w`), edit, clone, remove; detail pane shows resolved integration overrides
- **Repos tab**: create workspace (`n`), create template (`t`), remove; `Space` to multi-select repos
- Detail panes show resolved integration state with source annotations (`[global]`, `[template]`, `[workspace]`)
- `?` — scrollable keybinding reference; `Esc` closes it
- `Esc` — navigate back (action menu → list, overlay → split)

## Configuration

```bash
git-stacks config    # Interactive config wizard (or --yaml to open raw YAML in $EDITOR)
git-stacks doctor    # Health check — detect drift between config and filesystem
git-stacks doctor --fix   # Auto-repair drift
# Doctor also detects name/filename drift in workspaces and templates
```

Global config lives at `~/.config/git-stacks/config.yml`. Default workspace root is `~/workspaces`; clones live under `{workspace_root}/main/`, worktrees under `{workspace_root}/tasks/`.

## Agent Hook Installer

Install AI agent notification hooks into the current project so the TUI dashboard shows when an agent needs your attention:

```bash
# Interactive — choose which agent frameworks to install
git-stacks install --hooks

# Install Claude Code hooks explicitly
git-stacks install --hooks --claude

# Install GitHub Copilot hooks
git-stacks install --hooks --copilot

# Install both Claude Code and Copilot hooks simultaneously
git-stacks install --hooks --copilot --claude

# Remove installed hooks
git-stacks install --hooks --remove
```

Claude Code hooks are written to `.claude/settings.json`. Copilot hooks are written to `.github/hooks/git-stacks.json`. Both hook sets bridge agent lifecycle events (task completion, user questions, prompt submission) into workspace notifications via `git-stacks message send`.

When neither `--claude` nor `--copilot` is passed, an interactive prompt lets you choose which hook set(s) to install. The plugin system is extensible — new agent frameworks can be added as plugins in `src/lib/agent-hooks/`.

## Integrations

`git-stacks open` runs integrations in a defined order, passing artifacts (session names, window PIDs) between them:

| Tier | Integration | What it does | Artifact |
|------|-------------|-------------|----------|
| 1 | VSCode | Opens `.code-workspace` | Window PID |
| 1 | IntelliJ | Opens `.idea` project | Window PID |
| 1 | tmux | Creates detached tmux session | Session name |
| 2 | cmux | Creates/focuses cmux workspace | Workspace ref |
| 3 | niri | Arranges windows on a named niri workspace | — |
| 3 | AeroSpace | Moves windows to a named AeroSpace workspace (macOS) | — |
| 5 | GitHub | GitHub repo browse, PRs, and issues via `gh` CLI | — |
| 5 | GitLab | GitLab repo browse, MRs, and issues via `glab` CLI | — |
| 5 | Gitea | Gitea repo browse, PRs, and issues via `tea` CLI | — |
| 5 | Jira | Jira issue tracking via configurable command | — |

Integrations are configured per-global, per-template, or per-workspace. Use `git-stacks config` to enable/disable globally, or pass overrides during `git-stacks new` / `git-stacks edit`.

**Integration helper commands:**

```bash
git-stacks integration list                              # List all integrations with status
git-stacks integration <id> config example               # Show YAML config snippet
git-stacks integration <id> config show [workspace]      # Show resolved config (--json)
git-stacks integration tmux attach <workspace>           # Attach to workspace tmux session
git-stacks integration niri focus-workspace <workspace>  # Focus workspace niri workspace
git-stacks integration aerospace focus <workspace>       # Focus workspace AeroSpace workspace
git-stacks integration vscode open <workspace>           # Open workspace in VSCode
```

**tmux integration:**
- Creates a detached tmux session per workspace — does not steal terminal focus
- Configurable pane layout with repo-bound surfaces
- Session killed automatically on workspace clean/remove
- Attach manually via `git-stacks integration tmux attach` or niri commands config

**Niri integration** (for [niri](https://github.com/YaLTeR/niri) Wayland compositor users):
- Creates a dedicated named niri workspace per git-stacks workspace
- Declarative `columns` layout — arrange windows into vertical columns with width control
- Three window types: `app:` (direct spawn), `command:` (shell spawn with cwd), `source:` (reuse prior integration windows like vscode)
- Focus control: `focus: true` on window entries or config level
- Requires `NIRI_SOCKET` — silently skips when niri is not running

```yaml
# Example niri columns config in workspace YAML
settings:
  integrations:
    niri:
      columns:
        - width: "60%"
          windows:
            - source: vscode
              focus: true
        - width: "40%"
          windows:
            - command: ghostty -e git-stacks integration tmux attach $GS_WORKSPACE_NAME
```

**AeroSpace integration** (for [AeroSpace](https://nikitabobko.github.io/AeroSpace/) tiling window manager on macOS):
- Distributes windows across multiple AeroSpace workspaces from a single `git-stacks open` command
- Each entry in the `workspaces` array independently configures layout, normalization, flatten, focus, and commands
- VSCode/IntelliJ windows route to the first workspace entry; subsequent entries receive their own command-launched windows
- Normalization-aware layout: `flatten-workspace-tree` + `layout` when normalization is on (default), `split`-based alternatives when off
- `commands` array launches arbitrary apps with automatic snapshot-delta window detection and movement
- Focus and duplicate validation: at most one entry may have `focus: true`; duplicate workspace names are rejected
- Requires `aerospace` binary on macOS — silently skips on Linux/Windows
- `git-stacks doctor` reports binary availability as a warn-level check on macOS

```yaml
# Example multi-workspace AeroSpace config
settings:
  integrations:
    aerospace:
      workspaces:
        - workspace: "2"
          layout: h_tiles
          flatten_before_open: true
          focus: true
          commands:
            - source: vscode
            - app: kitty
              cwd: "$GS_WORKSPACE_PATH"
        - workspace: "3"
          layout: v_accordion
          commands:
            - command: "open -a Firefox"
            - app: Slack
```

**Forge integrations** (GitHub, GitLab, Gitea):

Forge integrations connect workspaces to pull request workflows and project browsing. Each wraps a forge CLI tool (`gh`, `glab`, `tea`) and resolves the correct repo path and base branch from workspace context. The `open` command works with both worktree and trunk mode repos.

```bash
# Open project homepage in browser
git-stacks integration github open my-feature --web
git-stacks integration gitlab open my-feature --web
git-stacks integration gitea open my-feature --web

# Print project URL to stdout (useful for piping)
git-stacks integration github open my-feature

# Create a PR for workspace branch against its base branch
git-stacks integration github pr create my-feature
git-stacks integration gitlab pr create my-feature      # translates to glab mr create
git-stacks integration gitea pr create my-feature

# View PR URL (prints to stdout, useful for piping)
git-stacks integration github pr open my-feature

# Open PR in browser
git-stacks integration github pr open my-feature --web

# Show PR status
git-stacks integration github pr status my-feature
```

When a workspace has multiple worktree-mode repos, specify which repo:

```bash
git-stacks integration github pr create my-feature backend-api
```

Repos must have a `forge` field set in the registry (`github`, `gitlab`, or `gitea`). This is auto-detected during `repo add` / `repo scan` from remote URL and CLI availability. Check forge CLI availability with `git-stacks doctor`.

**Issue tracking** (GitHub, GitLab, Gitea, Jira):

Link workspaces to issues from any supported tracker. Issue references are stored in workspace YAML — no external state. When run from inside a worktree, the workspace is auto-detected from your working directory — no need to specify it.

```bash
# Link an issue — auto-detects workspace from CWD
git-stacks integration jira issue link PROJ-123
git-stacks integration github issue link 42

# Or specify workspace explicitly (backward compatible)
git-stacks integration github issue link my-feature 42

# View linked issue URL (auto-detects workspace)
git-stacks integration github issue open

# Open in browser
git-stacks integration github issue open --web

# Remove link (auto-detects workspace)
git-stacks integration github issue unlink
```

Jira uses a configurable command template (default: `jira open $ISSUE_ID`). Configure via `git-stacks config` or edit the config YAML directly:

```yaml
# ~/.config/git-stacks/config.yml
integrations:
  jira:
    enabled: true
    open_cmd: "xdg-open https://company.atlassian.net/browse/$ISSUE_ID"
```

Issue data is stored per-workspace:

```yaml
# ~/.config/git-stacks/workspaces/my-feature.yml
settings:
  integrations:
    github:
      issue: "42"
    jira:
      issue: "PROJ-123"
```

## Hooks & Env Injection

Templates and workspaces support hook arrays (shell commands run in order):

- Template: `pre_create`, `post_create`, `pre_open`, `post_open`, `pre_close`, `post_close`, `pre_clean`, `post_clean`, `pre_merge`, `post_merge`, `pre_remove`, `post_remove`
- Workspace: `pre_create`, `post_create`, `pre_open`, `post_open`, `pre_close`, `post_close`, `pre_clean`, `post_clean`, `pre_merge`, `post_merge`, `pre_remove`, `post_remove`
- Per-repo: `pre_open`, `pre_clean`

Lifecycle operations cascade: `remove` triggers `clean` which triggers `close`. Each layer fires its own hooks, so a `remove` fires close → clean → remove hooks in order. `merge` follows the same pattern: close → clean → merge-specific steps → remove. The `GS_TRIGGERED_BY` env var tells hooks which top-level operation initiated the cascade (`close`, `clean`, `remove`, or `merge`).

Hooks receive injected env vars: `GS_WORKSPACE_NAME`, `GS_WORKSPACE_BRANCH`, `GS_WORKSPACE_PATH`, `GS_REPO_NAME`, `GS_TRIGGERED_BY`, and others. Templates and workspaces can also define `env: Record<string, string>` and an optional `env_file` path.

**Using hooks with the notification system:**

```yaml
# In a template or workspace YAML
hooks:
  post_create:
    - git-stacks message send "Workspace ready" --from setup
  post_open:
    - git-stacks message send "Opened" --from workspace
```

## Secrets

Reference external secrets in workspace or template env maps without storing plaintext in YAML:

```yaml
# In a template or workspace YAML
env:
  API_KEY: "${{ keychain:service=myapp,account=api-key }}"
  DB_PASSWORD: "${{ keychain:app=myapp,env=prod,key=db-pass }}"
  HOME_DIR: "${{ env:HOME }}"
  GIT_TOKEN: "${{ cmd:security find-generic-password -s gh-token -w }}"
```

Secrets are resolved at open time — resolved values are never written back to workspace YAML. Three built-in resolvers are available:

| Resolver | Source | Notes |
|----------|--------|-------|
| `keychain` | macOS `security` / Linux `secret-tool` | `key=value` pairs; Linux supports unlimited attributes, macOS max 2 |
| `env` | `process.env` | No subprocess, always available |
| `cmd` | `sh -c <command>` | Requires explicit opt-in in config |

The `keychain` resolver uses `key=value,key=value` syntax — each pair becomes an attribute for the platform's secret store. On Linux, pairs are passed directly to `secret-tool lookup` as positional key-value arguments. On macOS, the first two values map to the `-s` (service) and `-a` (account) flags of `security find-generic-password`; more than 2 attributes is an error.

```bash
# Skip secret resolution (substitutes empty strings)
git-stacks open my-feature --skip-secrets
```

Configure available resolvers in global config:

```yaml
# ~/.config/git-stacks/config.yml
secrets:
  resolvers: [keychain, env]  # cmd requires explicit opt-in
```

External CLI resolvers enforce a 10-second subprocess timeout. Use `git-stacks config` to manage resolver settings interactively.

## Port Allocation

Templates and workspaces can declare named port slots that are automatically allocated when `git-stacks open` runs:

```yaml
# In a template or workspace YAML
ports:
  API_PORT: ~
  DEBUG_PORT: ~
```

`~` means "allocate on open". After allocation, the values are written back to the workspace YAML:

```yaml
# After git-stacks open (allocated values written back)
ports:
  API_PORT: 10000
  DEBUG_PORT: 10001
```

Allocated port numbers are injected as environment variables into hooks, integration contexts, and env_files. Control the allocation range in global config:

```yaml
# ~/.config/git-stacks/config.yml
ports:
  range_start: 10000
  range_end: 65000
```

- `git-stacks open --reallocate` forces reallocation of conflicting ports
- Ports are freed automatically when a workspace is removed
- The creation wizard prompts for port names (after description, before integration overrides)
- Race-safe allocation via lockfile — safe for concurrent workspace opens
- Template composition merges ports with last-wins precedence when multiple templates declare the same port name

## Shell Completions

```bash
git-stacks completion bash >> ~/.bashrc
git-stacks completion zsh  >> ~/.zshrc
git-stacks completion fish > ~/.config/fish/completions/git-stacks.fish
```

Completions cover all commands, subcommands, dynamic entity names (workspaces, templates, repos), fixed enum flag values (`--strategy rebase|merge`, `--sort date|name|status`), and per-command flag completions (`new --from` completes template names). Workspace and template names are resolved dynamically from YAML `name` fields at completion time, so tab-completion always reflects the current config even when filenames diverge from names.

## License

MIT
