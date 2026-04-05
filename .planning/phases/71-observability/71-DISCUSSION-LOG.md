# Phase 71: Observability - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the assumptions analysis.

**Date:** 2026-04-05
**Phase:** 71-observability
**Mode:** assumptions
**Areas analyzed:** Logger Bootstrap, Domain Label Boundary, Output Channel Contract, Debug Cost Model

## Assumptions Presented

### Logger Bootstrap
| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Observability is initialized lazily in `src/index.ts`, stays off unless `GIT_STACKS_DEBUG=1`, and remains silent before the `manage` TUI starts. | Confident | `.planning/STATE.md`, `src/index.ts`, `src/tui/dashboard/run.tsx`, `src/tui/dashboard/App.tsx` |

### Domain Label Boundary
| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Phase 71 should instrument the domain code that exists today, with logical labels like `workspace-status`, `workspace-git`, and `workspace-yaml` even where some code still lives in `src/lib/workspace-ops.ts`. | Likely | `.planning/phases/70-extract-remaining-domain-modules-and-workspace-ops-facade/70-CONTEXT.md`, `src/lib/workspace-ops.ts`, `src/lib/workspace-env.ts`, `src/lib/workspace-lifecycle.ts`, `src/commands/workspace.ts`, `src/tui/dashboard/hooks/useWorkspaces.ts` |

### Output Channel Contract
| Assumption | Confidence | Evidence |
|------------|------------|----------|
| All debug lines must emit only to `stderr` and must not change stdout behavior, especially JSON modes. | Confident | `.planning/ROADMAP.md`, `src/commands/workspace.ts`, `tests/commands/status-json.test.ts`, `tests/commands/sync-json.test.ts`, `src/lib/workspace-ops.ts` |

### Debug Cost Model
| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Disabled-mode instrumentation should use a cheap guard/no-op wrapper so normal runs avoid timing and string-building overhead in hot paths. | Likely | `.planning/ROADMAP.md`, `.planning/STATE.md`, `package.json`, `src/lib/workspace-ops.ts`, `src/tui/dashboard/hooks/useWorkspaces.ts` |

## Corrections Made

No corrections — all assumptions confirmed.

## External Research

- LogTape application bootstrap: official docs say to set up LogTape in the application entrypoint and not inside libraries, which matches the planned `src/index.ts` bootstrap. (Source: https://logtape.org/manual/start)
- LogTape stderr sink: official sink docs show a stream sink writing to standard error, including a Bun-specific stderr writer pattern, which confirms stderr-only output is compatible with the chosen library. (Source: https://logtape.org/manual/sinks)
