# Phase 70: Extract remaining domain modules and workspace-ops facade - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the assumptions analysis.

**Date:** 2026-04-05
**Phase:** 70-extract-remaining-domain-modules-and-workspace-ops-facade
**Mode:** assumptions
**Areas analyzed:** Facade Boundary, YAML And Detection Ownership, Process Injection Pattern, Dependency Direction And Cycle Prevention

## Assumptions Presented

### Facade Boundary
| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Phase 70 should migrate runtime callers and test seams off `workspace-ops.ts` for extracted status/git/yaml functions, leaving `workspace-ops.ts` as lifecycle/orchestration only plus temporary type-only compatibility re-exports. | Confident | `.planning/ROADMAP.md`, `src/commands/workspace.ts`, `src/commands/template.ts`, `src/commands/repo.ts`, `src/commands/config.ts`, `src/tui/dashboard/App.tsx`, `src/tui/dashboard/hooks/useWorkspaces.ts`, `tests/helpers.ts` |

### YAML And Detection Ownership
| Assumption | Confidence | Evidence |
|------------|------------|----------|
| `detectWorkspaceFromCwd()` should move to `workspace-status.ts`; YAML helpers should move to `workspace-yaml.ts`; `openYamlInEditor()` likely belongs with YAML editing; `renameTemplate()` was initially assumed to be a possible YAML-module resident. | Likely | `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `src/commands/template.ts`, `src/commands/repo.ts`, `src/commands/config.ts`, `src/lib/workspace-ops.ts` |

### Process Injection Pattern
| Assumption | Confidence | Evidence |
|------------|------------|----------|
| `workspace-git.ts` and `workspace-yaml.ts` should each expose local mutable `_exec` seams rather than relying on `git.ts` to become the injection layer. | Likely | `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `src/lib/git.ts`, `src/lib/lifecycle.ts`, `src/lib/aerospace.ts` |

### Dependency Direction And Cycle Prevention
| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Extracted modules should import low-level helpers directly and never depend back on `workspace-ops.ts`; the facade depends on domain modules, not the reverse. | Confident | `.planning/phases/69-extract-workspace-env-ts-and-workspace-lifecycle-ts/69-CONTEXT.md`, `.planning/STATE.md`, `.planning/ROADMAP.md` |

## Corrections Made

### YAML And Detection Ownership
- **Original assumption:** `renameTemplate()` likely belongs in the YAML/editor module because it is adjacent to template-file editing concerns.
- **User correction:** `renameTemplate()` should not be treated as YAML-module ownership by default because it is workspace/template management behavior, not YAML behavior.
- **Reason:** The user explicitly distinguished template/workspace management from YAML editing concerns.
- **Locked follow-up:** `workspace-yaml.ts` may still expose low-level helpers that `renameTemplate()` calls, but `renameTemplate()` remains the higher-level orchestration function.
