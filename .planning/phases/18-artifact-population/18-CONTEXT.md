# Phase 18: artifact-population - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Update tmux, cmux, vscode, and intellij integrations to return real IntegrationArtifact values from open() instead of null. tmux returns session name, cmux returns workspace ref, vscode/intellij return WindowArtifact with best-effort pid/app_id/title identification (graceful null on failure).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/integrations/types.ts` — TmuxArtifact, CmuxArtifact, WindowArtifact, IntegrationArtifact discriminated union, ArtifactBag
- `src/lib/integrations/runner.ts` — runIntegrations() builds ArtifactBag from open() return values
- Four integration implementations already have open() returning `Promise<IntegrationArtifact | null>`

### Established Patterns
- All integrations currently return null from open() (Phase 16 placeholder)
- tmux.ts spawns/attaches sessions via `tmux new-session` / `tmux has-session`
- cmux.ts creates/opens workspaces via `cmux workspace` CLI
- vscode.ts launches via `code` CLI command
- intellij.ts launches via `idea` CLI command
- ArtifactBag is `Record<string, IntegrationArtifact | null>`

### Integration Points
- Phase 20 (niri-integration) consumes artifact bag for window identification and tmux session names
- Runner.ts stores returned artifacts in bag[integration.id]

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
