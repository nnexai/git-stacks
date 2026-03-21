# Phase 3: Design and Conditional Implementation - Research

**Researched:** 2026-03-18
**Domain:** TypeScript/Bun CLI — schema design, registry/template data model, TUI wizards, @clack/prompts
**Confidence:** HIGH

## Summary

The design decision is locked: Stacks are eliminated entirely and replaced with a three-primitive model (Repo Registry, Template, Workspace). All REPO-* and TMPL-* requirements are in scope. This is a large surgical refactor — not a greenfield feature — because the existing codebase is deeply coupled to the Stack model through `WorkspaceRepoSchema.stack` field, `workspace-ops.ts`'s `loadWorkspaceStacks()` function, and `workspace-wizard.ts`'s stack-picker TUI.

The work splits into three tiers: (1) new schemas in `config.ts` + new path constants in `paths.ts`, (2) new command files `repo.ts` and `template.ts` + updates to `workspace.ts` and `index.ts`, (3) updated TUI wizards (`workspace-wizard.ts`) and new wizard files for repo/template management. The `workspace-ops.ts` core logic carries forward with targeted updates — it resolves repos via registry instead of stack paths.

The `--from` flag for `git-stacks new` and the `open --recreate` feature introduce new interaction patterns. Both follow the Phase 2 confirmation prompt conventions already established in this codebase. Branch pattern placeholder expansion (`feature/<workspace-name>`) is a pure string operation with no external dependencies. The searchable repo picker must be implemented entirely within `@clack/prompts` 0.9.x constraints — OpenTUI is reserved for the management dashboard.

**Primary recommendation:** Sequence the work schema-first (config.ts), then ops update (workspace-ops.ts), then command layer (repo.ts, template.ts, workspace.ts), then TUI (workspace-wizard.ts). This order respects TypeScript compile dependencies and allows each layer to be tested before the next is built.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Stacks are **eliminated** — zerover, clean break, no migration path
- Existing stack YAMLs at `~/.config/git-stacks/stacks/` are orphaned — no migration tooling
- `stack *` commands are **removed** entirely
- Three primitives going forward: **Repo** (registry), **Template** (optional recipe), **Workspace** (task instance)
- Registry is the **source of truth** for where repos live on the machine
- Registration methods: `add <local-path>`, `add <url>` (ssh or https), `scan <dir>` (discovers repos one level deep, offers to register)
- Registry entry: `{ name, url, local_path, default_branch, type }`
- Templates are **optional** — ad-hoc workspace creation from registry is first-class, not a fallback
- Templates reference repos by registry name (`repo: api`) — no paths embedded
- Branch pattern placeholders: `feature/<workspace-name>` expanded at workspace creation time
- Workspace config is a **snapshot** at creation time — not live-coupled to template
- Field name in workspace YAML is `template:` (not `created_from`, `source`, or anything else)
- `git-stacks open <name> --recreate` — explicit re-sync against current template state
- `--recreate` is only available when `template:` is set on the workspace
- `--recreate` follows Phase 2 confirmation patterns
- `git-stacks new <name> [--from <source>]` — universal source flag
- Detection order: URL (contains `://` or starts with `git@`) → local path (exists on disk) → template name
- `git-stacks clone <workspace> [new-name]` — copy existing workspace config only
- `git-stacks template clone <name> <new-name>` — copy template under a new name
- Repo selection in `template new`, `template edit`, and ad-hoc `git-stacks new` must be **searchable/filterable**
- Use **`@clack/prompts` only** for repo picker — not OpenTUI

### Claude's Discretion
- Exact @clack/prompts implementation for searchable repo picker
- `--recreate` diff display format and confirmation prompt wording
- Template YAML field ordering conventions
- Storage location for repo registry (`~/.config/git-stacks/repos/` or single `registry.yml`)

