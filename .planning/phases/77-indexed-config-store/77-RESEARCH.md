# Phase 77: Indexed Config Store - Research

**Researched:** 2026-04-06
**Domain:** In-memory caching layer over YAML config I/O (TypeScript, Bun, module-private Map)
**Confidence:** HIGH

## Summary

Phase 77 adds an in-memory index to `src/lib/config.ts` that caches parsed `Workspace` and `Template` objects keyed by name. The index is a read-cache only — YAML files remain the source of truth. On read, the cache is checked first; on miss the existing scan path runs and populates the cache. On write or delete, only the specific named entry is evicted.

The entire change is internal to `config.ts`. No existing function signatures change, no new public exports are added, and callers remain unaware. The only open design question left to the planner is whether `list*()` caches a full array alongside individual entries or rebuilds from the map on every call — both approaches are valid and the tradeoffs are documented below.

All required external dependencies are already in place. The implementation is pure TypeScript using two module-level `Map` objects.

**Primary recommendation:** Use two module-private `Map<string, Workspace>` and `Map<string, Template>`, gate all six public I/O functions (read/write/list for each entity), and expose a `_cache` seam for test inspection and reset.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Per-entity invalidation. `writeWorkspace('foo')` drops only the `'foo'` entry from the workspace index; template writes drop only the affected template entry. No full wipe or per-collection wipe.
- **D-02:** `removeWorkspace()` / `removeTemplate()` (file deletion paths) also invalidate the specific entry.
- **D-03:** Index covers both workspaces and templates — both `read*()` single lookups and `list*()` full scans.
- **D-04:** Registry and global config are NOT indexed. Registry is a single-file read; global config is rarely re-read.
- **D-05:** No special staleness handling. The index is a module-level singleton that lives for the process duration.
- **D-06:** The TUI dashboard sees external changes on manual refresh (same as today). No time-based expiry or file watcher.
- **D-07:** Index is internal to `config.ts`. Module-private `Map` objects — no new exports, no `clearIndex()` or `warmIndex()` API.
- **D-08:** Existing `readWorkspace()`, `listWorkspaces()`, `readTemplate()`, `listTemplates()`, `writeWorkspace()`, `writeTemplate()` signatures remain unchanged. Callers don't know the index exists.

### Claude's Discretion

- Internal data structure for the index (Map, object, etc.)
- Whether `list*()` caches the full array or rebuilds from individual entries
- Whether `findWorkspaceFile()` / `findTemplateFile()` are refactored or kept as-is with index checks added
- Test structure and placement

### Deferred Ideas (OUT OF SCOPE)

- On-disk index file (`~/.config/git-stacks/index.yml`) for startup speed — ENGN-10
- Registry and global config indexing
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENGN-04 | Workspace/template lookups use an in-memory index instead of scanning all YAML files | Module-private `Map` objects in `config.ts`; `readWorkspace`/`readTemplate`/`listWorkspaces`/`listTemplates` check cache before calling scan helpers |
| ENGN-05 | Index is invalidated automatically on every write operation | Invalidation call after `writeYaml()` in `writeWorkspace()`/`writeTemplate()`; also after `unlinkSync` in all deletion paths |
| ENGN-06 | Index miss falls back to YAML scan (cache, not source of truth) | On miss, call existing `findWorkspaceFile()`/`findTemplateFile()` scan helpers; populate cache from result |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Runtime: Bun — use Bun APIs freely; no Node.js compat required
- Language: TypeScript strict mode throughout
- Config format: YAML with Zod validation — no schema changes
- No breaking changes: existing workspace YAML files must continue to work
- Named exports only (no wildcards)
- `type` for data structures, `interface` for contracts
- Discriminated unions for fallible ops; `null` only for "not found"
- Tests: `bun run test` (custom runner) — never `bun test tests/` directly
- Modules with subprocesses export mutable `_exec` object — similar seam (`_cache`) appropriate here for test inspection
- Production code in `src/` uses relative imports (`@/*` alias is test-only)

