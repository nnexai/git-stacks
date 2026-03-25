# Phase 35: Dynamic Name Completion - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** Infrastructure phase — minimal context

<domain>
## Phase Boundary

Shell completion for workspace and template arguments resolves candidate values dynamically from YAML `name` fields rather than filename globs. Currently the completion helpers (`bashDynamicLookup`, `_git_stacks_workspaces`, `__git_stacks_workspaces`) list filenames via `ls *.yml | sed 's/.yml$//'`. After this phase, they parse YAML `name:` fields instead.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. The completion generator helpers need to switch from filename-based listing to YAML name-field extraction. Key consideration: shell completion helpers run in user shells (bash/zsh/fish), so the YAML parsing must use basic shell tools (grep/sed/awk) — no runtime dependencies.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/completion-generator.ts` — generates all shell completion scripts
- `bashDynamicLookup()` — bash helper using `ls` + `sed` for workspaces/templates
- `_git_stacks_workspaces()` / `_git_stacks_templates()` — zsh helpers using glob expansion
- `__git_stacks_workspaces()` / `__git_stacks_templates()` — fish helpers using `ls` + `sed`

### Established Patterns
- Workspace YAML: `name:` field is top-level (e.g., `name: my-workspace`)
- Template YAML: `name:` field is top-level (e.g., `name: my-template`)
- Registry YAML: `- name:` entries in array format
- Completion helpers emit inline shell code, not function calls to the CLI

### Integration Points
- Phase 34 just extended the generator for deep nesting — same file, same patterns
- The `name` field was added to workspaces/templates in phase 33 (name-based identity)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase following established patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
