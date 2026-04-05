# Phase 71: Observability - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-05
**Phase:** 71-observability
**Mode:** assumptions (updated)
**Areas analyzed:** Logger Bootstrap, Disabled-Mode Cost Model, Bun stderr Sink Wiring, Output Channel Contract, Domain Label Scope, TUI Safety

## Assumptions Presented

### Logger Bootstrap
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| LogTape configured lazily in src/index.ts before program.parse(), gated by GIT_STACKS_DEBUG=1 | Confident | src/index.ts linear flow, package.json no logging dep, prior context D-01 |

### Disabled-Mode Cost Model
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Dual-config strategy: configure() with lowestLevel: null when disabled for true zero-cost | Likely | LogTape v2.0.5 source analysis — unconfigured default still allocates objects, calls Date.now(), parses templates. lowestLevel: null short-circuits at getSinks() line 149/169 |

### Bun stderr Sink Wiring
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| getStreamSink() with WritableStream wrapping Bun.stderr.writer() | Confident | LogTape sinks docs — getStreamSink() requires Web WritableStream, not process.stderr |

### Domain Label Scope
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Apply logical domain labels regardless of physical file location | Likely | Only workspace-env.ts and workspace-lifecycle.ts extracted; workspace-git/status/yaml still in workspace-ops.ts. Prior context D-03/D-04 say instrument current tree with logical labels |

### TUI Safety
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Reconfigure LogTape with lowestLevel: null before TUI dashboard launch | Likely | src/tui/dashboard/run.tsx uses alternate-screen; high-volume stderr could corrupt; prior context D-02 says silent before TUI |

## Corrections Made

No corrections — all assumptions confirmed.

## External Research

- **Bun stderr sink configuration**: getStreamSink() requires Web WritableStream; Bun needs Bun.stderr.writer() wrapped in WritableStream (Source: logtape.org/manual/sinks)
- **LogTape no-op overhead**: Unconfigured loggers (lowestLevel: "trace" default) are NOT zero-cost — allocate objects, call Date.now(), parse templates per call. lowestLevel: null required for true short-circuit (Source: LogTape v2.0.5 source analysis, logger.js lines 148-169)

## Previous Session (2026-04-05, initial)

Original assumptions covered Logger Bootstrap, Domain Label Boundary, Output Channel Contract, and Debug Cost Model. All confirmed without corrections. External research at that time covered LogTape bootstrap docs and sink docs but did not identify the lowestLevel: null requirement for true zero-cost disabled path.
