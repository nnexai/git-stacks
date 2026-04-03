---
phase: 61-secrets
plan: 01
subsystem: secrets
tags: [secrets, env, keychain, cmd, timeout]

requires: []
provides:
  - "Secret resolver library with parser, orchestrator, and built-in resolvers"
  - "10-second timeout enforcement for external resolvers"
  - "Unit tests for parsing, resolver selection, env/cmd behavior, and orchestration"
affects: [61-02, 61-03]

tech-stack:
  added: []
  patterns:
    - "Secret references stay as `${{ resolver:path }}` in persisted YAML and resolve only in runtime env maps"
    - "External resolver subprocesses use Bun.spawn with timeout-based termination"

key-files:
  created:
    - src/lib/secrets.ts
    - tests/lib/secrets.test.ts
  modified: []

key-decisions:
  - "Only `keychain`, `env`, and opt-in `cmd` ship in v0.14.0"
  - "`resolveSecrets()` accepts only raw env maps plus resolver instances, never workspace objects"
  - "Resolver lookup errors surface available resolver ids and config guidance"

requirements-completed: [SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-10]
completed: 2026-04-03
---

# Phase 61 Plan 01: Secret Resolver Library Summary

**Added a standalone secret-resolution library with `${{ resolver:path }}` parsing, built-in resolvers, and timeout-safe subprocess handling**

## Accomplishments

- Created `src/lib/secrets.ts`
- Added `SecretResolver`, `REF_PATTERN`, and `parseSecretRef()`
- Added built-in `envResolver`, `keychainResolver`, and `cmdResolver`
- Added internal `execWithTimeout()` helper for external resolver subprocesses
- Added `resolveSecrets(rawEnv, resolvers)` and `buildResolvers(config)`
- Added unit coverage for parser behavior, env/cmd resolvers, default vs opt-in resolver sets, and orchestrated resolution

## Files Created/Modified

- `src/lib/secrets.ts`
- `tests/lib/secrets.test.ts`

## Self-Check: PASSED

- FOUND: `src/lib/secrets.ts`
- FOUND: `tests/lib/secrets.test.ts`
