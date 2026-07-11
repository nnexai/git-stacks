# Native Linux Workspace Acceptance

Status: NOT YET OBSERVED

Observer:
Date:
Build/commit:
GTK/libadwaita/Ghostty versions:
Session/compositor:
Locale and IME:
Assistive technology:

Automated model/action tests do not fill this blocking Phase 106 graphical checkpoint.

| Requirement and observation | Wayland | X11 | Evidence / failure |
|---|---|---|---|
| LNX-01 adaptive workspace-first navigation and single-repository collapse | PENDING | PENDING | |
| LNX-02 every explicit connection page | PENDING | PENDING | |
| LNX-03 pins, grouping, order, selection survive restart/reconnect | PENDING | PENDING | |
| LNX-04 pair switching preserves hidden live Ghostty hosts | PENDING | PENDING | |
| LNX-05 select/cycle/drag/rename/close/relaunch and lineage | PENDING | PENDING | |
| LNX-06 contextual actions and configured-command failure behavior | PENDING | PENDING | |
| ACT-01/02 hierarchical icon/text/count/severity semantics | PENDING | PENDING | |
| ACT-03 exact/ended/repository/workspace fallback and explanation | PENDING | PENDING | |
| ACT-04 background events never present, navigate, or steal focus | PENDING | PENDING | |
| ACT-05 keyboard, visible focus, terminal/launcher IME isolation | PENDING | PENDING | |
| ACT-06 accessibility tree and screen-reader announcements | PENDING | PENDING | |

## Runbook

1. Run `bun run native:verify && bun run test && bun run typecheck && bun run test:deps && bun run verify:gates`.
2. Start the authoritative service and export the discovery endpoint and bearer authorization expected by `native/linux/app_graph.zig`. Confirm the snapshot contains at least one workspace/repository pair and configured command.
3. Launch the production executable with `bun run native:run` in a real Wayland session. Repeat under X11 with `GDK_BACKEND=x11 bun run native:run` where an X server is available.
4. Exercise every row, including continuous typing in another app while replay events arrive.
5. Record concrete observations, versions, failures and evidence paths; replace `PENDING` only from observation.

The executable uses `AdwNavigationSplitView`, an identity-backed workspace/repository list, a persistent `GtkStack` of Ghostty hosts, registered `win.*` GActions, and a searchable configured-command popover. Do not use `native:smoke-app` as graphical acceptance evidence: its isolated fixture lifecycle is intended for automated startup/teardown checks, not the authenticated multi-workspace checkpoint.

If launch fails before the window appears, first verify that the authoritative discovery/authentication environment resolves a ready snapshot. A missing selected pair is reported as `native launch requires an authoritative workspace/repository selection`; this is an environment/data precondition rather than a completed graphical observation.
