# Phase 33: Name-Based Identity - Research

**Researched:** 2026-03-24
**Domain:** Config I/O layer refactor — scan-based identity resolution for workspaces and templates
**Confidence:** HIGH

## Summary

Phase 33 promotes the YAML `name` field to be the authoritative identity for workspaces and templates. Currently `workspaceExists(name)`, `readWorkspace(name)`, `templateExists(name)`, and `readTemplate(name)` all assume the YAML filename equals the name — they construct the path directly as `{DIR}/{name}.yml`. After this phase, those functions scan all `.yml` files and match by YAML `name` field instead.

The existing `listWorkspaces()` and `listTemplates()` functions already do the correct scan-and-parse pattern — they iterate `readdirSync(DIR).filter(f => f.endsWith(".yml"))` and parse each file. The new scan-based lookup functions replicate this pattern internally, returning the first match by `name` field. The `writeWorkspace` and `writeTemplate` functions derive the filename from `workspace.name` / `template.name`, so after a scan-based lookup resolves the file's actual path, writes still go to the right place.

The rename operations require two atomic changes: update the `name` field in YAML and rename the file. `renameWorkspace()` already does this correctly (write-new + delete-old). `template rename` exists in `src/commands/template.ts` (lines 109–126) but is a thin inline implementation — it needs to be extracted to `workspace-ops.ts` as a proper `renameTemplate()` function that (1) validates YAML name matches old arg, (2) cascades `template:` references in all workspace YAMLs, and (3) adds `--dry-run` support.

**Primary recommendation:** Centralize all scan-based lookup logic in two new internal helpers in `src/lib/config.ts` — `findWorkspaceFile(name)` and `findTemplateFile(name)` — returning `{ data, filePath } | null`. All existing exported functions (`readWorkspace`, `workspaceExists`, etc.) delegate to these helpers.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Name Resolution Strategy**
- Scan all `.yml` files and compare YAML `name` field to find the right file — no fast-path filename assumption
- Replace existing `readWorkspace(name)`, `workspaceExists(name)`, `readTemplate(name)`, `templateExists(name)` to use scan-based lookup (not supplemented alongside)
- Linear scan is acceptable — workspace/template count is small (<50 typical), imperceptible for CLI
- If two `.yml` files have the same YAML `name` field: return first match with a warning to stderr; do not abort

**Divergence & Migration Handling**
- YAML `name` field wins over filename when they diverge — filename is opaque storage
- No auto-correction on read — only explicit rename changes files on disk
- Error message unchanged: `Workspace 'X' not found.` — filename vs name distinction is an internal detail, not surfaced in errors
- `git-stacks doctor` should detect and report name/filename divergence: "name field 'X' does not match filename 'Y.yml'"

**Rename Atomicity**
- Write-new + delete-old sequence is sufficient for CLI use (true atomic rename not required)
- Rename validation: check that the YAML `name` field in the file matches the `<old>` argument — ensures we rename the right logical entity even if filename drifted
- Add `git-stacks template rename <old> <new>` command — parity with workspace rename
- Template rename includes `--dry-run` flag — consistent UX with workspace rename
- **Template rename cascade**: when renaming a template, all workspace YAML files that have `template: <old-name>` must be updated to `template: <new-name>` atomically in the same operation — no workspace should reference a stale template name after rename

### Claude's Discretion

None specified.

### Deferred Ideas (OUT OF SCOPE)

- IDEN-05: TUI workspace and template action menus using name field for reverse-lookups — explicitly deferred to future milestone per REQUIREMENTS.md
- COMP-06: Repo name tab completion — separate phase (35) handles dynamic completion
- Auto-fix divergence on read — user prefers explicit rename only; no silent file moves
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IDEN-01 | User can look up, open, remove, and list workspaces by the `name` field in YAML (not by filename) | Scan-based lookup in `findWorkspaceFile()` helper; replaces `workspaceExists` + `readWorkspace` filename assumptions |
| IDEN-02 | User can look up, edit, remove, and list templates by the `name` field in YAML (not by filename) | Scan-based lookup in `findTemplateFile()` helper; replaces `templateExists` + `readTemplate` filename assumptions |
| IDEN-03 | User can rename a workspace or template and have both the YAML `name` field and the filename updated atomically; no drift possible | `renameWorkspace()` updated with YAML name validation; new `renameTemplate()` in workspace-ops with cascade + dry-run |
</phase_requirements>

