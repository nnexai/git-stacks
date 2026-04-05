# Phase 76: Integration Plugin Capability Contracts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 76-integration-plugin-capability-contracts
**Areas discussed:** Capability taxonomy, Runner gating strategy, integration list display, Migration path

---

## Capability taxonomy

| Option | Description | Selected |
|--------|-------------|----------|
| String union set | `capabilities: Set<Capability>` where Capability is a string union of optional behaviors. Flat, simple, easy to check. | ✓ |
| Bitmask enum | Numeric bitwise flags. Compact but less readable, uncommon pattern in codebase. | |
| Record<Capability, boolean> | Every capability explicitly declared true/false. Verbose. | |

**User's choice:** String union set
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Only optional behaviors | Capabilities = generate, cleanup, commands, configExample, windowDetection, applies. open/isEnabled/configurePrompt stay required. | ✓ |
| All behaviors including open | Every method in the set. open/isEnabled always present, adds noise. | |

**User's choice:** Only optional behaviors
**Notes:** None

---

## Runner gating strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Capability check before call | Runner checks `capabilities.has('generate')` before calling. Methods stay optional. Simple guard replacement. | ✓ |
| Required methods + capability assertion | Make all methods required, assert before calling. Stricter but more invasive. | |
| Separate required/optional interfaces | Split into base + Generatable + Cleanable. Type-safe but complex hierarchy. | |

**User's choice:** Capability check before call
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Trust declaration | TypeScript types + code review ensure correctness. No runtime validation. | ✓ |
| Validate at registration | Assert capability/method alignment at startup. | |
| Validate in dev mode only | Check only when GS_DEBUG is set. | |

**User's choice:** Trust declaration
**Notes:** None

---

## integration list display

| Option | Description | Selected |
|--------|-------------|----------|
| Short tags column | Single "Capabilities" column with abbreviated tags: gen, cmd, clean, win, cfg, apl. | ✓ |
| Symbols per capability | Fixed-width columns with checkmarks. Denser but harder to read. | |
| Comma-separated list | Full names in a column. Readable but wide. | |

**User's choice:** Short tags column
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, full names in array | JSON includes `"capabilities": [...]` with full names. | ✓ |
| No, table only | JSON stays as-is. Capabilities display-only. | |

**User's choice:** Yes, full names in array
**Notes:** None

---

## Migration path

| Option | Description | Selected |
|--------|-------------|----------|
| Required in interface | `capabilities` is required non-optional field. TS compiler forces all 10 plugins. | ✓ |
| Optional with fallback | Optional field, runner infers from method presence. Gradual but defeats purpose. | |
| Required + factory helper | Required field + auto-detect helper. Convenience + correctness. | |

**User's choice:** Required in interface
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| TS compiler is enough | Required field + typecheck catches missing capabilities. No extra test. | ✓ |
| Add runtime assertion test | Test imports integrations array and asserts non-empty capabilities sets. | |

**User's choice:** TS compiler is enough
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| No concern -- internal only | All 10 plugins first-party. No documented plugin API. Breaking changes fine. | ✓ |
| Add JSDoc deprecation notice | Note the interface changed. No compat shim, just docs. | |

**User's choice:** No concern -- internal only
**Notes:** None

---

## Claude's Discretion

- Exact abbreviated tag labels for capabilities column
- Capability type file placement
- Test structure and file placement
- Order of capability tags in list output

## Deferred Ideas

None -- discussion stayed within phase scope.
