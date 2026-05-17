# Phase 90: Files Command Surface and Conflict Policy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-16T10:34:24+02:00
**Phase:** 90-files-command-surface-and-conflict-policy
**Areas discussed:** todo folding, command verbs and defaults, drift detection, conflict and overwrite policy, delete behavior

---

## Todo Folding

| Option | Description | Selected |
|--------|-------------|----------|
| Fold Phase 90 slice of `Add bidirectional files sync` | Include command surface, manual sync-back, drift visibility, and conservative conflict/delete policy. | ✓ |
| Fold nothing | Leave all matches deferred. | |

**User's choice:** Fold the command/policy slice.
**Notes:** Other matches were treated as noisy or future-phase scope.

---

## Command Verbs and Defaults

| Option | Description | Selected |
|--------|-------------|----------|
| `status|pull|push` | Matches ROADMAP/PROJECT and parallels git direction language while staying in the `files` family. | ✓ |
| `status|sync-in|sync-back` | More explicit file-sync wording. | |
| Support both names | Primary `pull|push`, aliases `sync-in|sync-back`. | |

**User's choice:** `status|pull|push`.
**Notes:** User selected optional `[workspace]` with CWD auto-detection. User also selected pull refresh for existing targets, asked whether force belongs here, then selected pull `--force` overwrite/replace behavior. User selected explicit sync-back push with default refusals.

---

## Drift Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Current comparison only | Compare source and target trees without storing a baseline; report source-only, target-only, and differing counts. | ✓ |
| Add lightweight baseline | Store path/type/size/mtime state after sync to infer side changes. | |
| Existence-only status | Avoid walking file trees by default. | |

**User's choice:** Current comparison only.
**Notes:** User asked how source and target changes could be differentiated; we clarified that without a baseline only current differences can be known. User rejected baseline because sync trees can include thousands of files. User selected counts by default, verbose capped file paths, and inclusion of copy/symlink entries with simple state.

---

## Conflict and Overwrite Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Conservative default refusals | Pull refuses target-only/differing paths; push refuses source-only/differing paths. | ✓ |
| Refuse differing only | Allow side-only extras to remain by default. | |
| Merge by default | Apply changes without refusals. | |

**User's choice:** Conservative default refusals.
**Notes:** User selected force for both pull and push. Forced operation replaces the destination tree with the source tree for the selected direction. User selected `--dry-run` for both pull and push.

---

## Delete Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| No deletes without force | Defaults can only add missing files when the opposite side is clean. | ✓ |
| Empty directories only | Allow limited delete propagation. | |
| Delete when otherwise clean | Allow deletes in narrower clean cases. | |

**User's choice:** No deletes without force.
**Notes:** User selected force mirror semantics: destination-only files are deleted under `--force`. User declined adding `--merge` or `--add-only` in Phase 90.

---

## the agent's Discretion

- Planner may choose exact internal state labels and output column names as long as they preserve the locked semantics.
- Planner may cap verbose path output at a pragmatic number and include a truncation message.

## Deferred Ideas

- Lifecycle integration and stable machine-readable output for Phase 91.
- Full baselines/manifests unless real usage proves current comparison insufficient.
- Middle policies such as merge/add-only and richer policy fields.
