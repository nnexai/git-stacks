# Phase 70: Extract remaining domain modules and workspace-ops facade - Context

**Gathered:** 2026-04-05 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract the remaining status, git-sync, and YAML editor concerns out of `src/lib/workspace-ops.ts` into dedicated domain modules so that `workspace-ops.ts` ends this phase as a thin lifecycle/orchestration module. This phase includes caller updates needed to remove runtime dependence on the old facade, preserves behavior and test coverage, and keeps circular imports at zero. It does not add observability, and it does not redefine template/workspace management responsibilities beyond what is needed to complete the extraction cleanly.
</domain>

<decisions>
## Implementation Decisions

### Facade Boundary
- **D-01:** Phase 70 updates runtime callers and test seams off `src/lib/workspace-ops.ts` for extracted status, git, and YAML runtime functions.
- **D-02:** After this extraction, `src/lib/workspace-ops.ts` should contain only lifecycle/orchestration responsibilities: `openWorkspace`, `closeWorkspace`, `cleanWorkspace`, `removeWorkspace`, `mergeWorkspace`, and `renameWorkspace`.
- **D-03:** `SyncRow`, `PushRow`, and `PullRow` may be re-exported temporarily only as type compatibility shims while callers are updated.

### Status Ownership
- **D-04:** `src/lib/workspace-status.ts` owns `getWorkspaceStatus`, `getDirtyWorktrees`, `getWorkspaceListInfo`, and `detectWorkspaceFromCwd`.
- **D-05:** Status logic must preserve the current trunk/worktree behavior, ahead/behind aggregation, and deepest-path CWD matching already covered by the existing tests.

### Git Operations Ownership
- **D-06:** `src/lib/workspace-git.ts` owns `syncWorkspace`, `pushWorkspace`, and `pullWorkspace`.
- **D-07:** `workspace-git.ts` exports its own mutable `_exec` seam where process spawning or shell execution belongs at the extracted-module layer, following the project’s established injectable-process pattern.

### YAML Editing Ownership
- **D-08:** `src/lib/workspace-yaml.ts` owns `editWorkspaceYaml`, `editTemplateYaml`, `editGlobalConfigYaml`, `editRegistryYaml`, and `openYamlInEditor()`.
- **D-09:** `workspace-yaml.ts` may expose low-level file/path/validation helpers that support template rename flows, but `renameTemplate()` itself remains higher-level template/workspace management behavior rather than YAML-module ownership.
- **D-10:** `renameTemplate()` may call into `workspace-yaml.ts` helpers for file operations, but it retains responsibility for the workspace-reference cascade and other orchestration behavior.

### Dependency Direction And Cycle Prevention
- **D-11:** New domain modules import low-level helpers directly and must not depend back on `src/lib/workspace-ops.ts`.
- **D-12:** The facade depends downward on extracted modules, never the reverse, so `madge --circular src/` remains clean at the end of the phase.

### the agent's Discretion
- Whether `renameTemplate()` stays in `workspace-ops.ts` for this phase or moves to a better non-lifecycle home, as long as it remains orchestration logic and is not forced into `workspace-yaml.ts` purely for file-adjacency reasons.
- Exact caller migration order across commands, TUI, and tests, as long as the final runtime surface matches the phase boundary and all tests continue to pass.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Definition
- `.planning/ROADMAP.md` §Phase 70 - Goal, success criteria, lifecycle-only facade target, and zero-cycle requirement.
- `.planning/REQUIREMENTS.md` - `EXTR-01`, `EXTR-04`, `EXTR-05`, `EXTR-06`, `EXTR-07`, and `EXTR-08` define the extracted modules, `_exec` requirement, and regression bar.
- `.planning/STATE.md` - Current milestone decisions and any planning blockers already recorded.
- `.planning/phases/69-extract-workspace-env-ts-and-workspace-lifecycle-ts/69-CONTEXT.md` - Prior extraction decisions about dependency direction, facade migration, and avoiding circular imports.

### Current Implementation
- `src/lib/workspace-ops.ts` - Current source of the remaining status, git, YAML editor, and CWD-detection functions targeted by this phase.
- `src/commands/workspace.ts` - Primary CLI caller for extracted status/git functions and `detectWorkspaceFromCwd()`.
- `src/commands/template.ts` - Caller for template YAML editing and `renameTemplate()`.
- `src/commands/repo.ts` - Caller for registry YAML editing.
- `src/commands/config.ts` - Caller for global-config YAML editing.
- `src/tui/dashboard/App.tsx` - TUI caller for sync, push, and workspace YAML editing.
- `src/tui/dashboard/hooks/useWorkspaces.ts` - TUI caller for workspace status loading.

### Test Contracts
- `tests/helpers.ts` - Mock/export compatibility seam during caller migration.
- `tests/lib/workspace-ops.test.ts` - Behavior contract for status, sync, push, and YAML editor helpers.
- `tests/lib/pull.test.ts` - Dedicated `pullWorkspace()` contract.
- `tests/lib/detect-workspace-cwd.test.ts` - Dedicated `detectWorkspaceFromCwd()` contract.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/workspace-ops.ts`: Existing implementations for the remaining extracted functions can be moved with minimal behavioral change rather than rewritten.
- `src/lib/git.ts`: Supplies low-level git primitives used by sync/push/pull logic, even though it does not currently expose a module-level `_exec`.
- `src/lib/config.ts`: Provides schemas, workspace/template/registry paths, and read/write helpers used by status detection and YAML validation.
- `src/lib/paths.ts`: Supplies global config and registry paths plus `expandHome()` used in CWD detection.
- `src/lib/lifecycle.ts`, `src/lib/tmux.ts`, `src/lib/aerospace.ts`: Established examples of mutable `_exec` seams in this codebase.

### Established Patterns
- Extracted modules should use named exports, explicit return types, and direct imports from low-level helpers rather than routing through facades.
- Runtime caller migration is acceptable within an extraction phase when the roadmap explicitly tightens the module boundary.
- Tests depend heavily on stable seams in `tests/helpers.ts` and focused dedicated files for special behaviors like pull and CWD detection.

### Integration Points
- `src/commands/workspace.ts`, `src/tui/dashboard/App.tsx`, and `src/tui/dashboard/hooks/useWorkspaces.ts` will need direct imports from the new modules once runtime shims are removed.
- `tests/helpers.ts` must stay aligned with whichever modules commands and TUI mock after the migration.
- `renameTemplate()` needs a deliberate home separate from YAML-helper ownership if the final `workspace-ops.ts` boundary would otherwise be polluted, but it can reuse low-level helpers exported from `workspace-yaml.ts`.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly corrected the earlier assumption that `renameTemplate()` should automatically belong to the YAML module. It is template/workspace management behavior, not YAML ownership by nature.
- The preferred split is: `workspace-yaml.ts` exports low-level helpers that a rename flow can reuse, while `renameTemplate()` stays the higher-level orchestration function.

</specifics>

<deferred>
## Deferred Ideas

- Observability and debug labeling remain Phase 71 work.
- Extraction-focused unit expansion and explicit circular-import verification artifacts remain Phase 72 work, even though Phase 70 must still pass `madge --circular src/`.

</deferred>

---

*Phase: 70-extract-remaining-domain-modules-and-workspace-ops-facade*
*Context gathered: 2026-04-05*
