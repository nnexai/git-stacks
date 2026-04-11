# Phase 84: Local Coverage Gates, Docs, and Release Prep - Research

**Researched:** 2026-04-11
**Domain:** Local Bun-based verification orchestration for E2E inventory, coverage artifacts, and release-scope maintainer docs. [VERIFIED: repo code] [VERIFIED: phase context]
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Verification entrypoint
- **D-01:** Add one stable `bun run verify` umbrella command as the primary maintainer-facing local verification path.
- **D-02:** Documentation should still show the underlying component commands beneath `bun run verify` so maintainers can run or debug individual checks directly.

### Gate failure style
- **D-03:** Inventory and mapping gates should aggregate all detected problems into one report, then exit non-zero.
- **D-04:** The local gate UX should optimize for maintenance cleanup in one pass rather than fail-fast reruns for each missing inventory entry or unmapped test.

### Docs and release-prep scope
- **D-05:** README/CHANGELOG/version updates should stay tightly focused on the new coverage command(s), the `bun run verify` workflow, the inventory gates, and required release metadata.
- **D-06:** Do not broaden Phase 84 into a general rewrite of testing architecture docs or unrelated CLI documentation.

### Debug logging documentation
- **D-07:** Replace the existing older bracket/timing README examples in place with examples that match the shipped key/value stderr format.
- **D-08:** Document `GS_DEBUG` as the primary debug interface, while still noting `GIT_STACKS_DEBUG=1` as a legacy compatibility alias rather than the main recommendation.

### Locked upstream constraints
- **D-09:** Phase 84 gates must treat the Phase 80 machine-parseable inventory as the canonical source of truth for in-scope command coverage.
- **D-10:** Phase 84 must consume the stable `.coverage/` outputs produced by Phase 83 rather than redefining the coverage artifact contract.
- **D-11:** Verification remains local-only for this milestone; do not add CI workflows or mandatory numeric coverage thresholds here.

### the agent's Discretion
- Exact breakdown of helper scripts beneath `bun run verify`, as long as the top-level maintainer entrypoint stays stable and documented.
- Exact formatting of the aggregated gate report, including whether it groups by missing inventory entry, unmapped test, or supporting artifact issue.
- Exact scope of version/changelog edits needed for release prep, as long as they stay focused on the shipped E2E/coverage/verification surface.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GATE-01 | Local verification can fail when a new in-scope command is added without updating the E2E coverage inventory. | Add one aggregated gate script that compares the live Commander command surface against the canonical `tests/e2e-inventory.ts` entries instead of relying on docs or CI. [VERIFIED: requirements] [VERIFIED: repo code] [VERIFIED: phase 80 plan] |
| GATE-02 | Local verification can fail when an in-scope inventory item has no mapped E2E test. | Reuse the Phase 80 validator shape (`getUnmappedInScopeItems()` / `validateE2EInventory()`) and also verify every mapped test path exists before reporting green. [VERIFIED: requirements] [VERIFIED: phase 80 plan] |
| GATE-03 | Existing unit, integration, dependency, and typecheck commands continue to pass with the expanded E2E and coverage tooling. | Keep `test`, `test:unit`, `test:integ`, `test:deps`, and `typecheck` intact in `package.json`; add `verify` as a wrapper, not a replacement. [VERIFIED: requirements] [VERIFIED: repo code] |
| COVR-01 | Developer can run one command that generates a coverage report for the full test suite, including the existing shared-process unit runner and isolated E2E runner files. | Phase 84 should call the Phase 83 `bun run coverage` entrypoint from `bun run verify` instead of creating a second coverage interface. [VERIFIED: requirements] [VERIFIED: phase context] |
| COVR-02 | Coverage reports include source files exercised by subprocess-based E2E tests through Istanbul-compatible instrumentation and merged per-process artifacts. | Consume the Phase 83 machine-readable outputs only as inputs; do not reopen instrumentation design in Phase 84. [VERIFIED: requirements] [VERIFIED: phase context] |
| COVR-03 | Coverage output is written to a stable ignored directory and supports both human-readable summary output and machine-readable Istanbul artifacts usable by local verification gates. | Read `.coverage/coverage-final.json`, summary JSON, and LCOV from the Phase 83 contract; treat missing `.coverage/` support on this branch as a prerequisite gap, not Phase 84 scope expansion. [VERIFIED: requirements] [VERIFIED: phase context] [VERIFIED: repo code] |
| COVR-04 | Coverage reporting does not make normal `bun run test`, `bun run test:unit`, or `bun run test:integ` materially slower unless coverage is explicitly requested. | Keep coverage opt-in behind `coverage*` and `verify`; do not change the existing `test*` script definitions. [VERIFIED: requirements] [VERIFIED: repo code] [VERIFIED: phase context] |
</phase_requirements>

