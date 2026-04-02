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

**Repo Registry** — a flat list of local git repos with names, paths, types, and default branches. Stored at `~/.config/git-stacks/registry.yml`. Managed via `git-stacks repo add|scan|list|show|remove|rename`.

**Template** — a named set of repos (by registry name) with modes and branch patterns, used to stamp out workspaces. Stored at `~/.config/git-stacks/templates/{name}.yml`. Looked up by the name field inside the YAML, not by filename. Managed via `git-stacks template new|list|show|edit|clone|rename|remove`.

**Workspace** — a task/ticket-scoped instance created from a template. Each workspace has a branch; repos can be in `worktree` mode (isolated git worktree at `{workspace_root}/tasks/{workspace_name}/{repo_name}`) or `trunk` mode (references the main clone directly). Stored at `~/.config/git-stacks/workspaces/{name}.yml`. Looked up by the name field inside the YAML, not by filename.

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
git-stacks list                    # List all workspaces
git-stacks status [name]           # Show dirty state and worktree health
git-stacks rename <old> <new>      # Rename a workspace
git-stacks sync [name]             # Sync branches with upstream base branches
git-stacks run <name> [repo]       # Run a command or shell inside a workspace
git-stacks merge <name>            # Merge branches into base branches, then clean
git-stacks close <name>            # Close integration sessions (tmux, niri) without removing worktrees
git-stacks clean [name]            # Remove worktrees + folder (config kept), or --gone to remove all with deleted remote branches
git-stacks remove <name>           # Permanently remove worktrees + config (--force handles corrupt YAML)
git-stacks edit <name>             # Edit workspace interactively, or --yaml to open raw YAML in $EDITOR
git-stacks cd <name> [repo]        # Print path — use via shell function
git-stacks paths [workspace]       # Output repo paths (one per line) for agent CLI injection
git-stacks pull [workspace]        # Pull latest for all repos (--ff-only, skips dirty)
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
- **Workspaces tab**: open, rename, sync, merge, run, clean, remove, edit YAML; notification previews in list rows; full message history in detail pane; per-repo "N behind" staleness badges in detail view
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
# Install Claude Code hooks (interactive workspace + framework selection)
git-stacks install --hooks

# Remove installed hooks
git-stacks install --hooks --remove
```

This writes lifecycle hooks into `.claude/settings.json` in the current directory. When Claude Code finishes a task or asks a question, a notification appears in the dashboard. When you respond, the notification clears automatically.

The plugin system is extensible — new agent frameworks can be added as plugins in `src/lib/agent-hooks/`.

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
