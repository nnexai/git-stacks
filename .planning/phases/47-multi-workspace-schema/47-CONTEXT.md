# Phase 47: Multi-Workspace Schema - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the flat AeroSpace integration config (`workspace`, `layout`, `normalization`, `flatten_before_open`, `focus`, `commands`) with a `workspaces` array where each entry is independently validated. Add focus-uniqueness and duplicate-name validation as a separate exported function. Extend `SnapshotOpts` with `beforeSet` for cross-entry snapshot isolation.

</domain>

<decisions>
## Implementation Decisions

### Schema shape
- **D-01:** Breaking change — `workspaces` array replaces flat `workspace:` field. No backward compatibility, no union type. Array-only schema.
- **D-02:** Each entry in the `workspaces` array carries: `workspace` (string, required — AeroSpace workspace name), `layout`, `normalization`, `flatten_before_open`, `focus`, `commands`. All fields except `workspace` are optional with sensible defaults.
- **D-03:** Top-level config retains only `enabled` (boolean). The `workspaces` array is the sole container for per-workspace configuration.

### Validation behavior
- **D-04:** Focus-conflict and duplicate-name validation throw an `Error` with a plain-English message before the processing loop runs. Not Zod `.superRefine` — post-parse runtime checks.
- **D-05:** Validation lives in a separate exported `validateAerospaceConfig()` function. Reusable from both `open()` and potentially `doctor`. Unit-testable in isolation without mocking the full `open()` context.
- **D-06:** Focus conflict message format: `AeroSpace: multiple entries have focus: true (ws1, ws2) — at most one allowed`
- **D-07:** Duplicate name message format: `AeroSpace: duplicate workspace names: ws1`

### Config cascade
- **D-08:** `workspaces` array lives on template and workspace YAML levels only — NOT on the global config level. Global config only carries `enabled`.
- **D-09:** Full replace semantics: workspace-level `workspaces` array completely replaces template-level array. No entry-level merging.

### beforeSet extension
- **D-10:** `SnapshotOpts` gains an optional `beforeSet: Set<number>` field.
- **D-11:** `snapshotWindowIds()` consumes `beforeSet` internally — filters out beforeSet IDs from the delta result alongside the snapshot's own before-IDs. Callers (Phase 48 loop) pass the accumulated set and get correct results without post-filtering.

### Claude's Discretion
- Exact Zod schema definition for the workspace entry type (field names, optionality, defaults)
- Whether `aerospaceCommandSchema` changes or stays as-is (likely unchanged — command entries are per-workspace-entry)
- Internal organization of the validation function (single function with multiple checks, or composed helpers)
- Test fixture shapes for schema validation tests

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current AeroSpace integration (files being modified)
- `src/lib/integrations/aerospace.ts` — Current flat `aerospaceConfigSchema`, `open()` method, config parsing (lines 40-48 for schema, 106-114 for cascade)
- `src/lib/aerospace.ts` — `SnapshotOpts` type definition (lines 26-32), `snapshotWindowIds()` function

### Integration patterns
- `src/lib/integrations/types.ts` — Integration interface, IntegrationContext, ArtifactBag types
- `src/lib/integrations/niri.ts` — Reference integration with commands array, config schema pattern

### Config system
- `src/lib/config.ts` — Zod schemas for workspace/template YAML, integration config storage pattern

### Requirements
- `.planning/REQUIREMENTS.md` — SCHEMA-01 through SCHEMA-04 define acceptance criteria

### Prior phase context
- `.planning/phases/44-core-integration-plugin/44-CONTEXT.md` — Original minimal schema (workspace + enabled)
- `.planning/phases/45-layout-control-app-launching/45-CONTEXT.md` — Schema extension with layout/normalization/commands fields

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `aerospaceCommandSchema` (aerospace.ts:30-38): Command entry Zod schema — reused as-is inside each workspaces array entry
- `aerospaceConfigSchema` (aerospace.ts:40-48): Current flat schema — refactored into entry schema + top-level schema
- `SnapshotOpts` (aerospace.ts:26-32): Type to extend with `beforeSet` field

### Established Patterns
- Zod schemas as source of truth for YAML config shapes (config.ts pattern)
- Post-parse validation with thrown errors (not Zod `.superRefine`)
- Integration config stored under `ctx.workspace.settings?.integrations?.["aerospace"]` and `ctx.config.integrations["aerospace"]`
- Config cascade: workspace-level checked first, then global fallback (aerospace.ts:107-113)

### Integration Points
- `src/lib/integrations/aerospace.ts`: Schema refactor + add `validateAerospaceConfig()` export
- `src/lib/aerospace.ts`: Add `beforeSet` to `SnapshotOpts`, update `snapshotWindowIds()` to consume it
- `tests/lib/integrations/aerospace.test.ts`: Schema parsing tests, validation tests (focus conflict, duplicate names)
- `tests/lib/aerospace.test.ts`: `snapshotWindowIds()` tests with `beforeSet` filtering

</code_context>

<specifics>
## Specific Ideas

- User noted that `workspaces` on the global config level should not be possible — template and workspace levels only.
- Auto-assignment of AeroSpace workspace names was mentioned as a potential future feature (deferred).

</specifics>

<deferred>
## Deferred Ideas

- **AUTO-ASSIGN:** Automatic assignment of AeroSpace workspace names to git-stacks workspaces — noted during config cascade discussion as a future enhancement for template-level config.

</deferred>

---

*Phase: 47-multi-workspace-schema*
*Context gathered: 2026-03-29*