## Summary

Phase 84 should be planned as a thin maintainer-workflow layer over already-decided upstream artifacts, not as a new testing subsystem. The repo already uses `package.json` scripts as the public workflow surface and `scripts/test-runner.ts` as the split test orchestrator, so the cleanest Phase 84 shape is `package.json` → `scripts/verify.ts` → existing commands plus one aggregated gate module. [VERIFIED: repo code] [VERIFIED: phase context]

The main planning risk is prerequisite drift. On the live branch today, `tests/e2e-inventory.ts` is missing, no Phase 83 coverage scripts or `.coverage/` artifacts exist, `.gitignore` still does not ignore `.coverage/`, and `package.json` has no `verify` or `coverage` scripts yet. Phase 84 therefore needs an explicit first plan that verifies those upstream surfaces exist before implementation proceeds, rather than silently absorbing Phase 80/83 work. [VERIFIED: repo code] [VERIFIED: phase 80 plan] [VERIFIED: phase context]

README and release-prep work should stay surgical. `src/index.ts` already prefers `GS_DEBUG` and only falls back to `GIT_STACKS_DEBUG === "1"`, while `src/lib/observability.ts` emits key/value payloads like `op=... module=... msg=...`; the current README and older changelog copy still describe the older bracket/timing presentation as if that were the main contract. Phase 84 should refresh those docs in place while keeping the rest of the README untouched. [VERIFIED: repo code] [VERIFIED: phase context]

**Primary recommendation:** Use exactly three plans: (1) prerequisite guard, (2) local `verify` + aggregated gates, and (3) narrow docs/release prep. Put the umbrella command in `package.json`, put orchestration logic under `scripts/`, and make the gate script consume Phase 80 inventory and Phase 83 `.coverage/` outputs without inventing new contracts or thresholds. [VERIFIED: repo code] [VERIFIED: phase context] [ASSUMED]

## Key Findings

### 1. The branch still lacks the upstream artifacts Phase 84 is supposed to consume

- `tests/e2e-inventory.ts` and `tests/lib/e2e-inventory.test.ts` do not exist on the current branch even though Phase 80 planning names them as canonical artifacts. [VERIFIED: repo code] [VERIFIED: phase 80 plan]
- No `coverage`, `coverage:unit`, `coverage:integ`, or `verify` scripts exist in `package.json`; only `test`, `test:unit`, `test:integ`, `test:deps`, and `typecheck` are present. [VERIFIED: repo code]
- `.gitignore` does not ignore `.coverage/`, and no `.coverage/` directory currently exists. [VERIFIED: repo code]
- The Phase 83 planning directory contains context only; no Phase 83 research or plan files are present on this branch. [VERIFIED: repo code]

### 2. `package.json` + `scripts/` is the established place for maintainer workflows

- The repo already exposes every maintainer entrypoint through `package.json` scripts. [VERIFIED: repo code]
- The only existing custom orchestration logic for test execution lives under `scripts/` in `scripts/test-runner.ts`. [VERIFIED: repo code]
- That makes `package.json` the correct home for `bun run verify`, with repo-local helpers under `scripts/` rather than new logic under `src/`. [VERIFIED: repo code] [VERIFIED: phase context] [ASSUMED]

### 3. Aggregation requires a real script, not a shell-only command chain

- The locked Phase 84 UX requires inventory and mapping problems to be collected into one report before exiting non-zero. [VERIFIED: phase context]
- A dedicated Bun script can collect missing inventory entries, unmapped in-scope inventory IDs, broken mapped test paths, and missing/invalid coverage artifacts in one pass. [VERIFIED: phase context] [ASSUMED]
- A shell chain is still fine for sequencing the already-existing `test:deps` and `typecheck` commands after gate evaluation, but the aggregation step itself belongs in code. [VERIFIED: phase context] [ASSUMED]

### 4. The most reliable GATE-01 input is the live Commander tree, not prose docs

