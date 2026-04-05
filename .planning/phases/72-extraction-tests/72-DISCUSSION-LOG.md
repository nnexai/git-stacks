# Phase 72: Extraction tests - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-05
**Phase:** 72-extraction-tests
**Mode:** assumptions
**Areas analyzed:** Test Strategy (status/git), Test Strategy (env), Test Runner Classification, Circular Import Detection

## Assumptions Presented

### Test Strategy: workspace-status.ts & workspace-git.ts
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Tests mock git.ts via mock.module(), not via _exec injection | Confident | workspace-git.ts _exec is empty (line 29), both modules import git helpers directly from ./git |

### Test Strategy: workspace-env.ts
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Mostly pure function unit tests; buildWorkspaceEnv needs secrets mock, writeEnvFiles needs filesystem | Confident | workspace-env.ts has no git.ts dependency; mergeEnv/buildBaseEnv/buildRepoEnv are pure transforms |

### Test Runner Classification
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| mock.module() files auto-classify as isolated processes | Confident | scripts/test-runner.ts scans for mock.module( and isolates matching files |

### Circular Import Detection
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Add madge as devDependency; fall back to Bun-native if incompatible | Likely | ROADMAP says "madge --circular src/"; madge not in package.json yet |

## Corrections Made

No corrections — all assumptions confirmed.

## External Research

- madge + Bun compatibility: Flagged for research during planning phase — madge uses TypeScript APIs that may not align with Bun's module resolution.
