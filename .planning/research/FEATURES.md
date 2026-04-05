# Feature Research

**Domain:** CLI workspace manager — engine hardening & template labels (v0.17.0)
**Researched:** 2026-04-05
**Confidence:** HIGH (codebase analysis, known patterns)

## Feature Landscape

### Table Stakes (Users Expect These)

Features the milestone must deliver. Missing these = the hardening work is cosmetic.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Template labels propagate to workspace on creation | Template is the recipe; workspace is the instance — labels should mirror the template's classification without manual re-tagging | LOW | `TemplateSchema` already has `labels` field; workspace creation reads template → merge labels into new workspace YAML |
| Template `label add/remove/list/clear` commands | `workspace label *` already exists; users expect symmetry — templates need the same CLI surface | LOW | Parallel command family to the existing `label.ts`; reads/writes `Template.labels` |
| `--label` filter on `template list` | `workspace list --label` already works; same filter for templates is expected | LOW | `matchesLabels()` in `labels.ts` is already generic; wire to `listTemplates` + the `template list` command |
| Backward compatibility of existing workspace/template YAML | Users have config files on disk; any schema change must not break existing valid YAML | LOW | Zod defaults handle missing `labels` field — already covered by `z.array(LabelSchema).optional()` on both schemas |
| Rollback on partial workspace creation failure | Multi-step ops (worktree create × N repos) leave orphan worktrees if they fail mid-way; users expect either full success or clean state | HIGH | Requires tracking completed steps and running inverse operations in reverse order on error |
| Indexed lookup replaces directory scan for hot paths | `findWorkspaceFile()` and `findTemplateFile()` scan all YAML files on every lookup; at 50+ workspaces this is measurable; tool should feel instant | MEDIUM | In-memory index built on first access, invalidated on write; or on-disk index file at `~/.config/git-stacks/index.yml` |
| Integration plugin contract — capability fields | Runner calls `generate?`, `open`, `cleanup?`, `commands?` with no way to inspect which a plugin actually implements; contract must be declaratable | MEDIUM | Add `capabilities: Set<"generate" \| "open" \| "cleanup" \| "commands">` or make interface fields required with no-op defaults |
| DI seams on workspace-lifecycle and workspace-git | Extracted modules spawn git processes; `_exec` injectable pattern must be on the new modules, not just `lifecycle.ts` | LOW | Already partially done (v0.16.0 extraction); extend the established `_exec` object pattern |
| Structured logging beyond single `GS_DEBUG=1` | Debug output currently has labels (`[lifecycle]`) but no consistent field format; structured fields enable programmatic parsing | MEDIUM | `{ op, module, repo?, ms?, msg }` format to stderr; controlled by `GS_DEBUG=1` — not a separate logger |

### Differentiators (Competitive Advantage)

Features that make this milestone genuinely valuable beyond mechanical hardening.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Label-based workspace filtering across create/list/status | "List all workspaces tagged `agent`" or "open workspace with label `urgent`" — labels become a first-class org primitive, not just tags | LOW | Already works for `list`; extend `status`, shell completion for label values, TUI filter |
| Rollback log visible to user | When workspace creation fails mid-way, user sees "Rolling back: removed worktree for api, removed worktree for web" — not a silent mystery | LOW | `onProgress` callback carries rollback steps; same channel as forward progress |
| Index file enables offline inspection | `cat ~/.config/git-stacks/index.yml` lists all workspace names/branches without parsing individual files | LOW | Side-effect of building the index; no extra work |
| Plugin capability introspection via `integration list` | `git-stacks integration list` can show which capabilities each plugin has (generate, cleanup, commands) — useful for plugin authors and debugging | LOW | Read from `capabilities` field already on `Integration` interface |
| `GS_DEBUG` module filter (`GS_DEBUG=lifecycle,git`) | Filter debug output to specific modules instead of all-or-nothing | LOW | Parse `GS_DEBUG` value as comma-separated module names; `true` or `1` means all |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Label inheritance via template `includes` composition | "If my base template has labels, composed templates should inherit them" — sounds logical | `includes` already does union-merge of repos/hooks/env; labels on a composed template are intentionally set at the composed level, not inherited; silent inheritance would make label provenance opaque | Explicitly set labels on each template; document that includes does not propagate labels |
| On-disk index as primary config store | "Replace YAML files with an indexed database" — would speed up all lookups | YAML-per-entity is user-editable and inspectable; replacing it with a DB breaks the "edit your config in `$EDITOR`" contract that is central to the tool's UX | Keep YAML files as source of truth; add in-memory index as a read-cache layer only |
| Rollback via snapshot + restore | "Copy all YAML before each op, restore on failure" | YAML snapshots don't cover filesystem state (worktrees already created on disk); a snapshot-based approach gives false confidence | Track forward-progress steps explicitly and run inverses in reverse order — no snapshot needed |
| Plugin versioning / semver contracts | "Each integration declares which version of the Integration interface it targets" | Overkill for a single-process tool where plugins are shipped in the same repo; all integrations update with each release | Enforce the contract at TypeScript compile time via the `Integration` interface — if it compiles, it's compatible |
| Global label taxonomy / label registry | "Enforce that only predefined labels can be used" | Kills the low-friction "just add a label" workflow; most CLI tools let labels be freeform strings | Validate label format (already done via `LabelSchema` regex) but not label values; freeform is correct here |
| Async operation queue / saga engine | "Replace rollback with a proper saga pattern" | Saga engines (like Redux-Saga or xstate) are UI/server primitives; a CLI op is synchronous and short-lived; a saga adds a framework dependency with zero benefit | Simple try/catch + completed-step stack; inverse function per step; pure TypeScript |

