# Phase 69: Extract workspace-env.ts and workspace-lifecycle.ts - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the assumptions analysis.

**Date:** 2026-04-05
**Phase:** 69-extract-workspace-env-ts-and-workspace-lifecycle-ts
**Mode:** assumptions
**Areas analyzed:** Public API Stability, Env Module Boundary, Lifecycle Ownership, Test And Mock Contract

## Assumptions Presented

### Public API Stability
| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Phase 69 should not change any import sites; `workspace-ops.ts` remains the import facade and re-exports the moved env and lifecycle symbols alongside the untouched APIs. | Confident | `src/commands/workspace.ts`, `src/tui/dashboard/App.tsx`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` |

### Env Module Boundary
| Assumption | Confidence | Evidence |
|------------|------------|----------|
| `workspace-env.ts` should own the full env assembly flow, including `resolveWorkspaceEnvVars`, with `openWorkspace()` importing from that module instead of keeping secret-resolution logic in `workspace-ops.ts`. | Likely | `src/lib/workspace-ops.ts`, `tests/lib/workspace-ops.test.ts`, `.planning/REQUIREMENTS.md` |

### Lifecycle Ownership
| Assumption | Confidence | Evidence |
|------------|------------|----------|
| `workspace-lifecycle.ts` should contain `closeWorkspace`, `cleanWorkspace`, `removeWorkspace`, `mergeWorkspace`, and keep `_executeClose` and `_executeClean` private in the same file, importing env helpers from `workspace-env.ts` rather than back through the facade. | Likely | `src/lib/workspace-ops.ts`, `tests/lib/workspace-ops.test.ts`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` |

### Test And Mock Contract
| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Test compatibility depends on preserving the current `workspace-ops` named export surface, with `tests/helpers.ts` remaining the compatibility point for both mock factories and captured real implementations. | Confident | `tests/helpers.ts`, `tests/lib/workspace-ops.test.ts`, `tests/commands/workspace-edit.test.ts`, `tests/tui/workspace-wizard.test.ts`, `tests/tui/dashboard/integ-wizard.test.tsx`, `tests/tui/dashboard/integ-tab-switching.test.tsx` |

## Corrections Made

No corrections. All assumptions were confirmed.
