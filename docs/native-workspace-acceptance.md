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
2. Start the authoritative service and export its discovery/authentication environment.
3. Run `bun run native:run` in a real Wayland session and X11 where supported.
4. Exercise every row, including continuous typing in another app while replay events arrive.
5. Record concrete observations, versions, failures and evidence paths; replace `PENDING` only from observation.