- `src/index.ts` already imports and registers the full CLI surface through Commander primitives such as `registerWorkspaceCommands(program)`, `configCommand`, `repoCommand`, `templateCommand`, `integrationCommand`, and `createCompletionCommand(program)`. [VERIFIED: repo code]
- That means a gate script can instantiate the current command tree directly from source imports and compare discovered command paths with the canonical inventory command strings from Phase 80. [VERIFIED: repo code] [ASSUMED]
- This stays local, machine-readable, and aligned with the shipped CLI instead of depending on CI or human-maintained docs. [VERIFIED: repo code] [VERIFIED: phase context] [ASSUMED]

### 5. The README debug section is stale against shipped behavior

- `src/index.ts` resolves debug configuration with `process.env.GS_DEBUG ?? (process.env.GIT_STACKS_DEBUG === "1" ? "1" : undefined)`, so `GS_DEBUG` is already the primary interface and `GIT_STACKS_DEBUG=1` is only a compatibility fallback. [VERIFIED: repo code]
- `src/lib/observability.ts` emits payloads such as `op=debug module=status msg=...` and `op=getWorkspaceListInfo module=status msg=completed ms=...`; the sink still prefixes the category in brackets, so the shipped line shape is bracket-prefix plus key/value fields. [VERIFIED: repo code]
- README and the `0.16.0` changelog entry still describe the older timing-label examples like `[workspace-status] getWorkspaceListInfo: 12ms` as the primary format. [VERIFIED: repo code]

## Project Constraints (from copilot-instructions.md)

- Use GSD workflows only when the user explicitly invokes them. [VERIFIED: repo code]
- Treat `gsd-*` and `/gsd-*` as command invocations and load the matching skill. [VERIFIED: repo code]
- Prefer a matching custom agent when a GSD command requests a subagent. [VERIFIED: repo code]
- After completing a GSD deliverable, offer the next step to the user. [VERIFIED: repo code]

## Standard Stack

### Core

| Library / Surface | Version | Purpose | Why Standard |
|-------------------|---------|---------|--------------|
| Bun runtime | 1.3.10 | Executes repo-local verification scripts and the existing test suite. [VERIFIED: local environment] | The whole repo already runs TypeScript directly under Bun with no build step. [VERIFIED: repo code] |
| `package.json` scripts | repo-local | Maintainer-facing command surface for `test`, `test:unit`, `test:integ`, `test:deps`, and future `coverage` / `verify`. [VERIFIED: repo code] | This is already the canonical workflow entrypoint pattern in the repo. [VERIFIED: repo code] |
| `scripts/test-runner.ts` | repo-local | Preserves the current shared-process unit vs isolated integration split. [VERIFIED: repo code] | Phase 84 must compose this runner, not replace it. [VERIFIED: repo code] [VERIFIED: phase context] |
| `tests/e2e-inventory.ts` | planned repo-local artifact | Canonical machine-parseable inventory input for GATE-01 and GATE-02. [VERIFIED: phase 80 plan] | Phase 80 explicitly designates this file as the single source of truth. [VERIFIED: phase 80 plan] |

### Supporting

| Library / Surface | Version | Purpose | When to Use |
|-------------------|---------|---------|-------------|
| Commander | 14.0.3 | Build the live command tree for inventory-drift detection. [VERIFIED: npm registry] [VERIFIED: repo code] | Use inside the gate script to inspect shipped command paths without parsing docs. [VERIFIED: repo code] [ASSUMED] |
| Madge | 8.0.0 | Existing dependency-cycle gate behind `bun run test:deps`. [VERIFIED: npm registry] [VERIFIED: repo code] | Keep it as an underlying component command surfaced by `verify`. [VERIFIED: repo code] |
| `.coverage/coverage-final.json` + summary JSON + LCOV | Phase 83 contract | Stable machine-readable coverage inputs for local verification. [VERIFIED: phase context] | Read only these stable outputs; do not redefine the coverage contract in Phase 84. [VERIFIED: phase context] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `package.json` `verify` → repo-local `scripts/verify.ts` | A long shell-only `verify` command string | A raw shell chain is poor at producing the required one-pass aggregated report for inventory and mapping problems. [VERIFIED: phase context] [ASSUMED] |
| Live command-tree comparison | Manual README checklist updates | A docs-only checklist cannot satisfy GATE-01 because it cannot fail automatically on new in-scope command drift. [VERIFIED: requirements] |
| Local-only `bun run verify` | CI workflow enforcement | CI would conflict with the locked local-only milestone constraint. [VERIFIED: state] [VERIFIED: phase context] |