---

## Standard Stack

This phase introduces no new dependencies. All work uses existing project stack.

### Core (existing — no changes)
| Library | Version | Purpose | Role in this phase |
|---------|---------|---------|---------------------|
| `yaml` | 2.8.2 | YAML parsing | Parse `.yml` files during scan |
| `zod` | 3.25.76 | Schema validation | Validate parsed YAML via `WorkspaceSchema.safeParse` / `TemplateSchema.safeParse` |
| `bun` (fs built-ins) | latest | File I/O | `readdirSync`, `readFileSync`, `existsSync`, `unlinkSync` |

**Installation:** None required.

---

## Architecture Patterns

### Recommended Structure

No new files required. All changes are within:

```
src/
  lib/
    config.ts           — primary change site: scan-based helpers + updated public functions
    workspace-ops.ts    — add renameTemplate(); update renameWorkspace() name validation
  commands/
    template.ts         — template rename command delegates to renameTemplate() from workspace-ops
    doctor.ts           — add name/filename drift check functions + wire into allIssues
tests/
  lib/
    config.test.ts      — new scan-based lookup tests (drift scenarios, duplicate name warning)
    workspace-ops.test.ts — new renameTemplate() tests (cascade, dry-run, name validation)
```

### Pattern 1: Scan-Based File Lookup Helper

**What:** Internal helper that scans `WORKSPACES_DIR` (or `TEMPLATES_DIR`) for a `.yml` file whose parsed `name` field equals the given argument. Returns the parsed data and the actual file path.

**When to use:** Called by all public lookup functions — `workspaceExists`, `readWorkspace`, `templateExists`, `readTemplate`. Also used by rename operations to validate the old-name arg.

**Shape:**
```typescript
// Internal — not exported
type WorkspaceLookup = { data: Workspace; filePath: string }

function findWorkspaceFile(name: string): WorkspaceLookup | null {
  if (!existsSync(WORKSPACES_DIR)) return null
  const files = readdirSync(WORKSPACES_DIR).filter(f => f.endsWith(".yml"))
  const matches: WorkspaceLookup[] = []
  for (const f of files) {
    const filePath = join(WORKSPACES_DIR, f)
    try {
      const raw = readFileSync(filePath, "utf-8")
      const parsed = WorkspaceSchema.safeParse(parse(raw))
      if (parsed.success && parsed.data.name === name) {
        matches.push({ data: parsed.data, filePath })
      }
    } catch {
      // skip unreadable files (same as listWorkspaces behavior)
    }
  }
  if (matches.length > 1) {
    console.error(`[git-stacks] Warning: multiple workspaces with name '${name}' — using first match`)
  }
  return matches[0] ?? null
}
```

Same pattern for `findTemplateFile(name): { data: Template; filePath: string } | null`.

### Pattern 2: Updated Public Functions

After introducing the helpers, the public functions become thin wrappers:

```typescript
export function workspaceExists(name: string): boolean {
  return findWorkspaceFile(name) !== null
}

export function readWorkspace(name: string): Workspace {
  const found = findWorkspaceFile(name)
  if (!found) throw new Error(`Workspace '${name}' not found.`)
  return found.data
}
```

**Key insight:** `workspacePath(name)` is still needed by `writeWorkspace` (which writes using `workspace.name` as the filename). The only behavioral change is that lookup no longer assumes filename = name.

### Pattern 3: Template Rename with Cascade

**What:** `renameTemplate(oldName, newName, opts, onProgress)` in `src/lib/workspace-ops.ts` — mirrors the structure of `renameWorkspace()`.

