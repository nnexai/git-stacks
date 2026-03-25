# Phase 16: artifact-type-foundation - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Add typed return values to the Integration interface's open() method, create ArtifactBag as a shared accumulator type, and define IntegrationArtifact as a discriminated union — all without changing existing integration behavior.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/integrations/types.ts` — existing Integration interface, IntegrationContext, resolveEnabled helpers
- `src/lib/integrations/index.ts` — integration registry
- Four integration implementations: tmux.ts, cmux.ts, vscode.ts, intellij.ts

### Established Patterns
- Zod schemas for validation in types.ts
- Integration interface uses `open(ctx, artifactPath): Promise<void>` currently
- `generate?()` returns `string | null` for artifact paths
- `resolveEnabled()` pattern for config resolution

### Integration Points
- `open()` signature change affects all four integrations + callers in workspace-ops.ts, workspace-wizard.ts, workspace-clone.ts, App.tsx
- ArtifactBag type will be threaded through open() calls

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
