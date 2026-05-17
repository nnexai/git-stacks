# Phase 98: Grounded Dashboard Control Center - Context

**Gathered:** 2026-05-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 98 improves `git-stacks manage` as the main operator control surface. It keeps the existing keyboard-first tabbed list/detail model, makes workspace scanning denser and more useful, adds the agreed grouping modes, structures the workspace detail panel, and renders notes/file status inside the dashboard. This phase does not implement new dashboard actions such as repo edit, linked issue opening, manual command execution menus, or rollback progress fixes; those remain Phase 99 scope unless only a layout/consistency placeholder is needed.

</domain>

<decisions>
## Implementation Decisions

### Workspace List Density
- **D-01:** Keep workspace rows mostly as-is. Phase 98 should refine density and information ordering without redesigning the row from scratch.
- **D-02:** Existing concrete status tokens remain important. Do not replace clear row status with abstract dashboard panels or decorative summaries.

### Grouping Model
- **D-03:** Support exactly these grouping modes at a general level: `none`, `label`, `state`, and `template`.
- **D-04:** Grouping should not hide the concrete reason a workspace appears in a group. Rows or group headers should keep enough status context for scanning.

### Detail Section Order
- **D-05:** Use the roadmap order exactly for workspace details: `attention/messages -> repos -> file config/status -> source/issue links -> integrations -> notes -> config`.
- **D-06:** Add detail-panel scrolling support so long detail content remains usable when repos, file status, notes, or config exceed the visible panel height.

### Notes and File Status Detail
- **D-07:** Show notes and file status as full dashboard detail, not only compact summaries with command hints.
- **D-08:** Phase 98 should still preserve compact summary affordances where useful, but the dashboard must let users inspect meaningful note/file-status details without leaving the TUI.
- **D-09:** Notes belong in workspace details only, not as workspace-list badges or a dashboard-wide notes panel.
- **D-10:** File status should consume the Phase 97 lazy, grouped view model rather than running CLI subprocesses or duplicating file sync policy.

### Action Boundary
- **D-11:** Repo edit action is folded only as an action-surface consistency constraint for Phase 98 layout planning. The actual repo edit action implementation remains Phase 99.
- **D-12:** Manual workspace commands in the TUI workspace menu are Phase 99 action-menu scope, not Phase 98 layout/detail scope.

### Snapshot Coverage
- **D-13:** Acceptance coverage should include the roadmap set: narrow/medium/wide rows, grouped headers, detail ordering, file status display, note summary/detail, and contextual footers.
- **D-14:** Add a mandatory long-detail scrolling case proving details remain navigable when section content exceeds the panel height.

### Folded Todos
- **Improve TUI dashboard experience** (`.planning/todos/pending/2026-05-15-improve-tui-dashboard-experience.md`): Folded as the broad Phase 98 UI quality seed. It informs density, grouping, hierarchy, and dashboard-as-control-center direction.
- **Add workspace notes** (`.planning/todos/pending/2026-05-15-add-workspace-notes.md`): Folded only for Phase 98 dashboard display of notes. CLI/storage remains Phase 96 and stale/cleanup advisory behavior remains deferred.
- **Add repo edit action** (`.planning/todos/pending/2026-05-17-add-repo-edit-action.md`): Folded only as a consistency constraint for dashboard action placement. Implementation is Phase 99.

### the agent's Discretion
The agent may choose exact component boundaries, grouping labels, scroll-state mechanics, and snapshot fixture names. Those choices must preserve the existing tabbed list/detail model and the locked section order.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope
- `.planning/ROADMAP.md` — Phase 98 goal, dependency, requirements, success criteria, and Phase 99 boundary.
- `.planning/REQUIREMENTS.md` — `NOTE-03`, `TUI-01`, `TUI-02`, `TUI-03`, and `TUI-07`.
- `.planning/PROJECT.md` — v0.19.0 operator-control-center goals and established TUI constraints.

### Folded Todo Seeds
- `.planning/todos/pending/2026-05-15-improve-tui-dashboard-experience.md` — Broad dashboard-control-center improvement seed.
- `.planning/todos/pending/2026-05-15-add-workspace-notes.md` — Original notes display motivation and examples.
- `.planning/todos/pending/2026-05-17-add-repo-edit-action.md` — Action consistency concern; implementation remains Phase 99.

### Prior Phase Contracts
- `.planning/phases/96-workspace-notes/96-CONTEXT.md` — Notes storage/summary contract, dashboard-placement decision, malformed/empty note states.
- `.planning/phases/97-file-status-view-model-for-tui/97-CONTEXT.md` — Lazy grouped file-status view model, severity fields, and error/detail buckets for dashboard consumption.

### Existing Implementation
- `src/tui/dashboard/App.tsx` — Dashboard root, tab state, grouping/filtering, action dispatch, list/detail layout, and footer behavior.
- `src/tui/dashboard/WorkspaceList.tsx` — Existing grouped workspace list rendering and scroll behavior.
- `src/tui/dashboard/WorkspaceRow.tsx` — Existing workspace row density/status-token implementation.
- `src/tui/dashboard/WorkspaceDetail.tsx` — Main target for detail-section ordering, notes, file status, and scrollable long content.
- `src/tui/dashboard/types.ts` — Dashboard state and view type definitions.
- `src/tui/dashboard/hooks/useWorkspaces.ts` — Current workspace status loading; Phase 98 should not make file status eager for every row.
- `tests/tui/dashboard/snapshots/` — Existing terminal snapshot pattern for row/detail/footer acceptance coverage.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WorkspaceList.tsx` already supports grouped rendering and can be extended beyond label grouping.
- `WorkspaceRow.tsx` already balances name, branch, labels, repo counts, dirty state, and ahead/behind tokens; keep this mostly intact.
- `WorkspaceDetail.tsx` already renders repos, messages, integrations, and linked issues; it is the natural integration point for ordered sections, notes, file status, and scrolling.
- Existing snapshot tests under `tests/tui/dashboard/snapshots/` provide the acceptance pattern for narrow/medium/wide terminal states.

### Established Patterns
- Dashboard code is SolidJS/OpenTUI and uses explicit component files for detail/list/action surfaces.
- The current UI is keyboard-first and tabbed; Phase 98 should evolve that model rather than replacing it.
- TUI components should consume lib helpers instead of spawning CLI subprocesses for data already available in source modules.
- Production code must use relative imports; `@/*` remains test-only.

### Integration Points
- Extend workspace grouping in `App.tsx` / `WorkspaceList.tsx` without losing cursor behavior.
- Add or adapt a scrollable detail container around `WorkspaceDetail.tsx` content.
- Consume Phase 96 notes summary/detail helper and Phase 97 file-status view model from the detail panel.
- Add snapshots for grouped headers, detail section ordering, file status detail, notes detail, contextual footers, and long-detail scrolling.

</code_context>

<specifics>
## Specific Ideas

The preferred result is a denser, more operational version of the existing dashboard, not a new app. Rows should still feel familiar. Details should become the main inspection surface: ordered sections, enough note/file detail to act from the TUI, and scrolling when the panel is long.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- **Surface manual commands in TUI workspace menu** — Phase 99 action-menu scope.
- **Add manual workspace commands** — Phase 95 implementation scope; future TUI surfacing is Phase 99.
- **Add workspace stale view** — Explicitly deferred from v0.19.0 by user request. Notes and status may prepare for future stale advisory work but must not ship stale cleanup recommendations here.
- **Create workspace from forge source** — Already completed in v0.18.0 and not a dashboard layout concern.

</deferred>

---

*Phase: 98-Grounded Dashboard Control Center*
*Context gathered: 2026-05-17*
