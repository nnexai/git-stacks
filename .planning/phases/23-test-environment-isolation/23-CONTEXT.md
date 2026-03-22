# Phase 23: Test Environment Isolation - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Ensure every test that touches config reads from and writes to a temporary directory — no test can pollute or read from the real user config at `~/.config/git-stacks`.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GIT_STACKS_CONFIG_DIR` env var — already supported by `src/lib/paths.ts` for config directory override
- `tests/helpers.ts` — existing test helpers (`makeTmpDir`, `cleanup`, `touch`, `write`)
- Many test files already use `process.env.GIT_STACKS_CONFIG_DIR` or `process.env.HOME` redirection

### Established Patterns
- Config I/O tests redirect `process.env.HOME` before dynamically importing config to isolate the config directory
- `GIT_STACKS_CONFIG_DIR` env var overrides the default `~/.config/git-stacks/` path in `paths.ts`
- TUI tests use `process.env.GIT_STACKS_CONFIG_DIR = "/tmp/..."` before imports

### Integration Points
- `tests/helpers.ts` — add shared config isolation helper
- All test files touching config — audit and ensure isolation

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>
