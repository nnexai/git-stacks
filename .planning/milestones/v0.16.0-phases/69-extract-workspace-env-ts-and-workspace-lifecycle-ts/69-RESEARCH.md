# Phase 69: Extract workspace-env.ts and workspace-lifecycle.ts - Research

**Date:** 2026-04-05
**Phase:** 69-extract-workspace-env-ts-and-workspace-lifecycle-ts

## Overview

`src/lib/workspace-ops.ts` still owns two dense domains: env assembly for `openWorkspace()` and the lifecycle cascade for `closeWorkspace()`, `cleanWorkspace()`, `removeWorkspace()`, and `mergeWorkspace()`. Phase 69 should move those domains into isolated modules without changing the facade contract that commands, TUI code, and tests already consume.

## Current Extraction Shape

`workspace-env.ts` should become the single home for `mergeEnv`, `buildBaseEnv`, `buildRepoEnv`, `buildWorkspaceEnv`, `writeEnvFiles`, and the private `resolveWorkspaceEnvVars()` helper. That keeps secret resolution and workspace env shaping in one module and lets `openWorkspace()` consume the extracted env flow instead of carrying local copy logic.

`workspace-lifecycle.ts` should own `closeWorkspace`, `cleanWorkspace`, `removeWorkspace`, and `mergeWorkspace`, with `_executeClose` and `_executeClean` staying private in the same file. Those lifecycle operations should import env helpers directly from `workspace-env.ts`, not through the facade, so the extraction does not create a circular dependency.

## Compatibility Surface

`src/lib/workspace-ops.ts` remains the import facade during this phase. The existing named exports used by `tests/helpers.ts`, `tests/lib/workspace-ops.test.ts`, and the TUI/command integration tests should continue to resolve without import-path rewrites.

The facade is also the compatibility point for captured real implementations in `tests/helpers.ts`, so moving the code behind re-exports is safer than changing any consumer module.

## Verification Notes

The main checks for this phase are structural and behavioral:

1. The new env and lifecycle modules exist and export the same public APIs the facade previously exposed.
2. `workspace-ops.ts` keeps `openWorkspace()` and re-exports the moved symbols.
3. The remove -> clean -> close cascade order still holds.
4. `bun run test` passes after the extraction.

