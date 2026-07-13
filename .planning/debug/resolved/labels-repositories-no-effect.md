---
status: resolved
trigger: "Switching between Repositories and Labels does nothing; pinning no longer works; branch and changed-line metadata are absent; Active is confusing; the signal inbox is overloaded and the presentation is worse than before."
created: 2026-07-13
updated: 2026-07-13
---

# Labels/Repositories and Sidebar UAT Regression

## Symptoms

- **Expected behavior:** Labels and Repositories produce visibly different, stable sidebar hierarchies. Pinning works and remains visible. Compact rows expose branch and Git line additions/removals. Activity decorates rows without moving them into a confusing automatic organization. The signal inbox remains calm and scoped.
- **Actual behavior:** Both toggle positions render essentially the same flat workspace list. Pinning has no usable visible effect. Branch and changed-line metadata do not render. Active organization is unclear and unstable. The signal inbox is visually overloaded.
- **Errors:** No explicit error dialog. Live screenshot confirms the missing hierarchy and metadata.
- **Timeline:** Regressed during Phase 107.2 implementation and failed production GTK UAT on 2026-07-13.
- **Reproduction:** Launch `bun run native:run`, click Labels and Repositories, inspect the sidebar, then compare with the Supacode reference.

## Current Focus

- hypothesis: Confirmed and fixed: `refreshProjection` always rendered the flat rich projection while the actual label/repository hierarchy was disabled behind `if (false)`; monitor scale was also misclassified as 200% text and hid Git metadata on HiDPI.
- test: Pure sidebar goldens, production GTK source contracts, full native verification, live AT-SPI mode/pin actions, and settled app-window screenshots in both modes.
- expecting: Labels render configured label groups, Repositories render repository-name groups, Pinned remains global, Active only hoists working agents/live configured commands, and waiting/completed/failed state remains decorated after work stops.
- next_action: None; keep Phase 107.2 UAT open for human review.
- reasoning_checkpoint: Live screenshots show different hierarchies, visible pin controls, branch/default metadata, and separate semantic Git counters.

## Evidence

- timestamp: 2026-07-13T06:57:00+02:00
  observation: Live app screenshot shows flat workspace rows only; no branch, Git counts, pin control, or meaningful label/repository hierarchy.
- timestamp: 2026-07-13T06:59:00+02:00
  observation: `groupingClicked` changes `organization_mode`; production rendering must be checked for structural divergence.
- timestamp: 2026-07-13T10:34:00+02:00
  observation: Production `refreshProjection` called `workspace_view.project` and always emitted Pinned/Active/Workspaces; the real label/repository renderer immediately below was dead behind `if (false)`.
- timestamp: 2026-07-13T10:55:00+02:00
  observation: Live service `/v1/snapshot` exposed `main` plus nonzero additions/removals, but GTK treated monitor scale factor 2 as 200% text and suppressed Git metadata.
- timestamp: 2026-07-13T11:08:00+02:00
  observation: Live AT-SPI actions switched between visibly distinct Labels and Repositories projections and toggled the selected workspace out of and back into Pinned.
- timestamp: 2026-07-13T11:10:00+02:00
  observation: Settled screenshots show branch/default metadata and separate semantic green additions/red removals; transient black capture frames were eliminated by waiting for the Vulkan swapchain after projection rebuild.

## Eliminated

- hypothesis: The service or native decoder discarded branch and Git metadata.
  evidence: Authenticated live `/v1/snapshot` and native decoder tests contained the correct branch/addition/removal values; the renderer compression decision hid them.
- hypothesis: Active should be removed entirely.
  evidence: UAT clarified Active is a temporary Pinned-like section for working agents and configured commands; waiting/completed/failed outcomes must persist without remaining Active.

## Resolution

- root_cause: The Phase 107.2 production path replaced stable organization with a single flat section projection, leaving the working label/repository hierarchy unreachable. Pinning was hidden behind context actions, ordinary live shells and non-running signal states over-qualified for Active, terminal outcomes disappeared when work stopped, and GTK monitor density was incorrectly interpreted as 200% text, suppressing Git counters on the live HiDPI display.
- fix: Added one pure `projectSidebar` hierarchy consumed by production GTK; kept global Pinned and temporary Active precedence; made label/repository groups structurally distinct; limited Active to working agent activity or live configured commands; retained waiting/failed/completed decorations; added visible star actions; rendered branch/default plus separate semantic `+N`/`-N` labels; summarized recent inbox history; and added accessible label/repository actions.
- verification: `bun run typecheck`; focused workspace-ui, attention, application-actions, and accessibility modes; full `bun run native:verify`; live pin toggle; live service metadata inspection; app-window screenshots `/home/nnex/Pictures/Screenshots/git-stacks-107-2-sidebar-labels-fixed.png` and `/home/nnex/Pictures/Screenshots/git-stacks-107-2-sidebar-repositories-fixed.png`. Human Phase 107.2 UAT remains open.
- files_changed: `native/linux/workspace_view.zig`, `native/linux/app.zig`, `native/linux/application.zig`, `native/linux/app_contract_test.zig`, `native/tests/workspace_ui_test.zig`
