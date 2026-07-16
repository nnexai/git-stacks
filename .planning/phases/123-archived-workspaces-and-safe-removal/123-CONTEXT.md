# Phase 123: Archived Workspaces and Safe Removal - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver reversible archived workspace state and explicit destructive removal across the shared core/service contract, web client, and TUI. Archived workspaces leave normal projections and navigation, but—superseding the original ARCH-04 and roadmap wording—archiving stops their service-owned terminals instead of preserving live terminal processes. Remove and Force Remove stop terminals before filesystem mutation, with Force Remove available from web and TUI behind exact-name confirmation when dirty worktrees block normal removal.

</domain>

<decisions>
## Implementation Decisions

### Archive Behavior and Navigation
- Archiving the currently selected workspace immediately selects the next active workspace by the existing pin/priority order with recency as the fallback; if none exists, show the active-list empty state.
- Archiving stops all service-owned terminals for the workspace. Terminal shutdown must be confirmed before archive state is written; a close failure leaves the workspace active and changes no persisted archive state.
- Archive is a reversible one-step action with immediate feedback and an Undo/Unarchive affordance, not a destructive confirmation dialog.
- The Archived Workspaces surface is a singleton minimal overlay or view containing only workspace identity, the chosen activity/archive timestamp, and Unarchive. It exposes no pins, repositories, normal actions, or detail drill-in.

### Archive and Remove Safety
- Archive and Remove close and confirm every workspace terminal first. Any terminal-close failure leaves the workspace active and deletes nothing.
- Normal Remove uses a default-cancel confirmation that names the workspace and explicitly lists terminals, managed worktrees, the workspace directory, and the YAML definition as deleted; it does not require typed-name entry.
- If dirty worktrees block removal after terminals stop, deletion stops, every blocking repository is listed, and the UI clearly states that terminals were already stopped.
- Web and TUI offer Force Remove after the dirty-worktree failure. Force Remove requires typing the exact workspace name and clearly identifies the dirty repositories and irreversible deletion before bypassing the dirty guard.

### Shared Operations and Concurrency
- Archive, unarchive, remove, and force-remove are shared service/core operations used by web and TUI; clients contain no filesystem or Git deletion implementation.
- Stale revisions are rejected and the client refreshes. Remove and Force Remove are never replayed automatically; the user must reconfirm against current authoritative state.
- Archive and unarchive converge safely as idempotent state changes. Remove requests use idempotency keys so retries cannot delete unrelated or newly recreated state.
- Operation progress exposes named stages for stopping terminals, checking worktrees, removing worktrees, deleting workspace files, and reconciling state. Selection, terminal tabs, signals, counts, and navigation refresh from the authoritative result only.

### the agent's Discretion
- Exact visual styling, copy details, animation, and placement are flexible within the established web and TUI design systems, provided the locked confirmation, failure, minimal archive-view, and authoritative reconciliation behavior remains intact.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/core/src/config.ts` owns the Zod-backed workspace YAML schema and atomic workspace writes, making it the archive-field authority.
- `packages/core/src/workspace-lifecycle.ts` already owns dirty-worktree protection and worktree/YAML removal; extend this shared lifecycle rather than duplicating it in clients.
- `packages/service/src/policy/operations.ts` already maps typed workspace mutations to staged lifecycle operations and progress reporting.
- `packages/service/src/web/terminal-manager.ts` owns service terminal enumeration and confirmed close behavior, including escalation and cleanup-failure state.
- The TUI already has shared operation progress handling and confirmation/dialog surfaces; the web client already submits revision-bound operations with idempotency keys and refreshes from operation events.

### Established Patterns
- Workspace definitions are authoritative YAML validated by Zod; service snapshots and client projections are derived state.
- Machine mutations flow through typed core/service operations with expected revisions, operation events, progress, and authoritative snapshot reconciliation.
- Web and TUI are thin clients. Filesystem, Git, terminal lifecycle, and archive/remove policy stay out of client rendering code.
- Fallible operations use explicit results and actionable errors; destructive work fails closed rather than partially continuing after an unconfirmed prerequisite.

### Integration Points
- Extend the workspace schema/read-write path, snapshot/projection filters, and shared client state semantics for archived workspaces.
- Add terminal-aware archive/remove orchestration at the service operation layer while retaining core filesystem and dirty-worktree authority.
- Route web and TUI archive/unarchive/remove/force-remove controls through the same protocol mutation contracts and operation progress stream.
- Reconcile signals, active selection, terminal surfaces, counts, pins, switchers, and attention traversal from the post-operation snapshot.

</code_context>

<specifics>
## Specific Ideas

- Archive should behave like Remove with respect to terminal shutdown, while remaining reversible for workspace files, definitions, repositories, notes, and pin state.
- Force removal must be possible from both web and TUI and should use exact workspace-name entry as its elevated confirmation.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within the Phase 123 boundary.

</deferred>
