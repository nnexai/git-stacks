# Phase 59: Push - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 59-push
**Areas discussed:** TUI push confirmation, Post-push suggestion, Error UX

---

## TUI Push Confirmation

### Q1: Should TUI push require confirmation before executing?

| Option | Description | Selected |
|--------|-------------|----------|
| No confirmation | Act immediately like sync. Push is a normal workflow action, not destructive. Keeps TUI fast and consistent. | ✓ |
| Confirm for force-push only | Regular push runs immediately. Force-push shows confirmation dialog. | |
| Always confirm | Every push shows confirmation dialog. Safe but adds friction. | |

**User's choice:** No confirmation (Recommended)
**Notes:** Consistent with sync behavior.

### Q2: Should force-push be available from TUI?

| Option | Description | Selected |
|--------|-------------|----------|
| CLI only | TUI push is always regular push. Force-push requires explicit CLI flag. Prevents accidental force-push. | ✓ |
| Available in TUI with extra confirm | TUI offers force-push with confirmation dialog. More convenient for power users. | |

**User's choice:** CLI only (Recommended)
**Notes:** Safety over convenience for destructive operations.

---

## Post-push Suggestion

### Q3: How should the forge PR suggestion work after push?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline text hint | Print suggestion as text after push summary when forge is configured. Non-blocking. | |
| No suggestion | Just show push results. Users who want PRs already know the command. Keep output clean. | ✓ |
| Interactive prompt | Ask 'Create PR now?' if forge is configured. Convenient but adds friction to scripting. | |

**User's choice:** No suggestion
**Notes:** User wants clean, predictable push output with no extra suggestions.

---

## Error UX

### Q4: How should push failures be displayed?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline per-repo | Show each repo's result as it completes. Summary line at end. Matches sync pattern. | ✓ |
| Summary at end only | All results together after all repos finish. Cleaner but slower feedback. | |
| Inline + retry prompt | Inline results plus retry offer. Convenient but breaks scripting. | |

**User's choice:** Inline per-repo (Recommended)
**Notes:** Matches sync's existing pattern for consistency.

### Q5: TUI push progress: mirror SyncProgressView pattern?

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror sync pattern | Same ProgressView with PushRow status transitions. Per-repo live updates. Consistent. | ✓ |
| Simpler approach | Spinner with summary text, no per-repo progress. | |

**User's choice:** Mirror sync pattern (Recommended)
**Notes:** Consistency with existing TUI patterns.

---

## Claude's Discretion

- Error message parsing from `git push` stderr
- `pushBranch` function signature details
- Dry-run output verbosity
- Auto-set-upstream behavior
- Test structure and mock patterns

## Deferred Ideas

None — discussion stayed within phase scope
