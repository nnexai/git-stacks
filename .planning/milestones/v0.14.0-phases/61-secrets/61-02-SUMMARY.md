---
phase: 61-secrets
plan: 02
subsystem: config
tags: [config, secrets, schema]

requires:
  - phase: 61-secrets
    plan: 01
    provides: "resolver ids and buildResolvers"
provides:
  - "Optional `secrets.resolvers` support in GlobalConfigSchema"
  - "Config-schema tests for backward compatibility and secrets validation"
affects: [61-03]

tech-stack:
  added: []
  patterns:
    - "Secrets config is additive and preserves compatibility for existing config.yml files"

key-files:
  created: []
  modified:
    - src/lib/config.ts
    - tests/lib/config.test.ts

key-decisions:
  - "`secrets` remains optional on global config so existing installs parse unchanged"
  - "`resolvers` stays a free string array for forward compatibility with future resolver ids"

requirements-completed: [SEC-09]
completed: 2026-04-03
---

# Phase 61 Plan 02: Global Secrets Config Summary

**Extended global config to declare enabled secret resolvers without breaking older config files**

## Accomplishments

- Added optional `secrets` object to `GlobalConfigSchema`
- Added optional `secrets.resolvers: string[]`
- Preserved backward compatibility for configs without a `secrets` section
- Added schema coverage for missing secrets, valid resolver arrays, empty secrets config, and invalid non-string entries

## Files Created/Modified

- `src/lib/config.ts`
- `tests/lib/config.test.ts`

## Self-Check: PASSED

- FOUND: `src/lib/config.ts`
- FOUND: `GlobalConfigSchema secrets`