## Standard Stack

All implementation is within the existing codebase — no new packages required. [VERIFIED: codebase grep]

### Core (existing, no additions needed)
| Component | Version | Purpose | Notes |
|-----------|---------|---------|-------|
| TypeScript Map | built-in | In-memory index store | `Map<string, T>` with O(1) get/set/delete |
| Zod | ^4.3.6 | Schema parse (already done) | Index caches already-parsed `Workspace`/`Template` objects |
| yaml | ^2.8.3 | YAML parse (already done) | Scan result goes into cache; not re-parsed on hit |
| bun:test | built-in | Test framework | `describe/test/expect/beforeEach/afterEach` |

**Installation:** No new packages needed. [VERIFIED: src/lib/config.ts — all imports already present]

## Architecture Patterns

### Internal Map Structure

Two module-private Maps at the top of `config.ts`, after the existing imports: [ASSUMED — pattern is standard TypeScript; confirmed as appropriate by observability.ts module-state precedent]

```typescript
// Source: src/lib/config.ts pattern — module-private state (mirrors observability.ts lines 6-8)
const workspaceIndex = new Map<string, Workspace>()
const templateIndex = new Map<string, Template>()
```

A `_cache` seam object follows (exposed for test reset/inspection, consistent with `_exec` pattern used in lifecycle.ts, workspace-git.ts, etc.):

```typescript
// Mutable seam — tests replace map contents or call .clear()
export const _cache = {
  workspaces: workspaceIndex,
  templates: templateIndex,
}
```

This lets tests call `_cache.workspaces.clear()` in `beforeEach` without needing `clearIndex()` as a public API. [ASSUMED — no user decision on this; fits project seam convention]

### Read Path: Single Lookup

`readWorkspace(name)` and `readTemplate(name)` gain a cache-first guard before calling the scan helper:

```typescript
// Pattern: cache-first, fall through to scan on miss, populate on hit
export function readWorkspace(name: string): Workspace {
  const cached = workspaceIndex.get(name)
  if (cached) return cached
  const found = findWorkspaceFile(name)        // existing scan path (ENGN-06 fallback)
  if (!found) throw new Error(`Workspace '${name}' not found.`)
  workspaceIndex.set(name, found.data)         // populate cache
  return found.data
}
```

Same pattern for `readTemplate`. [VERIFIED: existing `findWorkspaceFile`/`findTemplateFile` at config.ts:241-283 already return the parsed object — no re-parsing needed]

### Read Path: List All

Two implementation options for `listWorkspaces()` / `listTemplates()`:

**Option A — Separate "list populated" boolean:**
Introduce a second module-private flag (`let workspaceListPopulated = false`). When the flag is false, do the full scan, populate all individual map entries, set flag true, return results. When true, return `Array.from(workspaceIndex.values())`.

Pros: Single source of entries (the Map). List invalidation happens naturally because individual entry deletes also make the rebuilt list accurate.
Cons: Slightly more logic; must reset the flag on any deletion/write that could affect membership (rename creates a new key and deletes old).

**Option B — Separate "full list" cache:**
A `workspaceListCache: Workspace[] | null` variable. When null, do scan; when populated, return it. Write operations set it to null.

Pros: Simple null check.
Cons: Two structures to keep in sync (Map + array). If individual entry is updated, array is stale unless we also null it.

