# Phase 107 Context

## Locked decisions

- Pinned workspaces are rendered in a separate always-expanded section.
- Remaining workspaces are grouped by either workspace label or repository name; groups are native collapsible sections and the selected grouping persists.
- A single-repository workspace is one direct workspace row, matching Supacode behavior.
- Multi-repository workspaces expose explicit repository targets before new terminals or commands launch.
- Live tab titles follow Ghostty title events and never expose internal surface IDs.
- Long automatic titles are shortened while retaining their meaningful suffix.
- Rename pins a manual title; clearing the rename returns the tab to automatic title updates.
- The phase includes a cohesive spacing, typography, control-language, accessibility, and visual polish pass after Phase 106 stability.

## Scope fence

- Git-stacks remains integration-neutral and does not own external editor sessions.
- Phase 108 retains packaging and actual macOS proof work.
- Lifecycle correctness from Phase 106 must remain green throughout visual changes.
