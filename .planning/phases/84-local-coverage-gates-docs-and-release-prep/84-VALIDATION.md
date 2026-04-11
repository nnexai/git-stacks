---
phase: 84
slug: local-coverage-gates-docs-and-release-prep
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-11
---

# Phase 84 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` on Bun 1.3.10 plus repo-local Bun scripts |
| **Config file** | `bunfig.toml`, `scripts/test-runner.ts`, and planned `scripts/verify*.ts` helpers |
| **Quick run command** | `bun run verify:prereqs && bun test tests/lib/verify-gates.test.ts -x && bun test tests/lib/verify.test.ts -x` |
| **Full suite command** | `bun run verify` |
| **Estimated runtime** | ~20-30 seconds quick loop / ~60-90 seconds full verify |

---

## Sampling Rate

- **Before any Phase 84 file edits:** Run the prerequisite audit from Plan 84-01 and stop on any missing Phase 80/83 surface.
- **After every task commit:** Run the narrowest relevant command from the verification map below.
- **After every plan wave:** Run `bun run verify` once the verify surface exists.
- **Before `/gsd-verify-work`:** `bun run verify` must pass and `README.md` / `CHANGELOG.md` / `package.json` must match the documented release surface.
- **Max feedback latency:** 30 seconds for task-level checks; ~90 seconds for full-wave verify

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 84-01-01 | 01 | 1 | GATE-01, GATE-02 | T-84-01 | Phase 84 halts before implementation when the canonical Phase 80 inventory module or its tests are missing. | integration | `test -f tests/e2e-inventory.ts && test -f tests/lib/e2e-inventory.test.ts && bun test tests/lib/e2e-inventory.test.ts -x` | n/a | ⬜ pending |
| 84-01-02 | 01 | 1 | GATE-01, GATE-02 | T-84-02 | Phase 84 halts before implementation when the Phase 83 coverage scripts or stable `.coverage/` outputs are missing. | integration | `rg -q '"coverage"' package.json && rg -q '"coverage:unit"' package.json && rg -q '"coverage:integ"' package.json && rg -q '^\.coverage/$' .gitignore && bun run coverage && test -f .coverage/coverage-final.json && test -f .coverage/coverage-summary.json && test -f .coverage/lcov.info && test -f .coverage/index.html` | n/a | ⬜ pending |
| 84-02-01 | 02 | 2 | GATE-01, GATE-02 | T-84-03 / T-84-05 | The gate collector aggregates inventory drift, unmapped inventory items, mapped-test path drift, and `.coverage/` artifact problems into one report before exiting. | unit | `bun test tests/lib/verify-gates.test.ts -x` | ❌ W0 | ⬜ pending |
| 84-02-02 | 02 | 2 | GATE-03 | T-84-04 | `bun run verify` stays local-only, refreshes coverage before gate validation, exposes prerequisite/gate helpers, and preserves the existing `test*`, `test:deps`, and `typecheck` command bodies. | integration | `bun test tests/lib/verify.test.ts -x && bun run verify:prereqs && bun run verify:gates` | ❌ W0 | ⬜ pending |
| 84-03-01 | 03 | 3 | GATE-03 | T-84-06 | README documents the shipped verify workflow and debug format without stale bracket/timing examples or unrelated doc sprawl. | docs | `rg -n "bun run verify|bun run verify:prereqs|bun run verify:gates|bun run coverage|GS_DEBUG|GIT_STACKS_DEBUG|op=.*module=.*msg=" README.md` | ❌ W0 | ⬜ pending |
| 84-03-02 | 03 | 3 | GATE-03 | T-84-07 | Release metadata is limited to v0.17.1 verify/coverage/gate/debug surface updates. | docs | `node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); if (pkg.version !== '0.17.1') process.exit(1)" && rg -n '^## \\[0\\.17\\.1\\]' CHANGELOG.md && rg -n "bun run verify|verify:gates|coverage|GS_DEBUG" CHANGELOG.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Confirm the upstream prerequisite surfaces exist before any Phase 84 implementation edit: `tests/e2e-inventory.ts`, `tests/lib/e2e-inventory.test.ts`, Phase 83 `coverage*` scripts in `package.json`, `.gitignore` entry for `.coverage/`, and successful local generation of `.coverage/coverage-final.json`, `.coverage/coverage-summary.json`, `.coverage/lcov.info`, and `.coverage/index.html`
- [ ] `scripts/verify-gates.ts` — aggregated inventory/mapping/coverage gate collector
- [ ] `tests/lib/verify-gates.test.ts` — deterministic aggregation coverage
- [ ] `scripts/verify.ts` — umbrella local verification workflow with prerequisite mode
- [ ] `tests/lib/verify.test.ts` — verify command ordering/preservation coverage
- [ ] README target section identified for in-place verify/debug refresh only (no broader rewrite)
- [ ] `CHANGELOG.md` top entry and `package.json` version target aligned to `0.17.1`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | — | — |

*All planned Phase 84 behaviors should have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s for task loops and < 90s for full-wave verify
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
