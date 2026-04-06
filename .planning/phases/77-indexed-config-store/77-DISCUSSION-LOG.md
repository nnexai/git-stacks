# Phase 77: Indexed Config Store - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 77-indexed-config-store
**Areas discussed:** Invalidation granularity, Index scope, Cache lifetime & TUI, API surface

---

## Invalidation Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Per-entity | writeWorkspace('foo') only drops 'foo' from the index. Efficient, matches milestone wording. Straightforward Map.delete(). | ✓ |
| Full wipe on write | Any write clears the entire index. Simplest possible implementation — zero risk of stale entries. | |
| Per-collection wipe | writeWorkspace() wipes all workspace entries but leaves template entries intact. Middle ground. | |

**User's choice:** Per-entity invalidation
**Notes:** Matches the milestone decision ("every write invalidates relevant entry").

---

## Index Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Workspaces + templates | Index both read*() single lookups and list*() full scans. Hot paths — called repeatedly in TUI, status, and workspace commands. Registry is a single file, already fast. | ✓ |
| Workspaces only | Templates are fewer and accessed less often. Minimal scope, extend later if needed. | |
| All entities | Also cache registry and global config reads. Maximum coverage but marginal benefit. | |

**User's choice:** Workspaces + templates
**Notes:** None.

---

## Cache Lifetime & TUI

| Option | Description | Selected |
|--------|-------------|----------|
| No special handling | TUI already re-reads on user actions. External changes not visible until refresh — acceptable. Same behavior as today minus re-parse cost. | ✓ |
| Time-based expiry | Cache entries expire after N seconds. Adds complexity but ensures TUI eventually sees external changes. | |
| File watcher | Watch config dir for file changes and invalidate on external writes. Most responsive but adds dependency. | |

**User's choice:** No special handling
**Notes:** None.

---

## API Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Internal to config.ts | Index is a module-private Map. Existing signatures unchanged. No new exports. Callers don't know the index exists. | ✓ |
| Separate module with clear/warm | New config-index.ts exports clearIndex() and warmIndex(). More explicit but adds coupling. | |
| Thin wrapper re-export | New config-index.ts wraps config.ts. Clean separation but doubles function surface. | |

**User's choice:** Internal to config.ts
**Notes:** None.

---

## Claude's Discretion

- Internal data structure, list caching strategy, scan helper refactoring, test structure

## Deferred Ideas

- On-disk index file (ENGN-10) — separate requirement
- Registry/global config indexing — extend later if needed
