# Phase 22: Niri Display Fix - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the TUI workspace detail pane to render niri `columns` configuration as human-readable text instead of `[object Object]`.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — bug fix phase with clear root cause and solution path.

Root cause: `WorkspaceDetail.tsx` line 134 uses template literal `${v}` on object values (the `columns` array). Fix: serialize non-primitive values to readable text (e.g., JSON.stringify or custom formatter).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WorkspaceDetail.tsx` line 126-137 — config summary rendering loop
- Niri config schema in `src/lib/integrations/niri.ts` — `niriConfigSchema` with `columns: z.array(niriColumnSchema)`

### Established Patterns
- Config summaries use `(key: value, key2: value2)` format for flat values
- Niri columns are arrays of `{ width?, windows: [{ app?, command?, source?, repo?, cwd?, focus? }] }`

### Integration Points
- `src/tui/dashboard/WorkspaceDetail.tsx` line 134 — the only change needed

</code_context>

<specifics>
## Specific Ideas

No specific requirements — fix the [object Object] rendering.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
