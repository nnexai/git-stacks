# Phase 98 - Research

## User Constraints

### Locked Decisions
- D-01: Keep workspace rows mostly as-is. Phase 98 should refine density and information ordering without redesigning the row from scratch.
- D-02: Existing concrete status tokens remain important. Do not replace clear row status with abstract dashboard panels or decorative summaries.
- D-03: Support exactly these grouping modes at a general level: `none`, `label`, `state`, and `template`.
- D-04: Grouping should not hide the concrete reason a workspace appears in a group. Rows or group headers should keep enough status context for scanning.
- D-05: Use the roadmap order exactly for workspace details: `attention/messages -> repos -> file config/status -> source/issue links -> integrations -> notes -> config`.
- D-06: Add detail-panel scrolling support so long detail content remains usable when repos, file status, notes, or config exceed the visible panel height.
- D-07: Show notes and file status as full dashboard detail, not only compact summaries with command hints.
- D-08: Phase 98 should still preserve compact summary affordances where useful, but the dashboard must let users inspect meaningful note/file-status details without leaving the TUI.
- D-09: Notes belong in workspace details only, not as workspace-list badges or a dashboard-wide notes panel.
- D-10: File status should consume the Phase 97 lazy, grouped view model rather than running CLI subprocesses or duplicating file sync policy.
- D-11: Repo edit action is folded only as an action-surface consistency constraint for Phase 98 layout planning. The actual repo edit action implementation remains Phase 99.
- D-12: Manual workspace commands in the TUI workspace menu are Phase 99 action-menu scope, not Phase 98 layout/detail scope.
- D-13: Acceptance coverage should include the roadmap set: narrow/medium/wide rows, grouped headers, detail ordering, file status display, note summary/detail, and contextual footers.
- D-14: Add a mandatory long-detail scrolling case proving details remain navigable when section content exceeds the panel height.

### Deferred Ideas
- Repo edit action implementation, manual workspace command menus, linked issue opening, stale cleanup recommendations, and rollback progress fixes remain outside Phase 98.

## Standard Stack

- [VERIFIED: codebase] Dashboard UI is SolidJS over OpenTUI in `src/tui/dashboard/*.tsx`; Phase 98 should continue using these primitives and existing testRender snapshot utilities.
- [VERIFIED: codebase] `WorkspaceRow.tsx` already owns row density, status tokens, branch/ahead/behind, labels, counts, and message preview; row work should be incremental.
- [VERIFIED: codebase] `WorkspaceList.tsx` already renders grouped rows for label grouping and handles list scrolling; it is the right place to generalize grouping modes and grouped footer copy.
- [VERIFIED: codebase] `WorkspaceDetail.tsx` currently mixes branch/created, repos, messages, integrations, and linked issues; it is the main target for ordered sections, notes, file status, and detail scrolling.
- [VERIFIED: codebase] `src/lib/notes.ts` exposes `getWorkspaceNoteSummary()` and list helpers for workspace notes; Phase 98 can render notes from that source without touching storage policy.
- [VERIFIED: roadmap] Phase 97 is the dependency for the lazy grouped file-status view model. Phase 98 plans must consume its helper/hook when available and must not shell out to `git-stacks files status`.

## Architecture Patterns

- Keep domain policy in `src/lib/**` and render state in dashboard components. File sync policy belongs to Phase 97 outputs, not `WorkspaceDetail.tsx`.
- Treat grouping as a view-model transformation near `App.tsx`/`WorkspaceList.tsx`, with cursor navigation over entries and headers excluded from navigable indexes.
- Treat detail rendering as ordered sections with small section renderers or helpers inside/near `WorkspaceDetail.tsx`; do not create a separate dashboard page or panel system.
- Add detail scroll state in `App.tsx` or a focused hook so keyboard handling remains centralized and list cursor behavior is preserved.
- Snapshot tests should assert terminal output and focused strings, not implementation-private component state.

## Don't Hand-Roll

- Do not duplicate Phase 97 file comparison or `files.sync` policy in TUI code.
- Do not create a new UI framework, component kit, or dashboard analytics panel.
- Do not add new workspace action implementations for repo edit, manual commands, or issue opening.
- Do not run CLI subprocesses from production TUI code to compute notes or file status.

## Common Pitfalls

- Grouping by state/template can accidentally break cursor/index mapping if headers are counted as selectable rows.
- A denser row can regress the locked "message attention last" behavior if counts, labels, and message preview reorder carelessly.
- Detail scrolling can conflict with list navigation unless it is active only when the detail pane has overflow or dedicated keys.
- Rendering notes in rows would violate D-09; notes must stay in workspace detail.
- Rendering file status without Phase 97 helpers would violate D-10 and create policy drift from `git-stacks files status`.

## Validation Architecture

Nyquist validation for Phase 98 should sample the dashboard across three independent dimensions:

- Width tiers: narrow, medium, wide row snapshots.
- Data states: grouped list headers, loaded/error file status, note count/latest/detail, long detail overflow.
- Interaction state: grouped cursor navigation, detail-scroll footer hints, and existing keyboard-first list/detail behavior.

The minimum validation set is focused component tests plus terminal snapshots for rows, grouped headers, detail ordering, file status, note summary/detail, contextual footers, and long-detail scrolling.

## Project Constraints

- [VERIFIED: codebase] Production `src/**` imports should stay relative.
- [VERIFIED: codebase] Tests may use the repo's existing Bun/OpenTUI test patterns.
- [VERIFIED: codebase] No package-manager changes are needed for this phase.
