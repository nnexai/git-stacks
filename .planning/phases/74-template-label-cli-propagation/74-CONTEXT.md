# Phase 74: Template Label CLI & Propagation - Context

**Gathered:** 2026-04-05 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can manage labels on templates via CLI, filter templates by label, and have template/workspace labels snapshot-copied into workspace YAML during workspace creation and clone flows. This phase does not add TUI label management or shell label completions.
</domain>

<decisions>
## Implementation Decisions

### Template label CLI surface
- **D-01:** Template label CRUD lives under `git-stacks template label add|remove|list|clear`, not as new top-level commands.
- **D-02:** Template label add/remove/list/clear behavior should mirror existing workspace label behavior, including regex validation, deduplication, empty-state output, and direct YAML persistence.

### Template list filtering
- **D-03:** `git-stacks template list --label <label>` uses exact label matching with repeatable `--label` flags.
- **D-04:** Multiple `--label` flags use AND semantics, matching the existing workspace list contract.

### Propagation boundary
- **D-05:** Label propagation is owned by workspace creation and clone flows, so labels are written into workspace YAML at creation time rather than resolved dynamically later.
- **D-06:** Template labels are unioned with user-provided workspace labels during workspace creation.
- **D-07:** Workspace clone preserves labels from the source workspace in the cloned workspace YAML.

### Composed template behavior
- **D-08:** Composed and included templates are part of the Phase 74 propagation contract.
- **D-09:** `composeTemplates()` must carry merged template labels so template-based creation paths using `includes` or multi-template composition propagate labels consistently.

### the agent's Discretion
- Whether label matching is implemented by generalizing `matchesLabels()` or by adding a template-specific helper with identical behavior
- Whether template label command logic is extracted into shared helpers or duplicated lightly from workspace label commands
- Exact CLI formatting of template list rows when labels are filtered out, as long as existing list readability is preserved
- Test file split between command-level coverage and lower-level helper/composition coverage

</decisions>

<specifics>
## Specific Ideas

- Preserve behavioral parity with workspace labels so users do not need to learn separate rules for template labels.
- Snapshot semantics remain the source of truth: once a workspace is created, later template label changes do not retroactively affect that workspace.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone requirements
- `.planning/ROADMAP.md` — Phase 74 goal, success criteria, and dependency boundary
- `.planning/REQUIREMENTS.md` — TLBL-01 through TLBL-07 acceptance criteria for template labels and propagation
- `.planning/STATE.md` — milestone-level locked decision that template labels snapshot-copy at workspace creation time

### Prior label decisions
- `.planning/milestones/v0.14.0-phases/60-labels/60-CONTEXT.md` — prior label-system decisions, especially D-11 through D-14 on shared label semantics and snapshot propagation

### Existing command and model surfaces
- `src/commands/label.ts` — current workspace label CRUD behavior to mirror for templates
- `src/commands/template.ts` — existing template command surface where nested template-label commands and `template list --label` belong
- `src/commands/workspace.ts` — existing `workspace list --label` semantics and workspace creation/clone entrypoints
- `src/lib/config.ts` — `TemplateSchema`, `WorkspaceSchema`, `listTemplates()`, `readTemplate()`, `writeTemplate()`, `readWorkspace()`, `writeWorkspace()`
- `src/lib/labels.ts` — shared exact-match AND label filter helper used by workspace listing today
- `src/lib/composition.ts` — composed-template merge behavior that currently omits labels
- `src/tui/workspace-wizard.ts` — workspace creation flow that already unions template labels with user-provided labels
- `src/tui/workspace-clone.ts` — workspace clone flow that currently preserves most source workspace fields, including labels

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/commands/label.ts`: ready-made validation, dedupe, empty-state messaging, and persistence flow for label CRUD
- `src/lib/labels.ts`: existing repeatable exact-match AND helper for label filtering
- `src/tui/workspace-wizard.ts`: already normalizes CLI labels and unions in template labels before writing workspace YAML
- `src/tui/workspace-clone.ts`: clone path already builds the new workspace by preserving most source workspace fields

### Established Patterns
- CLI subcommands live with their domain command group, so template label commands belong in `src/commands/template.ts`
- Label validation is regex-based and case-sensitive at schema and command level
- YAML files are the source of truth; command handlers read, mutate, and write validated objects directly
- Repeatable Commander flags already implement label filters on workspace listing with AND semantics

### Integration Points
- `src/commands/template.ts`: add nested `label` command group and `--label` option on `template list`
- `src/lib/labels.ts`: likely broaden from workspace-only typing to reusable template/workspace label filtering
- `src/lib/composition.ts`: merge template labels during composition so included/composed templates propagate labels
- `src/tui/workspace-wizard.ts`: preserve current union behavior across direct template, included-template, and composed-template creation paths
- `src/tui/workspace-clone.ts`: verify source-workspace labels remain persisted in clones

</code_context>

<deferred>
## Deferred Ideas

- TUI template/workspace label editing in the dashboard — covered by future requirements TLBL-08 and TLBL-09
- Shell completion for existing label values — covered by future requirement TLBL-10

</deferred>

---

*Phase: 74-template-label-cli-propagation*
*Context gathered: 2026-04-05*