**Installation:** None beyond the existing repo toolchain; Phase 84 should extend `package.json` and `scripts/` instead of adding a second workflow surface. [VERIFIED: repo code] [VERIFIED: phase context]

**Version verification:** [VERIFIED: npm registry] [VERIFIED: local environment]
- Bun runtime → `1.3.10` (installed locally)
- `commander` → `14.0.3` (registry current as of 2026-04-11)
- `typescript` → `6.0.2` (registry current as of 2026-04-11)
- `madge` → `8.0.0` (registry current as of 2026-04-11)

## Architecture Patterns

### Recommended Project Structure

```text
package.json                  # public maintainer scripts: coverage*, verify*, test*, typecheck
scripts/
├── test-runner.ts            # existing split runner
├── verify.ts                 # umbrella local workflow entrypoint
└── verify-gates.ts           # aggregated inventory/mapping/coverage checks
tests/
├── e2e-inventory.ts          # canonical Phase 80 inventory input
└── lib/
    └── verify-gates.test.ts  # pure gate aggregation tests
```

Use `package.json` for the stable user-facing names and `scripts/` for orchestration logic, because that is already how the repo exposes maintainers’ workflows today. [VERIFIED: repo code] The exact new filenames above are a recommended fit, not a locked decision. [ASSUMED]

### Pattern 1: One thin umbrella command over existing component commands

**What:** Make `bun run verify` the stable maintainer entrypoint, but keep the underlying `coverage`, `test:deps`, `typecheck`, and gate command surfaces individually runnable. [VERIFIED: phase context] [ASSUMED]

**When to use:** For release-readiness and milestone-local verification documentation. [VERIFIED: roadmap] [VERIFIED: phase context]

**Why here:** `package.json` already exposes all canonical repo workflows, and the phase context explicitly requires the underlying component commands to remain documented. [VERIFIED: repo code] [VERIFIED: phase context]

### Pattern 2: Gate aggregation in one pure collector

**What:** Put inventory drift, unmapped in-scope inventory IDs, broken mapped-test paths, and missing/invalid `.coverage/` artifact checks into one collector that returns a structured report before setting the final exit code. [VERIFIED: phase context] [ASSUMED]

**When to use:** Inside `verify` and as a directly runnable helper for maintainers debugging local failures. [VERIFIED: phase context] [ASSUMED]

**Boundary rule:** Coverage validation should stop at “artifact exists and parses as the Phase 83 contract promised”; it should not introduce thresholds or invent new coverage file names. [VERIFIED: phase context]

### Pattern 3: Prerequisite guard before Phase 84 logic

**What:** Make the first plan explicitly verify that upstream artifacts exist on the target branch: `tests/e2e-inventory.ts`, its validators, the Phase 83 `coverage*` scripts, and stable `.coverage/` outputs. [VERIFIED: repo code] [VERIFIED: phase 80 plan] [VERIFIED: phase context]

**When to use:** First task / first plan file. [VERIFIED: repo code] [ASSUMED]

**Why here:** The current branch visibly lacks those surfaces, so skipping this guard would cause Phase 84 work to absorb upstream phase scope by accident. [VERIFIED: repo code]

### Pattern 4: In-place docs refresh, not README sprawl

**What:** Update the existing README debug section in place, add one narrow maintainer verification section, and keep CHANGELOG/package version edits limited to verify/coverage/gate/release metadata. [VERIFIED: phase context] [VERIFIED: repo code] [ASSUMED]

**When to use:** The docs/release-prep plan only. [VERIFIED: phase context]

### Anti-Patterns to Avoid

- **Phase 84 as a backup implementation for Phase 80/83:** If inventory or coverage contracts are still absent, block early instead of rebuilding them here. [VERIFIED: repo code] [VERIFIED: phase context]
- **Fail-fast inventory gate UX:** The locked requirement is one aggregated report, not one missing item per rerun. [VERIFIED: phase context]
- **Threshold-based coverage policy:** Numeric coverage enforcement is explicitly future work, not Phase 84 scope. [VERIFIED: requirements] [VERIFIED: phase context]
- **Treating `GIT_STACKS_DEBUG=1` as the primary doc path:** The shipped bootstrap favors `GS_DEBUG`; the alias is legacy compatibility only. [VERIFIED: repo code] [VERIFIED: phase context]

## Recommended Plan Shape

