---
phase: 61-secrets
plan: 03
subsystem: workspace-open
tags: [workspace, open, config, skip-secrets]

requires:
  - phase: 61-secrets
    plan: 01
    provides: "secret resolver library"
  - phase: 61-secrets
    plan: 02
    provides: "global secrets config"
provides:
  - "openWorkspace secret resolution between mergeEnv and writeEnvFiles"
  - "CLI `open --skip-secrets` bypass path with empty-string substitution and warnings"
  - "Config wizard secrets resolver selection and `config show` display"
  - "Workspace-ops integration tests for resolved envs, skip path, and fatal failures"
affects: []

tech-stack:
  added: []
  patterns:
    - "Resolved secret values live only in local runtime env maps passed to env-file writes and hooks"
    - "TUI continues to require successful resolution because it does not pass `skipSecrets`"

key-files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - src/commands/workspace.ts
    - src/commands/config.ts
    - tests/lib/workspace-ops.test.ts

key-decisions:
  - "Secret resolution happens early enough that generated env files and lifecycle hooks both receive resolved runtime values"
  - "`--skip-secrets` is implemented on `open`, matching the active phase plan and roadmap success criteria"
  - "Skip mode substitutes empty strings only for secret references and logs a warning per skipped key"

requirements-completed: [SEC-06, SEC-07, SEC-08]
completed: 2026-04-03
---

# Phase 61 Plan 03: Workspace Integration Summary

**Integrated secrets into workspace opening, added `open --skip-secrets`, and exposed resolver toggles in the config UI**

## Accomplishments

- Wired `resolveSecrets()` into `openWorkspace()` between `mergeEnv()` and `writeEnvFiles()`
- Added `skipSecrets?: boolean` support to `openWorkspace()` options
- Added CLI `--skip-secrets` to `git-stacks open`
- Added config wizard multiselect for enabled secret resolvers
- Added `config show` secrets section
- Added workspace-ops tests covering successful env resolution, skip behavior with warnings, and fatal resolution failures

## Files Created/Modified

- `src/lib/workspace-ops.ts`
- `src/commands/workspace.ts`
- `src/commands/config.ts`
- `tests/lib/workspace-ops.test.ts`

## Self-Check: PASSED

- FOUND: `src/lib/workspace-ops.ts`
- FOUND: `--skip-secrets`
