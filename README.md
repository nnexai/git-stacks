# git-ws

Git worktree workspace manager — stacks, workspaces, and multi-repo orchestration.

**Why?** Switching between tasks (tickets, features, experiments) across multiple repos means juggling branches, IDE windows, and terminal sessions. `git-ws` creates isolated worktrees for each task and opens everything in one shot.

## Installation

**Requires [Bun](https://bun.sh) runtime.**

```bash
# Run directly (no install)
bunx git-ws --help

# Install globally
bun add -g git-ws
```

## Concepts

**Stack** — a named template describing a set of repos (paths, types, default modes). Stored at `~/.config/ws/stacks/{name}.yml`.

**Workspace** — a task/ticket-scoped instance created from a stack. Each workspace gets a branch; repos can be in `worktree` mode (isolated git worktree) or `trunk` mode (references the main clone directly). Stored at `~/.config/ws/workspaces/{name}.yml`.

## Quick Start

```bash
# Scan an existing directory and create a stack from it
ws stack init ~/dev/myproject

# Create a new workspace (interactive)
ws new my-feature

# Open a workspace (launches VSCode / tmux / cmux as configured)
ws open my-feature

# Merge branches back and clean up
ws merge my-feature
```

## Stacks

```bash
ws stack new          # Define a new stack interactively
ws stack init [dir]   # Create a stack by scanning a directory for git repos
ws stack edit <name>  # Add/remove/modify repos in a stack
ws stack list         # List all stacks
ws stack show <name>  # Show stack details
```

## Workspaces

```bash
ws new [name]              # Create a workspace interactively
ws clone <source>          # Clone a workspace with a new name and branch
ws open <name>             # Open a workspace (VSCode, IntelliJ, cmux, tmux)
ws list                    # List all workspaces
ws status [name]           # Show dirty state and worktree health
ws rename <old> <new>      # Rename a workspace
ws sync [name]             # Sync branches with upstream base branches
ws run <name> [repo]       # Run a command or shell inside a workspace
ws merge <name>            # Merge branches into base branches, then clean
ws clean [name]            # Remove worktrees (config kept), or --gone to remove all with deleted remote branches
ws remove <name>           # Permanently remove worktrees + config
ws cd <name> [repo]        # Print path — use via shell function
```

### Shell `cd` integration

Add to your shell config so `ws cd` actually changes directory:

**bash/zsh:**
```bash
wcd() { cd "$(ws cd "$@")"; }
```

**fish:**
```fish
function wcd; cd (ws cd $argv); end
```

## Configuration

```bash
ws config    # Interactive config wizard
ws doctor    # Health check — detect drift between config and filesystem
ws manage    # Interactive TUI dashboard
```

Global config lives at `~/.config/ws/config.yml`. Default workspace root is `~/workspaces`; clones live under `{workspace_root}/main/`, worktrees under `{workspace_root}/tasks/`.

## Hooks & Env Injection

Stacks and workspaces support hook arrays (shell commands run in order):

- Stack: `pre_create`, `post_create`, `pre_remove`
- Workspace: `pre_open`, `post_open`, `post_merge`
- Per-repo: `pre_open`

Hooks receive injected env vars: `WS_WORKSPACE`, `WS_BRANCH`, `WS_TASKS_DIR`, `WS_REPO_NAME`, and others. Stacks and workspaces can also define `env: Record<string, string>` and an optional `env_file` path.

## Shell Completions

```bash
ws completion bash >> ~/.bashrc
ws completion zsh  >> ~/.zshrc
ws completion fish > ~/.config/fish/completions/ws.fish
```

## License

MIT