### Plan 84-01: Prerequisite guard and branch-surface audit

- Verify that the canonical Phase 80 inventory module and validators exist at the planned paths. [VERIFIED: phase 80 plan] [VERIFIED: repo code]
- Verify that Phase 83 command surfaces exist (`coverage`, `coverage:unit`, `coverage:integ`) and that `.coverage/` is the chosen stable output directory. [VERIFIED: phase context] [VERIFIED: repo code]
- If those surfaces are missing, block with an explicit prerequisite report instead of implementing substitute inventory or coverage logic inside Phase 84. [VERIFIED: repo code] [VERIFIED: phase context]

### Plan 84-02: Local gates and `bun run verify`

- Add `bun run verify` in `package.json` and keep the underlying component commands visible. [VERIFIED: phase context] [VERIFIED: repo code]
- Implement a repo-local gate collector under `scripts/` that aggregates: live-command-surface drift, unmapped in-scope inventory IDs, missing mapped test files, and missing/invalid Phase 83 machine-readable coverage artifacts. [VERIFIED: phase context] [VERIFIED: repo code] [ASSUMED]
- Keep `test`, `test:unit`, `test:integ`, `test:deps`, and `typecheck` intact; `verify` should compose them rather than alter their behavior. [VERIFIED: repo code] [VERIFIED: requirements]

### Plan 84-03: Narrow docs and release prep

- Update README only where Phase 84 changes maintainer-facing behavior: one verify/coverage section plus the existing Debug Output section. [VERIFIED: phase context] [VERIFIED: repo code] [ASSUMED]
- Refresh README examples to show the shipped stderr format with bracket prefix plus key/value payloads, and document `GS_DEBUG` first with `GIT_STACKS_DEBUG=1` noted as a legacy alias. [VERIFIED: repo code] [VERIFIED: phase context]
- Prepare scoped release metadata updates in `package.json` and `CHANGELOG.md` for v0.17.1 surfaces only. `package.json` is currently `0.17.0` and `CHANGELOG.md` currently tops out at `0.17.0`. [VERIFIED: repo code]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Maintainer test orchestration | A second custom runner separate from `scripts/test-runner.ts` | Existing `test*` scripts plus a thin `verify` wrapper | The split runner already encodes the repo’s isolation rules. [VERIFIED: repo code] |
| Coverage artifact contract | New ad hoc JSON/XML file names | Phase 83 `.coverage/coverage-final.json`, summary JSON, and LCOV | Phase 84 is required to consume, not redefine, the Phase 83 contract. [VERIFIED: phase context] |
| Inventory source of truth | Markdown tables or README-maintained command lists | `tests/e2e-inventory.ts` | Phase 80 explicitly locks the typed module as canonical. [VERIFIED: phase 80 plan] [VERIFIED: phase context] |
| Release enforcement | GitHub Actions or mandatory thresholds | Local `bun run verify` with no numeric threshold gate | Local-only verification and no threshold policy are locked decisions. [VERIFIED: state] [VERIFIED: requirements] [VERIFIED: phase context] |

**Key insight:** Phase 84 should compose existing repo-native workflow surfaces, not introduce a new runner, new coverage format, new inventory format, or CI dependency. [VERIFIED: repo code] [VERIFIED: phase context]

## Common Pitfalls

### Pitfall 1: Absorbing missing upstream work into Phase 84

**What goes wrong:** The executor starts writing inventory or coverage-generation logic inside Phase 84 because the current branch does not yet contain the planned Phase 80 or Phase 83 outputs. [VERIFIED: repo code]

**Why it happens:** The live branch currently lacks `tests/e2e-inventory.ts`, lacks `coverage*` scripts, and lacks `.coverage/` support. [VERIFIED: repo code]

**How to avoid:** Make the first plan a prerequisite gate that blocks when those upstream artifacts are missing. [VERIFIED: repo code] [VERIFIED: phase context]

**Warning signs:** A Phase 84 diff starts adding inventory data models, coverage instrumentation, or `.coverage/` report generation from scratch. [VERIFIED: phase 80 plan] [VERIFIED: phase context] [ASSUMED]

### Pitfall 2: Using fail-fast gate plumbing for an aggregate-report requirement

**What goes wrong:** The local gate stops on the first missing inventory entry or unmapped test, forcing repeated reruns. [VERIFIED: phase context]

