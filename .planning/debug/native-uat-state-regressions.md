---
status: verifying
trigger: "Pinning a workspace does not work; title updates prevent workspace switching; attention is not visible for agent completion or message send; Ctrl+Shift+W can close the first tab instead of the active second tab."
created: 2026-07-12
updated: 2026-07-12
---

# Native UAT state regressions

## Symptoms

- Expected: pin/unpin immediately changes and persists sidebar placement.
- Actual: pinning appears to do nothing.
- Expected: terminal title updates do not affect workspace navigation.
- Actual: while a terminal continuously updates its title, workspace switching stops working.
- Expected: agent completion and `message send` attention events appear in the native client.
- Actual: neither produces visible attention; implementation status is uncertain.
- Expected: Ctrl+Shift+W closes the selected tab, consistently matching the tab close button.
- Actual: after interacting with multiple tabs it can close the first tab instead of the active second tab.
- Errors: no explicit error reported.
- Timeline: found during Phase 107 human UAT after the sidebar/title changes.
- Reproduction: use pin, switch workspaces while a terminal changes title, send attention/message events, and close the second of multiple tabs with Ctrl+Shift+W.

## Current Focus

- hypothesis: confirmed cross-boundary projection and decoding defects.
- test: focused reducer/client tests plus a production workspace smoke that injects 50 title updates before pinning and switching pairs.
- expecting: pin, switching, attention updates, and selected-page close remain stable.
- next_action: run full native verification and repository regression gates
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- timestamp: 2026-07-12
  finding: Ghostty SET_TITLE called `refreshProjection`, rebuilding and destroying sidebar controls for every title event.
- timestamp: 2026-07-12
  finding: native service decoder rejected the contract-supported legacy attention envelope emitted by `message send`.
- timestamp: 2026-07-12
  finding: attention reducer discarded later structured lifecycle states sharing an existing attention identity.
- timestamp: 2026-07-12
  finding: Ctrl+Shift+W used cached model surface state while the close button used the actual AdwTabPage.
- timestamp: 2026-07-12
  finding: focused attention, service-client, and workspace lifecycle checks pass after fixes; lifecycle smoke now injects 50 title updates before pin and pair switching.
- timestamp: 2026-07-12
  finding: human retest showed no attention because generated hooks invoked `git-stacks service attention publish`, but the CLI had no such command or authenticated publication endpoint.
- timestamp: 2026-07-12
  finding: generated hooks referenced nonexistent `GS_*` identity variables while native terminals export `GIT_STACKS_WORKSPACE_ID`, `GIT_STACKS_REPOSITORY_ID`, and `GIT_STACKS_SURFACE_ID`.
- timestamp: 2026-07-12
  finding: Limux/cmux use a real local notify command plus auto-exported terminal identity; Supacode keeps unread notification state attached to worktree and terminal surface. The repaired path follows those boundaries.

## Eliminated


## Resolution

- root_cause:
- fix:
- verification:
- files_changed:
