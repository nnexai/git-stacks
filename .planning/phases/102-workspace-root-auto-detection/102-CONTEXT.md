# Phase 102: Workspace Root Auto-detection - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 102 extends optional-workspace command resolution so commands invoked from a workspace root directory, or any subdirectory under that workspace root, resolve the current workspace. Existing repo worktree detection remains valid and more specific: the workspace is the primary detection result, and repo identity is secondary context only for commands that require a repo.

This phase does not add new workspace commands, stale-workspace advisory behavior, TUI redesign, template composition ergonomics, or new forge-source behavior. It fixes and documents the shared workspace resolution order for already-shipped optional-workspace command surfaces.

</domain>

<decisions>
## Implementation Decisions

### Workspace-root Match Semantics
- **D-01:** Workspace root detection should match the exact workspace root path and every subdirectory under it.
- **D-02:** Workspace detection is primary. Repo detection is secondary and should only be used by commands that need repo-specific behavior.
- **D-03:** Commands that only require a workspace should accept the workspace-root or workspace-subdirectory match even when no repo can be inferred.
- **D-04:** Commands that require a repo should resolve the workspace first, then resolve the repo from the current directory when possible and fail with command-appropriate guidance when repo identity is required but unavailable.
- **D-05:** Preserve existing deepest-repo matching for repo worktree paths. A nested repo/task path should remain more specific than a broad workspace-root match.
- **D-06:** Preserve existing trunk-skip and prefix-collision protections.

### Command Surface Coverage
- **D-07:** The planner/implementor may choose a representative set of user-facing optional-workspace commands to prove behavior end to end.
- **D-08:** Representative coverage should include at least three command surfaces that exercise different resolver shapes: a workspace-only command, a command with existing `GS_WORKSPACE_NAME` fallback behavior, and a repo-aware command where cwd can still matter after workspace detection.
- **D-09:** The implementation does not need an exhaustive subprocess test for every optional-workspace command if the shared resolver is directly tested and representative CLI tests prove the user-facing behavior.

### Resolver Consolidation
- **D-10:** Use the same style as the existing repo/workspace detection work. A shared helper/resolver is expected unless research finds a strong reason to keep a command-local wrapper.
- **D-11:** The documented resolution order is explicit workspace arg, cwd detection, then `GS_WORKSPACE_NAME` only for commands that already support that env fallback.
- **D-12:** Command-local wrappers may remain only as thin adapters around shared behavior for command-specific validation or error text.

### Edge-case Proof Depth
- **D-13:** Edge-case coverage should stay pragmatic and implementor-led. The phase should protect the known fragile cases, but it does not need a large matrix.
- **D-14:** At minimum, tests should preserve root/subdirectory matching, deepest repo matching, trunk/dir non-worktree behavior, missing worktree tolerance, and overlapping-prefix protection where these are touched by the resolver.
- **D-15:** Focused real-fixture subprocess tests are required for representative user-facing commands; direct unit tests can carry the broader resolver edge cases.

### the agent's Discretion
- The planner may choose the exact shared helper API and whether it lives in `workspace-status`, a new resolver module, or an existing command support module.
- The planner may choose the three representative command surfaces, with preference for commands that already expose different resolution behavior.
- The planner may decide the minimum edge-case matrix after inspecting current tests, as long as the decisions above and Phase 102 success criteria remain covered.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and Requirements
- `.planning/ROADMAP.md` — Phase 102 goal, dependency on Phase 101, success criteria, and planned two-plan split.
- `.planning/REQUIREMENTS.md` — `WDET-01` through `WDET-03`, the locked workspace-root detection requirements.
- `.planning/PROJECT.md` — v0.19.0 RC follow-up context and final-release boundary.
- `.planning/STATE.md` — Current project state showing Phase 102 as the active focus.

### Prior Context
- `.planning/phases/100-manager-tui-command-output-containment/100-CONTEXT.md` — Confirms manual commands are shipped surfaces but should not be broadened here.
- `.planning/phases/101-completion-completeness-repair/101-CONTEXT.md` — Confirms recent command surfaces should be verified without adding new behavior.

