# Phase 40: Template Composition - Research

**Researched:** 2026-03-26
**Status:** Complete

## Summary

Template composition requires changes across 4 layers: schema (config.ts), composition logic (new file), CLI command registration (workspace.ts), and workspace wizard (workspace-wizard.ts). The existing architecture already snapshots template data at workspace creation time, so composition is a merge step that runs between template selection and workspace YAML creation.

## Findings

### 1. Schema Extension (TemplateSchema)

**Current state:** `TemplateSchema` at `src/lib/config.ts:67-91` defines: `name`, `schema_version`, `description`, `repos`, `hooks`, `env`, `env_file`, `files`, `integrations`. No `includes` field exists.

**Required change:** Add `includes: z.array(z.string()).optional()` to `TemplateSchema`. This is a backward-compatible change — Zod's `.optional()` means existing templates without `includes` parse cleanly (COMP-07). The `safeParse()` path in `findTemplateFile()` and `listTemplates()` already tolerates missing optional fields.

**No workspace schema change needed.** Per D-02, workspace YAML stores the merged result — the `includes` field is resolved at creation time and never appears in workspace YAML.

### 2. Composition Function Design

**Location decision:** A new `src/lib/composition.ts` file is cleaner than adding to `config.ts` (which is already 355 lines). The function needs access to `readTemplate()` from `config.ts` but doesn't need to modify any existing config functions.

**Function signature:**
```typescript
export function composeTemplates(
  templateNames: string[],
  options?: { topLevel?: string }
): Template
```

Takes an array of template names (from `includes:` or CLI `--template` flags), loads each via `readTemplate()`, and merges them. The `topLevel` option identifies which template's settings take precedence in conflicts.

**Merge rules from CONTEXT.md decisions:**
- **Repos (D-04):** Union by repo name. If same repo appears in multiple templates, worktree mode wins over trunk.
- **Hooks (D-05):** Concatenate arrays in include order; top-level template's hooks run last.
- **Env (D-06):** Merge with last-wins per key; top-level template env wins.
- **Files (D-07):** Concatenate copy/symlink arrays in include order; top-level last. Same destination in later template overwrites earlier.
- **Integrations (D-08):** Deep-merge across templates; top-level wins per key.
- **branch_pattern:** First non-undefined pattern wins (from CONTEXT.md, Claude's discretion — this is the least surprising behavior since branch_pattern is typically template-specific).

**Circular detection (D-11):** Check `includes` references against a visited set before loading. If a cycle is detected, throw with a clear error message listing the cycle path. Per D-12, included templates' own `includes` fields are ignored with a warning (1-level limit).

### 3. CLI Multi-Template Flag

**Current state:** `src/commands/workspace.ts:84-89` registers the `new` command with `--from <source>`. The `--from` flag accepts either a template name or a local path.

**Required change:** Add `--template <name>` as a repeatable option. Commander.js supports this with:
```typescript
.option("--template <name...>", "Compose from multiple templates")
```
The variadic syntax `<name...>` collects all values into an array. Note: this is different from `--from` which is a single value. When `--template` is present, it takes precedence over interactive template selection.

**Interaction with `--from`:** If both `--from` and `--template` are specified, error out — they're mutually exclusive. `--from` handles single template or local path; `--template` handles multi-template composition.

### 4. Workspace Wizard Integration

**Current state:** `runWorkspaceNew()` in `src/tui/workspace-wizard.ts:100` handles workspace creation. Template repos are built via `buildReposFromTemplate()` at line 64. The wizard is single-select for templates (D-10).

**Required change (non-interactive path only):** When `--template` CLI flags are provided, the wizard bypasses template selection entirely. Instead:
1. Load all named templates
2. Resolve `includes:` for each (1 level deep)
3. Call `composeTemplates()` to merge
4. Build repos from the merged template via existing `buildReposFromTemplate()`
5. Snapshot merged hooks/env/files/integrations into workspace YAML

**Interactive wizard stays single-select** (D-10). When a user selects a template interactively, its `includes:` field is resolved automatically — no multi-select picker.

### 5. Template `includes:` Resolution in Interactive Mode

When a single template is selected interactively and it has `includes: [base, shared]`, the resolution path is:
1. User selects template `fullstack` which has `includes: [api, frontend]`
2. Load `api` and `frontend` templates
3. Compose: `[api, frontend, fullstack]` (included first, top-level last)
4. Merged template used for workspace creation

This happens transparently — the user selected one template but gets the composed result.

### 6. Existing Patterns and Reuse

**`buildReposFromTemplate()`** (line 64-98): Takes a single `Template` and builds `WorkspaceRepo[]`. This function works unchanged with a composed template — it doesn't care how the template was assembled.

**Snapshot pattern** (lines 172-177, 220-224): Template hooks/env/env_file/files/integrations are deep-cloned into workspace YAML at creation time. This pattern continues to work with composed templates — just use the merged values.

**`readTemplate()`** (line 210-229): Name-based lookup that returns a `Template`. Used by composition function to load included templates.

### 7. Testing Strategy

**Unit tests needed:**
- `composeTemplates()` — repo union, mode precedence, hook concatenation, env merge, file merge, integration merge
- Circular detection
- 1-level depth limit (included templates' includes ignored)
- Backward compat (templates without `includes` compose correctly)
- Schema parsing with `includes` field

**Integration test needed:**
- CLI `--template` flag passes multiple names to wizard
- `TemplateSchema` parses YAML with `includes` field

### 8. Edge Cases

- **Empty `includes: []`:** Should work fine — no templates to compose, just use the template as-is.
- **`includes` referencing non-existent template:** Error with clear message listing the missing template name.
- **All templates in `includes` have the same repo:** Single repo in result with worktree mode (if any template used worktree).
- **`env_file` across templates:** Last one wins (top-level). Only one `env_file` path makes sense per workspace.
- **`branch_pattern` conflicts:** When same repo appears in multiple templates with different `branch_pattern` values, use the one from the higher-precedence template (later in merge order, top-level wins).

## Validation Architecture

### Test Coverage Requirements

| Area | Test Type | Verification |
|------|-----------|-------------|
| Schema | Unit | `TemplateSchema.parse()` with `includes` field |
| Compose repos | Unit | Repo union, mode precedence |
| Compose hooks | Unit | Concatenation order, top-level last |
| Compose env | Unit | Last-wins merge |
| Compose files | Unit | Array concatenation |
| Circular detection | Unit | Error thrown with cycle path |
| Depth limit | Unit | Warning on nested includes |
| Backward compat | Unit | Templates without includes still work |
| CLI multi-template | Integration | `--template` flag parsing |

### Automated Verification

```bash
bun test tests/lib/composition.test.ts
bun run typecheck
```

## Technical Risks

1. **Commander.js variadic option parsing:** The `<name...>` syntax needs verification — Commander.js 12.x supports it but the exact behavior with multiple `--template` flags needs testing.
2. **Template load order:** Must be deterministic. `includes` array order + top-level last is the contract.

---

*Phase: 40-template-composition*
*Research completed: 2026-03-26*
