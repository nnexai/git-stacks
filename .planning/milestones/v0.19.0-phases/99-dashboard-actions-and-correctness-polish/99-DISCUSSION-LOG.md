# Phase 99: Dashboard Actions and Correctness Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-17T15:42:14+02:00
**Phase:** 99-Dashboard Actions and Correctness Polish
**Areas discussed:** Action Menu Shape, Manual Command TUI Behavior, Linked Issue Opening, Rollback Progress Visibility

---

## Action Menu Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Direct rows in existing menus | Add repo edit, linked issue open, and manual command entry as normal rows beside existing actions. | |
| Grouped action rows | Add rows like `Issue...` or `Commands...` that can branch into a second picker. | ✓ |
| Context-sensitive rows | Show direct rows only when data exists; otherwise hide or disable them. | |

**User's choice:** Grouped action rows.
**Notes:** Grouped rows should always be visible and disabled when unavailable. Disabled labels should include the reason. Existing shortcuts should be preserved where possible.

---

## Manual Command TUI Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Open a picker of visible command names, then run selected command | Matches grouped-row behavior and supports multiple commands. | ✓ |
| Open a picker with dry-run preview before running | Safer and more inspectable, but adds an extra step. | |
| Show commands only as inspectable details, no run action yet | Lowest implementation risk, weaker than the TUI run intent. | |

**User's choice:** Open a picker of visible command names, then run the selected command.
**Notes:** Picker shows main command names only. Hidden `pre*` / `post*` commands remain implicit. Execution uses the existing generic progress view and stays there until keypress on failure.

---

## Linked Issue Opening

| Option | Description | Selected |
|--------|-------------|----------|
| Open single linked issue directly | Fast path for the common case. | ✓ |
| Always open a picker | Consistent every time, with an extra step. | |
| Show details first, then open | More inspectable, but duplicates detail panel behavior. | |

**User's choice:** Open a single linked issue directly.
**Notes:** Multiple linked issues open a tracker picker. Disabled labels distinguish no linked issue from no available opener when cheaply detectable. Opening failures stay in the generic progress/error view until keypress.

---

## Rollback Progress Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Add an output log area below per-repo rows | Preserve rollback event order without forcing every event into a repo row. | |
| Extend per-repo rows only | Good for worktree rollback, weak for file/env events. | |
| Separate rollback section | Clear during failures, but more custom UI. | |
| Exclude rollback progress visibility completely | Remove rollback progress work from Phase 99 scope. | ✓ |

**User's choice:** Exclude rollback progress visibility completely.
**Notes:** This intentionally overrides older roadmap/requirements text for Phase 99. Downstream agents should not implement rollback progress visibility in this phase.

---

## the agent's Discretion

- Choose exact component boundaries and picker implementation.
- Choose new shortcut letters around existing shortcuts without rebalance.
- Choose whether unavailable opener detection is cheap enough; fall back to `none linked` if not.

## Deferred Ideas

- Dashboard create-flow rollback progress visibility is excluded from Phase 99 and should be deferred or removed from the current milestone scope.
- Workspace stale classification remains deferred from v0.19.0.
- Forge source workspace creation is already completed in v0.18.0.
- Template composition explanation remains future template ergonomics work.