**Cascade step order (important for recoverability):**
1. Validate `findTemplateFile(oldName)` returns a result and its `data.name === oldName`
2. Validate no template with `newName` already exists
3. Write new template file (name updated to `newName`)
4. Scan all workspace YAMLs and rewrite any with `template: oldName` to `template: newName`
5. Delete old template file

Doing step 4 before step 5 means if a workspace rewrite fails, the old template file still exists and the state is recoverable.

**Dry-run:** Collect and `onProgress` all would-be changes without writing. Return `{ ok: true }`.

### Pattern 4: Doctor Drift Detection

**What:** Two new pure functions in `src/commands/doctor.ts` — `findWorkspaceNameDrift()` and `findTemplateNameDrift()`.

**Logic:**
```typescript
function findWorkspaceNameDrift(workspaces: Workspace[]): Issue[] {
  // listWorkspaces() already scans all .yml files and returns parsed data
  // but we need the filename to compare — replicate the scan here
  const issues: Issue[] = []
  if (!existsSync(WORKSPACES_DIR)) return []
  for (const f of readdirSync(WORKSPACES_DIR).filter(f => f.endsWith(".yml"))) {
    const stem = f.replace(".yml", "")
    try {
      const raw = readFileSync(join(WORKSPACES_DIR, f), "utf-8")
      const parsed = WorkspaceSchema.safeParse(parse(raw))
      if (parsed.success && parsed.data.name !== stem) {
        issues.push({
          icon: "warn",
          entity: stem,
          message: `name field '${parsed.data.name}' does not match filename '${f}'`,
          fix: `git-stacks rename ${parsed.data.name} ${parsed.data.name}`,
        })
      }
    } catch { /* skip unreadable */ }
  }
  return issues
}
```

Note: doctor.ts needs `WORKSPACES_DIR` and `TEMPLATES_DIR` imports from `paths.ts` for this check.

### Anti-Patterns to Avoid

- **Don't export `findWorkspaceFile` / `findTemplateFile`**: These are internal implementation details. Exporting them would create a new API surface that callers could depend on, making future changes harder.
- **Don't change `writeWorkspace` / `writeTemplate` to scan-then-write**: Writes use `workspace.name` as the filename by design — this is the desired behavior (atomicity of rename = write-new + delete-old).
- **Don't change the `workspacePath(name)` signature**: It's still used internally and by `renameWorkspace()` for the delete-old step. Keep it as-is.
- **Don't add name-conflict checking during workspace/template creation**: That's the wizard's responsibility (already present in `workspace-wizard.ts:112`). The scan-based `workspaceExists` provides the correct answer there.
- **Don't read YAML twice in rename operations**: The scan helper already parses the file — pass the resolved `{ data, filePath }` result through to avoid double-reads.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file rename | OS-level `rename()` syscall | Write-new + delete-old sequence | Already proven pattern in `renameWorkspace()`; avoids cross-device rename failures; acceptable for CLI |
| Template back-reference index | In-memory index / cache of template → workspaces | Scan `listWorkspaces()` on every rename | <50 workspaces; scan is imperceptible; index would require cache invalidation complexity |
| Duplicate name disambiguation | UUID suffixes, auto-rename | Warn + return first match | User chose to create the duplicate; CLI should surface the warning, not silently alter names |

---

## Runtime State Inventory

> Omitted — this is not a rename/rebrand phase (the `name` field in YAML is user data, not an internal identifier being changed).

---

## Common Pitfalls

### Pitfall 1: Callers that pass the filename stem instead of the YAML name

**What goes wrong:** After scan-based lookup is deployed, callers that received a workspace/template name from a `.yml` filename (e.g., via shell completion reading filenames) will still work — but callers that constructed a name by stripping `.yml` from a filename and then calling `workspaceExists()` may get false negatives if the YAML name drifted.

**Why it happens:** Shell completion (IDEN-04, Phase 35) is still filename-based until Phase 35 ships. Between Phase 33 and 35, completions still suggest filenames. If a user has a drifted workspace (filename `foo.yml`, YAML name `bar`), tab-completing `foo` then running `git-stacks open foo` will fail with "not found" after this phase (correct behavior per spec).

