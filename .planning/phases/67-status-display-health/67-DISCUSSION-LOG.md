# Phase 67: Status, Display & Health - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-04
**Phase:** 67-Status, Display & Health
**Mode:** assumptions
**Areas analyzed:** Status/List Display Adaptation, TUI Dashboard Type and Display Gaps, Doctor Health Check Adaptation

## Assumptions Presented

### Status/List Display Adaptation
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Status/list commands need display-layer changes only — data layer already handles dir repos | Confident | workspace-ops.ts:332, workspace-ops.ts:101-107, workspace-ops.test.ts:2588-2633 |
| `--fetch` code path needs dir repo filter to avoid calling fetchOrigin on non-git dirs | Likely | workspace.ts:363 |

### TUI Dashboard Type and Display Gaps
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| TUI RepoStatus type must be extended to include "dir" in mode union | Confident | tui/dashboard/types.ts:8, workspace-ops.ts:314 |
| WorkspaceRow needs to surface dir repo counts (currently invisible) | Likely | WorkspaceRow.tsx:20-21, workspace-ops.ts:166 |

### Doctor Health Check Adaptation
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Doctor needs new dir-specific check for directory existence and type validation | Likely | doctor.ts:148-163 |
| Doctor's existing git checks already skip dir repos (HLTH-01 largely satisfied) | Confident | doctor.ts:130-145 |

## Corrections Made

No corrections — all assumptions confirmed.
