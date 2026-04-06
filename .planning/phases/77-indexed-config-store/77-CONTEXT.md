# Phase 77: Indexed Config Store - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Workspace and template lookups use an in-memory index instead of re-scanning and re-parsing all YAML files on every call. Write operations trigger per-entity invalidation. YAML remains the source of truth; the index is a read-only cache with scan fallback on miss. On-disk index persistence (ENGN-10) is out of scope.

</domain>

<decisions>
## Implementation Decisions

### Invalidation granularity
- **D-01:** Per-entity invalidation. `writeWorkspace('foo')` drops only the `'foo'` entry from the workspace index; template writes drop only the affected template entry. No full wipe or per-collection wipe.
- **D-02:** `removeWorkspace()` / `removeTemplate()` (file deletion paths) also invalidate the specific entry.

### Index scope
- **D-03:** Index covers both workspaces and templates — both `read*()` single lookups and `list*()` full scans.
- **D-04:** Registry and global config are NOT indexed. Registry is a single-file read; global config is rarely re-read. Extend later if needed.

### Cache lifetime & TUI
- **D-05:** No special staleness handling. The index is a module-level singleton that lives for the process duration.
- **D-06:** The TUI dashboard sees external changes on manual refresh (same as today). No time-based expiry or file watcher.

### API surface
- **D-07:** Index is internal to `config.ts`. Module-private `Map` objects — no new exports, no `clearIndex()` or `warmIndex()` API.
- **D-08:** Existing `readWorkspace()`, `listWorkspaces()`, `readTemplate()`, `listTemplates()`, `writeWorkspace()`, `writeTemplate()` signatures remain unchanged. Callers don't know the index exists.

### Claude's Discretion
- Internal data structure for the index (Map, object, etc.)
- Whether `list*()` caches the full array or rebuilds from individual entries
- Whether `findWorkspaceFile()` / `findTemplateFile()` are refactored or kept as-is with index checks added
- Test structure and placement

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone requirements
- `.planning/ROADMAP.md` — Phase 77 goal, success criteria (ENGN-04/05/06), dependency on Phase 76
- `.planning/REQUIREMENTS.md` — ENGN-04 (in-memory index), ENGN-05 (write invalidation), ENGN-06 (scan fallback)

### Config I/O implementation
- `src/lib/config.ts` — All read/write/list functions, `findWorkspaceFile()` and `findTemplateFile()` scan helpers, atomic write via tmp+fsync+rename
- `src/lib/paths.ts` — `WORKSPACES_DIR`, `TEMPLATES_DIR` path constants

### Consumers of config lookups
- `src/lib/workspace-ops.ts` — Primary consumer of `readWorkspace()`, `listWorkspaces()`
- `src/lib/workspace-lifecycle.ts` — Lifecycle operations that read/write workspaces
- `src/lib/workspace-status.ts` — Status queries via `listWorkspaces()`
- `src/lib/workspace-git.ts` — Git operations that read workspaces
- `src/tui/dashboard/` — TUI dashboard calls `listWorkspaces()` on render cycles

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/config.ts:241-283`: `findWorkspaceFile()` and `findTemplateFile()` — current scan-based lookup logic that becomes the fallback path on cache miss
- `src/lib/config.ts:317-335`: `listWorkspaces()` — current full-scan implementation to wrap with caching
- `src/lib/config.ts:383-401`: `listTemplates()` — same pattern, same caching opportunity
- Atomic write pattern (tmp+fsync+rename) already in `writeYaml()` — invalidation hooks slot after the rename

### Established Patterns
- Module-private state is already used elsewhere (e.g., `observability.ts` has module-level enable/silence state)
- Zod `safeParse` on every YAML read — index caches the parsed result, avoiding redundant re-parsing
- `_exec` mutable seam pattern for test isolation — index could expose a `_cache` seam if tests need to inspect or reset it

### Integration Points
- `readWorkspace()` / `readTemplate()` — add index lookup before `findWorkspaceFile()` / `findTemplateFile()` scan
- `listWorkspaces()` / `listTemplates()` — return cached list if populated, else scan and populate
- `writeWorkspace()` / `writeTemplate()` — invalidate the specific entry after `writeYaml()`
- File deletion paths in workspace remove/template remove — invalidate on delete

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

- On-disk index file (`~/.config/git-stacks/index.yml`) for startup speed — ENGN-10, separate from this phase
- Registry and global config indexing — not needed now, extend later if profiling shows a bottleneck

</deferred>

---

*Phase: 77-indexed-config-store*
*Context gathered: 2026-04-06*
