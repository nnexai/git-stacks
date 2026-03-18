# git-stacks

Git worktree workspace manager — repo registry, templates, and multi-repo orchestration.

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

**Repo Registry** — a flat list of local git repos with names, paths, types, and default branches. Stored at `~/.config/git-stacks/registry.yml`. Managed via `git-stacks repo add|scan|list|show|remove|rename`.

**Template** — a named set of repos (by registry name) with modes and branch patterns, used to stamp out workspaces. Stored at `~/.config/git-stacks/templates/{name}.yml`. Managed via `git-stacks template new|list|show|edit|clone|rename|remove`.

**Workspace** — a task/ticket-scoped instance created from a template. Each workspace has a branch; repos can be in `worktree` mode (isolated git worktree at `{workspace_root}/tasks/{workspace_name}/{repo_name}`) or `trunk` mode (references the main clone directly). Stored at `~/.config/git-stacks/workspaces/{name}.yml`.

## Quick Start

```bash
# Register repos from an existing directory
git-stacks repo scan ~/dev/myproject

# Create a template from registered repos (interactive)
git-stacks template new

# Create a new workspace (interactive)
git-stacks new my-feature

# Open a workspace (launches VSCode / tmux / cmux as configured)
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
```

## Templates

```bash
git-stacks template new [name]          # Create a new template interactively
git-stacks template list                # List all templates
git-stacks template show <name>         # Show template details
git-stacks template edit <name>         # Edit an existing template
git-stacks template clone <name> <new>  # Clone a template under a new name
git-stacks template rename <old> <new>  # Rename a template
git-stacks template remove <name>       # Remove a template
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
git-stacks manage    # Interactive TUI dashboard (default when run with no args)
git-stacks config    # Interactive config wizard
git-stacks doctor    # Health check — detect drift between config and filesystem
```

Global config lives at `~/.config/git-stacks/config.yml`. Default workspace root is `~/workspaces`; clones live under `{workspace_root}/main/`, worktrees under `{workspace_root}/tasks/`.

## Hooks & Env Injection

Templates and workspaces support hook arrays (shell commands run in order):

- Template: `pre_create`, `post_create`, `pre_open`, `post_open`, `pre_remove`, `post_merge`
- Workspace: `pre_create`, `post_create`, `pre_open`, `post_open`, `post_merge`, `pre_remove`
- Per-repo: `pre_open`

Hooks receive injected env vars: `WS_WORKSPACE`, `WS_BRANCH`, `WS_TASKS_DIR`, `WS_REPO_NAME`, and others. Templates and workspaces can also define `env: Record<string, string>` and an optional `env_file` path.

## Shell Completions

```bash
git-stacks completion bash >> ~/.bashrc
git-stacks completion zsh  >> ~/.zshrc
git-stacks completion fish > ~/.config/fish/completions/git-stacks.fish
```

## License

MIT
