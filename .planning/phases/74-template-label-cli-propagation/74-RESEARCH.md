# Phase 74: Template Label CLI & Propagation - Research

**Researched:** 2026-04-05 [VERIFIED: phase context]
**Domain:** CLI label management, template/workspace YAML persistence, and template-to-workspace snapshot propagation [VERIFIED: codebase grep]
**Confidence:** HIGH [VERIFIED: codebase grep]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Template label CRUD lives under `git-stacks template label add|remove|list|clear`, not as new top-level commands.
- **D-02:** Template label add/remove/list/clear behavior should mirror existing workspace label behavior, including regex validation, deduplication, empty-state output, and direct YAML persistence.
- **D-03:** `git-stacks template list --label <label>` uses exact label matching with repeatable `--label` flags.
- **D-04:** Multiple `--label` flags use AND semantics, matching the existing workspace list contract.
- **D-05:** Label propagation is owned by workspace creation and clone flows, so labels are written into workspace YAML at creation time rather than resolved dynamically later.
- **D-06:** Template labels are unioned with user-provided workspace labels during workspace creation.
- **D-07:** Workspace clone preserves labels from the source workspace in the cloned workspace YAML.
- **D-08:** Composed and included templates are part of the Phase 74 propagation contract.
- **D-09:** `composeTemplates()` must carry merged template labels so template-based creation paths using `includes` or multi-template composition propagate labels consistently.

### Claude's Discretion
- Whether label matching is implemented by generalizing `matchesLabels()` or by adding a template-specific helper with identical behavior
- Whether template label command logic is extracted into shared helpers or duplicated lightly from workspace label commands
- Exact CLI formatting of template list rows when labels are filtered out, as long as existing list readability is preserved
- Test file split between command-level coverage and lower-level helper/composition coverage

