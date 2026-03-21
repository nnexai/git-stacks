# Phase 3: Design and Conditional Implementation - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the Stack model with a three-primitive Registry + Template + Workspace model. The design evaluation has concluded: Stacks are eliminated, a Repo Registry becomes the source of truth for where repos live, Templates become optional reusable workspace recipes. Implement the full new model — all REPO-* and TMPL-* requirements are in scope.

</domain>

<decisions>
## Implementation Decisions

### Architecture: Registry + Template replaces Stacks entirely
- Stacks are **eliminated** — zerover, clean break, no migration path
- Existing stack YAMLs at `~/.config/git-stacks/stacks/` are orphaned — no migration tooling
- `stack *` commands are **removed** entirely
- Three primitives going forward: **Repo** (registry), **Template** (optional recipe), **Workspace** (task instance)

### Why Stacks failed to deliver reuse
- Stacks were intended as composable building blocks but in practice: either one-repo-per-stack (no value over direct config) or a single multi-repo stack used once to bootstrap, then bypassed via workspace clone
- Missing branch name placeholders made Stacks static — one Stack per target branch instead of one Template covering all feature branches
- Repo paths embedded in every Stack = duplication, not portability

### Repo Registry
- Registry is the **source of truth** for where repos live on the machine
- Registration methods: `add <local-path>`, `scan <dir>` (discovers repos one level deep, offers to register)
- Same repo at two different local locations → register under different names
- Registry entry: `{ name, local_path, default_branch, type }`
- Commands:
  ```
  git-stacks repo add <path>
  git-stacks repo scan <dir>
  git-stacks repo list
  git-stacks repo show <name>
  git-stacks repo remove <name>
  git-stacks repo rename <name> <new-name>
  ```

### Template
- Templates are **optional** — ad-hoc workspace creation from registry is first-class, not a fallback
- Template = unrealized workspace: defines which registered repos to use, modes, base branches, branch patterns, hooks, env, files, integrations
- Templates reference repos by registry name (`repo: api`) — no paths embedded — templates are **portable across machines**
- **Branch pattern placeholders**: `feature/<workspace-name>` expanded at workspace creation time
- **Base branch**: set per repo in template, **overridable at workspace creation time**
- Commands:
  ```
  git-stacks template new [name]
  git-stacks template list
  git-stacks template show <name>
  git-stacks template edit <name>
  git-stacks template clone <name> <new-name>
  git-stacks template rename <name> <new-name>
  git-stacks template remove <name>
  ```

### Template YAML shape
```yaml
name: my-app
description: Main app feature development
repos:
  - repo: api            # name from registry — path resolved at runtime
    mode: worktree
    base_branch: develop
    branch_pattern: "feature/<workspace-name>"
  - repo: web
    mode: worktree
    base_branch: develop
    branch_pattern: "feature/<workspace-name>"
  - repo: infra
    mode: trunk
    base_branch: main
hooks:
  post_open: [bun install]
env:
  NODE_ENV: development
```

### Workspace — template coupling
- Workspace config is a **snapshot** at creation time — not live-coupled to template
- Workspace YAML stores `template: <name>` (optional) — informational reference, not a live link
- Field name is `template:` (not `created_from` or any other name)
- `git-stacks open <name> --recreate` — explicit re-sync: diffs current workspace config against current template state, shows what would change, applies with confirmation prompt (or `--force` to skip)
- `--recreate` is only available when `template:` is set on the workspace
- `--recreate` follows Phase 2 confirmation patterns — consistent UX

### Workspace creation — `--from` flag
- `git-stacks new <name> [--from <source>]` — universal source flag:
  - `--from ~/dev/my-repo` or `--from ./path` (exists on disk) — registers repo + creates 1-repo workspace
  - `--from my-template` — creates workspace from named template
  - No `--from` — ad-hoc picker: select repos from registry
- Detection order: local path (exists on disk) → template name
- Auto-registers repos when `--from <path>` is used — registration is a side-effect, not a prerequisite

### Clone commands — no ambiguity
- `git-stacks clone <workspace> [new-name]` — copy existing workspace config (new branch, new worktrees)
- `git-stacks template clone <name> <new-name>` — copy template under a new name
- These are the only meanings of "clone" — the old "workspace from remote branch" concept is removed

### Repo picker UX
- Repo selection in `template new`, `template edit`, and ad-hoc `git-stacks new` must be **searchable/filterable**
- Plain multiselect list does not scale to tens or hundreds of registered repos
- Use **`@clack/prompts` only** — not OpenTUI (OpenTUI is reserved for the management dashboard)
- Exact implementation approach (text filter + filtered list, step-wise search, etc.) is Claude's discretion within @clack/prompts constraints

