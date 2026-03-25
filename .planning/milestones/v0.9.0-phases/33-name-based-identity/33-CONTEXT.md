# Phase 33: Name-Based Identity - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the YAML `name` field the authoritative identity for workspaces and templates. Users look up, open, remove, list, and rename by `name` field — filename is an internal storage detail. Rename must update both YAML `name` and filename atomically, and template rename must also update all workspace YAML files that reference that template.

</domain>

<decisions>
## Implementation Decisions

### Name Resolution Strategy
- Scan all `.yml` files and compare YAML `name` field to find the right file — no fast-path filename assumption
- Replace existing `readWorkspace(name)`, `workspaceExists(name)`, `readTemplate(name)`, `templateExists(name)` to use scan-based lookup (not supplemented alongside)
- Linear scan is acceptable — workspace/template count is small (<50 typical), imperceptible for CLI
- If two `.yml` files have the same YAML `name` field: return first match with a warning to stderr; do not abort

### Divergence & Migration Handling
- YAML `name` field wins over filename when they diverge — filename is opaque storage
- No auto-correction on read — only explicit rename changes files on disk
- Error message unchanged: `Workspace 'X' not found.` — filename vs name distinction is an internal detail, not surfaced in errors
- `git-stacks doctor` should detect and report name/filename divergence: "name field 'X' does not match filename 'Y.yml'"

### Rename Atomicity
- Write-new + delete-old sequence is sufficient for CLI use (true atomic rename not required)
- Rename validation: check that the YAML `name` field in the file matches the `<old>` argument — ensures we rename the right logical entity even if filename drifted
- Add `git-stacks template rename <old> <new>` command — parity with workspace rename
- Template rename includes `--dry-run` flag — consistent UX with workspace rename
- **Template rename cascade**: when renaming a template, all workspace YAML files that have `template: <old-name>` must be updated to `template: <new-name>` atomically in the same operation — no workspace should reference a stale template name after rename

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `workspacePath(name)` / `templatePath(name)` — will be changed to scan-based in `src/lib/config.ts`
- `listWorkspaces()` / `listTemplates()` — already scans all `.yml` files and reads YAML; reuse this scanning pattern for lookup
- `renameWorkspace()` in `src/lib/workspace-ops.ts` — already updates both YAML `name` and filename; add YAML name validation on the old arg
- `runDoctorChecks()` in `src/commands/doctor.ts` — extend with name/filename drift checks for workspaces and templates
- `WorkspaceSchema.name` / `TemplateSchema.name` — `z.string()` — the identity field being promoted

### Established Patterns
- Lookup returns `null` when "not found" is expected (not throwing); error returns `{ ok: false, error: string }`
- All path constants in `src/lib/paths.ts` — `WORKSPACES_DIR`, `TEMPLATES_DIR`
- `readdirSync(DIR).filter(f => f.endsWith(".yml"))` pattern used in `listWorkspaces()` / `listTemplates()` — replicate for scan-based lookup
- `formatZodError()` for schema parse errors
- `ProgressCallback` / `onProgress?.(msg)` pattern in workspace-ops for rename operations

### Integration Points
- `src/lib/config.ts` — primary change site: scan-based `readWorkspace`, `workspaceExists`, `readTemplate`, `templateExists`; new helper `findWorkspaceByName()`, `findTemplateByName()` (internal or exported)
- `src/commands/template.ts` — add `rename` subcommand; update all `templateExists` / `readTemplate` calls
- `src/lib/workspace-ops.ts` — update `renameWorkspace()` to validate YAML name on old arg
- `src/commands/doctor.ts` — add name/filename drift checks for workspaces and templates
- `tests/lib/config.test.ts` — add scan-based lookup tests including drift scenarios

</code_context>

<specifics>
## Specific Ideas

- Template rename cascade: `renameTemplate(oldName, newName)` in `workspace-ops.ts` should scan all workspace YAMLs and rewrite `template:` field where it matches `oldName` — do this before deleting the old template file so the operation is recoverable if it fails midway
- Doctor divergence check: iterate all `.yml` files in `WORKSPACES_DIR` and `TEMPLATES_DIR`, compare `f.replace(".yml","")` with parsed `name` field — flag any mismatch as a drift warning

</specifics>

<deferred>
## Deferred Ideas

- IDEN-05: TUI workspace and template action menus using name field for reverse-lookups — explicitly deferred to future milestone per REQUIREMENTS.md
- COMP-06: Repo name tab completion — separate phase (35) handles dynamic completion
- Auto-fix divergence on read — user prefers explicit rename only; no silent file moves

</deferred>
