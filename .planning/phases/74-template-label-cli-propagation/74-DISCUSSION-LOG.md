# Phase 74: Template Label CLI & Propagation - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-05T21:47:35+02:00
**Phase:** 74-template-label-cli-propagation
**Mode:** assumptions
**Areas analyzed:** Template Label CLI Surface, Template List Filter Semantics, Workspace Creation And Clone Propagation Boundary, Composed Template Label Propagation

## Assumptions Presented

### Template Label CLI Surface
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Template label CRUD should be added as a nested `template label` command and should mirror the existing workspace label behavior and messaging as closely as possible. | Confident | `.planning/ROADMAP.md`, `src/commands/label.ts`, `src/commands/template.ts`, `src/index.ts` |

### Template List Filter Semantics
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| `git-stacks template list --label` should follow the existing workspace-list label semantics: exact matching, repeatable flag support, and AND behavior for multiple flags. | Likely | `src/commands/workspace.ts`, `src/lib/labels.ts`, `.planning/milestones/v0.14.0-phases/60-labels/60-CONTEXT.md` |

### Workspace Creation And Clone Propagation Boundary
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Label propagation belongs in workspace creation and clone flows, so every creation path writes labels into workspace YAML at creation time. | Confident | `src/commands/workspace.ts`, `src/tui/workspace-wizard.ts`, `src/tui/workspace-clone.ts`, `.planning/STATE.md`, `.planning/milestones/v0.14.0-phases/60-labels/60-CONTEXT.md` |

### Composed Template Label Propagation
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Composed and included templates are part of the propagation contract, so composed `Template` objects need merged `labels` before workspace creation unions labels into the new workspace. | Likely | `src/tui/workspace-wizard.ts`, `src/lib/composition.ts`, `.planning/REQUIREMENTS.md` |

## Corrections Made

No corrections — all assumptions confirmed.