### Claude's Discretion
- Exact @clack/prompts implementation for searchable repo picker
- `--recreate` diff display format and confirmation prompt wording
- Template YAML field ordering conventions
- Storage location for repo registry (`~/.config/git-stacks/repos/` or single `registry.yml`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design requirements
- `.planning/REQUIREMENTS.md` §DESIGN-01, DESIGN-02 — design evaluation requirements (this context document IS the output of DESIGN-01/02)
- `.planning/REQUIREMENTS.md` §REPO-01 through REPO-04 — Repo Registry full requirement text
- `.planning/REQUIREMENTS.md` §TMPL-01 through TMPL-05 — Template full requirement text

### Existing code being replaced
- `src/lib/config.ts` — existing Zod schemas (StackSchema, WorkspaceSchema, WorkspaceRepoSchema) — reference for what to replace; WorkspaceRepoSchema has `stack:` field that becomes `repo:` (registry name)
- `src/commands/stack.ts` — existing stack commands — **to be removed entirely**
- `src/tui/stack-wizard.ts`, `src/tui/stack-edit.ts` — existing Stack TUI wizards — **to be replaced**
- `src/tui/workspace-wizard.ts` — existing workspace creation wizard — **to be updated** for registry picker + template selection

### Existing code to carry forward unchanged
- `src/lib/workspace-ops.ts` — core workspace lifecycle (open, remove, merge, clean, rename, sync) — update to resolve repos via registry, not Stack paths
- `src/lib/integrations/` — integration plugin system — unchanged, carries forward into Templates
- `src/lib/lifecycle.ts` — hook execution — unchanged
- `src/lib/git.ts` — git operations — unchanged
- `src/lib/paths.ts` — path constants — may need new registry/template path constants

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@clack/prompts` — all existing TUI wizards use this; repo picker must also use it (not OpenTUI)
- `WorkspaceSchema` in `src/lib/config.ts` — basis for updated Workspace schema: add `template?: string` field, replace `stack: string` in WorkspaceRepoSchema with `repo: string` (registry name)
- `readYaml` / `writeYaml` + Zod pattern in `src/lib/config.ts` — same pattern for new RepoRegistrySchema and TemplateSchema
- Integration plugin system (`src/lib/integrations/`) — plug directly into Template config the same way it plugs into Stack config today

### Established Patterns
- `opts: { force?: boolean, dryRun?: boolean }` shape on workspace-ops functions (Phase 2) — `--recreate` should follow the same opts pattern
- Confirmation prompt pattern: `p.confirm` in commands layer, not ops layer — `open --recreate` confirmation lives in `src/commands/workspace.ts`
- `onProgress` callback on workspace-ops functions — use for recreate progress reporting
- `schema_version` field on all YAML schemas (CONF-03) — new RepoRegistryEntry and TemplateSchema should include it

### Integration Points
- `src/commands/workspace.ts` — add `--recreate` to `open` command; add `--from` to `new` command; redefine `clone` as workspace copy
- `src/commands/stack.ts` — **delete this file**; add `src/commands/repo.ts` and `src/commands/template.ts`
- `src/index.ts` — register new `repo` and `template` command groups; deregister `stack`
- `src/lib/config.ts` — new schemas: `RepoRegistryEntrySchema`, `TemplateSchema`, `TemplateRepoSchema`; updated `WorkspaceRepoSchema` (repo ref by name, not stack name + path)
- `src/lib/paths.ts` — new path constants for registry and template storage dirs
- `src/tui/workspace-wizard.ts` — replace stack-picker with registry-picker (searchable); add template-or-adhoc choice

</code_context>

<specifics>
## Specific Ideas

- `--from` detection order: disk existence check first, then template name lookup — this order is unambiguous in practice
- `template:` field in workspace YAML is the exact field name — not `created_from`, `source`, or anything else
- `open --recreate` should show a diff before applying — "Template has changed: [what changed]. Apply?" — consistent with `--dry-run` output style from Phase 2
- Repo registry storage: single location per machine, likely `~/.config/git-stacks/repos.yml` or `~/.config/git-stacks/registry.yml` (planner decides exact path, but must be in paths.ts)
- The `stack:` field in current `WorkspaceRepoSchema` becomes `repo:` (registry name) — this is the key schema migration within workspace YAML files

</specifics>

<deferred>
## Deferred Ideas

- **Re-planning of earlier phases required**: Phase 1 plans (01-02 config schemas, 01-05 lifecycle tests) were built around StackSchema and WorkspaceSchema with Stack refs. Phase 4 UX requirements reference Stack commands. These phases need revision before or alongside Phase 3 execution.
- Quick repo onboarding ideas — user has further ideas here, deferred to future discussion
- `@clack/prompts` 1.1.0 upgrade (PWR-04) — currently v2 backlog; may unlock better autocomplete for repo picker; planner should check if needed
- Multiple checked-out locations of the same repo — current resolution: register under different names; more sophisticated aliasing is a future concern
- **URL/remote registration deferred to v2** — `add <url>` (ssh or https), `--from git@github.com/org/repo`, `--from https://...` for auto-clone + register. Phase 3 scoped to local paths only per user decision.

</deferred>

---

*Phase: 03-design-and-conditional-implementation*
*Context gathered: 2026-03-18*