**Recommendation:** Option A. The Map is already the canonical store for individual lookups. Using `Array.from(workspaceIndex.values())` avoids duplication and ensures list and single-lookup always agree. [ASSUMED — both are valid; this is Claude's discretion area per D-discretion]

### Write Path: Invalidation

`writeWorkspace(workspace)` drops the single cache entry after the file write completes:

```typescript
export function writeWorkspace(workspace: Workspace) {
  ensureDir(WORKSPACES_DIR)
  writeYaml(workspacePath(workspace.name), workspace)
  workspaceIndex.set(workspace.name, workspace)  // update cache in-place (write = upsert)
}
```

Note: on write we have the new value in hand, so we can update (not just delete) the cache entry. This is strictly an optimization — the requirement only specifies invalidation. Either `set` or `delete` satisfies ENGN-05; `set` avoids a subsequent miss on the next read.

For `renameWorkspace` in `workspace-ops.ts` (line 289): it calls `writeWorkspace(workspace)` (with new name) then `unlinkSync(workspacePath(oldName))`. The `unlinkSync` is outside `config.ts`. Two approaches:

1. **Preferred:** Add `deleteWorkspace(name)` or expose invalidation via the `_cache` seam — rename calls `_cache.workspaces.delete(oldName)` after unlink.
2. **Alternative:** Accept that the old name stays in cache until a miss — harmless because the file is gone so next read will get "not found" anyway, and `workspaceExists(oldName)` will hit the stale cache entry returning a cached object that's valid data but the file doesn't exist.

Actually Option 2 has a correctness problem: `workspaceExists` calls `findWorkspaceFile` only — but after this phase it will check the index first and return `true` for the old name even after deletion. This means `renameWorkspace` must invalidate the old entry.

**Conclusion:** Deletion paths (`unlinkSync` sites) must invalidate the cache. Since the `unlinkSync` calls are in `workspace-lifecycle.ts` and `workspace-ops.ts`, one of:
- Add a package-private `invalidateWorkspace(name)` / `invalidateTemplate(name)` export (contradicts D-07 "no new exports") 
- Move `unlinkSync` calls into config.ts as `deleteWorkspaceFile(name)` and `deleteTemplateFile(name)` — keeps all YAML/cache I/O in config.ts
- Expose invalidation through the `_cache` seam (callers call `_cache.workspaces.delete(name)`)

D-07 says "no `clearIndex()` or `warmIndex()` API" — it does not explicitly prohibit a `deleteWorkspace`/`deleteTemplate` function. The cleanest approach is to add `deleteWorkspace(name: string)` and `deleteTemplate(name: string)` to `config.ts` — thin wrappers around `unlinkSync` + cache eviction — and update the call sites in `workspace-lifecycle.ts` and `workspace-ops.ts`. This also consolidates all YAML file deletion in one module. [ASSUMED — D-07 language is ambiguous on this; recommended interpretation is that the restriction is against cache-management APIs, not against adding a file-deletion function to config.ts]

### Anti-Patterns to Avoid

- **Returning cached objects mutably:** Callers that modify the returned `Workspace` object would silently mutate the cache entry. Current codebase does `ws.name = newName` then `writeWorkspace(ws)` in rename — this works correctly because `writeWorkspace` then upserts the mutated object. Not a bug, but worth noting in tests.
- **List caching without invalidation on rename:** After `renameWorkspace(oldName, newName)`, the list cache must not contain the old entry. If using a separate list array, null it on rename. If using Option A (rebuild from Map), this is automatic.
- **Forgetting workspaceExists:** `workspaceExists(name)` calls `findWorkspaceFile(name)` — it needs the same cache-first guard, or it bypasses the index entirely, defeating the purpose.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Thread-safe cache | Mutex/lock mechanism | Plain Map (process is single-threaded) | Bun CLI is single-process, single-threaded — no concurrent writes possible |
| Cache invalidation on external file change | File watcher / inotify | Nothing (D-06: TUI sees external changes on manual refresh) | Design decision; watcher adds complexity with no benefit in this scope |
| LRU eviction | Cache size limits | Unbounded Map | Max ~100s of workspaces; memory is negligible |

## Runtime State Inventory

Not applicable — this is a greenfield internal feature addition (no rename/refactor of user-visible names).

## Common Pitfalls

### Pitfall 1: `workspaceExists` bypasses cache
**What goes wrong:** `workspaceExists` calls `findWorkspaceFile` directly. After the index is added to `readWorkspace`, `workspaceExists` still does a full scan on every call.
**Why it happens:** Easy to miss — it's a separate exported function that shares the scan helper.
**How to avoid:** Apply the same cache-first check in `workspaceExists` (`workspaceIndex.has(name)` returns true early).
**Warning signs:** Test that calls `workspaceExists` multiple times on the same name still hits the FS each time.

### Pitfall 2: Stale cache after `unlinkSync` in lifecycle/ops
**What goes wrong:** `removeWorkspace` deletes the file via `unlinkSync(workspacePath(name))` in `workspace-lifecycle.ts:395`. The cache still has the old entry. Subsequent `workspaceExists` returns `true` for a deleted workspace.
**Why it happens:** `unlinkSync` calls are outside `config.ts`, which doesn't know to evict the cache.
**How to avoid:** Add `deleteWorkspace(name)` / `deleteTemplate(name)` to `config.ts` and replace the raw `unlinkSync` call sites with it.
**Warning signs:** Test that removes a workspace then immediately calls `workspaceExists` / `listWorkspaces` still sees it.

### Pitfall 3: Rename leaves old name in cache
**What goes wrong:** `renameWorkspace(oldName, newName)` writes the new workspace, then `unlinkSync(workspacePath(oldName))`. If cache eviction only happens in `writeWorkspace`, the old `oldName` key remains.
**Why it happens:** `unlinkSync` is the eviction trigger for old names, but it's outside `config.ts`.
**How to avoid:** Same fix as Pitfall 2 — use `deleteWorkspace(oldName)` which evicts the cache.
**Warning signs:** After rename, `workspaceExists(oldName)` returns `true`.

### Pitfall 4: `listWorkspaces` returns stale results after write
**What goes wrong:** `listWorkspaces` is called, populates cache. `writeWorkspace(ws)` then adds/updates an entry. Next `listWorkspaces` call returns the old list.
**Why it happens:** List cache not rebuilt after entry-level write.
**How to avoid:** With Option A (rebuild from Map), this is automatic. With Option B, must null the list cache in `writeWorkspace`.
**Warning signs:** Test writes a workspace then calls `listWorkspaces` — does not see the new entry.

### Pitfall 5: Test isolation — module-level state persists between tests
**What goes wrong:** One test writes a workspace, next test's `readWorkspace` returns the cached value from the previous test even though the file system was reset.
**Why it happens:** Module-level Maps persist for the process lifetime; test isolation via `mock.module("@/lib/paths")` resets the FS path but not the Map.
**How to avoid:** Expose `_cache` seam; call `_cache.workspaces.clear()` and `_cache.templates.clear()` in `beforeEach` for tests that use the real `config.ts`.
**Warning signs:** Tests pass in isolation, fail when run in sequence.

## Code Examples

### Index initialization and seam [ASSUMED — standard TypeScript pattern]
```typescript
// At module top of src/lib/config.ts, after imports
const workspaceIndex = new Map<string, Workspace>()
const templateIndex = new Map<string, Template>()

// Exported seam for test isolation (mutable object, property-assignable per project pattern)
export const _cache = {
  workspaces: workspaceIndex,
  templates: templateIndex,
}
```

### readWorkspace with cache-first [ASSUMED — derived from existing code structure at config.ts:306-310]
```typescript
export function readWorkspace(name: string): Workspace {
  const cached = workspaceIndex.get(name)
  if (cached) return cached
  const found = findWorkspaceFile(name)
  if (!found) throw new Error(`Workspace '${name}' not found.`)
  workspaceIndex.set(name, found.data)
  return found.data
}
```

### writeWorkspace with cache upsert [ASSUMED — derived from existing code at config.ts:312-315]
```typescript
export function writeWorkspace(workspace: Workspace) {
  ensureDir(WORKSPACES_DIR)
  writeYaml(workspacePath(workspace.name), workspace)
  workspaceIndex.set(workspace.name, workspace)   // upsert after successful write
}
```

### deleteWorkspace (new function) [ASSUMED]
```typescript
export function deleteWorkspace(name: string): void {
  unlinkSync(workspacePath(name))
  workspaceIndex.delete(name)
  workspaceListPopulated = false  // reset list flag (Option A)
}
```

### listWorkspaces with Option A caching [ASSUMED — derived from existing code at config.ts:317-335]
```typescript
let workspaceListPopulated = false

export function listWorkspaces(): Workspace[] {
  if (workspaceListPopulated) return Array.from(workspaceIndex.values())
  if (!existsSync(WORKSPACES_DIR)) return []
  for (const f of readdirSync(WORKSPACES_DIR).filter((f) => f.endsWith(".yml"))) {
    const filePath = join(WORKSPACES_DIR, f)
    try {
      const raw = readFileSync(filePath, "utf-8")
      const parsed = WorkspaceSchema.safeParse(parse(raw))
      if (parsed.success) {
        workspaceIndex.set(parsed.data.name, parsed.data)
      } else {
        console.error(`[git-stacks] Skipping corrupt workspace '${f}': ${formatZodError(parsed.error)}`)
      }
    } catch (err) {
      console.error(`[git-stacks] Skipping unreadable workspace '${f}': ${err}`)
    }
  }
  workspaceListPopulated = true
  return Array.from(workspaceIndex.values())
}
```

### Test beforeEach cache reset [ASSUMED — consistent with project seam pattern]
```typescript
// In tests/lib/config.test.ts new describe blocks
import { _cache } from "../../src/lib/config"  // or via dynamic import

beforeEach(() => {
  _cache.workspaces.clear()
  _cache.templates.clear()
  // also reset list-populated flags if exposed via _cache
})
```

## Call Sites to Update

These are all places outside `config.ts` that call `unlinkSync` on workspace/template files:

| File | Line | Current | After |
|------|------|---------|-------|
| `src/lib/workspace-lifecycle.ts` | 339 | `unlinkSync(workspacePath(name))` | `deleteWorkspace(name)` |
| `src/lib/workspace-lifecycle.ts` | 395 | `unlinkSync(workspacePath(name))` | `deleteWorkspace(name)` |
| `src/lib/workspace-lifecycle.ts` | 531 | `unlinkSync(workspacePath(name))` | `deleteWorkspace(name)` |
| `src/lib/workspace-ops.ts` | 289 | `unlinkSync(workspacePath(oldName))` | `deleteWorkspace(oldName)` |
| `src/lib/workspace-ops.ts` | 340 | `unlinkSync(templatePath(oldName))` | `deleteTemplate(oldName)` |

[VERIFIED: grep of workspace-lifecycle.ts and workspace-ops.ts — confirmed line numbers approximate]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none — uses `scripts/test-runner.ts` |
| Quick run command | `bun run test` |
| Full suite command | `bun run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENGN-04 | `readWorkspace` returns from cache on second call without FS scan | unit | `bun run test` (tests/lib/config.test.ts) | Partially (config.test.ts exists; new tests needed) |
| ENGN-04 | `listWorkspaces` returns from cache on second call | unit | `bun run test` | New tests in config.test.ts |
| ENGN-04 | `readTemplate` / `listTemplates` return from cache | unit | `bun run test` | New tests in config.test.ts |
| ENGN-05 | After `writeWorkspace`, cache reflects update | unit | `bun run test` | New tests in config.test.ts |
| ENGN-05 | After `deleteWorkspace`, cache entry is gone | unit | `bun run test` | New tests in config.test.ts |
| ENGN-06 | On cache miss, falls back to YAML scan and populates cache | unit | `bun run test` | New tests in config.test.ts |

### Sampling Rate
- **Per task commit:** `bun run test`
- **Per wave merge:** `bun run test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] New `describe("in-memory index")` block in `tests/lib/config.test.ts` — covers ENGN-04, ENGN-05, ENGN-06
- [ ] Cache reset in `beforeEach` via `_cache.workspaces.clear()` / `_cache.templates.clear()`
- [ ] If `workspaceListPopulated` flag is part of `_cache`, include it in reset

