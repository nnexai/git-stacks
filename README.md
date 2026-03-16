# git-stacks

Git worktree workspace manager — stacks, workspaces, and multi-repo orchestration.

**Why?** Switching between tasks (tickets, features, experiments) across multiple repos means juggling branches, IDE windows, and terminal sessions. `git-stacks` creates isolated worktrees for each task and opens everything in one shot.

## Installation

**Requires [Bun](https://bun.sh) runtime.**

```bash
# Run directly (no install)
bunx git-stacks --help

# Install globally
bun add -g git-stacks
```

## Concepts

**Stack** — a named template describing a set of repos (paths, types, default modes). Stored at `~/.config/ws/stacks/{name}.yml`.

**Workspace** — a task/ticket-scoped instance created from a stack. Each workspace gets a branch; repos can be in `worktree` mode (isolated git worktree) or `trunk` mode (references the main clone directly). Stored at `~/.config/ws/workspaces/{name}.yml`.

## Quick Start

```bash
# Scan an existing directory and create a stack from it
git-stacks stack init ~/dev/myproject

# Create a new workspace (interactive)
git-stacks new my-feature

# Open a workspace (launches VSCode / tmux / cmux as configured)
git-stacks open my-feature

# Merge branches back and clean up
git-stacks merge my-feature
```

## Stacks

```bash
git-stacks stack new          # Define a new stack interactively
git-stacks stack init [dir]   # Create a stack by scanning a directory for git repos
git-stacks stack edit <name>  # Add/remove/modify repos in a stack
git-stacks stack list         # List all stacks
git-stacks stack show <name>  # Show stack details
```

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
git-stacks clean [name]            # Remove worktrees (config kept), or --gone to remove all with deleted remote branches
git-stacks remove <name>           # Permanently remove worktrees + config
git-stacks cd <name> [repo]        # Print path — use via shell function
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

## Configuration

```bash
git-stacks config    # Interactive config wizard
git-stacks doctor    # Health check — detect drift between config and filesystem
git-stacks manage    # Interactive TUI dashboard
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
git-stacks completion bash >> ~/.bashrc
git-stacks completion zsh  >> ~/.zshrc
git-stacks completion fish > ~/.config/fish/completions/git-stacks.fish
```

## License

MIT
