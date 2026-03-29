# Phase 48: Multi-Workspace Loop & Tests - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Rewrite the AeroSpace integration's `open()` method to iterate a `workspaces` array sequentially. Each entry executes: flatten, bag-move (index 0 only), commands, layout. Bag windows route to `workspaces[0]` only. `listWorkspaces()` hoisted before the loop. Cross-entry snapshot isolation via shared `beforeSet`. Deferred post-loop focus. Full test coverage for the loop, routing, validation, and snapshot isolation.

</domain>

<decisions>
## Implementation Decisions

### Loop error handling
- **D-01:** Skip-and-continue on per-entry failure. If any step (flatten, bag-move, commands, layout) fails for one workspace entry, log a warning and continue to the next entry. Do not abort the entire loop.
- **D-02:** Per-step try/catch within each entry — matches the existing pattern in `open()` where flatten, bag-move, commands, and layout each have their own try/catch.

### Spinner/progress UX
- **D-03:** Spinner message updates per entry: `"AeroSpace: setting up workspace {name} ({i}/{total})"`. Single spinner instance, message updated via `spinner.message()` as each entry begins.
- **D-04:** Final spinner stop message: `"AeroSpace workspaces ready"` (plural) when multiple entries, `"AeroSpace workspace ready"` when single entry.

### Post-loop focus
- **D-05:** Focus is deferred to after the entire loop completes. The entry with `focus: true` is noted during iteration, but `_exec.run(["workspace", targetName])` executes only after all entries have been processed.
- **D-06:** Window-level focus (command-level `focus: true`) also deferred — tracked per command, applied post-loop alongside workspace-level focus.

### Bag window routing
- **D-07:** Tier-1 bag windows (vscode, intellij from `ArtifactBag`) are moved only during iteration of `workspaces[0]`. The bag-move step is skipped entirely for entries at index > 0.

### beforeSet accumulation
- **D-08:** A shared `Set<number>` accumulates window IDs across all entries. Each entry's `snapshotWindowIds()` calls pass this set as `beforeSet`. Windows detected by entry A cannot appear as new windows in entry B.

### listWorkspaces hoist
- **D-09:** `listWorkspaces()` called exactly once before the loop. All entry workspace names validated upfront. If any name is unknown, throw an error before any windows are moved.

### Test coverage
- **D-10:** All 8 success criteria test areas get dedicated test cases: array schema parsing, focus validation, duplicate name rejection, bag routing to index 0 only, listWorkspaces call count (exactly 1), entry ordering, deferred post-loop focus, setLayout called with windowId.
- **D-11:** Claude adds edge case tests where risk is highest: empty workspaces array, single-entry array, beforeSet accumulation across entries, entry failure skip-and-continue behavior.

### Claude's Discretion
- Internal refactoring of `open()` — whether to extract per-entry processing into a helper function
- Test fixture shapes and mock setup organization
- Whether to add a `processEntry()` helper or inline the loop body
- Ordering of assertions within test cases

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current AeroSpace integration (file being rewritten)
- `src/lib/integrations/aerospace.ts` — Current `open()` method (lines 98-288), config schema, window detector
- `src/lib/aerospace.ts` — `SnapshotOpts` type (line 26-32), `snapshotWindowIds()`, `AerospaceCommands` interface

### Phase 47 context (schema decisions feeding into this phase)
- `.planning/phases/47-multi-workspace-schema/47-CONTEXT.md` — Schema shape (D-01 to D-03), validation behavior (D-04 to D-07), beforeSet extension (D-10, D-11)

### Integration patterns
- `src/lib/integrations/types.ts` — Integration interface, IntegrationContext, ArtifactBag types
- `src/lib/integrations/runner.ts` — Centralized integration runner, tier-based ordering

### Existing tests
- `tests/lib/integrations/aerospace.test.ts` — Current test file to extend with loop tests
- `tests/lib/aerospace.test.ts` — Shell wrapper tests including snapshotWindowIds

### Requirements
- `.planning/REQUIREMENTS.md` — PROC-01 through PROC-04 define acceptance criteria for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `snapshotWindowIds()` with `beforeSet` support (added in Phase 47) — used per-entry for cross-entry isolation
- `validateAerospaceConfig()` (added in Phase 47) — called before loop for focus/duplicate validation
- Per-step try/catch pattern in current `open()` — reused for each entry in the loop
- `shellQuote()`, `expandVars()` helpers in current `open()` — reused as-is

### Established Patterns
- Integration `open()` receives `IntegrationContext`, artifact path, and `ArtifactBag`
- Spinner via `ctx.silent ? null : p.spinner()` with start/stop/message
- Warning logs via `p.log.warn()` for non-fatal failures
- `_exec.run()` for aerospace CLI calls (injectable for tests)

### Integration Points
- `open()` in `src/lib/integrations/aerospace.ts` — primary rewrite target
- `tests/lib/integrations/aerospace.test.ts` — test file extension target
- Phase 47's new schema types consumed by the loop (workspace entry type, `validateAerospaceConfig`)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for the loop implementation and test organization.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 48-multi-workspace-loop-tests*
*Context gathered: 2026-03-29*