**Why it happens:** Simple shell chaining is easier to write than a collector, but it does not satisfy the one-pass cleanup UX that D-03 and D-04 require. [VERIFIED: phase context] [ASSUMED]

**How to avoid:** Collect all gate findings in memory, print one grouped report, then exit non-zero once. [VERIFIED: phase context] [ASSUMED]

**Warning signs:** The proposal for `verify` is only a long `&&` string with no dedicated gate script. [VERIFIED: repo code] [ASSUMED]

### Pitfall 3: Re-documenting the old debug format

**What goes wrong:** README examples keep showing the old label/timing form as if it were the shipped main contract. [VERIFIED: repo code]

**Why it happens:** README and the older changelog text predate the current `op=... module=... msg=...` payload format. [VERIFIED: repo code]

**How to avoid:** Source examples directly from `src/lib/observability.ts` and `src/index.ts`, and document `GS_DEBUG` first. [VERIFIED: repo code] [VERIFIED: phase context]

**Warning signs:** New README prose still says timings look like `[workspace-status] getWorkspaceListInfo: 12ms` without showing key/value fields. [VERIFIED: repo code]

### Pitfall 4: Accidentally slowing normal test workflows

**What goes wrong:** Coverage logic leaks into `bun run test`, `bun run test:unit`, or `bun run test:integ`, making everyday feedback slower. [VERIFIED: requirements] [VERIFIED: phase context]

**Why it happens:** `verify` needs coverage, but the existing fast-path test commands are already separate and intentionally non-coverage. [VERIFIED: repo code] [VERIFIED: phase context]

**How to avoid:** Keep coverage behind `coverage*` and `verify`; leave the existing `test*` commands behaviorally unchanged. [VERIFIED: requirements] [VERIFIED: repo code] [VERIFIED: phase context]

**Warning signs:** Any proposal edits the existing `test`, `test:unit`, or `test:integ` script bodies to insert coverage flags or instrumentation setup. [VERIFIED: repo code] [ASSUMED]

## Code Examples

Verified patterns from repo sources:

### Existing maintainer workflow pattern

```json
// Source: package.json [VERIFIED: repo code]
{
  "scripts": {
    "test": "bun run scripts/test-runner.ts",
    "test:unit": "bun run scripts/test-runner.ts --unit",
    "test:integ": "bun run scripts/test-runner.ts --integ",
    "test:deps": "madge --circular --extensions ts src/",
    "typecheck": "tsc --noEmit"
  }
}
```

This is the pattern Phase 84 should extend with `coverage*`, `verify:gates`, and `verify`, rather than creating a second workflow surface elsewhere. [VERIFIED: repo code] [VERIFIED: phase context] [ASSUMED]

### Shipped debug stderr shape

```text
// Source: src/lib/observability.ts + src/index.ts [VERIFIED: repo code]
[workspace-status] op=getWorkspaceListInfo module=status msg=completed ms=12
[workspace-git] op=debug module=git msg=syncWorkspace.fetch: 2 repos
```

These examples match the current sink + payload implementation better than the older README timing-only examples. [VERIFIED: repo code]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate manual local commands with no single maintainer entrypoint | One documented `bun run verify` umbrella command over coverage, gates, and existing quality commands | Locked for Phase 84 context on 2026-04-11 | Gives maintainers one local release-readiness path without requiring CI. [VERIFIED: phase context] |
| README describes bracket/timing debug examples as the main contract | Runtime emits bracket-prefixed key/value stderr fields and `GS_DEBUG` is the primary interface | Shipped by current `src/index.ts` + `src/lib/observability.ts`; changelog wording is partly stale | Docs must be refreshed in place to match shipped behavior. [VERIFIED: repo code] |
| No stable local coverage artifact contract on the current branch | Phase 83 locks `.coverage/` plus machine-readable Istanbul artifacts for Phase 84 consumption | Locked in Phase 83 context on 2026-04-11 | Phase 84 can read coverage artifacts locally without inventing new formats or thresholds. [VERIFIED: phase context] |