**How to avoid:** This is intentional per the spec — YAML name wins. Document it.

**Warning signs:** Tests that seed workspaces by writing `foo.yml` with `name: bar` and then call `workspaceExists("foo")` will correctly start failing after this change — those tests validate the OLD behavior and must be updated.

### Pitfall 2: `listWorkspaces()` uses `workspacePath(name)` internally — must be updated

**What goes wrong:** Looking at the existing `listWorkspaces()` at line 219 in `config.ts`:

```typescript
const raw = readFileSync(workspacePath(name), "utf-8")
```

This constructs the path as `{WORKSPACES_DIR}/{name}.yml` where `name` is `f.replace(".yml","")` — the filename stem. After the refactor, this still works correctly for listing, but if left as-is it's inconsistent with scan-based lookup semantics. The real issue: `listWorkspaces()` is used by doctor's `findOrphanedTaskDirs()` which matches against `workspace.name` from YAML — that function already uses the YAML name correctly. No behavioral problem here, but worth auditing.

**How to avoid:** When refactoring `listWorkspaces()`, consider reading directly from the full path `join(WORKSPACES_DIR, f)` instead of going through `workspacePath(name)` — removes the implicit filename = name assumption internally.

### Pitfall 3: `writeWorkspace` filename derivation after scan-based read

**What goes wrong:** If a user has a drifted workspace (filename `old.yml`, YAML `name: new`), then calls `readWorkspace("new")` (scan finds `old.yml`), modifies the result, and calls `writeWorkspace(ws)`, the write goes to `{WORKSPACES_DIR}/new.yml` — creating a new file while the old `old.yml` still exists. Now there are two files with `name: new`.

**Why it happens:** `writeWorkspace()` derives the filename from `workspace.name` — that's intentional for normal use. It becomes a problem only in the drifted state.

**How to avoid:** This scenario is the expected mechanism by which drift is "healed" organically — the next time the workspace is written, the correctly-named file is created. The old drifted file remains until the user runs `git-stacks rename foo foo` or doctor notices it. Document this in comments. The spec explicitly says no auto-correction on read.

### Pitfall 4: Template rename cascade — workspace read failure mid-cascade

**What goes wrong:** If a workspace YAML is corrupt or unreadable during cascade, the cascade should log a warning and continue — not abort. If it aborts, the template is renamed but some workspaces still reference the old name.

**How to avoid:** Use `WorkspaceSchema.safeParse()` (not `.parse()`) in the cascade scan. For unreadable/corrupt workspace files, log a warning and skip — matching `listWorkspaces()` behavior.

### Pitfall 5: `renameWorkspace()` line 860 uses filename-based `workspaceExists`

