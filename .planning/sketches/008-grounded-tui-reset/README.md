# Sketch 008: Grounded TUI Reset

## Goal

Restart the `git-stacks manage` sketch from the current TUI instead of from dashboard-style mockups.

The target is a keyboard-first workspace control center that keeps the current model:

- top bordered list pane with `[1 Workspaces]  2 Templates  3 Repos`
- bottom bordered detail pane for the currently selected item
- contextual footer for available operations
- action/help/message/progress/create flows as overlays
- workspaces as the primary tab, with templates and repos still first-class tabs

The design should improve information density without turning the TUI into a grid of unrelated panels.

## Current Ground Truth

Current implementation facts used by this sketch:

- `App.tsx` uses a stacked list/detail layout and sizes the list to roughly 60% of terminal height.
- `WorkspaceRow.tsx` already has the right row vocabulary: focus marker, selection marker, status indicator, workspace name, branch, `↑`, `↓`, labels, repo counts like `2wt 1tr ~1`, message preview, and message age.
- `WorkspaceDetail.tsx` already shows branch, created date, repo status, messages, integration cascade/source, and linked issues.
- `TemplateDetail.tsx` and `RepoDetail.tsx` already follow the same active-tab detail concept.
- `MessageOverlay.tsx` is receive-only, groups by sender, supports clearing a sender group, and closes with Esc.
- Existing tests already include terminal snapshot tests under `tests/tui/dashboard/snapshots`.

## Decisions Carried Forward

- Stack is the default. Horizontal split is only a wide-terminal enhancement.
- Templates and repos stay on separate tabs, not permanent panes.
- Menus stay overlays. Detail rows are summaries, not clickable buttons.
- The footer is contextual to the active tab. The tab title already teaches `1/2/3`.
- Messages are received only. The list/detail can tease attention, but the full message overlay remains the full surface.
- Running services are status-only until a later feature stores enough runtime metadata. Do not show fake controls like logs/stop unless the integration really supports them.
- List rows should not duplicate the detail pane. Git/repo health comes before message attention, and message preview is last.
- Labels can be omitted from rows when label grouping or detail makes them visible elsewhere.

## Variant A: Current Stack Plus

Closest to the current TUI. This is the safest implementation direction.

List pane:

- Keep one row per workspace.
- Keep current compact tokens.
- Reorder row content so message attention is always last.
- Treat branch as optional in the list row. Show it only when there is enough horizontal space; the selected workspace detail is the canonical branch location.
- Hide labels from rows by default when grouped by label or when terminal width is tight.
- Add an optional one-line group mode hint in the list title only: `[1 Workspaces]  g:none`.

Detail pane:

- Replace serialized integration/config fragments with structured rows that show actual configured values.
- Order sections by operational value: attention banner, repos, running services, links, workspace config.
- Stack sections vertically and let lower sections truncate first.
- No action words in rows. Actions remain in `Enter Actions`, `m Messages`, and other footer shortcuts.

Best for:

- preserving current behavior
- easiest incremental implementation
- terminals around 80-120 columns

## Variant B: Grouped Stack

Same layout as Variant A, but makes grouping an explicit management tool.

`g` cycles:

1. `none`
2. `label`
3. `state`

State grouping is derived at render time:

- `attention`: fresh messages, missing repos, status errors, or failed/recent operation signals when available
- `active`: dirty worktree repos, behind upstream, or future alive/unknown runtime tasks
- `ready`: no attention, no missing repos, no dirty repos, no behind repos; ahead counts are allowed and indicate push/merge readiness
- `idle`: clean/quiet workspaces with no current attention or runtime activity

Rows still show the concrete reasons through existing tokens like `↓5`, `~2`, `2wt 1tr`, status glyphs, and last message preview. The grouping header is a scan aid, not hidden state.

Best for:

- managing many concurrent workspaces
- batch selecting across groups
- seeing "what needs my eyes first" without adding a dashboard pane

## Variant C: Wide Split Enhancement

Only for wide terminals, roughly 132 columns and up.

Layout:

- left: workspace list, still wide enough for useful row tokens
- right: selected detail, with the same stacked detail content from Variant A
- footer remains one line

This must not become the default because the list is the primary control surface. If the left list cannot keep name, branch, git tokens, repo counts, and message preview readable, the layout falls back to stack.

Best for:

- full-width terminals
- reviewing 2-3 active environments while watching detail for one selected workspace

## Detail Section Rules

Workspace detail sections:

1. attention banner, only when there are messages or important status errors
2. repos
3. running services
4. links
5. workspace config

Workspace config should show more than counts when space allows:

- `env`: selected variable names or count plus first names, without secret values
- `env_file`: configured env file paths
- `files`: sync/symlink entries using `source -> target` shape where possible
- `integrations`: enabled integration IDs with source annotations such as `tmux/workspace`
- `hooks`: configured lifecycle hook names and counts
- `template`: inherited template name when present

Config rows should prefer concrete names and paths over prose. Secret values should not be printed.

Template detail sections:

1. repos
2. files/env/hooks
3. integrations
4. labels/description

Repo detail sections:

1. path/type/default branch/disk status
2. used by templates
3. used by workspaces

When height is constrained:

- keep the selected item title and the first section visible
- repos outrank services, services outrank details/config
- message banner outranks all lower workspace detail sections
- do not introduce hidden subtabs unless the footer explicitly exposes the key

## Message Treatment

Messages need two levels:

- row-level: final field in the workspace row, sender + short preview + age when width allows
- detail-level: one compact attention banner above repos

If the row needs to choose between branch and message preview, keep git/status tokens and message preview first. Branch can be read from detail for the focused workspace.

The banner should not list every message. It should show:

- count
- newest sender
- short newest text
- age
- `m Messages` hint only when the footer has enough width or the banner is focused/important

Full history remains the existing message overlay. It is receive-only.

## Running Services Treatment

Runtime/service state is a future status source, not a control surface yet.

Allowed display:

- integration/source: `tmux`, `vscode`, custom task runner, agent, etc.
- known identity: session name, pane count, pid, command label, or task name
- status: `alive`, `done`, `missing`, `unknown`, `stale`
- age if known

Avoid:

- fake `logs`, `stop`, `attach`, `open`, or `edit` labels in rows unless those commands are real dashboard actions
- implying the TUI can answer agent questions through messages
- large service panels that crowd repos/config

## Snapshot/Test Notes

New implementation should add or extend terminal snapshot coverage for:

- workspace rows at narrow, medium, and wide widths with message preview last
- workspace rows where branch is hidden but git/status tokens and message preview remain readable
- workspace rows with label-hidden state in grouped mode
- grouped list headers for `none`, `label`, and `state`
- workspace detail with sections stacked as `messages -> repos -> services -> details`
- constrained-height detail truncation
- message attention banner
- contextual footers for workspaces, templates, and repos

These should live beside the existing character-frame snapshot tests under `tests/tui/dashboard/snapshots`.

## Recommended Direction

Implement Variant A first, with the grouping cycle from Variant B.

Treat Variant C as a responsive enhancement after the stacked version is stable and snapshot-covered.
