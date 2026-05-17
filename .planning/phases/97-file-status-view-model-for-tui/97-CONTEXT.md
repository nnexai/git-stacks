# Phase 97: File Status View Model for TUI - Context

**Gathered:** 2026-05-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 97 exposes a reusable source-level file status view model for later dashboard use. It covers workspace and repo `files.copy`, `files.symlink`, and `files.sync` configuration/status using the v0.18.0 `git-stacks files status` behavior as the source of truth. This phase does not place the UI in the dashboard, redesign the dashboard layout, add file pull/push actions, add stale cleanup recommendations, or shell out to the CLI from TUI code.

</domain>

<decisions>
## Implementation Decisions

### Model Shape
- **D-01:** Expose a grouped view model, not a raw `FileEntryStatus[]` passthrough. The model should have workspace-level and repo-level sections.
- **D-02:** Each section should carry both its entries and a compact summary so Phase 98 can render details without deriving all aggregation itself.

### Status Language
- **D-03:** Preserve the existing CLI/file-status states such as `missing`, `pullable`, `pushable`, `diverged`, and `error` so parity with `git-stacks files status` remains obvious.
- **D-04:** Add a TUI-facing severity/attention field alongside those states so later rendering can emphasize warnings, actionable sync drift, and hard errors without translating policy in components.

### Loading Cost
- **D-05:** File status should load lazily for the selected workspace detail. Do not add file status scanning to the startup path for every workspace row.
- **D-06:** Phase 97 should expose a helper that Phase 98 can schedule from the detail view; it should not require dashboard-wide eager loading.

### Error Surface
- **D-07:** The helper should expose a compact warning/error summary for dashboard display.
- **D-08:** The helper should also expose per-entry detail buckets for expanded detail rendering and focused tests.

### Todo Routing
- **D-09:** No pending todos were folded into Phase 97. The matched todos were reviewed and left for their owning phases or backlog items.

### the agent's Discretion
The agent may choose exact type names, module boundaries, and summary field names as long as the model remains grouped, lazy-load friendly, parity-preserving, and consumable without CLI subprocesses.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope
- `.planning/ROADMAP.md` — Phase 97 goal, dependency, success criteria, and v0.19.0 milestone boundary.
- `.planning/REQUIREMENTS.md` — `TUI-04` requirement and adjacent TUI control-center constraints.
- `.planning/PROJECT.md` — Current milestone goals and established TUI/CLI boundaries.

### Prior Decisions
- `.planning/phases/96-workspace-notes/96-CONTEXT.md` — Reusable TUI helper precedent and decision to defer actual dashboard placement to later dashboard phases.
- `.planning/phases/95-manual-workspace-commands/95-CONTEXT.md` — Current milestone boundary around TUI surfacing and command-list defaults.

### Existing Implementation
- `src/lib/files.ts` — Existing file operation status and sync comparison behavior; must remain the policy source of truth.
- `src/commands/files.ts` — CLI command behavior and machine-readable status surface.
- `src/tui/dashboard/types.ts` — Dashboard view/state type patterns for TUI consumers.
- `src/tui/dashboard/WorkspaceDetail.tsx` — Future consumer area for detail rendering, though Phase 97 should not implement placement.
- `src/tui/dashboard/hooks/useWorkspaces.ts` — Existing workspace status loading path; Phase 97 should avoid making this eager file-status work for every row.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getFileEntryStatuses()` in `src/lib/files.ts`: Existing source-level status function for copy, symlink, and sync rows. Phase 97 should wrap or extend this rather than duplicating comparison logic.
- `FileEntryStatus` and sync comparison counts in `src/lib/files.ts`: Useful raw material for grouped sections, summaries, and per-entry detail buckets.
- `WorkspaceEntry` / `WorkspaceStatus` in `src/tui/dashboard/types.ts`: Current dashboard data shape to align with when defining a TUI-facing helper.

### Established Patterns
- Source logic belongs in `src/lib/`, with TUI components consuming helpers rather than reimplementing domain policy.
- Exported functions and types should use explicit return types and discriminated unions for expected failure states.
- Production code in `src/` must use relative imports, not the test-only `@/*` alias.

### Integration Points
- A new helper can live near `src/lib/files.ts` or a focused adjacent module if the grouped TUI view model would clutter existing file-operation code.
- Phase 98 can consume the helper from `WorkspaceDetail` or a lazy detail hook without running separate CLI subprocesses.
- Tests should cover copy, symlink, sync, missing target/source, drift, error aggregation, and summary generation from real or representative filesystem fixtures.

</code_context>

<specifics>
## Specific Ideas

The preferred shape is section-oriented: workspace section first, then repo sections, each with entries and summaries. TUI rendering should be able to show a compact warning line while still having access to detailed entry buckets when the detail panel expands or tests need to assert exact behavior.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- **Improve TUI dashboard experience** — Belongs primarily to Phase 98 dashboard layout/control-center work.
- **Add repo edit action** — Belongs to Phase 99 dashboard action polish.
- **Surface manual commands in TUI workspace menu** — Depends on Phase 95 and belongs to later TUI action/menu work, not the file status model.
- **Add manual workspace commands** — Already owned by Phase 95.
- **Add workspace notes** — Already owned by Phase 96 and later Phase 98 display work.
- **Add workspace stale view** — Explicitly deferred from v0.19.0 by user request; do not fold into file status.
- **Create workspace from forge source** — Already completed in v0.18.0 scope.
- **Improve template composition understanding** — Weak match; leave as future template-composition UX/documentation idea.

</deferred>

---

*Phase: 97-File Status View Model for TUI*
*Context gathered: 2026-05-17*