### Deferred Ideas (OUT OF SCOPE)
- Re-planning of earlier phases required (Phase 1 and Phase 4 references to Stack commands) — deferred
- Quick repo onboarding ideas — future discussion
- `@clack/prompts` 1.1.0 upgrade (PWR-04) — v2 backlog
- Multiple checked-out locations of the same repo with sophisticated aliasing — future concern
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DESIGN-01 | Current Stack/Workspace model evaluated against Repo-Registry/Template/Workspace model across at least 3 workflows — winning model documented with rationale | Fulfilled by CONTEXT.md which IS the output of this evaluation; the planner needs only a decision document task |
| DESIGN-02 | Decision documented on whether Stacks are replaced, renamed, or supplemented — backward-compatibility stance documented | Fulfilled by CONTEXT.md decision: Stacks eliminated, no migration, zerover |
| REPO-01 | User can register a repo by providing a remote URL — git-stacks clones it to workspace root and stores metadata | Requires new `RepoRegistryEntrySchema` + `git clone` call + registry write + `repo add` command |
| REPO-02 | User can register repos by pointing at a local folder — scans for git repos (non-recursive, one level) and offers to register found repos | Reuses existing `scanForRepos()` from `detect.ts`; add registry write; `repo scan` command |
| REPO-03 | User can list, view, and remove registered repos | `repo list`, `repo show`, `repo remove` commands reading/writing registry YAML |
| REPO-04 | Registered repos have a default branch used as base for worktree creation when no override specified | `default_branch` field on `RepoRegistryEntrySchema`; workspace-ops reads from registry |
| TMPL-01 | User can create a named Template referencing registered repos with per-repo config (mode, base branch override) | New `TemplateSchema` + `TemplateRepoSchema`; `template new` wizard; storage in templates dir |
| TMPL-02 | Templates support branch naming placeholders (e.g., `feature/<workspace-name>`) expanded at workspace creation time | String replace `<workspace-name>` with actual name in workspace-wizard; no external deps |
| TMPL-03 | Templates define hook arrays (pre_create, post_create, pre_open, post_open) and plugin/integration configurations | `TemplateSchema.hooks` + `TemplateSchema.integrations`; same shape as existing StackSchema |
| TMPL-04 | For trunk/dependency repos in a template, workspace instantiation ensures correct base branch is accessible | `openWorkspace` or `newWorkspace` checks trunk repo branch; creates worktree if needed |
| TMPL-05 | User can create workspace directly from existing workspace (clone pattern) without needing a template | Existing `workspace-clone.ts` flow — update to drop stack refs; add as `git-stacks clone` |
</phase_requirements>

## Standard Stack

### Core (unchanged from existing project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun | runtime | TypeScript execution, shell (`$`), test runner | Project runtime — no build step |
| zod | ^3.25.76 | Schema validation + type inference | All YAML I/O already uses Zod schemas |
| yaml | ^2.8.2 | YAML parse/stringify | All config files are YAML |
| @clack/prompts | ^0.9.1 | Interactive TUI prompts | All existing wizards use this |
| commander | ^12.1.0 | CLI argument/command parsing | Program entrypoint already uses this |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `fs` (built-in) | — | File system ops | YAML read/write, dir creation |
| Node.js `path` (built-in) | — | Path manipulation | All path construction |
| Node.js `os` (built-in) | — | `homedir()` | paths.ts already uses this |

### No New Dependencies Required
This phase adds no new npm packages. All required capabilities exist in the current dependency set:
- Schema validation: zod (already used)
- YAML I/O: yaml (already used)
- TUI prompts: @clack/prompts 0.9.x (already used)
- Git clone: Bun's `$` shell (already used for all git operations in `git.ts`)
- File system: Node.js builtins (already used)

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @clack/prompts for searchable picker | @inquirer/prompts or enquirer | Context decision locks @clack/prompts only; other libraries introduce new deps |
| Single `registry.yml` file | Per-repo files in `repos/` dir | Single file is simpler YAML I/O, consistent with existing workspace-per-file pattern; planner decides |

## Architecture Patterns

### Recommended Project Structure (new files only)

```
src/
  commands/
    repo.ts          — git-stacks repo add|scan|list|show|remove|rename subcommands
    template.ts      — git-stacks template new|list|show|edit|clone|rename|remove subcommands
    workspace.ts     — UPDATED: add --from to new, --recreate to open, redefine clone
    stack.ts         — DELETED
  lib/
    config.ts        — UPDATED: add RepoRegistryEntrySchema, TemplateSchema, TemplateRepoSchema;
                       update WorkspaceRepoSchema (stack → repo); remove Stack* exports
    paths.ts         — UPDATED: add REGISTRY_FILE, TEMPLATES_DIR constants
    workspace-ops.ts — UPDATED: resolveRepoFromRegistry() replaces loadWorkspaceStacks();
                       add recreateWorkspace()
    git.ts           — UNCHANGED
    lifecycle.ts     — UNCHANGED
    integrations/    — UNCHANGED
  tui/
    workspace-wizard.ts — UPDATED: replace stack-picker with registry-picker + template choice
    repo-wizard.ts      — NEW: interactive prompts for repo add (URL/path) and scan
    template-wizard.ts  — NEW: interactive prompts for template new and edit
    stack-wizard.ts     — DELETED
    stack-edit.ts       — DELETED
~/.config/git-stacks/
  registry.yml         — NEW: flat list of registered repos (RepoRegistryEntry[])
  templates/           — NEW: one file per template, same pattern as workspaces/
    my-app.yml
```