**What goes wrong:** After replacing `workspaceExists` with scan-based lookup, the existing `renameWorkspace` check at line 860 (`if (!workspaceExists(oldName))`) works correctly — it now correctly validates by YAML name. But line 863 (`if (workspaceExists(newName))`) also works correctly — it scans for any workspace with that YAML name. No behavior regression here, but worth noting that `renameWorkspace` also needs the YAML name validation step (check that the found file's `data.name === oldName`) per the spec.

**How to avoid:** After calling `findWorkspaceFile(oldName)`, check that `found.data.name === oldName` (which is always true by construction of the scan, but validates the caller passed the right identity). The real guard here is against the case where the filename drifted — if the user types the old filename stem instead of the YAML name, the scan won't find it, and the rename fails with "not found" (correct behavior).

---

## Code Examples

### Scan helper (internal)
```typescript
// src/lib/config.ts — internal, not exported
type WorkspaceLookup = { data: Workspace; filePath: string }

function findWorkspaceFile(name: string): WorkspaceLookup | null {
  if (!existsSync(WORKSPACES_DIR)) return null
  const matches: WorkspaceLookup[] = []
  for (const f of readdirSync(WORKSPACES_DIR).filter((f) => f.endsWith(".yml"))) {
    const filePath = join(WORKSPACES_DIR, f)
    try {
      const raw = readFileSync(filePath, "utf-8")
      const parsed = WorkspaceSchema.safeParse(parse(raw))
      if (parsed.success && parsed.data.name === name) {
        matches.push({ data: parsed.data, filePath })
      }
    } catch {
      // skip unreadable files — same policy as listWorkspaces
    }
  }
  if (matches.length > 1) {
    console.error(`[git-stacks] Warning: multiple workspaces with name '${name}' — using first match`)
  }
  return matches[0] ?? null
}
```

### Updated public workspace functions
```typescript
export function workspaceExists(name: string): boolean {
  return findWorkspaceFile(name) !== null
}

export function readWorkspace(name: string): Workspace {
  const found = findWorkspaceFile(name)
  if (!found) throw new Error(`Workspace '${name}' not found.`)
  return found.data
}
```

### renameTemplate skeleton (workspace-ops.ts)
```typescript
export async function renameTemplate(
  oldName: string,
  newName: string,
  opts: { dryRun?: boolean } = {},
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  if (!templateExists(oldName)) {
    return { ok: false, error: `Template '${oldName}' not found.` }
  }
  if (templateExists(newName)) {
    return { ok: false, error: `Template '${newName}' already exists.` }
  }

  const workspaces = listWorkspaces()
  const affectedWorkspaces = workspaces.filter((w) => w.template === oldName)

  if (opts.dryRun) {
    onProgress?.(`[dry-run] would rename template: ${oldName} -> ${newName}`)
    for (const ws of affectedWorkspaces) {
      onProgress?.(`[dry-run] would update workspace: ${ws.name} (template: ${oldName} -> ${newName})`)
    }
    onProgress?.("Dry run complete. No changes made.")
    return { ok: true }
  }

  // Write new template file
  const tpl = readTemplate(oldName)
  tpl.name = newName
  writeTemplate(tpl)
  onProgress?.(`wrote  ${newName}.yml`)

  // Cascade: update all workspaces that reference this template
  for (const ws of affectedWorkspaces) {
    ws.template = newName
    writeWorkspace(ws)
    onProgress?.(`updated workspace  ${ws.name}`)
  }

  // Delete old template file
  unlinkSync(templatePath(oldName))
  onProgress?.(`deleted  ${oldName}.yml`)

  return { ok: true }
}
```

Note: `templatePath(oldName)` still returns `{TEMPLATES_DIR}/{oldName}.yml` — which is the correct file to delete. After the scan-based refactor, `findTemplateFile(oldName)` returns the actual file path; use that in the real implementation instead of `templatePath(oldName)` to handle the drifted-filename case.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Filename = identity (workspacePath/templatePath derive path from name) | YAML `name` field = identity (scan-based lookup) | Phase 33 | Commands no longer break if user manually renamed a `.yml` file |
| Template rename: inline in `commands/template.ts` | Template rename: `renameTemplate()` in `workspace-ops.ts` with cascade + dry-run | Phase 33 | Parity with workspace rename; cascade keeps workspace references consistent |

---

## Open Questions

1. **`templatePath()` in `template rename` delete step**
   - What we know: After scan-based lookup, the found file path may differ from `templatePath(oldName)` if filename drifted.
   - What's unclear: Should the delete step use the scanned file path or `templatePath(oldName)`? The scanned file path is more correct.
   - Recommendation: Pass `found.filePath` through to the delete step. This requires `findTemplateFile` to return the file path, which the proposed design already does.

2. **`listWorkspaces()` internal path construction**
   - What we know: It uses `workspacePath(name)` where `name = f.replace(".yml", "")`, making it implicitly filename-based internally even though it returns YAML data.
   - What's unclear: Whether to update this or leave it (it works correctly for listing since it's iterating actual files).
   - Recommendation: Update to use `join(WORKSPACES_DIR, f)` directly for consistency; minor cleanup.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — this is a pure TypeScript config I/O refactor with no new tools, services, or CLIs required).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Jest-compatible) |
