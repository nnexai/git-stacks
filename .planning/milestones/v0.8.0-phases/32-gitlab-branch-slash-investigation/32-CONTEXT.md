# Phase 32: GitLab Branch Slash Investigation - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Investigate and resolve branch names containing '/' in GitLab commands. Determine whether the issue is in our gitlab.ts code or in the glab binary, then either fix or document.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure investigation phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/integrations/gitlab.ts` — GitLab integration with `_exec.run` for glab CLI invocation
- `src/lib/integrations/forge-utils.ts` — forge repo resolution, branch resolution
- `src/commands/doctor.ts` — health checks including forge CLI binary detection

### Established Patterns
- Forge integrations pass through to CLI tools (gh/glab/tea) with inherited stdio
- Doctor checks for binary availability but not version

### Integration Points
- `glab repo view --web` — the affected command that opens repo in browser
- `glab mr create --target-branch` — MR creation (not affected)
- `glab mr view --web` — MR viewing (not affected, uses MR number)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — investigation phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
