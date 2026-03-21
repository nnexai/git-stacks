# Phase 19: niri-shell-wrappers - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Create src/lib/niri.ts isolating all niri msg IPC calls behind a clean, mockable interface. Includes: isNiriRunning(), listNiriWindows(), listNiriWorkspaces(), setNiriWorkspaceName(), moveWindowToWorkspace(), niriSpawn(), snapshotWindowIds(). Unit tests must pass without NIRI_SOCKET present.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/integrations/types.ts` — IntegrationArtifact, WindowArtifact types
- Bun shell `$` and `Bun.spawn` patterns used throughout the codebase
- mock.module + query-string cache-busting pattern from runner.test.ts and artifacts.test.ts

### Established Patterns
- Shell command wrappers use `Bun.$` for output capture (e.g., git.ts)
- `Bun.spawn` used for fire-and-forget processes (e.g., vscode/intellij launch)
- Zod schemas for validating external JSON output
- Dependency injection via module re-export for testability

### Integration Points
- Phase 20 (niri-integration) will import from src/lib/niri.ts
- snapshotWindowIds() uses before/after `niri msg -j windows` diff with exponential-backoff polling
- All functions must be independently mockable for Phase 20 tests

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