*(Existing test infrastructure is sufficient — no new files needed, new test block in config.test.ts)*

## Security Domain

This phase makes no changes to authentication, session management, access control, or cryptography. The cache stores the same data already available via direct YAML read. No new attack surface is introduced.

| ASVS Category | Applies | Notes |
|---------------|---------|-------|
| V5 Input Validation | no change | Zod validation unchanged — cache stores already-validated objects |
| All others | no | Internal in-process cache, no network, no new I/O |

## State of the Art

This is standard in-process memoization. No ecosystem shifts apply. [ASSUMED]

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Scan all YAML files on every read | Scan once, cache parsed result | O(1) lookups after first access; eliminates repeated FS I/O in TUI render loops |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `_cache` seam (exported mutable object) is the right mechanism for test isolation | Architecture Patterns | Tests cannot reset state between runs; tests would share cache pollution |
| A2 | `deleteWorkspace(name)` / `deleteTemplate(name)` new exports in config.ts satisfy D-07 spirit (D-07 forbids cache-management APIs, not file-deletion helpers) | Call Sites to Update | Would need a different approach to evict cache on file deletion |
| A3 | Option A (rebuild list from Map, `workspaceListPopulated` flag) is better than Option B (separate list array) | Architecture Patterns | Minor — Option B also works; implementation detail only |
| A4 | `workspaceExists` needs the same cache-first guard as `readWorkspace` | Common Pitfalls | Without it, `workspaceExists` always scans even when cache is warm |
| A5 | Line numbers cited for `unlinkSync` call sites are approximate (verified by grep pattern, not exact offset) | Call Sites to Update | Off-by-one — does not affect correctness of the fix |

