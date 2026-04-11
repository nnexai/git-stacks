# Phase 84: Local Coverage Gates, Docs, and Release Prep - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 84-Local Coverage Gates, Docs, and Release Prep
**Areas discussed:** Verification entrypoint, Gate failure style, Docs and release-prep surface, Debug logging doc refresh

---

## Verification entrypoint

| Option | Description | Selected |
|--------|-------------|----------|
| Stable `bun run verify` | One umbrella local verification command with underlying component commands still documented | ✓ |
| Milestone-specific verify command | Versioned verification command such as `verify:v0.17.1` | |
| Manual sequence only | No umbrella command; document individual steps only | |

**User's choice:** Add one stable `bun run verify` umbrella command, and document the underlying component commands beneath it.
**Notes:** The maintainer flow should have one obvious local entrypoint without hiding the component checks.

---

## Gate failure style

| Option | Description | Selected |
|--------|-------------|----------|
| Aggregate all inventory / mapping problems | Show every missing inventory or mapping issue, then exit non-zero | ✓ |
| Fail fast | Stop on the first missing inventory or mapping issue | |
| Mixed mode | Aggregate gate problems, but fail fast on underlying command failures | |

**User's choice:** Aggregate all inventory / mapping problems in one report, then exit non-zero.
**Notes:** The gate should optimize for one cleanup pass rather than repeated reruns.

---

## Docs and release-prep surface

| Option | Description | Selected |
|--------|-------------|----------|
| Focused updates | Keep README/CHANGELOG/version updates narrowly focused on the new coverage and verification workflow | ✓ |
| Broader testing-doc refresh | Expand into a wider testing architecture documentation pass | |
| Mostly changelog-only | Keep README edits very small and push most detail into the changelog | |

**User's choice:** Keep docs and release-prep updates tightly focused on the new coverage / verify commands, the inventory-gate workflow, and the required release metadata updates.
**Notes:** Phase 84 should not become a general documentation rewrite.

---

## Debug logging doc refresh

| Option | Description | Selected |
|--------|-------------|----------|
| Replace examples in place | Update the current debug section to the shipped key/value stderr format and foreground `GS_DEBUG` | ✓ |
| Append a note only | Keep the current examples and add a brief note about the new format | |
| Add separate advanced section | Introduce a new section while leaving the existing debug section mostly intact | |

**User's choice:** Replace the old bracket/timing examples in-place with key/value stderr examples that use `GS_DEBUG`, while still noting `GIT_STACKS_DEBUG=1` as a legacy alias.
**Notes:** The README should reflect the real shipped output format without splitting guidance across multiple competing sections.

---

## the agent's Discretion

- Exact helper-script breakdown beneath `bun run verify`
- Exact aggregated gate report formatting
- Exact release-prep file edits once the new commands land

## Deferred Ideas

None.