### Pattern 1: Schema Addition in config.ts

**What:** Add three new Zod schemas following the exact existing pattern — `readYaml` + `writeYaml` + list function.
**When to use:** Any new persistent entity (registry entry, template).

```typescript
// Source: src/lib/config.ts existing pattern
export const RepoRegistryEntrySchema = z.object({
  name: z.string(),
  schema_version: z.string().default("1"),
  url: z.string().optional(),
  local_path: z.string(),
  default_branch: z.string().default("main"),
  type: RepoTypeSchema.default("other"),
})
export type RepoRegistryEntry = z.infer<typeof RepoRegistryEntrySchema>

export const RepoRegistrySchema = z.array(RepoRegistryEntrySchema).default([])

export const TemplateRepoSchema = z.object({
  repo: z.string(),          // registry name — not a path
  mode: z.enum(["trunk", "worktree"]).default("worktree"),
  base_branch: z.string().optional(),   // overrides registry default_branch
  branch_pattern: z.string().optional(), // e.g. "feature/<workspace-name>"
})
export type TemplateRepo = z.infer<typeof TemplateRepoSchema>

export const TemplateSchema = z.object({
  name: z.string(),
  schema_version: z.string().default("1"),
  description: z.string().optional(),
  repos: z.array(TemplateRepoSchema).default([]),
  hooks: HooksSchema.optional(),
  env: z.record(z.string()).optional(),
  env_file: z.string().optional(),
  files: FilesSchema,
  integrations: z.record(z.unknown()).optional(),
})
export type Template = z.infer<typeof TemplateSchema>
```

### Pattern 2: WorkspaceRepoSchema Migration

**What:** Replace `stack: z.string()` with `repo: z.string()` (registry name). Remove `stack` field entirely — zerover, no backward compat.
**Impact:** All existing workspace YAMLs with `stack:` field will fail Zod parse. This is intentional. The `listWorkspaces()` safeParse loop will log a warning and skip orphaned workspace YAMLs (CONF-01 already implements this).

```typescript
// BEFORE
export const WorkspaceRepoSchema = z.object({
  name: z.string(),
  stack: z.string(),
  // ...
})

// AFTER
export const WorkspaceRepoSchema = z.object({
  name: z.string(),
  repo: z.string(),          // registry name — replaces stack
  // ...
})
```

### Pattern 3: WorkspaceSchema Template Field

**What:** Add optional `template` field to WorkspaceSchema — informational, not live-coupled.

```typescript
export const WorkspaceSchema = z.object({
  // ... existing fields ...
  template: z.string().optional(),  // registry name of source template (informational)
  repos: z.array(WorkspaceRepoSchema).default([]),
})
```

### Pattern 4: Registry Resolution in workspace-ops.ts

**What:** Replace `loadWorkspaceStacks()` with `loadWorkspaceRepoRegistry()` — reads registry once, builds a `Map<name, RepoRegistryEntry>`.
**When to use:** In `openWorkspace`, `mergeWorkspace`, `cleanWorkspace`, `syncWorkspace` — anywhere that currently calls `loadWorkspaceStacks()`.

```typescript
// REPLACES: loadWorkspaceStacks() in workspace-ops.ts
function loadRegistryMap(): Map<string, RepoRegistryEntry> {
  const entries = readRegistry()
  const map = new Map<string, RepoRegistryEntry>()
  for (const entry of entries) map.set(entry.name, entry)
  return map
}
```

The key difference: `WorkspaceRepo.repo` is the registry name. `WorkspaceRepo.main_path` is still stored as an absolute path (snapshot at creation time). The registry is consulted for `default_branch` during workspace creation; `main_path` in the workspace YAML is the resolved path at creation time.

### Pattern 5: Branch Pattern Expansion

**What:** Simple string replacement at workspace creation time.
**When to use:** In workspace-wizard.ts when resolving `branch_pattern` from a template repo.

```typescript
// No external library needed — pure string replace
function expandBranchPattern(pattern: string, workspaceName: string): string {
  return pattern.replace(/<workspace-name>/g, workspaceName)
}

// Usage during workspace creation from template:
const branch = templateRepo.branch_pattern
  ? expandBranchPattern(templateRepo.branch_pattern, wsName)
  : templateRepo.base_branch ?? registryEntry.default_branch ?? "main"
```

