# Phase 88 - Pattern Map

**Created:** 2026-05-15
**Purpose:** Closest local analogs for the Phase 88 executor.

## Planned File Map

| Target file | Role | Closest analogs | Pattern to reuse |
|-------------|------|-----------------|------------------|
| `tests/functional-readiness-inventory.ts` | Machine-readable functional readiness source of truth | `tests/e2e-inventory.ts` | Export typed readonly data and helper functions; represent exclusions as explicit entries, not prose-only notes. |
| `scripts/functional-coverage-readiness.ts` | Functional coverage readiness collector and formatter | `scripts/verify-gates.ts` | Parse `.coverage/coverage-final.json`, return structured report objects, and format grouped actionable findings. |
| `tests/lib/functional-coverage-readiness.test.ts` | Fixture tests for readiness classification | `tests/lib/verify-gates.test.ts` | Use temp roots and tiny Istanbul-shaped coverage JSON fixtures; do not run `bun run coverage` inside unit tests. |
| `scripts/verify-gates.ts` | Local gate integration | Existing same file | Extend `VerifyGateReport`; collect all readiness problems before returning; keep existing inventory and coverage checks intact. |
| `tests/lib/verify-gates.test.ts` | Regression tests for aggregated gate output | Existing same file | Add fixture assertions that readiness must-fix problems are included with existing gate findings. |
| `package.json` | Optional debug script surface | Existing scripts | If added, keep `bun run verify` stable and make new scripts debugging aids under it. |
| `.planning/v0.17.1-FUNCTIONAL-COVERAGE-READINESS.md` | Release-readiness evidence before finalization | `CHANGELOG.md`, `README.md`, phase summaries | Commit human-readable evidence, not raw `.coverage/` artifacts; explicitly avoid milestone archive/tag/publish. |
| `README.md`, `CHANGELOG.md` | Maintainer-facing release-readiness wording | Existing verification and changelog sections | Keep wording scoped to functional readiness gates and local-only coverage. |

## Concrete Interfaces

### `tests/e2e-inventory.ts`

- `E2EInventoryItem` uses `id`, `family`, `flowType`, `commands`, `scopeStatus`, `mappedTests`, and `rationale`.
- Exclusions are first-class inventory entries with `scopeStatus: "excluded"`.
- Helper functions include `getInScopeItems`, `getExcludedItems`, `getUnmappedInScopeItems`, and `validateE2EInventory`.

### `scripts/verify-gates.ts`

- `collectVerifyGateReport(options?: CollectOptions): VerifyGateReport`
- `formatVerifyGateReport(report: VerifyGateReport): string`
- `VerifyGateReport.ok` is true only when every collected problem list is empty.
- Existing report fields must remain compatible: `inventoryDrift`, `unmappedInScopeItems`, `missingMappedTests`, `coverageArtifacts`, and `coverageSentinels`.

### `scripts/verify.ts`

- `getVerifyCommands(): string[]`
- `runVerifyWorkflow(options?: VerifyWorkflowOptions): Promise<number>`
- The `VERIFY_COMMANDS` list already includes `bun run coverage` before `bun run verify:gates`.

## Established Test Patterns

- Use `bun:test` with fixture files under temporary roots.
- Do not call `bun test tests/`; use focused `bun test <file>` or package scripts.
- Tests that only import scripts and write temp JSON can run with `bun test tests/lib/<file>.test.ts`.
- Full validation should use `bun run coverage`, `bun run verify:gates`, and `bun run verify`.

## Landmines

- Do not make maintainers combine scoped reports manually; `bun run coverage` remains canonical.
- Do not add CI workflows or numeric threshold policy for Phase 88.
- Do not classify real external-environment gaps as failures when the phase context says they are deferred.
- Do not commit `.coverage/` raw artifacts.
- Do not archive milestones, create tags, publish releases, or run `$gsd-complete-milestone`.
