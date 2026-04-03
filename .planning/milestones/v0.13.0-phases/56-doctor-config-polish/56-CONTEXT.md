# Phase 56: Doctor & Config Polish - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Two targeted fixes: (1) `git-stacks doctor` warns about missing forge CLIs only when the respective integration is actually configured, (2) tmux integration `configExample` shows a practical pane layout with direction, surfaces, and commands.

</domain>

<decisions>
## Implementation Decisions

### Forge CLI check logic (DOC-01)
- **D-01:** Doctor already checks gh, glab, tea, jira unconditionally (lines 318-348 of doctor.ts). Change to only check a forge CLI when the respective integration is configured in `globalConfig.integrations`.
- **D-02:** "Configured" means the integration key exists in `globalConfig.integrations` with `enabled: true`. If the integration isn't in the config at all, skip the CLI check for that forge.
- **D-03:** Keep the check as warn-level (not fail) — forge CLIs are optional, not required for core git-stacks functionality.

### Tmux config example (CFG-01)
- **D-04:** Replace the minimal `configExample` in `tmux.ts` (currently just `enabled: true`) with a practical example showing the `panes` array including direction, surfaces, and commands.
- **D-05:** Example should demonstrate a realistic dev setup (e.g., editor pane, test runner pane, server pane) to help users understand the configuration shape.

### Claude's Discretion
- Exact pane layout in the example (which surfaces, commands, split direction)
- Whether to add integration-conditional logic in a helper function or inline in doctor.ts
- Whether to also check CLI auth status (e.g., `gh auth status`) — the todo suggests it but requirements don't require it

### Folded Todos
- "Doctor should check for missing forge CLIs" — directly maps to DOC-01 (conditional check logic)
- "Tmux integration example should show pane setup" — directly maps to CFG-01

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Doctor command
- `src/commands/doctor.ts` — Full doctor implementation; forge CLI checks at lines 318-348; `checkBinary()` helper at line 105

### Tmux integration
- `src/lib/integrations/tmux.ts` — `configExample` at line 37; `paneSchema` definition; `applyPaneLayout()` function

### Integration system
- `src/lib/integrations/types.ts` — `Integration` interface with `configExample` field
- `src/lib/config.ts` — `readGlobalConfig()` returns `GlobalConfig` with `integrations` record

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `checkBinary()` in doctor.ts — already used for all CLI checks
- `readGlobalConfig()` — returns the global config with `integrations` settings
- `resolveEnabled()` from integrations/types.ts — checks if an integration is enabled

### Established Patterns
- Doctor groups issues by category (workspace, registry, runtime dependencies)
- Each integration has `id`, `configExample`, `isEnabled()` — follow same pattern
- `paneSchema` already defines the shape: `{ direction?, surface, command?, focus? }`

### Integration Points
- `doctor.ts` forge CLI section (lines 318-348) — add conditional logic reading `globalConfig.integrations`
- `tmux.ts` `configExample` string — replace with expanded YAML

</code_context>

<specifics>
## Specific Ideas

No specific requirements — implementation is straightforward from the code.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 56-doctor-config-polish*
*Context gathered: 2026-04-02*
