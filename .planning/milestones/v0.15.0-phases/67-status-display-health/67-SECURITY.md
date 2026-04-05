---
phase: 67
slug: status-display-health
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-05
---

# Phase 67 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Filesystem reads | `existsSync` + `statSync` on user-configured `main_path` values | Local file metadata (size, mtime) |
| TUI display | All changes are display-only within the TUI — no external input surfaces | User config paths rendered to terminal |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-67-01 | I (Information Disclosure) | doctor.ts statSync | accept | Paths come from user's own config YAML; no untrusted input. Doctor is a diagnostic tool run locally. | closed |
| T-67-02 | D (Denial of Service) | statSync TOCTOU | accept | Two-step existsSync then statSync has a benign TOCTOU window; doctor is a diagnostic tool, not a security gate. | closed |
| T-67-03 | I (Information Disclosure) | WorkspaceDetail repo paths | accept | Paths displayed in TUI are from user's own config; terminal is a local surface. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-67-01 | T-67-01 | Paths sourced from user's own config YAML; doctor is a local diagnostic tool with no untrusted input | PLAN.md disposition | 2026-04-05 |
| AR-67-02 | T-67-02 | Benign TOCTOU window in existsSync→statSync; doctor is diagnostic, not a security gate | PLAN.md disposition | 2026-04-05 |
| AR-67-03 | T-67-03 | Repo paths displayed in TUI come from user config; terminal is a local surface | PLAN.md disposition | 2026-04-05 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-05 | 3 | 3 | 0 | gsd-secure-phase |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-05
