# Phase 75: DI Seams & Structured Logging - Context

**Gathered:** 2026-04-05 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Add injectable `_exec` seams to `workspace-lifecycle.ts` and `workspace-git.ts`, and evolve the existing stderr debug channel into structured, module-filterable output driven by `GS_DEBUG`. This phase does not introduce a new logging backend, change the public `workspace-ops.ts` facade, or broaden rollback/capability/index scope from later phases.
</domain>

<decisions>
## Implementation Decisions

### Observability extension path
- **D-01:** Phase 75 extends the existing observability path in `src/lib/observability.ts` and its one-time bootstrap in `src/index.ts`; it does not add a parallel logger or bypass LogTape.
- **D-02:** Structured debug output remains stderr-only so normal human-readable stdout and `--json` stdout stay unchanged, and `git-stacks manage` continues to silence observability before the TUI starts.

### Debug environment contract
- **D-03:** `GS_DEBUG` becomes the Phase 75 selector syntax for structured debug output.
- **D-04:** `GS_DEBUG=1` and `GS_DEBUG=true` enable debug output for all modules.
- **D-05:** Existing `GIT_STACKS_DEBUG=1` behavior remains accepted as a compatibility alias during the transition so current docs, tests, and user workflows do not break.

### Module filter and output shape
- **D-06:** Structured debug fields are added centrally through the observability helpers rather than by per-module custom formatting.
- **D-07:** Module filtering accepts short user-facing tokens such as `lifecycle` and `git`, even though current internal category names are `workspace-lifecycle` and `workspace-git`.
- **D-08:** Structured output should remain single-line and human-readable on stderr while carrying the roadmap-required fields `{ op, module, repo?, ms?, msg }`.

### DI seam pattern
- **D-09:** `workspace-lifecycle.ts` adopts the established mutable `_exec` object pattern already used in shell-wrapper modules so tests can replace subprocess behavior without spawning real processes.
- **D-10:** `workspace-git.ts` keeps the same mutable `_exec` seam convention rather than switching to constructor injection or threaded dependency parameters.
- **D-11:** The public `workspace-ops.ts` facade and the existing close -> clean -> remove/merge cascade behavior remain unchanged in this phase.

### the agent's Discretion
- Exact serialization format of the structured stderr line, as long as all required fields are present and the output remains readable in a terminal.
- Whether module aliasing is implemented as a normalization map, category metadata, or another centralized observability helper.
- Whether compatibility coverage for `GIT_STACKS_DEBUG=1` is enforced primarily in observability unit tests, command-level tests, or both.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone requirements
- `.planning/ROADMAP.md` — Phase 75 goal, success criteria, dependency boundary, and milestone sequencing.
- `.planning/REQUIREMENTS.md` — OBSV-01 through OBSV-05 acceptance criteria for DI seams and structured debug output.
- `.planning/STATE.md` — current milestone ordering and locked decision that the `workspace-ops.ts` facade remains stable through v0.17.0.

### Prior observability contract
- `.planning/milestones/v0.16.0-ROADMAP.md` — shipped observability contract from Phase 71, including stderr-only output and TUI silencing.
- `README.md` — current documented public debug behavior using `GIT_STACKS_DEBUG=1` and stderr-only usage patterns.
- `CHANGELOG.md` — released wording for current debug-output behavior that Phase 75 must preserve or explicitly evolve compatibly.

### Existing implementation surfaces
- `src/index.ts` — current observability bootstrap and `manage` silencing behavior.
- `src/lib/observability.ts` — current logging/timing facade to extend for structured fields and module filtering.
- `src/lib/workspace-lifecycle.ts` — lifecycle module gaining a real `_exec` seam while preserving cascade behavior.
- `src/lib/workspace-git.ts` — git domain module with existing placeholder `_exec` seam and current debug instrumentation.
- `src/lib/lifecycle.ts` — canonical mutable `_exec.spawn` seam pattern already used for subprocess test isolation.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/observability.ts`: single bootstrap point for enable/silence state, debug emission, and timed operation logging.
- `src/lib/lifecycle.ts`: established mutable `_exec.spawn` seam pattern that downstream modules can mirror.
- `tests/lib/observability.test.ts`: focused stderr-capture tests for observability behavior without needing full CLI fixtures.
- `tests/commands/debug-output.test.ts`: command-level regression coverage for stderr-only debug output with stdout preserved.

### Established Patterns
- Mutable exported `_exec` objects are the accepted test-isolation seam for subprocess-owning modules.
- Debug instrumentation is centralized: domain modules call `logDebug()` and `timeOperation()` rather than formatting log lines themselves.
- Public CLI behavior treats stderr as the only debug channel, preserving human-readable and JSON stdout contracts.
- The `manage` command explicitly silences observability before entering the alternate-screen TUI, so any Phase 75 changes must stay compatible with that boundary.

### Integration Points
- `src/index.ts`: extend env parsing from only `GIT_STACKS_DEBUG === "1"` to the new `GS_DEBUG` contract and compatibility alias handling.
- `src/lib/observability.ts`: add module-filter parsing, structured field formatting, and category normalization/alias handling.
- `src/lib/workspace-lifecycle.ts`: introduce `_exec` seam and any lifecycle-specific structured debug fields without changing exported workflow behavior.
- `src/lib/workspace-git.ts`: align the existing seam and debug calls with the new structured-field contract.
- `README.md`, `CHANGELOG.md`, and debug-related tests: update or extend documentation and regression coverage around the new env/filter syntax.
</code_context>

<specifics>
## Specific Ideas

- Preserve the existing stderr-only debug model instead of inventing a second observability surface.
- Short filter names like `lifecycle` and `git` should work even if internal categories keep their current `workspace-*` naming.
- Compatibility matters: existing `GIT_STACKS_DEBUG=1` users should not lose debug output when Phase 75 lands.
</specifics>

<deferred>
## Deferred Ideas

- Broader dependency injection across every filesystem/process boundary — outside Phase 75 and already noted as future work in v0.16 artifacts.
- Structured logging beyond the current stderr debug channel — still deferred; this phase only upgrades the existing debug path.
- Rollback orchestration, integration capability contracts, and indexed config caching — covered by Phases 76-78, not this context pass.
</deferred>

---

*Phase: 75-di-seams-structured-logging*
*Context gathered: 2026-04-05*