## Open Questions

1. **`_cache` seam vs. `workspaceListPopulated` flag exposure**
   - What we know: `_cache` exposes the Maps; but `workspaceListPopulated` is a separate scalar
   - What's unclear: Should `_cache` also expose the flag for test reset? `_cache = { workspaces: Map, templates: Map, workspaceListPopulated: boolean, templateListPopulated: boolean }` would allow full reset
   - Recommendation: Yes — include the flags in `_cache` so `beforeEach` can reset everything in one place

2. **`workspaceExists` cache guard**
   - What we know: `workspaceExists` calls `findWorkspaceFile` (scan path) without any index lookup
   - What's unclear: If we add cache-first to `workspaceExists`, does that cause issues if the index is partially populated (e.g., not all workspaces have been read)?
   - Recommendation: `workspaceIndex.has(name)` returns `true` only if that workspace was previously read or listed. A `false` doesn't mean it doesn't exist — so `workspaceExists` must also fall through to the scan on cache miss, same as `readWorkspace`. This is correct behaviour.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure TypeScript refactor within existing Bun/config.ts module)

## Sources

### Primary (HIGH confidence)
- `src/lib/config.ts` — Full implementation of all read/write/list/find functions, line numbers confirmed by direct file read
- `src/lib/workspace-lifecycle.ts` — All `unlinkSync(workspacePath(...))` call sites confirmed by grep
- `src/lib/workspace-ops.ts` — `unlinkSync` call sites for workspace rename and template rename confirmed by grep
- `src/lib/observability.ts` — Module-private `Map` / `let` state precedent confirmed by direct file read
- `tests/lib/config.test.ts` — Existing test patterns, `useIsolatedConfig`, `_cache` seam conventions confirmed
- `tests/helpers.ts` — `makeConfigMock`, `useIsolatedConfig`, seam reset patterns confirmed

### Secondary (MEDIUM confidence)
- Project `CLAUDE.md` — Runtime constraints, TypeScript conventions, test runner requirements

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all existing code verified
- Architecture: HIGH for structure, ASSUMED for implementation details (seam naming, list caching strategy)
- Pitfalls: HIGH — all derived from direct code inspection of call sites and existing patterns
- Call sites to update: HIGH — verified by grep; line numbers approximate but patterns confirmed

**Research date:** 2026-04-06
**Valid until:** Stable — 90 days (pure internal refactor, no external dependencies)
