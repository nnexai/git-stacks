# Phase 103: v0.19.0 Final Release Validation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 103-v0.19.0 Final Release Validation
**Areas discussed:** todo folding, release artifact wording, verification gate shape, RC.2 tag and publish handoff, failure and caveat policy

---

## Todo Folding

| Option | Description | Selected |
|--------|-------------|----------|
| None | Mark all matched pending todos as reviewed/deferred. | ✓ |
| Improve TUI dashboard experience | Fold broad dashboard polish into release validation. | |
| Add manual workspace commands | Fold manual command feature todo into release validation. | |
| Add workspace notes | Fold notes feature todo into release validation. | |
| Add workspace stale view | Fold stale workspace advisory idea into release validation. | |
| Create workspace from forge source | Fold forge-source workspace creation todo into release validation. | |
| Improve template composition understanding | Fold template composition ergonomics idea into release validation. | |

**User's choice:** None; mark all as reviewed/deferred.
**Notes:** The matched todos were keyword matches and should not broaden Phase 103.

---

## Release Artifact Wording

| Option | Description | Selected |
|--------|-------------|----------|
| Normal fix wording | Describe RC follow-up as general fixes for existing issues. | ✓ |
| Heavy caveat wording | Over-emphasize that RC.1 exposed defects. | |
| Minimal mention only | Avoid release-note detail for the RC follow-up fixes. | |

**User's choice:** Normal fix wording.
**Notes:** User said this "should not be a problem" because the phase is fixing issues that already existed; general fixes should be fine.

---

## Verification Gate Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Planner discretion | Planner chooses the exact gate shape as long as required areas are covered. | ✓ |
| Canonical verify only | Use only `bun run verify`. | |
| Strict release script | Add or use a stricter sequenced release script. | |

**User's choice:** Planner discretion.
**Notes:** User answered "whatever". The context locks the requirement that focused RC follow-up checks and the canonical release gate must be covered.

---

## RC.2 Tag and Publish Handoff

| Option | Description | Selected |
|--------|-------------|----------|
| Final 0.19.0 release | Bump/tag final `0.19.0`. | |
| Publishable RC.2 | Bump package metadata to `0.19.0-rc.2` and tag `v0.19.0-rc.2`. | ✓ |
| Tag only | Keep package version unchanged and only create an RC.2 tag. | |

**User's choice:** Publishable RC.2.
**Notes:** User clarified "yes bump it" after confirming the intended package metadata shape is `0.19.0-rc.2` with tag `v0.19.0-rc.2`.

---

## Failure and Caveat Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Recommended strict policy | Block on Phase 100-103 or canonical release-gate failures; document only unrelated pre-existing failures with exact evidence and explicit release decision. | ✓ |
| Lenient caveats | Allow release with broader documented caveats. | |
| Zero caveats | Block on any local failure regardless of scope. | |

**User's choice:** Recommended strict policy.
**Notes:** User selected "recommended".

---

## the agent's Discretion

- Choose the exact verification gate shape.
- Choose whether to extend `scripts/release-rc-check.ts`, add a focused RC.2 script, or sequence commands manually in the plan.
- Choose focused smoke commands for the Phase 100-102 repairs after inspecting implementation summaries/tests.
- Choose README/help update depth based on user-facing relevance.

## Deferred Ideas

- Matched pending todos were reviewed and deferred rather than folded into Phase 103.