### Pattern 6: --from Detection Order

**What:** `git-stacks new <name> --from <source>` resolves source type before routing to the right creation path.
**When to use:** In `workspace.ts` `new` command handler.

```typescript
// Detection order from CONTEXT.md (locked decision):
function detectFromSource(source: string): "url" | "local-path" | "template" {
  if (source.includes("://") || source.startsWith("git@")) return "url"
  if (existsSync(source) || existsSync(expandHome(source))) return "local-path"
  return "template"
}
```

### Pattern 7: open --recreate Flow

**What:** Diff current workspace config against current template state, show changes, confirm, apply.
**When to use:** In `workspace.ts` `open` command handler when `--recreate` option is present.

```typescript
// In src/commands/workspace.ts — consistent with Phase 2 pattern
program
  .command("open <name>")
  .option("--recreate", "Re-sync workspace from template (only if template: is set)")
  .option("--force", "Skip confirmation in --recreate")
  .action(async (name, opts) => {
    if (opts.recreate) {
      const ws = readWorkspace(name)
      if (!ws.template) {
        console.error(`Workspace '${name}' has no template: field — cannot use --recreate.`)
        process.exit(1)
      }
      // Diff + confirm lives in commands layer (NOT ops layer) — per Phase 2 pattern
      // Then call recreateWorkspace() in workspace-ops.ts
    }
    // ... existing open logic
  })
```

### Pattern 8: Searchable Repo Picker with @clack/prompts 0.9.x

