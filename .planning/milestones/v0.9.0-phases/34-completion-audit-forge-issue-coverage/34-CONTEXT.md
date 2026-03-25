# Phase 34: Completion Audit & Forge/Issue Coverage - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Every CLI command has verified shell completion coverage in bash, zsh, and fish; forge (`pr`) and issue subcommands newly receive complete tab-completion support. A documented audit confirms full coverage.

</domain>

<decisions>
## Implementation Decisions

### Audit Approach
- Walk the Commander.js tree programmatically (the completion generator already does this via `buildTree()`) and cross-reference with `DYNAMIC_COMPLETIONS` to identify gaps
- Document the audit as a markdown table in the phase SUMMARY showing each command path and its completion status
- Fix gaps found during the audit as part of the same phase

### Completion Strategy for Integration Commands
- Integration subcommands (github/gitlab/gitea pr create/open/status, issue link/unlink/open, jira issue, niri focus-workspace, tmux attach) need DYNAMIC_COMPLETIONS entries for workspace/repo arguments
- The completion generator's `buildNode()` already walks nested commands — the gap is in the `DYNAMIC_COMPLETIONS` map which lacks `integration.*` paths
- Add entries like `"integration.github.pr.create": "workspace"`, `"integration.github.issue.link": "workspace"` etc.

### Claude's Discretion
All remaining implementation choices (exact DYNAMIC_COMPLETIONS key format for nested integration commands, audit document layout, whether to add a test) are at Claude's discretion — pure technical work following established patterns.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/completion-generator.ts` — full bash/zsh/fish generation with `DYNAMIC_COMPLETIONS`, `OPTION_ENUMS`, `FLAG_COMPLETIONS`, `COMMAND_FLAG_COMPLETIONS` maps
- `buildTree()`/`buildNode()` recursively walks Commander.js tree to discover all commands
- Dynamic lookup helpers already exist for workspace, repo, template, shells types

### Established Patterns
- `DYNAMIC_COMPLETIONS` maps dot-path command names (e.g., `"repo.show": "repo"`) to completion types
- Integration commands are registered dynamically via `integration.commands(sub)` in `src/commands/integration.ts`
- Nested subcommands: `integration.github.pr.create`, `integration.github.issue.link`, etc.

### Integration Points
- `src/commands/integration.ts` — loops over integrations and adds subcommands
- GitHub, GitLab, Gitea integrations all have `pr` (create/open/status) and `issue` (link/unlink/open) subcommands
- Jira has `issue` (link/unlink/open) only
- Niri has `focus-workspace`, Tmux has `attach`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — technical audit following existing completion-generator patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
