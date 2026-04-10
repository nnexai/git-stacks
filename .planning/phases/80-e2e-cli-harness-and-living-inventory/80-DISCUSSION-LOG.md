# Phase 80: E2E CLI Harness and Living Inventory - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 80-E2E CLI Harness and Living Inventory
**Areas discussed:** Harness shape, Inventory source of truth, Inventory granularity, Failure diagnostics

---

## Harness shape

| Option | Description | Selected |
|--------|-------------|----------|
| Shared helpers in `tests/helpers.ts` with a reusable runCli-style subprocess wrapper | Consolidate the existing repeated `Bun.spawnSync(... "src/index.ts" ...)` pattern into shared helpers while keeping the existing test architecture. | ✓ |
| A dedicated E2E harness module outside `tests/helpers.ts` | Build a separate subsystem for E2E execution. | |
| Keep mostly per-file wrappers and extract only tiny shared pieces | Preserve the current scattered wrapper pattern with only minimal deduplication. | |

**User's choice:** Shared helpers in `tests/helpers.ts` with a reusable runCli-style subprocess wrapper.
**Notes:** Keep the shared layer small: `runCli`-style execution, isolated config/git env setup, and reusable fixture builders. Assertions stay in each test file; no scenario DSL.

---

## Inventory source of truth

| Option | Description | Selected |
|--------|-------------|----------|
| A typed TypeScript inventory module in the repo | Use typed repo-owned data as the canonical machine-readable source. | ✓ |
| A JSON or YAML inventory artifact plus separate markdown docs | Use a data file plus separate documentation. | |
| A markdown-first inventory document with embedded machine-readable structure | Make the human-readable document the main artifact. | |

**User's choice:** A typed TypeScript inventory module in the repo.
**Notes:** If a human-readable inventory view is still required after the roadmap update, it should be generated and minimal only. The user does not care about a polished human-readable inventory and plans to refine the roadmap accordingly.

---

## Inventory granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Stable flow-level IDs where needed | Use stable user-flow entries, with one command mapping to one item only when that truly matches the user flow. | ✓ |
| Every command/subcommand/flag as its own item | Maximal command-surface decomposition. | |
| Broad capability buckets | Inventory high-level areas instead of precise flows. | |

**User's choice:** Stable flow-level IDs where needed.
**Notes:** Avoid a brittle command/flag explosion. Command-level items are only appropriate when they actually represent standalone flows.

---

## Failure diagnostics

| Option | Description | Selected |
|--------|-------------|----------|
| Rich failure bundle only on failure | Emit argv, cwd, exit code, stdout, stderr, and relevant artifact paths for failing scenarios while keeping passing runs quiet. | ✓ |
| Always print full command transcripts | Make every run verbose, including passing tests. | |
| Terse failures unless opt-in debug is enabled | Keep default failures short and hide most context. | |

**User's choice:** Rich failure bundle only on failure.
**Notes:** Environment details should be limited to a curated, redacted subset relevant to the scenario rather than a full env dump.

---

## Claude's Discretion

- Exact helper names and local file boundaries around the shared harness helpers.
- Exact inventory type names and any minimal generated view mechanism.
- Exact failure-bundle formatting and env-redaction helpers.

## Deferred Ideas

- Removing the human-readable/documented inventory requirement entirely after roadmap refinement.
- Any hand-maintained prose inventory or richer reporting layer.