## Feature Dependencies

```
[Template labels: CLI commands (template label add/remove/list/clear)]
    └──requires──> [TemplateSchema.labels field] (already exists in config.ts)

[Template labels: propagate to workspace on creation]
    └──requires──> [Template labels: CLI commands] (template must have labels to propagate)
    └──requires──> [workspace creation reads template labels and merges]

[--label filter on template list]
    └──requires──> [TemplateSchema.labels field]
    └──enhances──> [Template labels: CLI commands]

[Rollback on partial failure]
    └──requires──> [Step-tracking data structure] (completed-steps stack)
    └──enhances──> [workspace creation] (the most failure-prone multi-step op)
    └──enhances──> [Structured logging] (rollback steps visible via onProgress)

[Indexed config store]
    └──conflicts──> [scan-based lookup as canonical source] (index must be secondary / cache)
    └──enhances──> [workspace list], [template list] (faster for large registries)

[Integration plugin capability contract]
    └──requires──> [Integration interface update] (add `capabilities` or tighten optional fields)
    └──enhances──> [runner.ts] (can skip generate() call if capability absent without optional-chain)

[Broader DI seams]
    └──requires──> [workspace-lifecycle.ts, workspace-git.ts extracted] (already done in v0.16.0)
    └──enhances──> [test isolation for new ops]

[Structured logging fields]
    └──enhances──> [GS_DEBUG=1 existing output] (same channel, richer format)
    └──conflicts──> [human-readable progress] (must not change stdout; stderr only)
```

### Dependency Notes

- **Template labels → propagation requires CLI commands first:** The `git-stacks new` wizard needs template labels to exist to copy them. Template label CLI commands are the prerequisite.
- **Indexed config store must not replace YAML:** Index is a read-cache only. Writes always update YAML first, then invalidate the index. This preserves the "edit YAML directly" contract.
- **Rollback requires step tracking, not snapshots:** Each step in workspace creation (`createWorktree`, `copyFiles`, `runHooks`) must register an inverse before executing. On error, drain the stack in reverse.
- **Integration capability contract does not require plugin changes:** The `Integration` interface can declare required capabilities as a readonly field; TypeScript will enforce at compile time; existing integrations gain the field with a one-liner change.

## MVP Definition

### Launch With (v1 — this milestone)

- [ ] **Template label CLI** (`template label add/remove/list/clear`) — symmetry with workspace label commands; reads/writes `TemplateSchema.labels`
- [ ] **`--label` filter on `template list`** — reuse `matchesLabels()` from `labels.ts`
- [ ] **Template labels propagate on workspace creation** — in `workspace-ops.ts` / `workspace-lifecycle.ts` creation path, merge `template.labels` into the new `Workspace.labels` (union, no duplicates); new wizard step asks user to confirm/override inherited labels
- [ ] **Operation runner with rollback** — a thin `OperationRunner` type that wraps `runStep(forward, inverse)` calls; on error, drains inverse stack; exposed via `onProgress` callback for visibility; used by workspace creation path
- [ ] **In-memory index for workspace/template lookups** — module-level `Map<name, {data, filePath}>` built on first list call, invalidated on write; no on-disk index file required for v1
- [ ] **Integration capability contract** — add `capabilities: readonly string[]` (or typed enum) to `Integration` interface; runner uses it to skip `generate()` call guard; all 10 existing integrations declare their capabilities

### Add After Validation (v1.x)

- [ ] **Structured debug log fields** — `{ op, module, repo?, ms?, msg }` emitted to stderr under `GS_DEBUG=1`; replace current free-form strings
- [ ] **`GS_DEBUG` module filter** — `GS_DEBUG=lifecycle,git` to reduce noise during investigation
- [ ] **On-disk index file** — persist the in-memory index to `~/.config/git-stacks/index.yml` for startup speed; only needed once the workspace count grows large enough to matter

### Future Consideration (v2+)

