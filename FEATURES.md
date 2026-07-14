# Current Features

This document is a product-level inventory for the `0.20.0` release line. The older version of this file specified push, ahead/behind tracking, secret references, labels, and stash-assisted sync as planned work; all five are now implemented.

For command syntax and configuration examples, see [README.md](./README.md). For release-specific changes, see [CHANGELOG.md](./CHANGELOG.md).

## Workspace Model

`git-stacks` combines registered repositories into reusable templates and creates task-scoped workspaces from them.

- `worktree` repositories receive an isolated branch and Git worktree.
- `trunk` repositories reuse the main checkout and are excluded from workspace-branch mutations.
- `dir` repositories expose an ordinary non-Git directory to the workspace.
- Templates compose recursively through `includes` and can define repos, labels, commands, hooks, files, ports, environment, and integration settings.
- Workspace definitions remain human-editable YAML and snapshot the resolved task configuration.

## Workspace Lifecycle

The CLI supports creation, cloning, editing, opening, closing, cleaning, removal, recreation, renaming, merging, and source-based creation from supported forge URLs.

Lifecycle operations preserve the existing safety model:

- Expected failures return structured outcomes rather than silently continuing.
- Worktree creation and recreation clean up only resources created by the active operation.
- Destructive operations provide dry-run, confirmation, or force boundaries as appropriate.
- Workspace hooks run with a consistent `GS_*` environment and configurable failure behavior.

## Multi-Repository Git Operations

### Push

`git-stacks push [workspace]` pushes each worktree repository's workspace branch to `origin` in parallel. Trunk and directory repositories are skipped. First push configures upstream tracking automatically; `--dry-run`, `--json`, `--force-with-lease`, and explicit `--force` are available.

### Pull and Sync

`git-stacks pull [workspace]` uses fast-forward-only pulls and refuses unsafe dirty or diverged repositories. `git-stacks sync [workspace]` updates workspace branches from their configured base branches.

`sync --stash` can temporarily stash dirty worktrees, synchronize them, and restore stashes in reverse order. Pop conflicts remain visible and preserve recovery information instead of discarding local changes.

### Ahead/Behind Status

Workspace list and status views expose per-repository and aggregate ahead/behind counts. Ordinary reads use local remote-tracking state; `status --fetch` refreshes remotes first, and stale values are marked rather than presented as current.

## Environment, Secrets, Ports, and Files

- Template and workspace environment values are merged with generated workspace and repository context.
- Secret references use `${{ resolver:path }}` and resolve at runtime without writing plaintext back to YAML. Built-in resolvers cover the platform keychain, environment variables, and explicit commands.
- Named ports are allocated under a file lock, persisted with the workspace, validated as shell-safe identifiers, and reallocated explicitly when requested.
- File entries support symlinks, copies, and real-file synchronization for private local context.
- `git-stacks files status|pull|push` makes drift and sync direction explicit; conservative defaults refuse overwrites and destination-only deletion without `--force`.
- `git-stacks env` previews the same merged and resolved environment used by workspace execution.

## Labels and Priority

Templates and workspaces support namespaced labels such as `client:acme` and `sprint:14`. Template labels are copied into new workspaces, CLI list filters use AND semantics, and both dashboards can group by label.

Each workspace can also carry an integer `priority` in its YAML definition. Priority affects ordering within the dashboard's existing groups; it is not a separate pinned list or client-local preference.

## Commands and Notes

Templates and workspaces can define named manual commands. `git-stacks command list` resolves the available command set, and `git-stacks command run` executes an explicitly selected command with the same cwd, repository targeting, environment, ports, secrets, and bounded output model as the dashboards.

Workspace notes are append-only local operator context stored outside managed repositories. They can be added, listed, cleared, and inspected from the TUI without placing private working notes in project Git history.

## Shared Interactive Core

The terminal dashboard and browser client are two presentations over one local service:

- The service owns complete config, filesystem and Git projection, mutations, operation state, workspace monitoring, signals, and browser terminal processes.
- The TUI uses the complete authenticated local-client contract and owns rendering, navigation, and viewport state only.
- The browser uses a narrower projection that omits trusted machine paths, credentials, raw environment values, and unapproved launch details.
- Clients load revisioned snapshots and follow server-sent events for changes instead of rescanning the machine on navigation.
- One-shot CLI commands remain available for scripts and direct terminal workflows.

## Browser Client and Terminals

`git-stacks web` opens a one-use paired URL on loopback. The browser supports workspace and repository navigation, workspace lifecycle actions, label/priority organization, commands, signals, and context menus.

On verified Linux systems, terminal tabs are backed by service-owned PTYs:

- Multiple shell and configured-command tabs can run independently.
- Resize is derived from the actual terminal container and forwarded to the PTY.
- Only visible terminal views stream output; hidden views reconnect with bounded replay when shown again.
- Reloading or temporarily closing a page can reconnect while the local service and PTY remain alive.
- Ordinary shell exit removes the tab; ended command tabs retain their output.
- Process groups are cleaned up when a terminal or the service is explicitly stopped.

Browser terminal support is intentionally disabled on platforms that have not been verified.

## Workspace Signals

The service exposes one provider-neutral signal contract for automation and coding agents.

- Activity is reduced to one current lifecycle lane per provider and terminal surface.
- `working` and `completed` are visible state; `waiting` and `failed` request attention; `idle` removes the lane.
- Notifications are discrete and independently dismissible.
- Dismissal is journaled and shared across clients. A newer lifecycle event with the same identity may reactivate the signal.
- Opening the exact terminal acknowledges its attention, and orphaned activity is removed when its terminal no longer exists.

User-level integrations for Codex, Claude Code, GitHub Copilot, and OpenCode are strictly opt-in through `git-stacks hooks install|update|uninstall|status`. Normal CLI, service, TUI, and browser startup never modify provider configuration.

## Integrations

The integration runner coordinates IDEs, terminal multiplexers, window managers, forges, and issue trackers through typed plugins and ordered artifact passing. Configuration resolves from global, template, and workspace layers, with per-workspace overrides and explicit applicability checks.

Current integrations include VS Code, IntelliJ, tmux, cmux, niri, AeroSpace, GitHub, GitLab, Gitea, and Jira.

## Deliberate Boundaries

- The browser and service bind to loopback; this is not a hosted or remote-control product.
- Browser terminal persistence lasts only while the owning local service process is alive; it does not survive a service stop or machine reboot.
- Coding-agent hooks are never installed implicitly.
- The retired GTK/Zig native client is not a supported product surface. Its final state is preserved by the `native-client-final-2026-07-14` archive tag.
- New interactive behavior belongs in the service or shared domain core unless it is strictly presentation or viewport state.
