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

## Reopened hardening decisions (2026-07-12)

- Phase 107 is reopened before Phase 108 because the prior visual acceptance did not cover feature-complete native-client behavior.
- The native client provides a first-class create-workspace dialog with exactly three primary inputs: name, branch, and source.
- Source selection is either one existing template or one-or-more registered repositories. Template configuration and repository paths remain engine-owned and are resolved through the authenticated service; the native client never reads or writes workspace YAML.
- Workspace creation is an idempotent, progress-reporting service operation. The empty installation state must still open a useful native window and make creation the primary action.
- Workspaces created, edited, renamed, or removed by the CLI, TUI, or another process must reconcile into an already-running native client without restart. The service owns filesystem monitoring/invalidation; native clients consume the versioned snapshot/event contract.
- External synchronization must preserve native presentation state, live terminal ownership, and unread attention. Vanished workspace/repository pairs remain visibly orphaned while live terminals exist rather than being silently destroyed.
- Codex is a first-class attention provider: installable project hooks publish the lifecycle states Codex actually exposes, and the native UI retains and shows provider, title, detail, and exact routing context.
- Attention remains additive and best-effort: an unavailable service must never break or add noise to ordinary agent use.
- Selecting the exact terminal clears its unread attention; selecting an attention row focuses the exact surviving surface or the documented nearest surviving context.
- The priority findings in `107-UI-REVIEW.md` are release criteria: keyboard-complete launcher behavior, accessible selected/pressed/status semantics, labeled icon controls, confirmation before terminating a live terminal, adaptive narrow layout, and actionable empty/error/no-result states.
- Phase 108 remains limited to Linux delivery/packaging and actual macOS proof; none of that work is pulled into this hardening pass.
