# Phase 100: Manager TUI Command Output Containment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 100-Manager TUI Command Output Containment
**Areas discussed:** Captured command scope, Output viewer behavior, Long/noisy output policy, Restore and cancel semantics

---

## Captured Command Scope

| Option | Description | Selected |
|--------|-------------|----------|
| All non-editor TUI-launched commands | Capture stdout/stderr for manual commands, linked issue open, workspace run, and any action paths that execute commands while OpenTUI remains active. Editor flows keep using renderer suspend/resume. | yes |
| Manual commands first | Fix the clearest corruption path, since manual commands currently inherit shell output through `runManualCommand()`. Other noisy paths can follow later. | |
| Every process launch, including editors | Most comprehensive, but risks changing established `$EDITOR` behavior and may make interactive editors unusable inside the dashboard. | |
| Other | Freeform scope boundary. | |

**User's choice:** All non-editor TUI-launched commands.
**Notes:** Editor flows remain on renderer suspend/resume and should not be converted unless validation output after resume leaks into the dashboard.

---

## Output Viewer Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Upgrade `ProgressView` into a bounded command-output viewer | Reuse the existing modal shape, but add command label, running/exit status, recent output, and close/back behavior. | yes |
| Add a separate `CommandOutputView` | Cleaner type boundary for stdout/stderr streams and lifecycle state, but more new surface area. | |
| Keep current `ProgressView` and only append lines | Smallest change, but does not fully satisfy bounded output, status, and predictable stderr/no-output states. | |
| Other | Freeform viewer shape. | |

**User's choice:** Upgrade the existing progress-modal pattern.
**Notes:** This should be a real bounded command-output viewer, not a minimal append-lines patch.

---

## Long/Noisy Output Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Tail recent output with a truncation marker | Keep the last bounded set of lines, show that earlier output was omitted, preserve ordering, and visually distinguish stderr lines. | yes |
| Scrollable output buffer | More inspectable, but adds navigation state and focus complexity inside a modal. | |
| Summary-only with last few lines | Simple, but weak for diagnosis and likely too thin for `TOUT-02`. | |
| Other | Freeform output behavior. | |

**User's choice:** Tail recent output with a truncation marker.
**Notes:** Preserve stdout/stderr ordering and visually distinguish stderr lines.

---

## Restore and Cancel Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Finished commands close back to the exact prior dashboard context; running commands cannot be dismissed | Preserve tab, row, action picker context where applicable, and only allow close/back after exit. This avoids orphaned child processes. | yes |
| Finished commands return to list view only; running commands cannot be dismissed | Simpler restore state, but weaker than the roadmap's same-context requirement. | |
| Allow dismissing running commands while they continue in background | More flexible, but creates lifecycle/state problems and hidden output. | |
| Other | Freeform close/cancel behavior. | |

**User's choice:** Finished commands close back to exact prior context; running commands cannot be dismissed.
**Notes:** Do not introduce background command execution state.

---

## the agent's Discretion

- The planner may decide whether the code is cleaner as an enhanced `ProgressView` or as helper types/state around the same modal pattern.
- The exact output tail line limit is implementation detail.

## Deferred Ideas

- Workspace notes, stale view, forge source workspaces, and template composition explanations were reviewed as todo matches but not folded into this phase.
