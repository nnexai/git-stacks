# Phase 101: Completion Completeness Repair - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 101-Completion Completeness Repair
**Areas discussed:** Todo folding, command coverage boundary, regression gate

---

## Todo Folding

| Option | Description | Selected |
|--------|-------------|----------|
| None | Do not fold matched deferred todos into Phase 101. | ✓ |
| Fold manual workspace commands | Fold the manual-command todo because `command` completions are relevant. | |
| Fold workspace notes | Fold the notes todo because `notes` completions are relevant. | |
| Fold forge source workspace creation | Fold the forge/source todo because source-adjacent completions are relevant. | |
| Fold all command-family matches | Fold every matched command-family todo into Phase 101. | |

**User's choice:** None.
**Notes:** Matched todos remain reviewed-but-not-folded. Phase 101 verifies completion coverage for shipped command surfaces without widening into todo implementation.

---

## Command Coverage Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Command coverage audit | Verify command coverage and close any completion gaps. | ✓ |
| Selective family patch | Focus only on known recently-added command families. | |
| Agent discretion | Let planning decide whether broad audit is needed. | |

**User's choice:** "basically i want you to verify the coverage of commands and ensure any gaps are closed."
**Notes:** This locks Phase 101 as a full current-command-tree completion audit and repair, not a selective patch.

---

## Regression Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Live inventory required | Build or reuse a machine-readable inventory from the live Commander tree and compare generated completion coverage against it. | ✓ |
| Focused assertions only | Add targeted tests for known missing families and important dynamic cases. | |
| Hybrid | Use live inventory for command/subcommand presence, plus focused assertions for dynamic value behavior and shell-specific edge cases. | |

**User's choice:** Live inventory required.
**Notes:** Focused shell/dynamic assertions are still useful, but the primary gate must prevent future command additions from silently missing completion coverage.

---

## the agent's Discretion

- Exact inventory shape and test-file split.
- Whether to parse generated shell output directly or expose a structured completion model for tests.
- How far to take shell-specific executable simulation after the live inventory gate is in place.

## Deferred Ideas

- Reviewed matched todos were not folded into this phase and are listed in `101-CONTEXT.md`.
