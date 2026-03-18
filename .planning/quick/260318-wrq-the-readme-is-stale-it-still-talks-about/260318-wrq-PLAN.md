---
phase: quick
plan: 260318-wrq
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
autonomous: true
requirements: [readme-update]
must_haves:
  truths:
    - "README accurately reflects the current CLI command surface (template, repo, workspace, manage)"
    - "README uses correct config paths (~/.config/git-stacks/, not ~/.config/ws/)"
    - "README documents all three core concepts: Repo Registry, Templates, Workspaces"
    - "README hooks section matches actual template/workspace hook schemas"
  artifacts:
    - path: "README.md"
      provides: "Accurate project documentation"
      contains: "template"
  key_links: []
---

<objective>
Rewrite the README.md to accurately reflect the current CLI commands and concepts.

Purpose: The README is stale -- it still references the old "stack" terminology and `stack init` workflow, missing the repo registry, template system, and manage command that the codebase actually implements.
Output: An updated README.md that matches the real CLI surface.
</objective>

<execution_context>
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/workflows/execute-plan.md
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@README.md
@src/index.ts
@src/commands/workspace.ts
@src/commands/template.ts
@src/commands/repo.ts
@src/commands/doctor.ts
@src/commands/config.ts
@src/commands/completion.ts
@src/lib/paths.ts
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite README.md to match current CLI</name>
  <files>README.md</files>
  <action>
Rewrite README.md to accurately reflect the current codebase. Here is exactly what needs to change:

**Concepts section** -- Replace the two concepts (Stack, Workspace) with the three current concepts:
- **Repo Registry** -- a flat list of local git repos with names, paths, types, and default branches. Stored at `~/.config/git-stacks/registry.yml`. Managed via `git-stacks repo add|scan|list|show|remove|rename`.
- **Template** -- named sets of repos (by registry name) with modes and branch patterns. Stored at `~/.config/git-stacks/templates/{name}.yml`. Managed via `git-stacks template new|list|show|edit|clone|rename|remove`.
- **Workspace** -- task/ticket-scoped instances created from templates. Each workspace has a branch; repos can be `worktree` mode (isolated git worktree at `{workspace_root}/tasks/{workspace_name}/{repo_name}`) or `trunk` mode (main clone path referenced directly). Stored at `~/.config/git-stacks/workspaces/{name}.yml`.

**Quick Start section** -- Update the workflow example to use the new commands:
- `git-stacks repo scan ~/dev/myproject` (register repos from a directory)
- `git-stacks template new` (create a template from registered repos)
- `git-stacks new my-feature` (create workspace -- unchanged)
- `git-stacks open my-feature` (open workspace -- unchanged)
- `git-stacks merge my-feature` (merge and clean -- unchanged)

**Repo Registry section** -- Add a NEW section documenting the repo subcommands:
```
git-stacks repo add <path>           # Register a local git repo
git-stacks repo scan <dir>           # Scan directory for git repos and register them
git-stacks repo list                 # List all registered repos
git-stacks repo show <name>          # Show repo details
git-stacks repo remove <name>        # Remove a repo from registry
git-stacks repo rename <old> <new>   # Rename a registered repo
```

**Templates section** -- Replace the "Stacks" section entirely:
```
git-stacks template new [name]          # Create a new template interactively
git-stacks template list                # List all templates
git-stacks template show <name>         # Show template details
git-stacks template edit <name>         # Edit an existing template
git-stacks template clone <name> <new>  # Clone a template under a new name
git-stacks template rename <old> <new>  # Rename a template
git-stacks template remove <name>       # Remove a template
```

**Workspaces section** -- Keep the same commands but ensure accuracy. The existing list is correct. Keep it as-is.

**Configuration section** -- Update the config path from `~/.config/ws/config.yml` to `~/.config/git-stacks/config.yml`. Add `git-stacks manage` description (interactive TUI dashboard -- also the default command when run with no args). Keep doctor and config commands.

**Hooks section** -- Update terminology from "Stacks" to "Templates" and update the hook lists:
- Template hooks: `pre_create`, `post_create`, `pre_open`, `post_open`, `pre_remove`, `post_merge`
- Workspace hooks: `pre_create`, `post_create`, `pre_open`, `post_open`, `post_merge`, `pre_remove`
- Per-repo hooks: `pre_open`
- Update the description: "Templates and workspaces support hook arrays..."

**Shell Completions section** -- Keep as-is (unchanged and accurate).

**Keep the same overall structure, tone, and formatting style** (concise, command-focused, no fluff). Keep the "Why?" paragraph and Installation section unchanged. Keep the License section. Keep the shell `cd` integration section.

Do NOT add badges, emoji, or excessive prose. Match the existing terse style.
  </action>
  <verify>
    <automated>grep -q "template" README.md && grep -q "repo" README.md && grep -q "git-stacks/templates" README.md && grep -q "registry.yml" README.md && ! grep -q "stack init" README.md && ! grep -q "~/.config/ws/" README.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>
    - README uses "Template" not "Stack" for the template concept
    - README documents all three concepts: Repo Registry, Templates, Workspaces
    - All config paths use `~/.config/git-stacks/` not `~/.config/ws/`
    - Repo Registry section exists with add|scan|list|show|remove|rename commands
    - Templates section lists new|list|show|edit|clone|rename|remove commands
    - Quick Start uses `repo scan` and `template new` workflow
    - Hooks section says "Templates" not "Stacks" and lists all 6 hook types
    - `manage` command documented
    - No references to `stack init` or the old `stack` subcommand remain
  </done>
</task>

</tasks>

<verification>
- `grep -c "stack" README.md` should return 0 (or only in "git-stacks" the tool name itself)
- All documented commands match actual commander registrations in src/commands/
- Config paths all reference `~/.config/git-stacks/`
</verification>

<success_criteria>
README.md accurately documents the current git-stacks CLI with its three core concepts (Repo Registry, Templates, Workspaces), correct config paths, and complete command reference for all subcommands.
</success_criteria>

<output>
After completion, create `.planning/quick/260318-wrq-the-readme-is-stale-it-still-talks-about/260318-wrq-SUMMARY.md`
</output>
