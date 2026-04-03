# Phase 60: Labels — Research

**Researched:** 2026-04-03

## Objective

Determine the implementation approach for workspace labels: schema additions, CLI CRUD subcommand, list filtering, TUI rendering, TUI filter extension, and group-by-label toggle.

## Findings

### 1. Schema Integration Points

**WorkspaceSchema** (config.ts line 143): Add `labels` field after `ports`. The schema currently has 15 fields. Adding `labels: z.array(z.string().regex(...)).optional()` is additive — existing YAML files without `labels` will parse fine (field is optional, defaults to undefined).

**TemplateSchema** (config.ts line 75): Same field addition after `ports`. Template labels are unioned onto workspace at creation time (D-14 from CONTEXT.md).

**Label regex**: `^[A-Za-z0-9._:-]+$` — matches NameSchema pattern but adds colon for namespacing (`sprint:14`). No spaces, no path separators.

**Backward compatibility**: Zero risk. Field is optional with no default. Existing YAML files parse unchanged.

### 2. CLI Label Subcommand

**Pattern**: New `src/commands/label.ts` file (D-07). Follows existing command structure:
- `repoCommand` in `src/commands/repo.ts` — subcommand pattern with add/remove/list
- `templateCommand` in `src/commands/template.ts` — subcommand pattern

**Commands**:
- `git-stacks label add <workspace> <label...>` — read workspace, validate labels, dedupe, write
- `git-stacks label remove <workspace> <label...>` — read workspace, filter out labels, write
- `git-stacks label list <workspace>` — read workspace, print labels
- `git-stacks label clear <workspace>` — read workspace, set labels to [], write

**Registration**: Add `labelCommand` to `src/index.ts` following the same pattern as `repoCommand`.

### 3. CLI List Filtering

**Current list command** (workspace.ts line 262-308): Reads all workspaces, gets list info, sorts, prints. Adding `--label` filter is a pre-sort filter step.

**`--label` option**: Commander.js repeatable option pattern (same as `--template` on `new`):
```ts
.option("--label <tag>", "Filter by label (repeatable for AND)", (val, arr) => { arr.push(val); return arr }, [])
```

**AND logic**: Filter workspaces where every `--label` value appears in `workspace.labels`.

**Shared utility** (STATE.md constraint): `matchesLabels(workspace: Workspace, terms: string[]): boolean` — reusable by both CLI and TUI. Lives in a utility location (either config.ts or a new labels.ts helper).

### 4. CLI `--label` on `new`

**Current new command** (workspace.ts line 104-116): Passes `name`, `from`, `template` to `runWorkspaceNew`. Need to add `--label` option and pass through.

**Workspace wizard** (workspace-wizard.ts): Labels prompt placed after repos, before hooks (D-08). Comma-separated text input, empty = skip.

### 5. TUI WorkspaceRow Label Rendering

**Current layout** (WorkspaceRow.tsx):
```
prefix(5) | status(2) | name(variable) | branch(variable) | counts(variable) | message/age
```

**Label placement** (D-01): Labels render after branch, before counts. This means inserting a new `<text>` element between the branch and counts columns.

**Styling** (D-02): Dim gray brackets with white text: `[backend] [sprint:14]`.

**Truncation** (D-03): Max 2 labels shown, then `+N` overflow. Need width calculation for label column.

**Width calculation**: The existing responsive width system uses `dims().width` with fixed offsets. Labels get a slice of the remaining space. Need to add `labelsWidth` memo that computes available space after name + branch columns.

### 6. TUI Filter Extension

**Current filter** (App.tsx line 121-125):
```ts
const filteredEntries = createMemo(() => {
  const f = tabFilter.workspaces[0]().toLowerCase()
  if (!f) return entries()
  return entries().filter((e) => e.workspace.name.toLowerCase().includes(f))
})
```

**Extension** (D-09, D-10, D-11): Match against name OR any label. Optional `label:` prefix for label-only filtering.

```ts
return entries().filter((e) => {
  const name = e.workspace.name.toLowerCase()
  const labels = e.workspace.labels ?? []
  if (f.startsWith("label:")) {
    const labelTerm = f.slice(6)
    return labels.some(l => l.toLowerCase().includes(labelTerm))
  }
  return name.includes(f) || labels.some(l => l.toLowerCase().includes(f))
})
```

### 7. TUI Group-by-Label Toggle

**Keybinding** (D-06): `g` key in list view, workspaces tab only. Ephemeral toggle state (not persisted).

**Grouped view** (from FEATURES.md and CONTEXT.md):
- Group header rows (non-focusable) with label name
- Tree-style connectors (`├─`, `└─`)
- Workspaces appear in each group they belong to
- `[unlabeled]` section at bottom for workspaces with no labels

**Implementation approach**: 
- New `groupedByLabel` signal (boolean, default false)
- When grouped, `filteredEntries` is replaced by a grouped structure: `{ label: string; entries: WorkspaceEntry[] }[]`
- WorkspaceList needs to render group headers (non-focusable) interspersed with WorkspaceRows
- Flat cursor: up/down moves linearly, skipping group header rows (D-04)
- Actions affect the workspace itself, all appearances update (D-05)

**Complexity note**: This is the most complex part. The WorkspaceList currently renders a flat array. Group-by requires either:
1. A combined flat array of `(header | workspace)` items with cursor mapping
2. A nested For loop with flattened index tracking

Option 1 is simpler for cursor management.

### 8. Test Strategy

**Schema tests** (tests/lib/config.test.ts): Add label validation tests — valid labels, invalid characters, optional field, empty array.

**Label CRUD tests**: New test file `tests/lib/label.test.ts` or add to config.test.ts. Test add/remove/list/clear operations on workspace YAML.

**Filter tests**: Test `matchesLabels` utility function — AND logic, case sensitivity, empty labels.

**No TUI integration tests needed** (TUI tests are not the project pattern — unit tests on logic functions).

### 9. Completion

Shell completion for `label` subcommand is auto-generated by `completion-generator.ts` which walks the commander.js program tree. No manual completion work needed — just registering the command is sufficient.

Dynamic workspace name completion for `label add <workspace>` will work via the existing dynamic completion system (Phase 35).

### 10. Dependency Analysis

**Phase 58 dependency**: The ROADMAP says Phase 60 depends on Phase 58 (ahead/behind tracking). The CONTEXT.md decision D-01 says labels render "after `↑N ↓N`". However, the schema and CLI work are fully independent. The TUI rendering order is the only coupling — and can be positioned correctly even if Phase 58 is not yet implemented (just position after where ahead/behind will go, or after branch if ahead/behind columns don't exist yet).

**Risk**: Low. All changes are additive. No migration needed.

## Plan Decomposition

Recommended: **4 plans in 2 waves**

**Wave 1 (parallel)**:
- Plan 01: Schema + label utility — Add `labels` field to schemas, create `matchesLabels` utility, add schema tests
- Plan 02: Label CLI subcommand — New `src/commands/label.ts` with add/remove/list/clear, register in index.ts

**Wave 2 (depends on Wave 1)**:
- Plan 03: CLI integration — `--label` filter on `list`, `--label` flag on `new`, wizard labels prompt
- Plan 04: TUI labels — WorkspaceRow label tags, filter extension, group-by-label toggle with `g` key

Wave 2 depends on Wave 1 because:
- Plan 03 uses `matchesLabels` from Plan 01
- Plan 04 uses the schema changes from Plan 01 and the label rendering needs the schema

## RESEARCH COMPLETE
