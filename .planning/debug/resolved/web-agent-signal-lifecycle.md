# Web agent signal lifecycle

## Symptom

- Codex activity is missed when its terminal is not visible.
- Copilot can remain shown as active after work completes.
- Completed activity is not shown in the workspace sidebar.
- Opening the exact terminal tab does not discard its signal.

## Expected behavior

1. A provider emits `working` while its terminal is not visible and the workspace shows that provider as active.
2. The provider emits `completed` when the turn ends and the workspace keeps a done indicator.
3. Selecting the exact terminal marks that provider/surface lifecycle as seen.
4. Later lifecycle events on the same terminal become visible again.

## Initial evidence

- Service activity is coalesced by provider plus exact surface, which prevents stale session identifiers from stranding old state.
- Browser streaming can be paused without dropping OSC signal ingestion.
- The web presentation excluded `completed` from `isActiveSession`.
- The web client did not model native `exact_tab_visible` read behavior.
- Provider hook event names and real CLI behavior required end-to-end verification.

## Working hypothesis

Confirmed. The remaining issue had three causes: the web presentation omitted completed lifecycle state, the browser had no per-surface seen watermark, and overlapping projection requests could apply out of order. Provider hook compatibility was not the cause on the installed Codex and Copilot versions.

## Verification plan

- Add focused reducer/presentation/API tests for working, completed, exact-tab seen, and later reactivation.
- Run real Codex and Copilot prompts with low-cost models inside service-owned browser terminals.
- Keep another workspace selected while each agent runs, then verify working and completed indicators before selecting the originating tab.
- Verify selecting that tab clears the lifecycle and a later run reappears.

## Resolution

- Added per-browser-principal activity watermarks keyed by provider and exact terminal surface.
- Added `/web/api/signals/acknowledge`; selecting or viewing a terminal acknowledges only the current lifecycle version on that surface.
- A later working/completed transition has a new version and becomes visible again.
- Included completed lifecycle signals in workspace provider badges and styled them as done.
- Added a client refresh generation guard so an older request cannot overwrite a newer lifecycle projection.
- Preserved service-authoritative signal history and independent visibility for other browser principals and native clients.

## Verification evidence

- Real Codex run: `gpt-5.6-luna`, hidden terminal, observed `working` then `completed` in both journal and browser, then exact-tab selection cleared it.
- Real Copilot run: `gpt-5-mini` with minimal effort, hidden terminal, observed `working` then `completed` in both journal and browser, then exact-tab selection cleared it.
- Codex emitted two working records and one completed record; service coalescing projected one current provider/surface lane.
- Copilot emitted working records followed by two completed hooks (`agentStop` and `sessionEnd`); service coalescing likewise projected one lane.
- Focused web/signal/provider tests, TypeScript checks, web build, dependency-cycle check, full repository test suite, and relevant native model/service-client/workspace UI harnesses passed.

## Status

Resolved on 2026-07-14.
