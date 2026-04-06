---
phase: 76
slug: integration-plugin-capability-contracts
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-06
---

# Phase 76 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Plugin declaration -> Runner | Runner trusts plugin capabilities declaration (no runtime validation) | Capability set (non-sensitive metadata) |
| CLI output -> User | Non-sensitive capability metadata displayed in integration list | Capability names/abbreviations |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-76-01 | Tampering | Plugin capabilities set | accept | All 10 plugins are first-party, co-located in src/. TypeScript compiler enforces field presence. No third-party plugins. Trusted declaration model. | closed |
| T-76-02 | Information Disclosure | integration list capabilities | accept | Capabilities are non-sensitive metadata about which optional methods a plugin implements. No secrets or user data exposed. | closed |
| T-76-03 | Information Disclosure | integration list output | accept | Capabilities are non-sensitive metadata. No secrets, paths, or user data exposed in the column. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-76-01 | T-76-01 | First-party plugins only; TypeScript enforces capability declarations at compile time. No runtime validation needed. | plan author | 2026-04-06 |
| AR-76-02 | T-76-02 | Capability names are non-sensitive method-presence metadata. No secrets or user data. | plan author | 2026-04-06 |
| AR-76-03 | T-76-03 | CLI output shows only capability abbreviations/names. No sensitive data in column. | plan author | 2026-04-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-06 | 3 | 3 | 0 | gsd-secure-phase |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-06