**Deprecated/outdated:**
- README Debug Output wording that treats `GIT_STACKS_DEBUG=1` and old timing labels as the primary story. [VERIFIED: repo code]
- Any proposal to use CI or numeric coverage thresholds for this milestone. [VERIFIED: requirements] [VERIFIED: phase context]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The best file split is `scripts/verify.ts` plus `scripts/verify-gates.ts`, with one narrow unit-test file such as `tests/lib/verify-gates.test.ts`. | Architecture Patterns | Low — filenames can change without affecting phase intent. |
| A2 | `bun run verify` should call `bun run coverage` before gate evaluation, then run existing quality commands like `test:deps` and `typecheck` without reworking the existing `test*` scripts. | Summary / Recommended Plan Shape | Medium — command order affects runtime cost and failure UX. |
| A3 | README should gain one small maintainer-verification section in addition to the in-place Debug Output refresh. | Architecture Patterns / Recommended Plan Shape | Low — the exact README insertion point can change while staying in scope. |
| A4 | The cleanest GATE-01 implementation is to instantiate the live Commander tree inside a repo-local script and compare it to inventory command strings. | Key Findings / Architecture Patterns | Medium — if command-tree introspection proves awkward, the planner may need a nearby extraction helper. |

## Open Questions (RESOLVED)

1. **Will the target execution branch include the Phase 80 and Phase 83 artifacts before Phase 84 starts?**
   - What we know: The current branch is missing `tests/e2e-inventory.ts`, missing `coverage*` scripts, missing `.coverage/`, and missing a `.coverage/` ignore rule. [VERIFIED: repo code]
   - Resolution: Planning does not assume those artifacts will appear ahead of execution; Phase 84 therefore starts with an explicit prerequisite audit that blocks cleanly if those upstream artifacts are still absent. [VERIFIED: repo code] [VERIFIED: phase context]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | `package.json` scripts, test runner, future `verify` helpers | ✓ | 1.3.10 | — |
| Node.js | GSD tooling and package metadata inspection | ✓ | v25.9.0 | — |
| npm | Package version verification | ✓ | 11.12.1 | — |
| git | Existing CLI runtime checks and repo-fixture tests | ✓ | 2.53.0 | — |

**Missing dependencies with no fallback:**
- None in the current local environment. [VERIFIED: local environment]

