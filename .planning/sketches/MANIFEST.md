# Sketch Manifest

## Design Direction

Improve `git-stacks manage` into a lazygit-like workspace control center. The TUI should make better use of terminal space, favor hand-designed operational summaries over serialized config output, and support juggling several active development environments at once. Core jobs are creating workspaces, switching between them, understanding clean/stale/merge-ready state, seeing agent/message attention, and surfacing session/runtime state such as tmux or long-running services when available.

Current selected direction: use Sketch 008 as the reset baseline. Start from the current stacked `git-stacks manage` TUI, improve density through compact row tokens and better ordered detail sections, keep receive-only messages as row preview plus detail banner plus overlay, add `none -> label -> state` workspace grouping, and treat horizontal split as a later wide-terminal enhancement only. Keep Templates and Repos as separate tabs with tab-specific detail panes following the same pattern.

## Reference Points

- lazygit: dense panes, keyboard-first control, focused detail, always-visible context
- Current `git-stacks manage`: Workspaces/Templates/Repos tabs, workspace detail, messages, grouping, action menus, create wizards, sync/push/create progress
- Current terminal snapshots: `WorkspaceRow`, `RepoDetail`, `HelpOverlay`, status/progress/dialog snapshots
- Current TUI inventory: `.planning/sketches/CURRENT-TUI-INVENTORY.md`

## Sketches

| # | Name | Design Question | Winner | Tags |
|---|------|-----------------|--------|------|
| 001 | control-center-shell | Which overall pane structure best uses terminal space for workspace management? | null | layout, tui, lazygit |
| 002 | workspace-detail-density | How should the selected workspace detail pane summarize state without serialized config dumps? | null | detail, state, messages, services |
| 003 | create-switch-flow | How should creation and fast workspace switching fit into the control center? | null | create, switch, workflow |
| 004 | list-vs-detail-allocation | What belongs in the workspace list row versus the focused detail pane? | null | list, detail, density, tui |
| 005 | responsive-terminal-layout | How should the TUI degrade across narrow, medium, wide, and short terminal sizes? | base | responsive, terminal, layout |
| 006 | message-feedback-surface | How should workspace messages surface agent/tool feedback without wasting detail-pane space? | A | messages, feedback, detail, tui |
| 007 | final-tui-directions | Which implementable TUI direction best combines responsive layout, grouping, details, services, and message attention? | null | synthesis, tui, management |
| 008 | grounded-tui-reset | How should the management TUI restart from the current stacked design while adding density, state grouping, services, and message attention? | current | reset, tui, workspaces, snapshots |
