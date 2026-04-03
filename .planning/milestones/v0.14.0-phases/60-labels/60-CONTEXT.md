# Phase 60: Labels - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Workspace labeling system: schema field on WorkspaceSchema and TemplateSchema, CLI `label` subcommand for CRUD, `--label` filter on `list`, `--label` flag on `new`, TUI label rendering in WorkspaceRow, filter extension to match labels, and group-by-label toggle view.

</domain>

<decisions>
## Implementation Decisions

### TUI label placement
- **D-01:** Labels render after `↑N ↓N` (ahead/behind from Phase 58), before the counts column (`3wt 1tr`). Position: branch → ↑N ↓N → [labels] → counts → message.
- **D-02:** Dim gray brackets with white text: `[backend] [sprint:14]`. Subtle, doesn't compete with name/branch.
- **D-03:** Max 2 labels shown, then `+N` overflow indicator: `[backend] [sprint:14] +1`. Keeps row manageable.

### Group-by-label UX
- **D-04:** Flat cursor across all items in grouped view. Up/down moves linearly through all visible rows (group headers are skipped/non-focusable). Simple, consistent with current list behavior.
- **D-05:** Actions on a workspace in grouped view affect the workspace itself. All group appearances update immediately (not just the current group slot).
- **D-06:** `g` toggle state is ephemeral (not persisted to config or workspace YAML).

### Label subcommand structure
- **D-07:** New file `src/commands/label.ts` for label CRUD (add/remove/list/clear). Registered in `index.ts` like other commands. Keeps `workspace.ts` (1019 lines) from growing further.
- **D-08:** Wizard labels prompt placed after repos, before hooks/integrations. Format: comma-separated text input, empty = skip.

### Filter syntax
- **D-09:** TUI `/` filter auto-matches both workspace name AND labels. No prefix required. Optional `label:` prefix for label-only filtering.
- **D-10:** TUI filter is single-term. AND logic is CLI-only (`--label a --label b`). TUI filter stays simple.
- **D-11:** Shared `matchesLabels(workspace, terms[])` utility used by both CLI `--label` filter and TUI filter (per STATE.md constraint).

### Schema (from FEATURES.md spec)
- **D-12:** `labels` field: `z.array(z.string().regex(/^[A-Za-z0-9._:-]+$/)).optional()` on both WorkspaceSchema and TemplateSchema.
- **D-13:** Labels are case-sensitive. Colon allows namespacing: `sprint:14`, `client:acme`, `type:bugfix`.
- **D-14:** Template labels unioned onto workspace at creation time (not inherited dynamically). Workspace YAML is source of truth after creation (LBL-08).

### Claude's Discretion
- Exact responsive width calculation for label tags in WorkspaceRow
- Group header styling (bold, color, separator lines)
- Whether `label:` prefix in TUI filter is substring match or exact match
- `label clear` confirmation behavior (confirm before removing all labels, or silent)
- Test structure for label CRUD, filter, and group-by operations

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Feature specification
- `FEATURES.md` §4 "Labels / Grouping" — Complete design spec: schema changes, label rules, CLI commands, TUI rendering, group-by toggle, files to touch

### Requirements
- `.planning/REQUIREMENTS.md` §"Labels" — LBL-01 through LBL-08 acceptance criteria

### Existing patterns
- `src/lib/config.ts` — `WorkspaceSchema` (line 143) and `TemplateSchema` (line 75) where `labels` field will be added
- `src/tui/dashboard/WorkspaceRow.tsx` — Current layout for inserting label tags
- `src/tui/dashboard/App.tsx` — Filter logic (line 121-136) to extend for label matching
- `src/tui/dashboard/WorkspaceList.tsx` — List rendering where group-by-label toggle applies
- `src/tui/dashboard/types.ts` — `Action` type, `UIView` type to extend
- `src/commands/workspace.ts` — `list` action (line 266) for `--label` filter, `new` action for `--label` flag

### Prior phase context
- `.planning/phases/58-ahead-behind-tracking/58-CONTEXT.md` — D-07/D-09: ↑N ↓N placement and hide-zeros rule; labels render after ahead/behind column

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `readWorkspace()` / `writeWorkspace()` in config.ts — read/write for label mutations
- Existing filter infrastructure in `App.tsx` — extend `filteredEntries` memo
- `WorkspaceRow` responsive width system — add label column width calculation
- `ActionMenu.tsx` action array pattern — add label-related actions

### Established Patterns
- Zod schema validation on read — `labels` field validates against regex on YAML load
- `NameSchema` regex pattern — similar validation pattern for label strings
- Tab/filter state management in `App.tsx` — per-tab independent state for group toggle
- Command registration in `index.ts` — pattern for adding `labelCommand`

### Integration Points
- `WorkspaceSchema` + `TemplateSchema` — add `labels` field
- `workspace-wizard.ts` — insert labels prompt after repos step
- `workspace.ts` `list` action — add `--label` option and filter logic
- `workspace.ts` `new` action — accept `--label` flag
- `WorkspaceRow.tsx` — insert label tags between ahead/behind and counts
- `WorkspaceList.tsx` — group-by-label rendering toggle
- `App.tsx` — extend filter to match labels; add `g` keybinding
- Shell completion — `label` subcommand auto-discovered by completion-generator

</code_context>

<specifics>
## Specific Ideas

- Label tags should be visually subordinate to name and branch — dim brackets, not competing for attention
- Group-by view as spec shows: tree-style with `├─` / `└─` connectors, `[unlabeled]` section at bottom
- Workspaces appearing in multiple groups is expected behavior — not a duplication bug

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 60-labels*
*Context gathered: 2026-04-03*