### Workspace Detection Implementation and Tests
- `src/lib/workspace-status.ts` — Existing `detectWorkspaceFromCwd()` implementation with worktree task-path matching, deepest-match behavior, trunk skip, and prefix-collision guard.
- `src/lib/integrations/issue-utils.ts` — Existing `resolveWorkspaceArg()` helper for integration issue commands.
- `src/commands/workspace.ts` — Existing optional-workspace command handling for `paths`, `env`, `pull`, `push`, and related workspace surfaces.
- `src/commands/files.ts` — Files command family resolver and workspace-root path handling.
- `src/commands/command.ts` — Manual command resolver using cwd detection for omitted workspace.
- `src/commands/notes.ts` — Notes resolver using explicit arg, cwd detection, then `GS_WORKSPACE_NAME`.
- `tests/lib/detect-workspace-cwd.test.ts` — Existing direct resolver tests for exact/subdirectory worktree paths, deepest match, trunk skip, tilde expansion, and prefix collisions.
- `tests/commands/workspace-wrapper-edges.test.ts` — Existing subprocess coverage for optional workspace wrapper behavior such as `paths` and `env`.
- `tests/commands/files.test.ts` — Existing files command subprocess coverage.
- `tests/commands/command.test.ts` — Existing manual command subprocess coverage.
- `tests/commands/notes.test.ts` — Existing notes command subprocess coverage and env fallback precedence.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `detectWorkspaceFromCwd(cwd?)` in `src/lib/workspace-status.ts` already centralizes worktree-path cwd detection and can be extended or wrapped for workspace-root matching.
- Existing command-local resolvers in `src/commands/files.ts`, `src/commands/command.ts`, and `src/commands/notes.ts` provide examples of how optional workspace args are validated today.
- `resolveWorkspaceArg()` in `src/lib/integrations/issue-utils.ts` is an existing integration-side helper for optional workspace args.
- Test helpers in `tests/helpers.ts` already support isolated config homes, workspace YAML fixtures, and subprocess `runCli()` calls.

### Established Patterns
- Explicit workspace arguments override cwd detection.
- Existing notes behavior already prefers cwd detection over `GS_WORKSPACE_NAME` when no explicit workspace is passed.
- Existing worktree detection ignores trunk repos as workspace-identifying repo paths, uses deepest path length for nested matches, and guards prefix collisions with separator-aware checks.
- Broad suites should run through the custom Bun test runner rather than raw `bun test tests/`.

### Integration Points
- Workspace-root matching needs the configured tasks directory from `getTasksDir(config.workspace_root)` and known workspace names from persisted workspace YAML.
- Commands that only need a workspace can stop after workspace detection.
- Commands that need repo context should continue using repo-level cwd matching or repo-specific helpers after workspace detection.
- Error text should be updated where it currently says only "run from inside a worktree" so workspace root invocation is documented as valid.

</code_context>

<specifics>
## Specific Ideas

- User direction: "every subdirectory as well - so always workspace, and repo is a secondary part to the autodetection."
- User direction: commands that only require a workspace should use the workspace match; commands that require a repo should use repo identity only when needed.
- User direction: representative command coverage is enough; the implementor may pick the exact three surfaces.
- User assumption: resolver consolidation should follow the previous repo/workspace helper pattern.
- User direction: edge-case testing does not need to be large; leave exact depth to the implementor.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- **Improve TUI dashboard experience** (`.planning/todos/pending/2026-05-15-improve-tui-dashboard-experience.md`) — Reviewed by matcher but not folded; dashboard behavior is out of scope for workspace-root detection.
- **Add manual workspace commands** (`.planning/todos/pending/2026-05-15-add-manual-workspace-commands.md`) — Not folded; Phase 102 should preserve shipped `command` resolver behavior without expanding manual command functionality.
- **Add workspace notes** (`.planning/todos/pending/2026-05-15-add-workspace-notes.md`) — Not folded; Phase 102 should preserve shipped `notes` resolver behavior without expanding notes functionality.
- **Add workspace stale view** (`.planning/todos/pending/2026-05-15-add-workspace-stale-view.md`) — Future advisory workflow; out of scope.
- **Create workspace from forge source** (`.planning/todos/pending/2026-05-15-create-workspace-from-forge-source.md`) — Already resolved by Phase 92 and out of scope.
- **Improve template composition understanding** (`.planning/todos/pending/2026-05-15-improve-template-composition-understanding.md`) — Future ergonomics/support idea; out of scope.

</deferred>

---

*Phase: 102-Workspace Root Auto-detection*
*Context gathered: 2026-05-25*