### Deferred Ideas (OUT OF SCOPE)
- TUI template/workspace label editing in the dashboard — covered by future requirements TLBL-08 and TLBL-09
- Shell completion for existing label values — covered by future requirement TLBL-10
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TLBL-01 | User can add labels to a template via `git-stacks template label add <template> <label...>` | Add nested `template label` subcommands in [`src/commands/template.ts`](/home/nnex/dev/prj/git-stacks/src/commands/template.ts#L9) and mirror validation/persistence from [`src/commands/label.ts`](/home/nnex/dev/prj/git-stacks/src/commands/label.ts#L9). [VERIFIED: codebase grep] |
| TLBL-02 | User can remove labels from a template via `git-stacks template label remove <template> <label...>` | Reuse the same regex, dedupe, and empty-state semantics already used for workspaces, but switch storage from `readWorkspace/writeWorkspace` to `readTemplate/writeTemplate`. [VERIFIED: codebase grep] |
| TLBL-03 | User can list labels on a template via `git-stacks template label list <template>` | Template YAML already round-trips `labels` through `TemplateSchema`, `readTemplate()`, and `writeTemplate()`. [VERIFIED: codebase grep] |
| TLBL-04 | User can clear all labels from a template via `git-stacks template label clear <template>` | Clearing should remove the field (`labels: undefined`) for parity with workspace label commands. [VERIFIED: codebase grep] |
| TLBL-05 | User can filter templates by label via `git-stacks template list --label <label>` | Generalize the existing exact-match AND helper in [`src/lib/labels.ts`](/home/nnex/dev/prj/git-stacks/src/lib/labels.ts#L1) and apply it inside `template list`, mirroring workspace `list --label`. [VERIFIED: codebase grep] |
| TLBL-06 | Template labels propagate to workspace on creation (union merge with user-provided labels) | Direct template creation already unions `template.labels` with CLI/prompted labels in [`src/tui/workspace-wizard.ts`](/home/nnex/dev/prj/git-stacks/src/tui/workspace-wizard.ts#L377); the missing work is making `composeTemplates()` merge labels so included/multi-template paths reach that union point. [VERIFIED: codebase grep] |
| TLBL-07 | Workspace clone copies labels from source workspace | `runWorkspaceClone()` spreads the source workspace into the new object and only overrides `name`, `branch`, `created`, `repos`, and optional `settings`, so `labels` are already preserved; add an explicit test to lock that in. [VERIFIED: codebase grep] |
</phase_requirements>

## Summary

Phase 74 is an extension of the existing label subsystem, not a new subsystem. `TemplateSchema` already accepts `labels`, template YAML already reads/writes through `readTemplate()` and `writeTemplate()`, workspace listing already defines the exact-match AND contract for repeatable `--label` flags, and workspace creation already unions template labels into the saved workspace YAML. [VERIFIED: codebase grep]

The actual implementation gap is narrow: `src/commands/template.ts` has no nested `label` command group and no `--label` filter on `template list`, `src/lib/labels.ts` is typed only for `Workspace`, and `src/lib/composition.ts` currently merges repos/hooks/env/files/integrations/ports but drops labels entirely. [VERIFIED: codebase grep] That last omission is the only propagation bug surface for composed or included templates. [VERIFIED: codebase grep]

Planning should therefore target three code paths only: CLI template label CRUD, shared template/workspace label filtering, and composition-time label merging before the existing workspace-wizard snapshot step. [VERIFIED: codebase grep] Do not expand scope into TUI label editing, shell completions, or runtime re-resolution of template labels after workspace creation. [VERIFIED: phase context]

**Primary recommendation:** Reuse the workspace label command semantics exactly, generalize `matchesLabels()` to any `{ labels?: string[] }`, and add label merging to `composeTemplates()` so every create path flows through the existing snapshot union in `runWorkspaceNew()`. [VERIFIED: codebase grep]

## Project Constraints (from CLAUDE.md)

- Use `bun run src/index.ts` to run the CLI, `bun run test` for the full suite, and `bun run typecheck` for compile validation. [VERIFIED: CLAUDE.md]
- Do not use `bun test tests/` directly; the repo requires `scripts/test-runner.ts` because `mock.module()` pollution breaks shared-process runs. [VERIFIED: CLAUDE.md]
- Bun executes TypeScript directly; there is no build step for this repo. [VERIFIED: CLAUDE.md]
- Production code under `src/` must use relative imports; the `@/*` alias is test-only. [VERIFIED: CLAUDE.md]
- All template/workspace YAML I/O must stay in `src/lib/config.ts` through the paired `read*`/`write*` helpers and their atomic write path. [VERIFIED: CLAUDE.md]
- Workspace/template lookup matches the YAML `name` field rather than filename, so plan against entity-name semantics instead of path-based assumptions. [VERIFIED: CLAUDE.md]
- `safeText()` is the required prompt wrapper for text input in TUI flows. [VERIFIED: CLAUDE.md]
- The repo must preserve backward compatibility for existing YAML files. [VERIFIED: CLAUDE.md]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `commander` | `14.0.3` (published 2026-01-31) [VERIFIED: npm registry] | CLI command tree, nested `template label` subcommands, repeatable `--label` parsing. [VERIFIED: codebase grep] | The repo already defines every CLI surface with Commander, and Commander documents subcommands plus variadic args passed as arrays, which matches the existing workspace label command shape. [VERIFIED: codebase grep] [CITED: https://github.com/tj/commander.js] |
| `zod` | `4.3.6` (published 2026-01-22) [VERIFIED: npm registry] | Schema validation for template/workspace YAML, including label regex enforcement. [VERIFIED: codebase grep] | `TemplateSchema` and `WorkspaceSchema` already share the `LabelSchema` regex, so no new validation layer is needed. [VERIFIED: codebase grep] |
| `yaml` | `2.8.3` (published 2026-03-21) [VERIFIED: npm registry] | YAML parse/stringify for persisted templates and workspaces. [VERIFIED: codebase grep] | All label persistence already flows through `readTemplate()/writeTemplate()` and `readWorkspace()/writeWorkspace()`, which in turn use the YAML helpers in `src/lib/config.ts`. [VERIFIED: codebase grep] |
| `bun` | `1.3.10` locally installed. [VERIFIED: local env] | Runtime for CLI execution and test runner execution. [VERIFIED: CLAUDE.md] | The repo is Bun-native and ships `src/index.ts` directly as the CLI entrypoint. [VERIFIED: codebase grep] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bun:test` | Bundled with Bun `1.3.10`. [VERIFIED: local env] | Unit/integration test assertions for command/lib/TUI coverage. [VERIFIED: codebase grep] | Use for new template-label command tests, composition label-merge tests, and clone preservation tests. [VERIFIED: codebase grep] |
| `scripts/test-runner.ts` | Repo-local custom runner. [VERIFIED: codebase grep] | Isolates integration tests that would otherwise leak `mock.module()` state. [VERIFIED: codebase grep] | Use for full-suite validation; individual targeted files can still run with `bun test <file>`. [VERIFIED: CLAUDE.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Generalizing `matchesLabels()` to a label-bearing structural type. [VERIFIED: codebase grep] | Adding a separate template-only filter helper. [ASSUMED] | A template-only helper would work, but it creates two places to drift on exact-match, AND, and case-sensitive behavior that Phase 60 deliberately centralized. [VERIFIED: codebase grep] |
| Shared template label CRUD helper functions. [ASSUMED] | Light duplication inside `src/commands/template.ts`. [ASSUMED] | Both are viable under the discretion budget; shared helpers reduce drift, while light duplication keeps the change smaller. The plan should decide this explicitly. [VERIFIED: phase context] |

**Installation:**
```bash
# No new packages are required for Phase 74.
```

**Version verification:** Current versions were confirmed with `npm view commander version`, `npm view zod version`, `npm view yaml version`, and `npm view typescript version`, plus `bun --version` for the runtime. [VERIFIED: npm registry] [VERIFIED: local env]

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── commands/
│   └── template.ts          # nested template label CRUD + template list filter
├── lib/
│   ├── labels.ts            # shared exact-match AND helper for any label-bearing entity
│   ├── composition.ts       # merge labels across includes and multi-template composition
│   └── config.ts            # template/workspace read/write + schema validation
└── tui/
    ├── workspace-wizard.ts  # existing snapshot union point for template + user labels
    └── workspace-clone.ts   # existing source-workspace label preservation path

tests/
├── commands/                # template label CRUD + template list filter integration tests
├── lib/                     # generalized label helper + composition label merge tests
└── tui/                     # workspace clone preservation test
```
[VERIFIED: codebase grep]

### Pattern 1: Mirror Workspace Label CRUD Under `template label`
**What:** Add a nested `label` command group to `templateCommand` and mirror the workspace label command semantics exactly: same regex, same dedupe behavior, same empty-state messages, same YAML write behavior. [VERIFIED: phase context] [VERIFIED: codebase grep]

**When to use:** For TLBL-01 through TLBL-04 only; do not create a second top-level command in `src/index.ts`. [VERIFIED: phase context] [VERIFIED: codebase grep]

**Example:**
```typescript
const templateLabelCommand = new Command("label")
  .description("Manage template labels")

templateLabelCommand
  .command("add <template> <labels...>")
  .action((templateName: string, labels: string[]) => {
    labels.forEach(validateLabel)
    const tpl = readTemplate(templateName)
    const merged = [...new Set([...(tpl.labels ?? []), ...labels])]
    writeTemplate({ ...tpl, labels: merged })
  })

templateCommand.addCommand(templateLabelCommand)
```
Source pattern: workspace label CRUD in [`src/commands/label.ts`](/home/nnex/dev/prj/git-stacks/src/commands/label.ts#L25). [VERIFIED: codebase grep] Commander supports nested subcommands and variadic args arrays. [CITED: https://github.com/tj/commander.js]

### Pattern 2: Keep Label Filtering Exact, Repeatable, and Shared
**What:** Reuse the workspace contract: each `--label` flag appends another exact label term, and all terms must match. [VERIFIED: phase context] [VERIFIED: codebase grep]

**When to use:** For `template list --label`, and for any future template-side label filtering surfaces that need parity with workspace filtering. [VERIFIED: phase context]

**Example:**
```typescript
type LabeledEntity = { labels?: string[] }

export function matchesLabels(entity: LabeledEntity, terms: string[]): boolean {
  if (terms.length === 0) return true
  const labels = entity.labels ?? []
  return terms.every(term => labels.includes(term))
}
```
Source pattern: workspace list currently calls `matchesLabels(ws, opts.label)` with repeatable Commander flags. [VERIFIED: codebase grep]

### Pattern 3: Propagate Labels at Snapshot Boundaries, Not at Read Time
**What:** Labels must be materialized into workspace YAML during creation/clone flows. [VERIFIED: phase context] Existing `runWorkspaceNew()` already unions template labels with CLI/prompted labels before writing the workspace, and `runWorkspaceClone()` already preserves labels by spreading the source workspace into the new object. [VERIFIED: codebase grep]

**When to use:** For all creation paths, including `--from <template>`, interactive template selection, and CLI multi-template composition via `--template`. [VERIFIED: codebase grep]

**Example:**
```typescript
// composition.ts
function mergeLabels(templates: Template[]): string[] | undefined {
  const merged = [...new Set(templates.flatMap(tpl => tpl.labels ?? []))]
  return merged.length > 0 ? merged : undefined
}

// workspace-wizard.ts
if (template?.labels?.length) {
  labels = [...new Set([...template.labels, ...labels])]
}
```
Source pattern: the union already exists in [`src/tui/workspace-wizard.ts`](/home/nnex/dev/prj/git-stacks/src/tui/workspace-wizard.ts#L377); composition currently lacks the `mergeLabels()` step. [VERIFIED: codebase grep]

### Anti-Patterns to Avoid
- **Do not add live template-label inheritance to workspace reads:** snapshot semantics are locked, and `Workspace` YAML is supposed to become the source of truth after creation. [VERIFIED: phase context] [VERIFIED: codebase grep]
- **Do not reimplement YAML mutation with manual string edits:** `writeTemplate()` and `writeWorkspace()` already provide atomic validated persistence. [VERIFIED: CLAUDE.md] [VERIFIED: codebase grep]
- **Do not “fix” propagation in only one creation path:** direct-template creation already works; the actual missing path is composed/included templates because `composeTemplates()` omits `labels`. [VERIFIED: codebase grep]
- **Do not couple this phase to TUI template label editing or shell completion:** both were explicitly deferred. [VERIFIED: phase context]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Template label persistence | Manual YAML string mutation. [ASSUMED] | `readTemplate()` + `writeTemplate()` in `src/lib/config.ts`. [VERIFIED: codebase grep] | The config layer already parses with Zod and writes atomically via temp file + fsync + rename. [VERIFIED: codebase grep] |
| Template label filter semantics | A second, slightly different label matcher. [VERIFIED: phase context] | Generalized `matchesLabels()` in `src/lib/labels.ts`. [VERIFIED: codebase grep] | Workspace filtering, tests, and prior label decisions already define exact-match AND behavior there. [VERIFIED: codebase grep] |
| Propagation for includes/composed templates | Ad hoc label union inside each wizard branch. [VERIFIED: codebase grep] | `composeTemplates()` merging labels once, then letting `runWorkspaceNew()` perform the existing final union with user labels. [VERIFIED: codebase grep] | This keeps one composition truth and one snapshot-write truth. [VERIFIED: codebase grep] |

**Key insight:** The phase is mostly about routing existing semantics through missing template surfaces; the only genuinely new logic is label accumulation during composition. [VERIFIED: codebase grep]

## Common Pitfalls

### Pitfall 1: Direct Template Creation Passes, But Includes/Multi-Template Creation Silently Drops Labels
**What goes wrong:** Testing only `--from <template>` or interactive single-template creation makes propagation look complete while composed templates still lose labels. [VERIFIED: codebase grep]
**Why it happens:** `runWorkspaceNew()` unions `template.labels`, but `composeTemplates()` never returns a `labels` field today. [VERIFIED: codebase grep]
**How to avoid:** Add label merging to `composeTemplates()` and cover both `includes` and multiple `--template` names in tests. [VERIFIED: phase context] [VERIFIED: codebase grep]
**Warning signs:** A template YAML contains labels, a workspace created from that template directly gets them, but the same template when composed or included does not. [VERIFIED: codebase grep]

### Pitfall 2: Runtime Re-Sync Work Accidentally Breaks Snapshot Semantics
**What goes wrong:** A planner might try to update `workspace open --recreate` so later template label edits backfill existing workspaces. [VERIFIED: codebase grep]
**Why it happens:** `open --recreate` already re-syncs hooks/env/files/integrations/repos from the template, which can tempt feature creep into labels. [VERIFIED: codebase grep]
**How to avoid:** Keep Phase 74 scoped to create/clone-time propagation only, and leave existing workspaces untouched after creation. [VERIFIED: phase context]
**Warning signs:** Any plan item mentions `open --recreate`, retroactive relabeling, or reading template labels while listing workspaces. [VERIFIED: codebase grep]

### Pitfall 3: Validation Rules Drift Between Template and Workspace Commands
**What goes wrong:** Template labels might accept or reject values differently from workspace labels. [VERIFIED: phase context]
**Why it happens:** Workspace label commands use a local `LABEL_REGEX`, while schema validation lives separately in `LabelSchema`; copying without centralizing can drift. [VERIFIED: codebase grep]
**How to avoid:** Either extract a shared label validator or at minimum reuse the exact same regex literal and test invalid-label behavior on the template CLI. [VERIFIED: codebase grep]
**Warning signs:** Template-label tests pass while schema tests reject the same YAML, or vice versa. [VERIFIED: codebase grep]

## Code Examples

Verified patterns from current repo surfaces:

### Repeatable Exact-Match Label Filtering
```typescript
program
  .command("list")
  .option("--label <tag>", "Filter by label (repeatable, AND logic)", (val, arr) => {
    arr.push(val)
    return arr
  }, [] as string[])
  .action((opts) => {
    const filtered = opts.label.length > 0
      ? workspaces.filter(ws => matchesLabels(ws, opts.label))
      : workspaces
  })
```
Source: [`src/commands/workspace.ts`](/home/nnex/dev/prj/git-stacks/src/commands/workspace.ts#L280) and [`src/lib/labels.ts`](/home/nnex/dev/prj/git-stacks/src/lib/labels.ts#L1). [VERIFIED: codebase grep]

### Snapshot Union During Workspace Creation
```typescript
let labels = normalizeLabels(cliLabels ?? [])
if (labels.length === 0) {
  labels = normalizeLabels(labelsStr.split(","))
}
if (template?.labels?.length) {
  labels = [...new Set([...template.labels, ...labels])]
}
```
Source: [`src/tui/workspace-wizard.ts`](/home/nnex/dev/prj/git-stacks/src/tui/workspace-wizard.ts#L377). [VERIFIED: codebase grep]

### Clone Preservation by Copy-Forward
```typescript
const { cmux_workspace_id: _, settings: _existingSettings, ...restNoSettings } = source
const newWorkspace = {
  ...restNoSettings,
  name: newName,
  branch: newBranch,
  created: new Date().toISOString().split("T")[0],
  repos: newRepos,
}
```
Source: [`src/tui/workspace-clone.ts`](/home/nnex/dev/prj/git-stacks/src/tui/workspace-clone.ts#L157). [VERIFIED: codebase grep]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workspace-only label CRUD under top-level `git-stacks label`. [VERIFIED: codebase grep] | Keep workspace CRUD as-is, but add template CRUD under nested `git-stacks template label ...` for domain-local discoverability. [VERIFIED: phase context] | Phase 74 decision D-01 on 2026-04-05. [VERIFIED: phase context] | Preserves existing CLI while extending the template domain surface without another top-level command. [VERIFIED: phase context] |
| Label propagation handled only by single-template workspace creation. [VERIFIED: codebase grep] | Propagation must cover composed and included templates by merging labels in `composeTemplates()` before the existing snapshot union. [VERIFIED: phase context] | Phase 74 decisions D-08 and D-09 on 2026-04-05. [VERIFIED: phase context] | Ensures `--template a --template b`, `includes`, and interactive template creation all behave identically. [VERIFIED: codebase grep] |
| Retroactive inheritance would couple workspace reads to template state. [ASSUMED] | Snapshot-copy labels into workspace YAML at creation/clone time and leave later template edits isolated. [VERIFIED: phase context] [VERIFIED: codebase grep] | Locked since Phase 60 D-14 and repeated in milestone state. [VERIFIED: phase context] [VERIFIED: codebase grep] | Avoids hidden drift and keeps workspace YAML as the post-creation source of truth. [VERIFIED: phase context] |

**Deprecated/outdated:**
- Dynamic template-label resolution after workspace creation is out of bounds for this phase and contradicts locked snapshot semantics. [VERIFIED: phase context]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A separate template-only label matcher would technically work as an alternative to a generalized helper. | Standard Stack / Alternatives Considered | Low — affects code organization only, not CLI behavior. |
| A2 | Shared helper extraction for template label CRUD is optional rather than mandatory. | Standard Stack / Alternatives Considered | Low — affects implementation shape and task count, not requirements coverage. |
| A3 | Manual YAML string mutation is what an implementer might otherwise hand-roll here. | Don't Hand-Roll | Low — only used to explain what not to do. |
| A4 | Retroactive inheritance is a tempting but possible alternative architecture. | State of the Art | Low — included as contrast, not recommendation. |

## Open Questions

1. **Should template list output display labels when filters are applied, or only use labels as a hidden filter?**
   - What we know: exact row formatting after filtering is explicitly left to agent discretion. [VERIFIED: phase context]
   - What's unclear: whether surfacing labels in `template list` materially improves UX enough to justify output changes in this phase. [VERIFIED: phase context]
   - Recommendation: keep the current row layout unless tests or manual UX review show filtered results are ambiguous; filtering correctness matters more than label rendering here. [ASSUMED]

2. **Should template label CRUD share extracted helper functions with workspace label CRUD?**
   - What we know: behavior parity is mandatory, but helper extraction is discretionary. [VERIFIED: phase context]
   - What's unclear: whether the repo prefers less duplication or a smaller patch localized to `src/commands/template.ts`. [VERIFIED: phase context]
   - Recommendation: choose the smallest implementation that still keeps validation/error strings identical, and let tests enforce parity. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | CLI execution, tests, typecheck scripts. [VERIFIED: codebase grep] | ✓ [VERIFIED: local env] | `1.3.10` [VERIFIED: local env] | — |
| git | CLI startup guard for all subcommands except `completion`; command fixtures also create real repos. [VERIFIED: codebase grep] | ✓ [VERIFIED: local env] | `2.53.0` [VERIFIED: local env] | — |
| npm | Package version verification during research. [VERIFIED: npm registry] | ✓ [VERIFIED: local env] | `11.11.1` [VERIFIED: local env] | `bun pm view` can provide package metadata if needed. [VERIFIED: local env] |

**Missing dependencies with no fallback:**
- None. [VERIFIED: local env]

**Missing dependencies with fallback:**
- None. [VERIFIED: local env]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `bun:test` plus repo-local isolated runner in `scripts/test-runner.ts`. [VERIFIED: codebase grep] |
| Config file | `bunfig.toml`. [VERIFIED: codebase grep] |
| Quick run command | `bun test tests/lib/labels.test.ts tests/lib/composition.test.ts tests/tui/workspace-wizard.test.ts tests/commands/label.test.ts tests/commands/list-columns.test.ts` [VERIFIED: local env] |
| Full suite command | `bun run test` [VERIFIED: CLAUDE.md] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TLBL-01 | `template label add` validates, dedupes, and persists labels to template YAML. [VERIFIED: phase context] | integration | `bun test tests/commands/template-label.test.ts` | ❌ Wave 0 |
| TLBL-02 | `template label remove` removes labels and drops the field when empty. [VERIFIED: phase context] | integration | `bun test tests/commands/template-label.test.ts` | ❌ Wave 0 |
| TLBL-03 | `template label list` prints one label per line and `No labels.` when empty. [VERIFIED: phase context] | integration | `bun test tests/commands/template-label.test.ts` | ❌ Wave 0 |
| TLBL-04 | `template label clear` removes all template labels symmetrically with workspace clear. [VERIFIED: phase context] | integration | `bun test tests/commands/template-label.test.ts` | ❌ Wave 0 |
| TLBL-05 | `template list --label` applies exact-match AND filtering and no-match messaging. [VERIFIED: phase context] | integration | `bun test tests/commands/template-list.test.ts` | ❌ Wave 0 |
| TLBL-06 | Template labels union into workspace labels during create, including includes/multi-template composition. [VERIFIED: phase context] | integration + unit | `bun test tests/tui/workspace-wizard.test.ts tests/lib/composition.test.ts` | ✅ |
| TLBL-07 | Cloning a workspace preserves source labels in the new workspace YAML. [VERIFIED: phase context] | integration | `bun test tests/tui/workspace-clone.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/composition.test.ts tests/tui/workspace-wizard.test.ts tests/commands/template-label.test.ts tests/commands/template-list.test.ts tests/tui/workspace-clone.test.ts`
- **Per wave merge:** `bun run test`
- **Phase gate:** `bun run test && bun run typecheck`

### Wave 0 Gaps
- [ ] `tests/commands/template-label.test.ts` — covers TLBL-01, TLBL-02, TLBL-03, TLBL-04 by mirroring [`tests/commands/label.test.ts`](/home/nnex/dev/prj/git-stacks/tests/commands/label.test.ts#L41). [VERIFIED: codebase grep]
- [ ] `tests/commands/template-list.test.ts` — covers TLBL-05 including no-match messaging, based on the workspace list fixture style in [`tests/commands/list-columns.test.ts`](/home/nnex/dev/prj/git-stacks/tests/commands/list-columns.test.ts#L160). [VERIFIED: codebase grep]
- [ ] `tests/tui/workspace-clone.test.ts` — covers TLBL-07 explicitly; no such file exists today. [VERIFIED: codebase grep]
- [ ] Extend `tests/lib/composition.test.ts` with label merge cases for `includes` and CLI multi-template composition. [VERIFIED: codebase grep]
- [ ] Extend `tests/tui/workspace-wizard.test.ts` so TLBL-06 covers a composed/included template path, not just direct template union. [VERIFIED: codebase grep]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no [VERIFIED: codebase grep] | CLI phase does not add identity/auth flows. [VERIFIED: codebase grep] |
| V3 Session Management | no [VERIFIED: codebase grep] | CLI phase does not add sessions/tokens/cookies. [VERIFIED: codebase grep] |
| V4 Access Control | no [VERIFIED: codebase grep] | No role/authorization boundary is introduced by template labels. [VERIFIED: codebase grep] |
| V5 Input Validation | yes [VERIFIED: codebase grep] | `LabelSchema` in Zod plus command-level `LABEL_REGEX` validation. [VERIFIED: codebase grep] |
| V6 Cryptography | no [VERIFIED: codebase grep] | No cryptographic operation is part of this phase. [VERIFIED: codebase grep] |

### Known Threat Patterns for CLI + YAML Config Persistence

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Invalid or malicious label strings persisted into config. [VERIFIED: codebase grep] | Tampering | Reject at command input with `LABEL_REGEX` and revalidate on YAML read with `LabelSchema`. [VERIFIED: codebase grep] |
| Corrupt template/workspace YAML causing list/read instability. [VERIFIED: codebase grep] | Denial of Service | `listTemplates()` and `listWorkspaces()` use `safeParse` and skip corrupt files instead of trusting disk content blindly. [VERIFIED: codebase grep] |

## Sources

### Primary (HIGH confidence)
- `CLAUDE.md` - project commands, test runner rules, import constraints, YAML I/O rules, backward-compatibility requirements. [VERIFIED: CLAUDE.md]
- `.planning/phases/74-template-label-cli-propagation/74-CONTEXT.md` - locked decisions, discretion scope, deferred items, canonical refs. [VERIFIED: phase context]
- `.planning/REQUIREMENTS.md` - TLBL-01 through TLBL-07 acceptance criteria. [VERIFIED: phase context]
- `.planning/STATE.md` - milestone-level snapshot-copy decision and current phase ordering. [VERIFIED: phase context]
- [`src/commands/template.ts`](/home/nnex/dev/prj/git-stacks/src/commands/template.ts#L9) - missing template label CRUD and missing template list filter. [VERIFIED: codebase grep]
- [`src/commands/label.ts`](/home/nnex/dev/prj/git-stacks/src/commands/label.ts#L25) - existing workspace label CRUD behavior to mirror. [VERIFIED: codebase grep]
- [`src/commands/workspace.ts`](/home/nnex/dev/prj/git-stacks/src/commands/workspace.ts#L280) - existing repeatable `--label` filter contract and clone entrypoint. [VERIFIED: codebase grep]
- [`src/lib/config.ts`](/home/nnex/dev/prj/git-stacks/src/lib/config.ts#L81) - shared label schema and template/workspace YAML read/write helpers. [VERIFIED: codebase grep]
- [`src/lib/labels.ts`](/home/nnex/dev/prj/git-stacks/src/lib/labels.ts#L1) - current exact-match AND matcher. [VERIFIED: codebase grep]
- [`src/lib/composition.ts`](/home/nnex/dev/prj/git-stacks/src/lib/composition.ts#L147) - current composition behavior and omission of labels. [VERIFIED: codebase grep]
- [`src/tui/workspace-wizard.ts`](/home/nnex/dev/prj/git-stacks/src/tui/workspace-wizard.ts#L377) - existing template/user label union before workspace write. [VERIFIED: codebase grep]
- [`src/tui/workspace-clone.ts`](/home/nnex/dev/prj/git-stacks/src/tui/workspace-clone.ts#L157) - existing clone preservation path for source fields, including labels. [VERIFIED: codebase grep]
- [`tests/commands/label.test.ts`](/home/nnex/dev/prj/git-stacks/tests/commands/label.test.ts#L41), [`tests/commands/list-columns.test.ts`](/home/nnex/dev/prj/git-stacks/tests/commands/list-columns.test.ts#L160), [`tests/lib/labels.test.ts`](/home/nnex/dev/prj/git-stacks/tests/lib/labels.test.ts#L14), [`tests/lib/composition.test.ts`](/home/nnex/dev/prj/git-stacks/tests/lib/composition.test.ts), [`tests/tui/workspace-wizard.test.ts`](/home/nnex/dev/prj/git-stacks/tests/tui/workspace-wizard.test.ts#L317) - current coverage and gaps. [VERIFIED: codebase grep]
- npm registry package metadata: `commander` 14.0.3 (2026-01-31), `zod` 4.3.6 (2026-01-22), `yaml` 2.8.3 (2026-03-21), `typescript` 6.0.2 (2026-03-23). [VERIFIED: npm registry]
- Commander.js README: https://github.com/tj/commander.js - nested subcommands, variadic arguments, and option handling. [CITED: https://github.com/tj/commander.js]

### Secondary (MEDIUM confidence)
- None.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependency selection is needed; versions were verified against the npm registry and the repo already uses the relevant libraries. [VERIFIED: npm registry] [VERIFIED: codebase grep]
- Architecture: HIGH - the affected flows are localized and already partially implemented in current code. [VERIFIED: codebase grep]
- Pitfalls: HIGH - the failure modes come directly from current code gaps, especially missing label merge in `composeTemplates()`. [VERIFIED: codebase grep]

**Research date:** 2026-04-05 [VERIFIED: phase context]
**Valid until:** 2026-05-05 for repo-internal architecture; re-check npm versions before execution if package updates matter. [VERIFIED: npm registry] [ASSUMED]
