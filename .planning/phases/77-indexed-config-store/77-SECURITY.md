---
phase: 77
slug: indexed-config-store
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-06
---

# Phase 77 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| YAML file → in-memory cache | Parsed YAML data enters in-memory Map in `config.ts`; already Zod-validated on read | Workspace/template config objects (no secrets) |
| `name` arg → filesystem path | `deleteWorkspace(name)` / `deleteTemplate(name)` build paths via `workspacePath(name)` / `templatePath(name)` | String `name` parameter (trust: validated) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-77-01 | Tampering | In-memory cache (`workspaceIndex` / `templateIndex` Maps in `src/lib/config.ts`) | accept | Cache mirrors same data as YAML files on disk. An attacker with FS write access can already modify YAML directly — cache is not a new trust boundary and confers no privilege elevation. | closed |
| T-77-02 | Information Disclosure | `_cache` exported seam (`src/lib/config.ts`) | accept | `_cache` exposes parsed config objects that are already readable via existing `readWorkspace` / `readTemplate` / `listWorkspaces` / `listTemplates` exports. No new data exposure; seam is for test isolation (mirrors `_exec` pattern). | closed |
| T-77-03 | Denial of Service | Unbounded `Map` growth in `workspaceIndex` / `templateIndex` | accept | Map size is bounded by the count of workspace/template YAML files on disk (~100s in practice). No external input controls Map cardinality. Memory impact is negligible and scales with disk contents. | closed |
| T-77-04 | Tampering | `deleteWorkspace` / `deleteTemplate` path-traversal via `name` argument | mitigate | `NameSchema` (src/lib/config.ts:68-70) rejects path separators, traversal (`..`), and shell metacharacters via `/^[A-Za-z0-9._-]+$/`. Schema is applied in `WorkspaceSchema`, `TemplateSchema`, and `RepoRegistryEntrySchema`. All `deleteWorkspace` / `deleteTemplate` callers (`workspace-ops.ts:290,341`, `workspace-lifecycle.ts:345,401,537`, `commands/template.ts:166`, `tui/dashboard/App.tsx:378`) pass names sourced from Zod-validated objects or CLI/TUI args that round-trip through these schemas. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-77-01 | T-77-01 | In-memory cache stores the same data as on-disk YAML; attacker needs pre-existing FS write access to modify YAML, which already grants modification capability. Cache introduces no new trust boundary. | gsd-secure-phase | 2026-04-06 |
| AR-77-02 | T-77-02 | `_cache` export exposes objects already readable via existing public `read*` / `list*` APIs. Seam is required for test isolation (cache eviction between tests). Pattern mirrors `_exec` from `lifecycle.ts` and `workspace-git.ts`. | gsd-secure-phase | 2026-04-06 |
| AR-77-03 | T-77-03 | Map growth is bounded by the number of workspace/template YAML files on disk (~100s maximum in practice). No external or untrusted input controls Map cardinality. Memory footprint is negligible. | gsd-secure-phase | 2026-04-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-06 | 4 | 4 | 0 | gsd-secure-phase |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-06
