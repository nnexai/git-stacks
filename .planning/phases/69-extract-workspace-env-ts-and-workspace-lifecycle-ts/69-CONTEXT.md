# Phase 69: Extract workspace-env.ts and workspace-lifecycle.ts - Context

**Gathered:** 2026-04-05 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract the env assembly helpers and lifecycle cascade operations out of `src/lib/workspace-ops.ts` into `src/lib/workspace-env.ts` and `src/lib/workspace-lifecycle.ts`, while preserving the existing `workspace-ops.ts` facade, cascade ordering, and passing test suite. This phase does not change caller import sites, observability behavior, or the remaining status/git/yaml extraction work deferred to later phases.
</domain>

<decisions>
## Implementation Decisions

### Public API Stability
- **D-01:** `src/lib/workspace-ops.ts` remains the public import facade for Phase 69 and re-exports the moved env and lifecycle symbols so existing imports in commands, TUI, and tests do not change.

### Env Module Boundary
- **D-02:** `src/lib/workspace-env.ts` owns the env assembly flow for this phase and exports `mergeEnv`, `buildBaseEnv`, `buildRepoEnv`, `buildWorkspaceEnv`, and `writeEnvFiles`.
- **D-03:** Secret-resolution support stays co-located with the env module via a private `resolveWorkspaceEnvVars()` helper so `buildWorkspaceEnv()` and `openWorkspace()` share one env-resolution path.

### Lifecycle Ownership
- **D-04:** `src/lib/workspace-lifecycle.ts` owns `closeWorkspace`, `cleanWorkspace`, `removeWorkspace`, and `mergeWorkspace`.
- **D-05:** `_executeClose` and `_executeClean` move with the lifecycle extraction and stay private in `src/lib/workspace-lifecycle.ts`.
- **D-06:** Lifecycle code imports env helpers directly from `src/lib/workspace-env.ts`, not back through the `workspace-ops.ts` facade, to avoid circular dependencies.
- **D-07:** Remove, clean, and close behavior must preserve the current cascade order and `GS_TRIGGERED_BY` propagation exactly as exercised by the existing lifecycle tests.

### Test And Mock Contract
- **D-08:** The current named export surface of `workspace-ops.ts` remains compatible during Phase 69 so `tests/helpers.ts`, command tests, and TUI tests keep working without import-path rewrites.
- **D-09:** `tests/helpers.ts` remains the compatibility seam for `makeWorkspaceOpsMock()` and captured real `workspace-ops` exports during this extraction step.

### the agent's Discretion
- Exact internal statement ordering and helper placement within `workspace-env.ts` and `workspace-lifecycle.ts`, as long as the exported API, private-helper boundaries, and current behavior remain intact.
- Whether `workspace-ops.ts` uses direct re-export statements, local imports plus exports, or a small compatibility wrapper shape, as long as the public module surface is unchanged.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Definition
- `.planning/ROADMAP.md` §Phase 69 - Phase goal, success criteria, and facade/cascade constraints for this extraction.
- `.planning/REQUIREMENTS.md` - `EXTR-02`, `EXTR-03`, and `EXTR-09` define the required env extraction, lifecycle extraction, and cascade preservation.
- `.planning/STATE.md` - Locked milestone decisions for extraction order, facade pattern, and private lifecycle helpers.

### Current Implementation
- `src/lib/workspace-ops.ts` - Current source of the env helpers, lifecycle cascade, and the `openWorkspace()` integration point that must keep using the extracted env logic.
- `src/commands/workspace.ts` - Primary runtime caller of the `workspace-ops.ts` facade.
- `src/tui/dashboard/App.tsx` - TUI caller of the lifecycle functions re-exported by `workspace-ops.ts`.

### Test Contracts
- `tests/helpers.ts` - Mock/export compatibility contract for `workspace-ops.ts`.
- `tests/lib/workspace-ops.test.ts` - Behavior contract for env helpers, lifecycle ordering, and trigger propagation.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/workspace-ops.ts`: Existing implementations of the env helpers and lifecycle functions can be moved largely intact rather than rewritten.
- `src/lib/config.ts`: Provides `Workspace`, `WorkspaceRepo`, `GlobalConfig`, `readWorkspace`, `workspaceExists`, `workspacePath`, and repo-path helpers used by both extracted areas.
- `src/lib/lifecycle.ts`: Supplies `runHooks()` and `runHooksCaptured()` for close/clean/remove/merge hook execution.
- `src/lib/integrations/runner.ts`: Provides `runIntegrationCleanup()` used by close/lifecycle operations.
- `src/lib/secrets.ts`: Already encapsulates secret reference parsing and resolution for env assembly.

### Established Patterns
- Public functions use named exports and explicit return types; production modules use relative imports under `src/lib/`.
- Fallible lifecycle operations return discriminated `{ ok: boolean; error?: string }` results instead of throwing for expected failures.
- Test isolation depends on keeping stable named exports and mutable seams in mocks rather than broad import rewrites mid-extraction.

### Integration Points
- `openWorkspace()` in `src/lib/workspace-ops.ts` must start importing env helpers from `workspace-env.ts` after extraction.
- `src/commands/workspace.ts` and `src/tui/dashboard/App.tsx` continue importing from `workspace-ops.ts`, relying on facade re-exports.
- `tests/helpers.ts` and `tests/lib/workspace-ops.test.ts` are the first compatibility checkpoints for export-surface regressions.

</code_context>

<specifics>
## Specific Ideas

No additional product-level preferences beyond preserving the current facade, private helper boundaries, and lifecycle semantics.

</specifics>

<deferred>
## Deferred Ideas

- Remaining extraction of git, status, and yaml/editor concerns stays in Phase 70.
- Observability and debug labels stay in Phase 71.
- Focused extraction-specific unit expansion and circular-import validation stay in Phase 72.

</deferred>

---

*Phase: 69-extract-workspace-env-ts-and-workspace-lifecycle-ts*
*Context gathered: 2026-04-05*