**Missing dependencies with fallback:**
- None in the current local environment. [VERIFIED: local environment]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` under Bun 1.3.10. [VERIFIED: repo code] [VERIFIED: local environment] |
| Config file | `bunfig.toml`. [VERIFIED: repo code] |
| Quick run command | `bun test tests/lib/verify-gates.test.ts -x`. [ASSUMED] |
| Full suite command | `bun run verify`. [ASSUMED] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GATE-01 | New live in-scope command paths missing from inventory are reported together. [VERIFIED: requirements] | unit | `bun test tests/lib/verify-gates.test.ts -x`. [ASSUMED] | ❌ Wave 0 |
| GATE-02 | In-scope inventory items with empty or broken `mappedTests` are reported together. [VERIFIED: requirements] | unit | `bun test tests/lib/verify-gates.test.ts -x`. [ASSUMED] | ❌ Wave 0 |
| GATE-03 | Existing `test`, `test:unit`, `test:integ`, `test:deps`, and `typecheck` flows still pass unchanged. [VERIFIED: requirements] [VERIFIED: repo code] | smoke | `bun run test && bun run test:unit && bun run test:integ && bun run test:deps && bun run typecheck` | ✅ |
| COVR-01 | `verify` consumes the full-suite `coverage` command rather than replacing it. [VERIFIED: requirements] [VERIFIED: phase context] | smoke | `bun run coverage && bun run verify`. [ASSUMED] | ❌ Wave 0 |
| COVR-02 | Local verification reads subprocess-aware coverage outputs without redefining instrumentation. [VERIFIED: requirements] [VERIFIED: phase context] | unit/smoke | `bun test tests/lib/verify-gates.test.ts -x && bun run coverage`. [ASSUMED] | ❌ Wave 0 |
| COVR-03 | `.coverage/` machine-readable artifacts exist and parse before gates report green. [VERIFIED: requirements] | smoke | `bun run coverage && bun run verify:gates`. [ASSUMED] | ❌ Wave 0 |
| COVR-04 | Normal `test*` commands remain non-coverage fast paths. [VERIFIED: requirements] [VERIFIED: repo code] | smoke | `bun run test:unit && bun run test:integ`. | ✅ |

### Sampling Rate

- **Per task commit:** `bun test tests/lib/verify-gates.test.ts -x` for gate logic changes, or README/CHANGELOG grep checks for docs-only tasks. [ASSUMED]
- **Per wave merge:** `bun run verify` once the Phase 83 prerequisites exist. [ASSUMED]
- **Phase gate:** Run `bun run verify` plus the unchanged existing quality commands needed to prove GATE-03 before `/gsd-verify-work`. [VERIFIED: requirements] [ASSUMED]

### Wave 0 Gaps

- [ ] `tests/e2e-inventory.ts` — canonical inventory input expected from Phase 80. [VERIFIED: repo code] [VERIFIED: phase 80 plan]
- [ ] `tests/lib/e2e-inventory.test.ts` — reusable inventory validators expected from Phase 80. [VERIFIED: repo code] [VERIFIED: phase 80 plan]
- [ ] `package.json` `coverage`, `coverage:unit`, `coverage:integ` scripts — expected from Phase 83. [VERIFIED: repo code] [VERIFIED: phase context]
- [ ] `package.json` `verify` / `verify:gates` scripts — new Phase 84 surfaces. [VERIFIED: repo code] [ASSUMED]
- [ ] `scripts/verify.ts` and `scripts/verify-gates.ts` — recommended Phase 84 helpers. [ASSUMED]
- [ ] `.coverage/` ignored output contract on the current branch. [VERIFIED: repo code] [VERIFIED: phase context]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local maintainer scripts only; no auth surface added here. [VERIFIED: phase context] |
| V3 Session Management | no | Local CLI verification only; no session state added here. [VERIFIED: phase context] |
| V4 Access Control | no | Local repo workflow; no new authorization layer. [VERIFIED: phase context] |
| V5 Input Validation | yes | Validate inventory data, mapped test paths, and coverage JSON structure before reporting green. [VERIFIED: phase 80 plan] [VERIFIED: phase context] [ASSUMED] |
| V6 Cryptography | no | No cryptographic behavior is added in this phase. [VERIFIED: phase context] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shell injection while orchestrating `verify` component commands | Tampering / Elevation | Spawn commands with argv arrays from Bun APIs instead of `sh -c` string concatenation. [VERIFIED: repo code] [ASSUMED] |
| Trusting stale or malformed `.coverage/` artifacts | Tampering / Repudiation | Run or validate the Phase 83 coverage command before gating, and parse expected JSON artifacts explicitly. [VERIFIED: phase context] [ASSUMED] |
| False green from missing mapped test files | Tampering | Check that every `mappedTests` path exists in the repo before accepting the inventory mapping report. [VERIFIED: phase 80 plan] [ASSUMED] |

## Sources

### Primary (HIGH confidence)
- Repo audit — `package.json`, `.gitignore`, `README.md`, `CHANGELOG.md`, `src/index.ts`, `src/lib/observability.ts`, `scripts/test-runner.ts`, `bunfig.toml`, `tests/commands/debug-output.test.ts`, `tests/lib/observability.test.ts`. [VERIFIED: repo code]
- Planning docs — `.planning/ROADMAP.md` Phase 84, `.planning/REQUIREMENTS.md` COVR-01..04 and GATE-01..03, `.planning/STATE.md`, `.planning/PROJECT.md`, `84-CONTEXT.md`, `80-CONTEXT.md`, `83-CONTEXT.md`, `80-02-PLAN.md`. [VERIFIED: roadmap] [VERIFIED: requirements] [VERIFIED: phase context] [VERIFIED: phase 80 plan]
- Local environment probes — `bun --version`, `node --version`, `npm --version`, `git --version`. [VERIFIED: local environment]
- npm registry checks — `npm view commander version`, `npm view typescript version`, `npm view madge version`. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- Existing Phase 80 and 82.1 research docs for artifact style and prerequisite-drift precedent. [VERIFIED: repo code]

### Tertiary (LOW confidence)
- None. All low-confidence implementation-shape claims are tagged `[ASSUMED]` inline instead of being treated as verified facts.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — current workflow surfaces and versions are directly visible in repo code, local environment, and npm registry. [VERIFIED: repo code] [VERIFIED: local environment] [VERIFIED: npm registry]
- Architecture: MEDIUM — the recommended split fits existing repo patterns, but exact helper filenames and command order remain discretionary and upstream Phase 80/83 artifacts are absent on this branch. [VERIFIED: repo code] [VERIFIED: phase context] [ASSUMED]
- Pitfalls: HIGH — the main risks are directly evidenced by current branch drift and locked Phase 84 constraints. [VERIFIED: repo code] [VERIFIED: phase context]

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 for repo-local findings, or sooner if Phases 80/83 land and change the live branch surfaces. [VERIFIED: repo code] [ASSUMED]
