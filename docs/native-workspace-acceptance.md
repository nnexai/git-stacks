# Native Linux Workspace Acceptance

Implementation note (2026-07-11): the workspace now uses `AdwTabView`/`AdwTabBar`, a draggable `GtkPaned`, secondary-click row/tab menus, and an owned centered `AdwDialog` command launcher. Re-run every observation below; evidence from the former synthetic tab/kebab UI is obsolete.

Status: NOT YET OBSERVED

Observer:
Date:
Build/commit:
GTK/libadwaita/Ghostty versions:
Session/compositor:
Locale and IME:
Assistive technology:

Automated model/action tests do not fill this blocking Phase 106 graphical checkpoint.

## Automated preflight (implementation checkpoint)

- [x] Every registered `win.*` action has a production callback branch; the contract test rejects a missing branch.
- [x] Shell shortcut/action and empty-tab-bar double-click share `createTerminal`.
- [x] Configured-command activation passes the selected stable command id through authoritative `/v1/native-launch` resolution.
- [x] Close tears down the registered terminal host; ended-tab relaunch resolves and registers a distinct host before publishing predecessor lineage.
- [x] Rename uses an editable production dialog; tab and workspace contextual menus expose lifecycle-valid actions.
- [x] Pin/unpin and pin drag ordering write the private native presentation file atomically and restore after snapshot discovery.
- [x] Restart restoration retains pair-local tab order, renamed title, cwd label, exit status and predecessor lineage; every restored tab is ended and malformed records are quarantined independently.
- [x] Workspace/repository display names come from the authoritative aggregate snapshot; Open in VS Code invokes `git-stacks integration vscode open <workspace-name>` and is gated by readiness plus CLI availability.
- [x] Attention replay remains projection-only; only explicit attention activation applies its exact/fallback focus route.

Last combined Plan 03 preflight: `bun run native:test:restore && bun run native:test:workspace-ui && bun run native:test:tabs && bun run native:test:application-actions && bun run native:test:attention && bun run native:test:accessibility && bun run native:test:service-client && bun run native:test:model && bun run native:build-app` — PASS. These results do not replace the observations below.

| Requirement and observation | Wayland | X11 | Evidence / failure |
|---|---|---|---|
| LNX-01 adaptive workspace-first navigation and single-repository collapse | PENDING | PENDING | |
| LNX-02 every explicit connection page | PENDING | PENDING | |
| LNX-03 pins, grouping, selection and pair-local tab presentation survive restart/reconnect as ended records | PENDING | PENDING | |
| LNX-04 pair switching preserves hidden live Ghostty hosts | PENDING | PENDING | |
| LNX-05 select/cycle/drag/rename/close/relaunch and lineage | PENDING | PENDING | |
| LNX-06 contextual actions, authoritative VS Code integration dispatch and configured-command failure behavior | PENDING | PENDING | |
| ACT-01/02 hierarchical icon/text/count/severity semantics | PENDING | PENDING | |
| ACT-03 exact/ended/repository/workspace fallback and explanation | PENDING | PENDING | |
| ACT-04 background events never present, navigate, or steal focus | PENDING | PENDING | |
| ACT-05 keyboard, visible focus, terminal/launcher IME isolation | PENDING | PENDING | |
| ACT-06 accessibility tree and screen-reader announcements | PENDING | PENDING | |

## Runbook

1. Run `bun run native:verify && bun run test && bun run typecheck && bun run test:deps && bun run verify:gates`.
2. Start the authoritative service and export the discovery endpoint and bearer authorization expected by `native/linux/app_graph.zig`. Confirm the snapshot contains at least one workspace/repository pair and configured command.
3. Launch the production executable with `bun run native:run` in a real Wayland session. Repeat under X11 with `GDK_BACKEND=x11 bun run native:run` where an X server is available.
4. Rename and reorder tabs in at least two pairs, close one and let one exit, quit/restart, then verify order/title/cwd/exit/lineage restoration and that no restored tab claims to be live. Inject one malformed sibling record and confirm valid records still restore.
5. Confirm workspace/repository labels match the authoritative snapshot exactly. Activate Open in VS Code and verify the configured git-stacks VS Code integration is used for the selected workspace; repeat with the integration/CLI unavailable and verify the action is unavailable or fails structurally without a raw `code` fallback.
6. Exercise every remaining row, including continuous typing in another app while replay events arrive.
7. Record concrete observations, versions, failures and evidence paths; replace `PENDING` only from observation.

The executable uses `AdwNavigationSplitView`, an identity-backed workspace/repository list, a persistent `GtkStack` of Ghostty hosts, registered `win.*` GActions, and a searchable configured-command popover. Do not use `native:smoke-app` as graphical acceptance evidence: its isolated fixture lifecycle is intended for automated startup/teardown checks, not the authenticated multi-workspace checkpoint.

If launch fails before the window appears, first verify that the authoritative discovery/authentication environment resolves a ready snapshot. A missing selected pair is reported as `native launch requires an authoritative workspace/repository selection`; this is an environment/data precondition rather than a completed graphical observation.