**What:** @clack/prompts 0.9.x does not have a built-in autocomplete or filterable select. The searchable picker must be implemented using the available primitives.
**Implementation approach (Claude's discretion — recommended):**
- Use a two-step flow: `p.text` for search/filter input, then `p.select` or `p.multiselect` with the filtered results. Re-prompt if needed.
- Alternative: Accept a text prefix filter upfront, then show a multiselect of matching repos. This avoids complex state management.
- For small registries (< 20 repos), plain `p.multiselect` is acceptable. Add the filter step only when registry has > 20 repos (detect at runtime).

```typescript
// Recommended approach for workspace-wizard.ts
async function pickReposFromRegistry(
  registry: RepoRegistryEntry[],
  message: string
): Promise<RepoRegistryEntry[]> {
  if (registry.length <= 20) {
    // Plain multiselect — no filter needed
    const selected = await p.multiselect({
      message,
      options: registry.map(r => ({ value: r.name, label: r.name, hint: r.local_path })),
      required: true,
    })
    if (p.isCancel(selected)) cancel()
    return registry.filter(r => (selected as string[]).includes(r.name))
  }
  // Step-wise: filter text → filtered multiselect
  const filterRaw = await safeText({
    message: `${message} (type to filter, empty = show all)`,
  })
  if (p.isCancel(filterRaw)) cancel()
  const filter = (filterRaw as string).trim().toLowerCase()
  const filtered = filter
    ? registry.filter(r => r.name.toLowerCase().includes(filter))
    : registry
  if (filtered.length === 0) {
    p.log.warn(`No repos match '${filter}'.`)
    return []
  }
  const selected = await p.multiselect({
    message: `Select repos (${filtered.length} shown)`,
    options: filtered.map(r => ({ value: r.name, label: r.name, hint: r.url ?? r.local_path })),
    required: true,
  })
  if (p.isCancel(selected)) cancel()
  return registry.filter(r => (selected as string[]).includes(r.name))
}
```

### Pattern 9: Registry Storage

**Recommended (Claude's discretion):** Single flat file `~/.config/git-stacks/registry.yml` — array of `RepoRegistryEntry` objects. Rationale: simpler than per-repo files, consistent with the global config pattern. Templates use per-file storage (one per template) — consistent with workspaces pattern.

```typescript
// In src/lib/paths.ts — add these constants
export const REGISTRY_FILE = join(WS_CONFIG_DIR, "registry.yml")
export const TEMPLATES_DIR = join(WS_CONFIG_DIR, "templates")
```

```typescript
// In src/lib/config.ts — registry I/O
export function readRegistry(): RepoRegistryEntry[] {
  if (!existsSync(REGISTRY_FILE)) return []
  return readYaml(REGISTRY_FILE, RepoRegistrySchema)
}

export function writeRegistry(entries: RepoRegistryEntry[]) {
  writeYaml(REGISTRY_FILE, entries)
}
```

### Anti-Patterns to Avoid

- **Keeping StackSchema in config.ts as a "compatibility shim":** CONTEXT.md is explicit — zerover, no migration. Keeping Stack code adds dead weight and confuses future readers.
- **Live-coupling workspace to template:** Workspace YAML stores `template:` name as informational only. Do not re-read the template during normal `open`. Only `open --recreate` triggers template re-read.
- **Calling `loadWorkspaceStacks()` from updated ops:** This function references the deleted Stack model. It must be removed entirely and replaced with registry-based resolution. Any lingering call will cause a TypeScript error — treat compiler errors as a verification checklist.
- **Embedding paths in templates:** Templates store registry names (`repo: api`), not paths. Paths are in the registry. Embedding paths in templates defeats portability.
- **Using `existsSync` for symlink detection when writing env files:** The existing codebase uses `lstatSync` (not `existsSync`) for symlink detection — this is intentional (existsSync returns false for dangling symlinks). New code must follow the same pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML read/write with Zod validation | Custom serialization | `readYaml` + `writeYaml` + Zod pattern in `config.ts` | Already exists, handles error formatting, ensureDir |
| Corrupt file handling | Try/catch in list commands | `listWorkspaces()` pattern using `safeParse` | CONF-01 already implements warn-and-skip |
| Branch existence check | Custom git parsing | `checkBranchExists()` in `git.ts` | Already exists |
| Worktree creation | Custom git commands | `createWorktree()` in `git.ts` | Already exists, handles branch-exists vs new-branch cases |
| Hook execution | Custom child_process spawning | `runHooks()` in `lifecycle.ts` | Already exists, handles env injection |
| Repo type detection | File extension scanning | `detectRepoType()` in `detect.ts` | Already exists |
| Directory scanning for repos | Custom readdir logic | `scanForRepos()` in `detect.ts` | Already exists, one-level scan |
| Integration plugin invocation | Custom dispatch | `integrations` registry in `lib/integrations/index.ts` | Already exists, plug-in architecture |
| `~/` path expansion | Custom string replace | `expandHome()` from `paths.ts` | Already exists |
| Confirmation prompts | Custom readline | `p.confirm()` + `p.isCancel()` pattern | Phase 2 established this pattern consistently |
| Branch pattern expansion | Template engine library | Single `String.replace()` call | `<workspace-name>` is the only placeholder; no library needed |

**Key insight:** This phase is a refactor of an existing, well-structured codebase. The primary engineering discipline is identifying which existing functions to reuse unchanged, which to update, and which to delete — not building new infrastructure.

## Common Pitfalls

### Pitfall 1: WorkspaceRepoSchema `stack` → `repo` Field Migration

**What goes wrong:** Any workspace YAML written before Phase 3 has `stack: <name>` in each repo. After the schema change to `repo: <name>`, `WorkspaceSchema.safeParse()` will fail for these files. The `listWorkspaces()` function will warn and skip them — correct behavior for zerover. But test helpers that create workspace fixtures using the old schema shape will need updating.
**Why it happens:** Existing test fixtures in `workspace-ops.test.ts` construct workspace YAML directly using `WorkspaceRepoSchema` fields. After the rename, `stack: "my-stack"` must become `repo: "my-repo"`.
**How to avoid:** Update all test fixtures in the same task that changes `WorkspaceRepoSchema`. Run `bun test` after schema change to surface all breakage immediately.
**Warning signs:** TypeScript errors on `repo.stack` — the compiler will flag every call site.

### Pitfall 2: workspace-ops.ts Still References Stack Model

**What goes wrong:** `workspace-ops.ts` has `loadWorkspaceStacks()`, `mergeEnv(workspace, stacks)`, and `writeEnvFiles(workspace, stacks, ...)`. All of these take a `Map<string, Stack>`. After Stack deletion, these signatures must change.
**Why it happens:** `mergeEnv` and `writeEnvFiles` currently pull `env` and `env_file` from both the Stack and the Workspace. In the new model, only the Template (or Workspace itself) carries `env`. The Stack layer disappears.
**How to avoid:** In the new model, `mergeEnv` takes only `(workspace: Workspace, template?: Template)`. The planner must include a task that updates these function signatures before the command layer tasks.
**Warning signs:** Compiler error on `readStack(repo.stack)` — stack is gone.

### Pitfall 3: openWorkspace Stack-Level Hooks

**What goes wrong:** `openWorkspace` currently runs "Stack-level post_open" hooks from `for (const [stackName, stack] of stacks)`. In the new model, post_open hooks live on the Template, not on Stack. But the Workspace only stores a `template:` name — it does not re-read the template on open.
**Why it happens:** The design decision is that workspace config is a snapshot. This means template hooks must be copied into the workspace YAML at creation time, not re-read from the template file on every open.
**How to avoid:** During workspace creation (in workspace-wizard.ts), copy template hooks into `workspace.hooks`. The workspace becomes self-contained after creation.
**Warning signs:** Hooks defined on a template not running after workspace creation. Test: verify `ws.hooks.post_open` is populated in the written workspace YAML.

### Pitfall 4: git clone for REPO-01 Needs Correct Target Path

**What goes wrong:** `repo add <url>` must clone to a deterministic path within workspace_root (e.g., `{workspace_root}/main/{repo-name}`). If the path already exists, the command should error clearly — not silently overwrite.
**Why it happens:** The existing `getMainDir()` function in `paths.ts` returns `{workspace_root}/main`. The repo name for the local directory should be inferred from the URL (`basename(url, ".git")`). Collision must be detected before the clone starts.
**How to avoid:** Check `existsSync(targetPath)` before running `git clone`. If exists, error with suggestion to use a different name or register the existing path directly.
**Warning signs:** Silent overwrite or clone into wrong directory.

### Pitfall 5: --recreate Diff Requires Canonical Comparison

**What goes wrong:** `open --recreate` needs to compare current workspace repo config against current template state. A naïve object diff will flag unrelated fields (e.g., `task_path` is in workspace but not in template).
**Why it happens:** Workspace YAML is a snapshot with computed fields (`task_path`, `main_path`). Template YAML has logical fields (`repo`, `mode`, `branch_pattern`). They are not structurally identical.
**How to avoid:** Diff only the template-controlled fields: repo list membership, mode per repo, base_branch per repo, hooks, env, integrations. Do not diff `task_path` or `main_path` (those are computed at creation time).
**Warning signs:** `--recreate` always reports changes even when nothing has changed.

### Pitfall 6: Completion Generator References stack Commands

**What goes wrong:** `completion-generator.ts` walks the commander.js program tree to generate shell completions. After deleting `stackCommand`, the completion generator should automatically stop emitting stack completions — but any hardcoded stack-specific completions (dynamic workspace/stack name lookups in fish/bash) in `completion.ts` must be removed.
**Why it happens:** `src/commands/completion.ts` may have dynamic completions that read from `STACKS_DIR`. After the dir is orphaned, these completions would still try to read it.
**How to avoid:** Search for `STACKS_DIR` references in completion files and remove/replace with `TEMPLATES_DIR` equivalents.
**Warning signs:** Shell completions still suggest `stack` subcommand after deletion.

### Pitfall 7: @clack/prompts multiselect Returns Symbol on Cancel

**What goes wrong:** `p.multiselect()` returns a `Symbol` (the cancel symbol) when the user presses Escape. If the result is not checked with `p.isCancel()` before iterating, it throws `TypeError: cannot iterate over Symbol`.
**Why it happens:** This is a known quirk of @clack/prompts. The existing codebase handles it correctly with `if (p.isCancel(result)) cancel()`. New code must follow the same pattern.
**How to avoid:** Every `await p.*()` call must be followed by `if (p.isCancel(result)) cancel()`.
**Warning signs:** Unhandled TypeError on Escape keypress.

## Code Examples

Verified patterns from existing codebase:

### Registry YAML I/O (mirrors existing listWorkspaces pattern)
```typescript
// Source: src/lib/config.ts listWorkspaces() pattern
export function listRegistryEntries(): RepoRegistryEntry[] {
  if (!existsSync(REGISTRY_FILE)) return []
  try {
    const raw = readFileSync(REGISTRY_FILE, "utf-8")
    const parsed = RepoRegistrySchema.safeParse(parse(raw))
    if (parsed.success) return parsed.data
    console.error(`[git-stacks] Registry parse error: ${formatZodError(parsed.error)}`)
    return []
  } catch (err) {
    console.error(`[git-stacks] Cannot read registry: ${err}`)
    return []
  }
}
```

### Template YAML I/O (mirrors existing readStack/writeStack pattern)
```typescript
// Source: src/lib/config.ts stackPath/writeStack pattern
export function templatePath(name: string): string {
  return join(TEMPLATES_DIR, `${name}.yml`)
}

export function templateExists(name: string): boolean {
  return existsSync(templatePath(name))
}

export function readTemplate(name: string): Template {
  return readYaml(templatePath(name), TemplateSchema)
}

export function writeTemplate(template: Template) {
  ensureDir(TEMPLATES_DIR)
  writeYaml(templatePath(template.name), template)
}
```

### Commander subcommand pattern (mirrors stackCommand)
```typescript
// Source: src/commands/stack.ts pattern — use same structure for repo.ts and template.ts
export const repoCommand = new Command("repo").description("Manage repo registry")

repoCommand
  .command("list")
  .description("List registered repos")
  .action(() => { /* ... */ })
```

### Confirmation prompt pattern (Phase 2 established)
```typescript
// Source: src/commands/workspace.ts remove handler — established Phase 2 pattern
if (!opts.force && !opts.dryRun) {
  const ok = await p.confirm({
    message: `Remove repo '${name}' from registry?`,
    initialValue: false,
  })
  if (p.isCancel(ok) || !ok) {
    console.log("Cancelled.")
    return
  }
}
```

### git clone in Bun shell
```typescript
// Source: src/lib/git.ts pattern — Bun $ shell for git operations
export async function cloneRepo(url: string, targetPath: string): Promise<{ ok: boolean; error?: string }> {
  const result = await $`git clone ${url} ${targetPath}`.quiet().nothrow()
  if (result.exitCode !== 0) {
    return { ok: false, error: result.stderr.toString().trim() }
  }
  return { ok: true }
}
```

### safeText usage (existing pattern from tui/utils.ts)
```typescript
// Source: src/tui/workspace-wizard.ts — safeText wraps p.text to handle undefined on empty input
const nameRaw = await safeText({
  message: "Repo name (shown in registry)",
  validate: (v) => (!v.trim() ? "Required" : undefined),
})
if (p.isCancel(nameRaw)) cancel()
const name = (nameRaw as string).trim()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stack-coupled workspace creation | Registry-decoupled creation | Phase 3 | Workspace wizard must select from registry, not stacks list |
| `workspace.repos[i].stack` | `workspace.repos[i].repo` | Phase 3 | All existing workspace YAMLs become unparseable (intentional zerover) |
| `loadWorkspaceStacks()` in ops | `loadRegistryMap()` | Phase 3 | Ops layer resolves repo metadata from registry, not stacks |
| `stack *` commands | `repo *` + `template *` | Phase 3 | `src/commands/stack.ts` deleted; two new command files created |
| Stack-level hooks in workspace-ops | Template hooks copied to workspace at creation | Phase 3 | Workspace is self-contained after creation |
| `git-stacks clone` (old: workspace from remote branch) | `git-stacks clone <workspace>` (copy workspace config) | Phase 3 | Renamed semantic; `template clone` is separate command |

**Deprecated/outdated after Phase 3:**
- `StackSchema`, `StackRepo`, `Stack` types — deleted
- `stackPath()`, `stackExists()`, `readStack()`, `writeStack()`, `listStacks()` — deleted
- `loadWorkspaceStacks()` in workspace-ops.ts — deleted
- `src/commands/stack.ts` — deleted
- `src/tui/stack-wizard.ts` — deleted
- `src/tui/stack-edit.ts` — deleted
- `STACKS_DIR` constant in paths.ts — can be removed (or kept as dead code temporarily)

## Open Questions

1. **Registry storage: single flat file vs per-entry files**
   - What we know: Single `registry.yml` is simpler for atomic reads/writes. Per-entry files in `repos/` dir matches workspaces pattern and avoids full-file rewrite on every add/remove.
   - What's unclear: With a flat file, concurrent writes (two simultaneous `repo add` calls) could corrupt. In practice this CLI is single-user so concurrency is not a real concern.
   - Recommendation: Single `registry.yml` — simpler, consistent with global config pattern. Planner should lock this choice.

2. **Template `pre_create`/`post_create` hooks copied into workspace YAML at creation time vs re-read from template**
   - What we know: CONTEXT.md says workspace is a snapshot — not live-coupled to template. This implies hooks must be copied.
   - What's unclear: Only `hooks` needs copying — `env`, `files`, `integrations` also need to be captured as a snapshot to be truly self-contained.
   - Recommendation: Copy all template-level fields (hooks, env, env_file, files, integrations) into the workspace YAML at creation time. The `template:` field remains as provenance. This is the cleanest interpretation of "snapshot."

3. **TMPL-04: trunk repos ensuring correct base branch**
   - What we know: TMPL-04 says "ensures the correct base branch is accessible." For trunk repos, the workspace config just references `main_path`. If the main clone is on a different branch, it needs to be switched or a worktree at that branch needs to be created.
   - What's unclear: Switching the main clone's HEAD to a different branch could affect other workspaces using that trunk repo. Creating an extra worktree is safer but increases complexity.
   - Recommendation: Check current branch at `open` time; emit a warning if trunk repo is on wrong branch. Planner should decide whether to auto-fix (create a worktree at base_branch) or warn-only.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in, no separate install) |
| Config file | none — bun discovers `tests/**/*.test.ts` automatically |
| Quick run command | `bun test tests/lib/config.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DESIGN-01 | Decision document exists (doc artifact, not code) | manual-only | n/a | ❌ Wave 0: write decision doc |
| DESIGN-02 | Decision documented with backward-compat stance | manual-only | n/a | ❌ Wave 0: part of decision doc |
| REPO-01 | `RepoRegistryEntrySchema` parses URL entry correctly | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 |
| REPO-01 | `addRepo(url)` clones to correct path + writes registry | integration | `bun test tests/lib/registry.test.ts` | ❌ Wave 0 |
| REPO-02 | `scanForRepos()` still works (unchanged) | unit | `bun test tests/lib/detect.test.ts` | ✅ exists |
| REPO-02 | `repo scan` registers discovered repos into registry | integration | `bun test tests/lib/registry.test.ts` | ❌ Wave 0 |
| REPO-03 | `listRegistryEntries()` returns all entries | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 |
| REPO-03 | `removeRegistryEntry(name)` removes entry | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 |
| REPO-04 | Registry entry `default_branch` used when workspace created without override | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 |
| TMPL-01 | `TemplateSchema` parses template YAML correctly | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 |
| TMPL-01 | `writeTemplate`/`readTemplate`/`listTemplates` round-trip | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 |
| TMPL-02 | `expandBranchPattern("feature/<workspace-name>", "JIRA-123")` returns `"feature/JIRA-123"` | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 |
| TMPL-03 | Template hooks copied into workspace YAML at creation | unit | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 |
| TMPL-04 | Trunk repo base branch check at open time | unit | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 |
| TMPL-05 | `workspace clone` creates new workspace from existing (no template needed) | integration | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 |
| (schema migration) | Updated `WorkspaceRepoSchema` uses `repo:` not `stack:` | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 (update existing) |
| (ops migration) | `openWorkspace` resolves repo from registry (not stack) | integration | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 (update existing) |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/config.test.ts tests/lib/workspace-ops.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/registry.test.ts` — covers REPO-01 (clone), REPO-02 (scan+register), REPO-03 (list/remove), REPO-04 (default_branch)
- [ ] Update `tests/lib/config.test.ts` — add `RepoRegistryEntrySchema` + `TemplateSchema` parse tests; update `WorkspaceRepoSchema` tests to use `repo:` field
- [ ] Update `tests/lib/workspace-ops.test.ts` — update all fixtures to use `repo:` field; add tests for recreateWorkspace, template hook copying

## Sources

### Primary (HIGH confidence)
- Direct source code reading: `src/lib/config.ts`, `src/lib/workspace-ops.ts`, `src/lib/paths.ts`, `src/lib/git.ts`, `src/lib/detect.ts` — all internal patterns verified from source
- Direct source code reading: `src/commands/stack.ts`, `src/commands/workspace.ts`, `src/index.ts` — command registration patterns verified
- Direct source code reading: `src/tui/workspace-wizard.ts`, `src/tui/stack-wizard.ts`, `src/tui/workspace-clone.ts` — TUI wizard patterns verified
- Direct source code reading: `tests/lib/workspace-ops.test.ts`, `tests/lib/config.test.ts` — test patterns and fixture shapes verified
- `.planning/phases/03-design-and-conditional-implementation/03-CONTEXT.md` — locked decisions, all architectural choices

### Secondary (MEDIUM confidence)
- `package.json` — verified @clack/prompts version is 0.9.1 (not 1.1.0 — PWR-04 is v2 backlog)
- @clack/prompts 0.9.x API — verified from existing usage in codebase (safeText, p.text, p.select, p.multiselect, p.confirm, p.spinner, p.isCancel) — these are the only available primitives

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package.json and existing source; no new dependencies required
- Architecture: HIGH — all patterns derived from existing verified source code; schema changes are straightforward Zod additions
- Pitfalls: HIGH — derived from direct reading of code that will be changed; TypeScript compiler will surface most issues
- Test map: HIGH — derived from existing test file structure and bun:test patterns

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable — no fast-moving external dependencies; all libraries already in use)
