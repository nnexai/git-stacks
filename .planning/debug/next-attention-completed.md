---
status: resolved
trigger: 'now "completed" is not discarded - i used the "next attention" button'
created: 2026-07-18
updated: 2026-07-18
---

# Debug Session: Next Attention Does Not Acknowledge Completed

## Symptoms

- expected: Using Next attention activates the completed signal's exact terminal and clears that completed attention state while retaining any working presence.
- actual: Next attention navigates, but the completed signal remains visible and actionable.
- errors: No error is shown.
- timeline: Observed during manual verification of the post-rc.1 web signal-attention changes.
- reproduction: Publish or reach a completed agent signal, then click Next attention.

## Current Focus

- hypothesis: Confirmed. The running daemon predated the router change and returned the pre-ack signal projection even after recording acknowledgement.
- test: Compare live daemon/source/build timestamps, inspect the journal for republished completion, verify the post-ack router regression, then restart onto the rebuilt daemon.
- expecting: The selected terminal's completed signal disappears in the acknowledgement response while working signals remain.
- next_action: Commit, push, and publish the verified post-rc.1 fix set.
- reasoning_checkpoint: The screenshot proved navigation succeeded; the live journal proved completion was not republished; process timestamps proved the service still held the old router implementation in memory.
- tdd_checkpoint: true

## Evidence

- timestamp: 2026-07-18T18:21:00+02:00
  observation: The user reports completed attention remains after invoking Next attention.
  implication: Exact-terminal acknowledgement is not reliably coupled to this navigation action.
- timestamp: 2026-07-18T18:30:00+02:00
  observation: packages/web/src/app.ts selectNextAttention() selects the candidate terminal, and selectTerminal() calls acknowledgeTerminalSignals(terminal.meta.surface_id). The router records completed activity acknowledgement and returns the remaining visible projection.
  implication: The reported behavior is not explained by the static call chain; a live-path gap (unresolved target, failed request, or timing) remains.
- timestamp: 2026-07-18T18:34:00+02:00
  observation: The screenshot and clarification show the user began on a different terminal and Next Attention selected the completed terminal while the global attention count remained one.
  implication: Candidate ordering and terminal resolution worked; completed removal failed after navigation.
- timestamp: 2026-07-18T18:35:00+02:00
  observation: The live journal contained one final Copilot completed event at 18:33:21 local and no later publication, while the daemon started at 17:51, the router source changed at 18:11, and the fixed bundle was built at 18:31.
  implication: The old in-memory router recorded acknowledgement but returned the pre-ack projection; no timeout or provider republish was involved.
- timestamp: 2026-07-18T18:35:17+02:00
  observation: The old daemon was stopped and a new daemon started from the rebuilt bundle as pid 41798.
  implication: Subsequent live sessions use the post-ack projection behavior covered by the router regression.

## Eliminated

- The acknowledgement endpoint does retain working presence and removes completed attention for the exact surface.
- Next Attention does call selectTerminal for a resolved surface.
- Candidate rotation is not the cause because the user started on another terminal and reached the correct completed terminal.
- Completion was not repeatedly published; the journal contained no later signal after the final completed event.

## Resolution

- root_cause: The live daemon was started before the secure router fix, so it recorded exact-surface acknowledgement but returned the pre-ack signal list to the browser. A later tab switch fetched the already-filtered state, making the change appear only then.
- fix: The pending router change returns the post-ack projection immediately; the local daemon was rebuilt and restarted onto that implementation.
- verification: The focused router test proves completed removal and working retention; 2,291 Vitest tests, 123 Node tests, and the complete TUI suite pass.
- files_changed: packages/service/src/secure/router.ts, tests/service/signal-visibility.test.ts
