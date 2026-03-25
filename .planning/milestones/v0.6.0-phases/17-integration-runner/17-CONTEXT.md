# Phase 17: integration-runner - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Consolidate all inline integration loops into a single runner.ts module with two execution modes: generate-only (for TUI callers) and generate+open (for workspace-ops/CLI). Preserve existing --no-ide/--no-cmux skip flags. Add tier-based ordering.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/integrations/types.ts` — Integration interface, IntegrationContext, ArtifactBag, IntegrationArtifact types (Phase 16)
- `src/lib/integrations/index.ts` — integration registry array
- Four integration implementations: tmux.ts, cmux.ts, vscode.ts, intellij.ts

### Established Patterns
- `workspace-ops.ts:574` — primary generate+open loop with ArtifactBag pipeline
- `workspace-wizard.ts:459` — generate-only loop for TUI
- `workspace-clone.ts:166` — generate-only loop for clone flow
- `wizard-helpers.ts:37` — config-time loop (not execution, excluded from consolidation)
- `config.ts:37,64` — config wizard loops (excluded from consolidation)
- Skip flags: `--no-ide` and `--no-cmux` handled via skip set in workspace-ops.ts

### Integration Points
- New `src/lib/integrations/runner.ts` will be imported by workspace-ops.ts, workspace-wizard.ts, workspace-clone.ts, App.tsx
- Must support both ArtifactBag pipeline (generate+open) and simple generate-only mode

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
