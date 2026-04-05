# Phase 75: DI Seams & Structured Logging - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-05T20:53:49Z
**Phase:** 75-DI Seams & Structured Logging
**Mode:** assumptions
**Areas analyzed:** Observability Extension Path, Debug Env Compatibility, Structured Debug Shape and Module Names, DI Seam Pattern and Facade Stability

## Assumptions Presented

### Observability Extension Path
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Phase 75 should extend the existing stderr observability facade and bootstrap path instead of creating a second logging channel. | Confident | `.planning/ROADMAP.md`, `.planning/milestones/v0.16.0-ROADMAP.md`, `src/lib/observability.ts`, `src/index.ts`, `README.md`, `CHANGELOG.md` |

### Debug Env Compatibility
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| `GS_DEBUG` should become the new selector syntax, while `GIT_STACKS_DEBUG=1` remains a compatibility alias and `GS_DEBUG=1|true` enables all modules. | Likely | `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `src/index.ts`, `README.md`, `CHANGELOG.md`, `tests/commands/debug-output.test.ts` |

### Structured Debug Shape and Module Names
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Structured fields should be added centrally in observability helpers, and short filter names like `lifecycle` and `git` should map onto current `workspace-*` categories. | Likely | `.planning/ROADMAP.md`, `src/lib/observability.ts`, `src/lib/workspace-git.ts`, `src/lib/workspace-lifecycle.ts`, `src/lib/workspace-status.ts`, `README.md` |

### DI Seam Pattern and Facade Stability
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| `workspace-lifecycle.ts` and `workspace-git.ts` should use the existing mutable `_exec` seam pattern and leave the public `workspace-ops.ts` facade/cascade behavior unchanged. | Likely | `src/lib/lifecycle.ts`, `src/lib/tmux.ts`, `src/lib/niri.ts`, `src/lib/cmux.ts`, `src/lib/workspace-git.ts`, `.planning/STATE.md`, `tests/lib/workspace-ops.test.ts` |

## Corrections Made

No corrections — all assumptions confirmed.
