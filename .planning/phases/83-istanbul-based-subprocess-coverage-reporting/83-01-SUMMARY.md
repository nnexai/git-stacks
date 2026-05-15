---
phase: 83-istanbul-based-subprocess-coverage-reporting
plan: 01
subsystem: testing
tags: [coverage, istanbul, bun, subprocess]
requires:
  - phase: 82.1-support-commands-and-error-path-e2e-coverage
    provides: Istanbul subprocess smoke proof
provides:
  - Coverage command surface in package scripts
  - Istanbul instrumentation dependency and ignored .coverage output directory
  - Coverage runner and preload scaffold used by later Phase 83 work
affects: [coverage, local-verification, phase-84]
tech-stack:
  added: [istanbul-lib-instrument]
  patterns:
    - Opt-in local coverage command surface separate from normal tests
key-files:
  created:
    - scripts/coverage-runner.ts
    - scripts/coverage-preload.ts
  modified:
    - package.json
    - bun.lock
    - .gitignore
key-decisions:
  - "Keep normal `bun run test`, `test:unit`, and `test:integ` unchanged; coverage remains opt-in."
patterns-established:
  - "Coverage artifacts are disposable and ignored under `.coverage/`."
requirements-completed: [COVR-01, COVR-02, COVR-04]
duration: recovered
completed: 2026-05-14
---

# Phase 83 Plan 01: Coverage Surface Summary

**Opt-in Istanbul coverage scripts and scaffolding for subprocess-inclusive reports**

## Accomplishments

- Added the public `coverage`, `coverage:unit`, and `coverage:integ` script surface.
- Added Istanbul instrumentation support and ignored `.coverage/` outputs.
- Established the runner/preload files that later Phase 83 work completed.

## Task Commits

1. **Coverage surface restoration** - `db36286` (fix)

## Verification

- Phase 84 prerequisite guard later verified the scripts and `.coverage/` outputs with `bun run coverage`.

## Next Phase Readiness

Plan 83-02 could build the instrumentation engine and subprocess wiring on top of this surface.

---
*Phase: 83-istanbul-based-subprocess-coverage-reporting*
*Completed: 2026-05-14*
