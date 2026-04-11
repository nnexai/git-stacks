# Phase 83: Istanbul-Based Subprocess Coverage Reporting - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 83-Istanbul-Based Subprocess Coverage Reporting
**Areas discussed:** Coverage command surface, Report bundle, Artifact layout and cleanup, Coverage accounting

---

## Coverage command surface

| Option | Description | Selected |
|--------|-------------|----------|
| `coverage` + `coverage:unit` + `coverage:integ` | Mirrors the existing test script split while keeping one obvious full-suite entrypoint | ✓ |
| `coverage` only | Single full-suite command with no scoped helpers | |
| `coverage --unit` / `coverage --integ` | One script with flag-driven scope switching | |

**User's choice:** Add `bun run coverage` plus scoped `bun run coverage:unit` / `bun run coverage:integ` helpers.
**Notes:** Keep the new coverage UX aligned with the repo's existing `test`, `test:unit`, and `test:integ` script split.

---

## Report bundle

| Option | Description | Selected |
|--------|-------------|----------|
| Summary + HTML + machine-readable Istanbul artifacts | Terminal summary, browsable HTML, merged JSON, summary JSON, and LCOV from the same run | ✓ |
| Summary + machine-readable artifacts only | No HTML output | |
| Summary + HTML + one merged JSON | Human-readable output plus only a minimal machine-readable artifact | |

**User's choice:** Terminal summary + browsable HTML report + machine-readable Istanbul artifacts (`coverage-final.json`, summary JSON, LCOV).
**Notes:** The default output should be immediately useful to humans and later local automation without rerunning or converting reports.

---

## Artifact layout and cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Stable final outputs, disposable intermediates | Keep final reports in `.coverage/`, but rebuild scratch artifacts each run | ✓ |
| Preserve intermediates for debugging | Keep final reports plus instrumented files and raw per-process shards under `.coverage/` | |
| OS-temp intermediates only | Keep final outputs in `.coverage/` and push all scratch artifacts to temp space | |

**User's choice:** Keep final reports in a stable `.coverage/` directory, but treat instrumented source and per-process scratch artifacts as disposable and rebuild them each run.
**Notes:** The stable output directory should stay inspectable without becoming cluttered with implementation debris.

---

## Coverage accounting

| Option | Description | Selected |
|--------|-------------|----------|
| Full-source accounting | Include all `src/**/*.ts` files and show untouched files as 0% | ✓ |
| Exercised-files only | Report only files touched during the run | |
| Hybrid by command scope | Full-source for full-suite coverage, exercised-files-only for scoped variants | |

**User's choice:** Include all `src/**/*.ts` files in the report and show untouched files as 0%.
**Notes:** Reports should remain honest about the full shipped source surface and support future local gating.

---

## the agent's Discretion

- Exact script implementation split between `package.json` and supporting runner files
- Exact scratch artifact naming and cleanup mechanics
- Exact include/exclude details beyond the locked `src/**/*.ts` accounting rule

## Deferred Ideas

None.
