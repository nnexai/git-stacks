# Phase 64: Schema & Registry - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Users can declare non-git directories as "dir" repos in registry and template YAML, and add or scan them via CLI. This is the foundational schema phase — all subsequent dir mode phases build on it.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key schema decisions to make:
- Extend `RepoTypeSchema` to include "dir" or create a separate `RepoKindSchema`
- Whether `TemplateRepoSchema.mode` gains a "dir" option or infers it from registry type
- How `WorkspaceRepoSchema` handles dir repos (task_path behavior, base_branch omission)
- Whether `scanForRepos` in detect.ts should offer non-git directories or remain git-only with a separate scan function

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/config.ts` — Zod schemas for RepoRegistryEntry, TemplateRepo, WorkspaceRepo; read/write functions
- `src/lib/detect.ts` — `detectRepoType()` and `scanForRepos()` (currently git-only: filters by `.git` existence)
- `src/commands/repo.ts` — `repo add` command (currently requires `.git` directory)
- `src/tui/repo-wizard.ts` — `runRepoScan()` for interactive repo scanning

### Established Patterns
- `RepoTypeSchema = z.enum(["java", "typescript", "other"])` — language/build-system detection
- Registry entries have `name`, `local_path`, `default_branch`, `type`, `forge`
- Template repos reference registry by name, specify mode (trunk/worktree) and branch_pattern
- Workspace repos resolve main_path and task_path at creation time

### Integration Points
- `RepoRegistryEntrySchema` needs a way to flag dir repos (new field or extended type enum)
- `TemplateRepoSchema.mode` needs a "dir" option (or derive from registry type)
- `WorkspaceRepoSchema` needs to handle missing task_path/base_branch for dir repos
- `repo add` command needs to accept non-git paths
- `scanForRepos` needs to optionally discover non-git directories

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
