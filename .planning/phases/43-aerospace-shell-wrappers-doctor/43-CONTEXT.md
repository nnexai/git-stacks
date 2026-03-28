# Phase 43: AeroSpace Shell Wrappers & Doctor - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Typed async CLI wrappers for AeroSpace commands in `src/lib/aerospace.ts` with injectable `_exec` for test isolation, platform-gated running detection, and `git-stacks doctor` binary availability check on macOS. This phase builds the shell wrapper foundation — the integration plugin (Phase 44) and layout control (Phase 45) consume these wrappers.

</domain>

<decisions>
## Implementation Decisions

### Output parsing
- **D-01:** Use Zod schemas on parsed TSV fields — define `AerospaceWindowSchema` and `AerospaceWorkspaceSchema` with `z.object()`, parse TSV rows into objects, validate with `z.array(schema).parse()`. Matches niri.ts pattern for consistency.
- **D-02:** Tab-split parsing (not whitespace split) to correctly handle multi-word app names in `--format` output.

### Wrapper scope
- **D-03:** Phase 43 includes all 6 wrappers listed in success criteria: `listWindows`, `listWorkspaces`, `moveNodeToWorkspace`, `focus`, `layout`, `flattenWorkspaceTree`.
- **D-04:** Include `snapshotWindowIds()` helper (before/after delta detection) in Phase 43 alongside wrappers, matching niri.ts which has it in the same file. Phase 44 consumes it directly.
- **D-05:** Include an `aerospace version` or info wrapper for doctor diagnostics and future compatibility checks.

### Running detection
- **D-06:** `isAerospaceRunning()` uses platform gate (`process.platform === "darwin"`) first, then binary probe (`which aerospace`). Returns false immediately on non-macOS. Binary presence implies availability — downstream callers handle "installed but not running" errors gracefully.

### Doctor check gating
- **D-07:** AeroSpace doctor check only appears on macOS. Linux/Windows users never see it. Keeps doctor output clean — only shows relevant checks per platform.

### Error handling
- **D-08:** Match niri.ts error handling exactly — return empty arrays on non-zero exit code or parse errors (try/catch swallows). Callers never get exceptions from the wrapper layer.

### Test strategy
- **D-09:** Mirror niri.test.ts pattern — `_exec` injection for all wrapper tests. Include TSV parsing edge cases (multi-word app names, empty output, malformed rows). Validate Zod schema enforcement with fixture data.

### Exported interface
- **D-10:** Export `AerospaceCommands` interface listing all public functions, matching niri.ts `NiriCommands` pattern. Phase 44 consumer tests use it as constraint to ensure all functions are mocked with correct signatures.

### Claude's Discretion
- Format string selection per wrapper function (hardcoded internally — each wrapper knows its own `--format` fields)
- Exact Zod schema field definitions (inferred from AeroSpace `--format` field names)
- snapshotWindowIds timing parameters (exponential backoff defaults matching niri.ts)
- Internal helper structuring

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Shell wrapper pattern (primary template)
- `src/lib/niri.ts` -- Direct template for aerospace.ts: injectable `_exec`, Zod schemas, exported `NiriCommands` interface, `snapshotWindowIds()` helper, `isNiriRunning()` platform gate
- `tests/lib/niri.test.ts` -- Test pattern: `_exec` injection, fixture data, edge case coverage

### Doctor binary checks
- `src/commands/doctor.ts` -- `checkBinary()` helper using `which`, warn-level entries with install links, Issue type with FixOperation

### Integration system
- `src/lib/integrations/types.ts` -- Integration interface contract
- `src/lib/integrations/index.ts` -- Plugin registry (where Phase 44 will register aerospace)

### Requirements
- `.planning/REQUIREMENTS.md` -- WRAP-01, WRAP-02, WRAP-03 define acceptance criteria for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/niri.ts`: Direct structural template — _exec pattern, Zod schemas, NiriCommands interface, snapshotWindowIds with exponential backoff
- `src/commands/doctor.ts`: `checkBinary()` function using `which`, Issue/FixOperation types for structured doctor output
- `src/lib/integrations/niri.ts`: Integration plugin that consumes niri.ts wrappers — Phase 44 will follow same consumer pattern

### Established Patterns
- Injectable `_exec` objects for shell command isolation (niri.ts, tmux.ts, cmux.ts, lifecycle.ts)
- `$\`cmd\`.quiet().nothrow()` for all shell operations
- Zod schemas as source of truth for external data shapes
- `shellQuote()` for path interpolation in shell commands (Phase 42 security)

### Integration Points
- `src/commands/doctor.ts`: Add macOS-gated `aerospace` binary check to existing binary check section
- `src/lib/aerospace.ts`: New file — no existing code to modify, pure addition
- `tests/lib/aerospace.test.ts`: New test file following niri.test.ts structure

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches following the established niri.ts pattern.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 43-aerospace-shell-wrappers-doctor*
*Context gathered: 2026-03-28*