- [ ] **TUI label management** — add/remove labels from workspace detail pane in the dashboard; depends on TUI input components already working
- [ ] **`--label` filter on `workspace new`** — open only workspaces matching a label set; only useful once users have many workspaces
- [ ] **Label completion** — shell completions offer existing label values for `--label` and `label add/remove` arguments; requires reading all labels from all workspace/template YAML at completion time

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Template label CLI commands | HIGH (symmetry, discoverability) | LOW (parallel to existing label.ts) | P1 |
| Template labels propagate on create | HIGH (reduces manual re-tagging) | LOW (read + merge in creation path) | P1 |
| `--label` filter on template list | MEDIUM (consistency) | LOW (matchesLabels() already exists) | P1 |
| Operation runner with rollback | HIGH (correctness, no orphan worktrees) | MEDIUM (step-tracking design, wiring) | P1 |
| In-memory config index | MEDIUM (performance at scale) | MEDIUM (invalidation on all write paths) | P1 |
| Integration capability contract | MEDIUM (plugin clarity, type safety) | LOW (interface field + 10 plugin updates) | P1 |
| Broader DI seams | MEDIUM (test isolation) | LOW (extend _exec pattern to more modules) | P2 |
| Structured log fields | LOW (developer ergonomics) | LOW (string format change in debug output) | P2 |
| GS_DEBUG module filter | LOW (debug ergonomics) | LOW (parse env var value) | P3 |
| On-disk index file | LOW (only matters at 50+ workspaces) | MEDIUM (persistence + invalidation) | P3 |

## Implementation Notes by Feature

### Template Labels → Workspace Propagation

The propagation logic belongs in `workspace-lifecycle.ts` `createWorkspace()` call site. Merge strategy: union (`[...new Set([...templateLabels, ...userProvidedLabels])]`). The new workspace wizard can show inherited labels and let the user remove any before creation. No new YAML field needed — `WorkspaceSchema.labels` already exists.

**Dependency on existing:** `TemplateSchema.labels` (exists), `WorkspaceSchema.labels` (exists), `LabelSchema` regex (exists), `matchesLabels()` (exists). Zero schema changes needed.

### Operation Runner with Rollback

The pattern:
```typescript
type Step = { name: string; undo: () => Promise<void> }
const completed: Step[] = []
// Before each forward step:
completed.push({ name: "created worktree for api", undo: () => removeWorktree(path) })
await createWorktree(path)
// On error:
for (const step of completed.reverse()) {
  onProgress?.(`Rolling back: ${step.name}`)
  await step.undo()
}
```
No library needed. The completed-step stack is the only state. This applies to `openWorkspace` (the most multi-step operation). Rollback should be best-effort — undo failures are logged but do not prevent the next undo step from running.

**Dependency on existing:** `onProgress?: ProgressCallback` already threads through workspace-lifecycle; rollback messages use the same channel.

### Indexed Config Store

An in-memory `Map` at module scope in `config.ts`:
```typescript
let workspaceIndex: Map<string, WorkspaceLookup> | null = null
function getWorkspaceIndex(): Map<string, WorkspaceLookup> { ... }
function invalidateWorkspaceIndex(): void { workspaceIndex = null }
```
`writeWorkspace()` calls `invalidateWorkspaceIndex()`. `findWorkspaceFile()` uses `getWorkspaceIndex()` instead of scanning. For tests, `invalidateWorkspaceIndex()` can be exported and called in `beforeEach`. No on-disk state needed for v1.

**Dependency on existing:** `findWorkspaceFile()`, `findTemplateFile()`, `writeWorkspace()`, `writeTemplate()` in `config.ts`.

### Integration Plugin Capability Contract

Current `Integration` interface has optional `generate?`, `cleanup?`, `commands?`. The contract gap is that runner.ts uses optional chaining to guard calls — callers cannot inspect intent vs implementation. Adding `capabilities`:

```typescript
export type IntegrationCapability = "generate" | "cleanup" | "commands" | "window-detect"

export interface Integration {
  capabilities: readonly IntegrationCapability[]
  // ... existing fields
}
```

Runner uses `integration.capabilities.includes("generate")` instead of `integration.generate != null`. This is purely declarative — the function fields remain optional for TypeScript structural typing, but plugins are now required to declare what they implement.

**Dependency on existing:** `Integration` interface in `types.ts`; all 10 plugin files in `src/lib/integrations/`.

## Sources

- Codebase analysis: `src/lib/config.ts` (schemas, scan-based lookup), `src/lib/labels.ts`, `src/commands/label.ts`, `src/lib/integrations/types.ts`, `src/lib/integrations/runner.ts`
- Project requirements: `.planning/PROJECT.md` (v0.17.0 milestone goals)
- Pattern: completed-step rollback is standard CLI multi-step operation practice (e.g., Homebrew formula install, Terraform apply rollback concept)
- Pattern: in-memory read-cache with write-invalidation is the standard approach for file-backed config in CLI tools (e.g., git's packed-refs vs loose refs; npm's shrinkwrap cache)

---
*Feature research for: CLI workspace manager — engine hardening & template labels*
*Researched: 2026-04-05*
