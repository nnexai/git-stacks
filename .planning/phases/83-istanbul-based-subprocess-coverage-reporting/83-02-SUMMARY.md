---
phase: 83-istanbul-based-subprocess-coverage-reporting
plan: 02
subsystem: testing
tags: [coverage, istanbul, bun, instrumentation, subprocess]
requires:
  - phase: 83-istanbul-based-subprocess-coverage-reporting
    provides: Coverage command surface and scaffold
provides:
  - Source instrumentation pipeline for src/**/*.ts and src/**/*.tsx
  - Subprocess coverage collection through coverage-specific runtime environment
  - Preload/runtime coverage routing used by unit and integration coverage runs
affects: [coverage-runner, coverage-preload, phase-84, phase-84.1]
tech-stack:
  added: []
  patterns:
    - Coverage-only execution path that leaves normal tests untouched
key-files:
  created: []
  modified:
    - scripts/coverage-runner.ts
    - scripts/coverage-preload.ts
    - src/index.ts
key-decisions:
  - "Use Istanbul source instrumentation and per-process coverage shards rather than V8 coverage, because Bun subprocesses do not emit usable V8 coverage artifacts."
  - "Preserve original `src/...` paths in coverage keys so reports map back to source files."
patterns-established:
  - "Coverage env vars are set only by `scripts/coverage-runner.ts`."
requirements-completed: [COVR-01, COVR-02, COVR-04]
duration: recovered
completed: 2026-05-14
---

# Phase 83 Plan 02: Instrumentation Wiring Summary

**Istanbul source instrumentation and subprocess shard collection for Bun tests**

## Accomplishments

- Implemented source instrumentation for the project TypeScript/TSX source tree.
- Wired coverage-specific unit and integration runs so isolated subprocess tests contribute coverage data.
- Kept normal test commands unaffected by the coverage environment.

## Task Commits

1. **Coverage implementation recovery** - `db36286` (fix)
2. **Plan 02 verification gap repair** - `2129afd` (fix)

## Verification

- Later Phase 84 and 84.1 verification confirmed the coverage command surface generated stable reports and captured nonzero source hits after follow-up repairs.

## Next Phase Readiness

Plan 83-03 could merge collected coverage data and emit stable reports for local gates.

---
*Phase: 83-istanbul-based-subprocess-coverage-reporting*
*Completed: 2026-05-14*
