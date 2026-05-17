# Current `git-stacks manage` TUI Inventory

Grounding notes for the management TUI sketches. This reflects the current code in `src/tui/dashboard/**` as inspected during the sketch pass.

## Existing Layout

- Main list/detail layout uses two stacked panes:
  - Top pane: current tab list with border title `[1 Workspaces] 2 Templates 3 Repos`.
  - Bottom pane: selected item detail pane.
  - Bottom one-line help/filter/status bar remains visible.
- Tabs are first-class:
  - `1` Workspaces
  - `2` Templates
  - `3` Repos
  - `[` / `]` cycle tabs
- Menus and workflows are overlays/dialogs, not permanent panes.

## Current Workspace List Row Data

Rows currently show:

- Focus marker and selection state: `>[ ]`, `[x]`
- Status glyph from loaded repo status:
  - pending dot
  - loading spinner
  - missing repo
  - dirty repo
  - clean
  - error
- Workspace name
- Workspace branch
- Aggregated ahead/behind indicators for worktree repos
- Labels, capped to two plus overflow
- Worktree/trunk counts and dirty count
- Message preview if messages exist, otherwise relative created age

## Current Workspace Detail Data

The workspace detail pane currently has:

- Branch and created timestamp
- Per-repo list:
  - repo name
  - mode: worktree, trunk, dir
  - current branch
  - exists/dirty status
  - ahead/behind indicators
- Last three messages, with full overlay via `m`
- Integrations:
  - hides globally disabled integrations without overrides
  - shows enabled/disabled/skipped state
  - shows source annotation: global/template/workspace/skipped
  - formats some config values, but generic nested objects/arrays can degrade into JSON-like output
- Linked Issues from workspace integration settings for `github`, `gitlab`, `gitea`, and `jira`.

## Current Message Surface

- Messages are durable JSONL per workspace.
- Dashboard receives live IPC pushes when running.
- Workspace row can show newest message preview.
- Detail pane shows up to three messages.
- `m` opens a message overlay grouped by sender.
- Message groups can be cleared with `c`.
- Messages older than 30 minutes are visually stale in the overlay/detail.

## Current Actions

Workspace action overlay:

- `o` open
- `x` close
- `n` rename
- `e` edit workspace YAML
- `c` clean
- `r` remove
- `m` merge
- `s` sync
- `p` push
- `u` run

Template action overlay:

- `w` create workspace
- `e` edit
- `c` clone
- `r` remove

Repo action overlay:

- `w` create workspace
- `t` create template
- `r` remove

## Current Batch Behavior

- Space selects rows on Workspaces, Templates, and Repos.
- Workspace batch bar currently offers clean all and remove all.
- Template and Repo batch bars currently point users to Enter actions.
- Repo action menu uses selected repos for batch workspace/template creation.
- Workspace batch operations currently apply to selected workspace indices.

## Current Create/Progress Workflows

- Template-based workspace creation opens a wizard:
  - workspace name
  - branch
  - confirm
- Repo-based ad-hoc workspace creation opens a wizard:
  - workspace name
  - branch
  - confirm
- Repo-based template creation opens a wizard:
  - template name
  - confirm
- Create, sync, push, and generic progress views are dialogs with per-repo row state.

## Available Workspace Configuration Data

The workspace model currently includes:

- `description`
- `branch`
- `created`
- `last_opened`
- `template`
- `source` for forge-created workspaces:
  - forge type
  - MR/PR number
  - source/target branch
  - web URL
  - title
- `repos`
- `env`
- `env_file`
- `files`
- `ports`
- `labels`
- `hooks`
- integration settings

Useful future detail-pane sections should expose these as human summaries, not serialized JSON.

## Runtime and Integration Reality

- Current detail pane displays integration configuration and source annotations.
- Tmux integration can create/focus a session and has pane configuration in workspace settings.
- The dashboard does not currently poll live tmux/session/process state in the workspace detail pane.
- Runtime display should distinguish:
  - configured runtime/session layout available now
  - live runtime/session state as a future enhancement
- Running service display should not invent controls. Services are expected to be fire-and-forget tasks started by integrations; the management UI can show known configured tasks and, if implemented later, whether a process/session still appears alive from a pid/session check. It should not imply logs/stop/restart unless that control exists.

## Design Implications

- Do not replace Templates and Repos with permanent panes; keep them as tabs.
- Do not spend permanent screen space on menus; keep menus as overlays.
- Keep the bottom hotkey row. It is important for discoverability and mirrors current behavior.
- Detail rows are not buttons. Avoid right-column pseudo-actions like `open`, `edit`, `logs`, or `stop` unless the row is in an explicit action overlay. The detail pane should summarize status; operations are reached through `Enter` action menus or tab-specific shortcuts.
- Detail section switching is not current behavior. If used in a redesign, it must be an explicit proposed keyboard mode, for example `d` cycles the focused detail section and `Shift+d` cycles backward. It must not look like a second global tab system competing with `1`/`2`/`3`.
- Workspace-row age values need clear semantics:
  - if fresh messages exist, show newest message/attention age
  - otherwise prefer `last_opened`
  - otherwise fall back to created age
- Message counts should be visually distinct from workspace names, e.g. a separate `msg:3` badge/column.
- Workspace row signal groups should follow the established `WorkspaceRow` style: marker/selection, status glyph, workspace name, branch, compact git/status indicators, labels/counts, message preview or age.
- Labels do not have to appear on every row in the redesign if they are visible via label grouping, filters, and detail/config sections.
- The message group should come last before age so it can be truncated first when width is tight.
- On wide rows, use spare message-group width for the latest message sender/preview.
- The main design question is information allocation:
  - List rows: fast scan and workspace choice.
  - Detail pane: why the workspace has that state, full small repo list, config context, messages, links, and next actions.
