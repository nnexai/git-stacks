# Phase 44: Core Integration Plugin - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

AeroSpace integration plugin (`src/lib/integrations/aerospace.ts`) that detects newly created windows via snapshot-delta and moves them to a configured AeroSpace workspace. Registered as tier-3 plugin (order 31, disabled by default). Layout control, normalization, focus switching, and app launching are Phase 45.

</domain>

<decisions>
## Implementation Decisions

### WindowDetector pattern
- **D-01:** Implement the `WindowDetector` interface on the integration object, matching niri exactly. `runner.ts` calls `begin()` before tier-1 integrations spawn, then `resolve()` after to populate `WindowArtifact.windowIds["aerospace"]`. This lets AeroSpace move vscode/intellij windows to its target workspace without tight coupling.

### Config schema scope
- **D-02:** Minimal schema for Phase 44 — only `workspace` (string, required target AeroSpace workspace name) and `enabled` (boolean). Phase 45 extends the schema with layout, normalization, focus, commands, and flatten_before_open fields. Schema grows with features.

### Target workspace validation
- **D-03:** Warn and skip when configured workspace doesn't exist. Log warning (`AeroSpace workspace "X" not found — skipping window placement`), return null from `open()`. Non-blocking — other integrations still run. Validation uses `listWorkspaces()` from aerospace.ts.

### Integration structure
- **D-04:** `cleanup()` is an explicit no-op method (empty async function). Documents DETECT-05 design intent: AeroSpace workspaces are user-managed, not created by the integration.
- **D-05:** `open()` is purely minimal: gate check → validate workspace → move bag windows → done. No scaffolding for Phase 45 layout extension. Phase 45 extends `open()` when layout features are added.
- **D-06:** Registration in `src/lib/integrations/index.ts` as tier-3 plugin with `order: 31` (one above niri's 30), `enabledByDefault: false`.
- **D-07:** `configurePrompt()` returns `{ enabled: true }` matching niri's minimal approach. Workspace name configuration is done in YAML, not via interactive prompts.

### Claude's Discretion
- Spinner/logging behavior in open() (follow niri's pattern with ctx.silent support)
- WindowDetector timing parameters (match niri's exponential backoff: 200ms initial, 2s max, 10s timeout)
- Internal helper structuring within the integration file
- Whether to add a `commands()` method (niri has focus-workspace — AeroSpace may not need one in Phase 44)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Integration plugin pattern (primary template)
- `src/lib/integrations/niri.ts` — Direct template: WindowDetector implementation, open() with bag window movement, config schema, cleanup(), tier-3 registration
- `src/lib/integrations/types.ts` — Integration interface, WindowDetector interface, DetectorSnapshot, ArtifactBag, IntegrationContext types
- `src/lib/integrations/index.ts` — Plugin registry (add aerospace here)

### Shell wrappers (consumed by this phase)
- `src/lib/aerospace.ts` — Phase 43 output: listWindows, listWorkspaces, moveNodeToWorkspace, snapshotWindowIds, isAerospaceRunning (all consumed by integration)

### Integration runner
- `src/lib/integrations/runner.ts` — Centralized runner that calls begin/resolve on WindowDetector instances, passes ArtifactBag to open()

### Requirements
- `.planning/REQUIREMENTS.md` — DETECT-01 through DETECT-05 define acceptance criteria for this phase

### Prior phase context
- `.planning/phases/43-aerospace-shell-wrappers-doctor/43-CONTEXT.md` — Phase 43 decisions (wrapper scope, _exec pattern, Zod schemas, AerospaceCommands interface)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/aerospace.ts` (Phase 43): All shell wrappers including snapshotWindowIds(), listWindows(), listWorkspaces(), moveNodeToWorkspace(), isAerospaceRunning()
- `src/lib/integrations/niri.ts`: Direct structural template for the integration plugin — WindowDetector, open(), cleanup(), configurePrompt()
- `src/lib/integrations/runner.ts`: Centralized runner that orchestrates begin/resolve/open lifecycle

### Established Patterns
- Tier-3 integrations are consumers, not producers — `open()` always returns null
- WindowDetector `begin()` captures pre-spawn window state, `resolve()` polls for new windows with exponential backoff
- `resolveEnabled()` helper for global/workspace config cascade
- Spinner with `ctx.silent` guard for non-interactive mode
- `bag` iteration to find WindowArtifact entries with window IDs to move

### Integration Points
- `src/lib/integrations/index.ts`: Add `aerospaceIntegration` to the `integrations` array
- `src/lib/integrations/aerospace.ts`: New file implementing Integration interface
- `tests/lib/integrations/aerospace.test.ts`: New test file for integration logic

</code_context>

<specifics>
## Specific Ideas

- Phase 45 is where the interesting configuration decisions (layout, normalization, commands) will be discussed — this phase stays minimal.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 44-core-integration-plugin*
*Context gathered: 2026-03-28*