| Config file | `bunfig.toml` |
| Quick run command | `bun test tests/lib/config.test.ts tests/lib/workspace-ops.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IDEN-01 | `workspaceExists("bar")` finds `foo.yml` with `name: bar` | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 |
| IDEN-01 | `readWorkspace("bar")` returns workspace from drifted file | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 |
| IDEN-01 | Duplicate YAML name: returns first match + stderr warning | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 |
| IDEN-02 | `templateExists("bar")` finds `foo.yml` with `name: bar` | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 |
| IDEN-02 | `readTemplate("bar")` returns template from drifted file | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 |
| IDEN-03 | `renameWorkspace()` validates YAML name matches old arg | unit | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 |
| IDEN-03 | `renameTemplate()` renames file + updates all workspace `template:` refs | unit | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 |
| IDEN-03 | `renameTemplate()` dry-run reports actions without writing | unit | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 |
| IDEN-03 | Doctor drift check: workspace name ≠ filename → warn issue | unit | `bun test tests/lib/config.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/config.test.ts tests/lib/workspace-ops.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

New test cases must be added to existing test files (not new files):

- [ ] `tests/lib/config.test.ts` — scan-based lookup: drifted filename, duplicate name warning, not-found
- [ ] `tests/lib/workspace-ops.test.ts` — `renameTemplate()`: cascade, dry-run, YAML name validation
- [ ] `tests/lib/config.test.ts` — doctor drift helpers: `findWorkspaceNameDrift`, `findTemplateNameDrift` (or test via doctor command directly)

Existing test infrastructure (isolation via `useIsolatedConfig`, `mock.module("@/lib/paths")`, cache-busting imports) is sufficient — no new fixtures needed.

---

## Project Constraints (from CLAUDE.md)

Actionable directives relevant to this phase:

- **Runtime:** Bun — use `readFileSync`, `readdirSync`, `existsSync`, `unlinkSync` from `fs`; no Node.js-specific APIs
- **Imports in `src/`:** Use relative imports only — `@/*` alias is test-only
- **Zod:** All YAML I/O validated with Zod; use `safeParse` for listing/scanning, `.parse()` for known-good reads (with try/catch)
- **Return values:** Return `null` for "not found", `{ ok: false, error: string }` for operation failures — never throw from workspace-ops functions
- **No `any`:** Type all scan results explicitly
- **Error messages:** Keep existing error message format: `Workspace 'X' not found.` — do not change
- **File naming:** New functions in existing files; no new files needed
- **No breaking changes:** Existing workspace YAML files must continue to work — scan-based lookup is fully backward compatible (it finds files by YAML content, not filename)
- **Callbacks:** Use `ProgressCallback` / `onProgress?.(msg)` pattern for rename operations
- **Test isolation:** Use `useIsolatedConfig()` + `mock.module("@/lib/paths")` + cache-busting dynamic imports

---

## Sources

### Primary (HIGH confidence)
- Direct code read: `src/lib/config.ts` — full source; all functions, schemas, and I/O patterns verified by reading
- Direct code read: `src/lib/workspace-ops.ts` lines 854–924 — `renameWorkspace()` implementation
- Direct code read: `src/commands/template.ts` — all template subcommands including existing rename (lines 109–126)
- Direct code read: `src/commands/doctor.ts` — all doctor check functions; `Issue` interface; output formatting
- Direct code read: `tests/lib/config.test.ts` — full test coverage and isolation patterns
- Direct code read: `tests/helpers.ts` — `useIsolatedConfig()` pattern

### Secondary (MEDIUM confidence)
- Direct code read: `src/commands/workspace.ts` — all `workspaceExists`/`readWorkspace` call sites (caller blast radius)
- Direct code read: Grep results for all `workspaceExists`/`templateExists`/`readWorkspace`/`readTemplate` callers across `src/`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing stack fully understood from code read
- Architecture: HIGH — scan pattern directly derived from existing `listWorkspaces()`/`listTemplates()` implementations
- Pitfalls: HIGH — derived from reading actual code paths and edge cases in the existing implementation
- Test patterns: HIGH — derived from reading existing test files and isolation helpers

**Research date:** 2026-03-24
**Valid until:** Stable — pure TypeScript refactor of internal config I/O with no external dependencies
