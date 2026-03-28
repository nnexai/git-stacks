# Phase 40: Template Composition - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `includes:` field to templates for composable building blocks and support multiple `--template` flags on `git-stacks new` for ad-hoc composition. Merge repos, hooks, env, files, and integrations from composed templates with clear precedence rules. Limited to 1 level of nesting.

</domain>

<decisions>
## Implementation Decisions

### Resolution timing
- **D-01:** Resolve `includes:` at workspace creation time (during `git-stacks new`), not when template is read
- **D-02:** Workspace YAML stores the merged result — editing an included template changes future workspaces but not existing ones
- **D-03:** `readTemplate()` does NOT expand includes; a separate `resolveTemplate()` function handles composition

### Merge rules (from requirements + discussion)
- **D-04:** Repos merged as union; same repo in multiple templates → worktree mode wins over trunk (COMP-03)
- **D-05:** Hooks concatenate in include order; top-level template's hooks run last (COMP-04)
- **D-06:** Env vars merge last-wins per key; top-level template env wins (COMP-05)
- **D-07:** File ops concatenate in include order; same destination → later wins; top-level last
- **D-08:** Integration configs deep-merged across templates; top-level wins per key (consistent with env semantics)

### Wizard integration
- **D-09:** Multi-template is CLI-only via `--template api --template frontend` flags
- **D-10:** Interactive wizard stays single-select — no multi-template picker (explicitly out of scope per REQUIREMENTS.md)

### Validation & safety (from requirements)
- **D-11:** Circular `includes:` chains detected and produce clear error message (COMP-06)
- **D-12:** `includes:` limited to 1 level — included templates' own `includes` fields are ignored with a warning (REQUIREMENTS.md Out of Scope)
- **D-13:** Existing templates without `includes:` continue to work — backward-compatible schema change (COMP-07)

### Schema change
- **D-14:** Add `includes: z.array(z.string()).optional()` to `TemplateSchema` — optional field, defaults to empty

### Claude's Discretion
- `resolveTemplate()` function signature and placement (config.ts vs new composition.ts)
- Error message format for circular includes
- Whether `--template` flag is repeatable or comma-separated
- `branch_pattern` conflict resolution when same repo appears with different patterns

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Template system
- `src/lib/config.ts` lines 59-91 -- `TemplateRepoSchema`, `TemplateSchema`, `Template` type; schema needs `includes` field
- `src/lib/config.ts` lines 210-225 -- `readTemplate()` with name lookup; does NOT expand includes
- `src/lib/config.ts` lines 330-345 -- `listTemplates()` -- must continue working with new schema

### Workspace creation
- `src/tui/workspace-wizard.ts` -- `runWorkspaceNew()` wizard; stays single-select
- `src/commands/workspace.ts` lines 42-48 -- `new` command registration; needs `--template` multi-flag

### Merge targets
- `src/lib/lifecycle.ts` -- `runHooks()` hook execution; hook arrays from composition feed into this
- `src/lib/files.ts` -- `applyFileOperations()` file copy/symlink; file ops from composition feed into this

### Requirements
- `.planning/REQUIREMENTS.md` -- COMP-01 through COMP-07 acceptance criteria
- `.planning/REQUIREMENTS.md` Out of Scope -- depth limit, wizard single-select

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TemplateSchema` in `src/lib/config.ts` -- Zod schema to extend with `includes` field
- `readTemplate()` -- name-based template lookup; composition function builds on top
- `runWorkspaceNew()` in `src/tui/workspace-wizard.ts` -- workspace creation flow to integrate composition into

### Established Patterns
- Zod `.optional()` for backward-compatible schema additions
- `safeParse()` for template loading — already handles missing fields gracefully
- Commander.js `.option('--template <name...>')` for repeatable flags (or `.option('--template <name>', '', collect)`)
- Template→workspace snapshot: templates are resolved at creation time, workspace YAML is self-contained

### Integration Points
- `TemplateSchema` gets `includes: z.array(z.string()).optional()` field
- New `resolveTemplate()` or `composeTemplates()` function that takes template names and returns merged `Template`
- `git-stacks new --template` accepts multiple values
- `runWorkspaceNew()` calls composition function when multiple templates are involved
- Circular detection runs before any merge logic

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches following existing template patterns

</specifics>

<deferred>
## Deferred Ideas

- Deep `includes:` nesting (includes-of-includes) — revisit if demanded (REQUIREMENTS.md Out of Scope)
- TUI multi-template wizard — wizard stays single-select for v0.10.0 (REQUIREMENTS.md Out of Scope)

</deferred>

---

*Phase: 40-template-composition*
*Context gathered: 2026-03-26*
