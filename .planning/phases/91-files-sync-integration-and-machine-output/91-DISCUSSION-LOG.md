# Phase 91: Files Sync Integration and Machine Output - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-16T10:45:06+02:00
**Phase:** 91-files-sync-integration-and-machine-output
**Areas discussed:** todo folding, lifecycle integration, machine output, TUI/automation boundary, README examples

---

## Todo Folding

| Option | Description | Selected |
|--------|-------------|----------|
| Fold Phase 91 slice of `Add bidirectional files sync` | Include lifecycle integration, JSON/machine output, completion/help, and README examples. | ✓ |
| Fold nothing | Leave all matches deferred. | |

**User's choice:** Fold the Phase 91 files-sync integration/output slice.
**Notes:** Other matches were deferred as noisy or future capability scope.

---

## Lifecycle Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-pull on create | Initial workspace creation materializes sync sources once. | ✓ |
| Explicit pull only | Require `git-stacks files pull` after create. | |
| Per-entry auto flag | Add `auto_pull: true` or similar. | |

**User's choice:** Auto-pull on create.
**Notes:** User selected no auto-pull on normal open, pull only newly created/missing targets during recreate, and fail creation clearly on sync conflicts or unsafe targets.

---

## Machine Output

| Option | Description | Selected |
|--------|-------------|----------|
| Per-entry JSON | Include workspace, scope, repo, type, target, state, counts, warnings/errors, and capped detail. | ✓ |
| Text-table mirror | Only mirror visible text table fields. | |
| Raw internal object | Expose internal comparison structures. | |

**User's choice:** Per-entry JSON, then corrected public stability.
**Notes:** User originally selected stable-enough JSON and capped verbose details, then corrected README/API direction: JSON should exist but not be over-documented or treated as a long-term locked public contract before testing.

---

## TUI and Automation Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| No dashboard UI now | Expose stable command/JSON behavior only; future TUI can consume it. | ✓ |
| Small dashboard indicator | Add sync drift indicator. | |
| Full dashboard actions | Add status/pull/push UI. | |

**User's choice:** No dashboard UI now.
**Notes:** User selected completion/help coverage and meaningful exit codes with JSON: nonzero on errors/refusals, zero when status/dry-run succeeds even if drift exists.

---

## README Examples

| Option | Description | Selected |
|--------|-------------|----------|
| `.planning`/`.codex` private config sync | Original agent/GSD use case. | |
| Broader private files | Dotfiles, specs, agent configuration such as skills/hooks. | ✓ |
| Generic assets | Shared generated config/assets sync. | |

**User's choice:** Dotfiles, specs, and agent configuration.
**Notes:** User selected security/practicality framing for sync versus symlink and explicit warning about `--force` mirroring/deletes. User rejected README JSON examples for now.

---

## the agent's Discretion

- Planner may choose exact JSON field names, but should keep the shape coherent, tested, and not over-documented as permanent public API.
- Planner may choose exact README example names as long as they represent dotfiles/specs/agent configuration and include safety warnings.

## Deferred Ideas

- Broad dashboard UI.
- Long-term public JSON contract and README JSON examples after testing.
- Full per-file baselines/manifests.
