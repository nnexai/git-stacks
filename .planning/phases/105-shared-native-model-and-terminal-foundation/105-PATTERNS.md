# Phase 105: Full Ghostty Linux Surface Pattern Map

**Refreshed:** 2026-07-11
**Authority:** D-17 through D-23 and Spikes 005-009.

## Production topology

```text
GtkApplication / host workspace layout
  -> one GtkGLArea per terminal leaf
       -> ghostty_surface_t (renderer, fonts, config, protocol, PTY and child)
            -> bounded embedded process-control ABI (PID, PGID, birth token, close/signal/reap/absence)
                 -> product ownership registration + sibling crash guard
  -> shared ghostty_app_t + finalized ghostty_config_t
  -> product reducer/persistence (identity and presentation truth only)
```

Git-stacks owns workspace, split, tab, surface identity, restoration metadata, cleanup policy and evidence. Ghostty owns every terminal leaf, rendering/font stack, configuration parsing, PTY creation, terminal child and protocol behavior. Production contains no `ghostty-vt`, Pango cell renderer, partial Ghostty config parser, or product-created terminal PTY.

## Exact dependency pattern

Pin `am-will/ghostty` commit `81ab8ffa90185221782baf785e85387321e16f8d` and Zig 0.15.2 by artifact/source-tree digest. Build `libghostty.so` with `-Dapp-runtime=none`. Audit exported symbols, the Linux payload in `include/ghostty.h`, `src/apprt/embedded.zig`, upstream merge base/ahead/behind state, and the bounded process-control patch. Advancing any pin is dedicated compatibility work.

## GTK surface pattern

One reusable leaf owns one `GtkGLArea`, `ghostty_surface_t`, stable product surface identity and callback generation. Make the GL context current before display-realized, create, draw, resize/scale, display-unrealized and destruction calls. Shared app/config outlive every surface. Main-context callbacks and async clipboard completions validate surface identity plus generation.

Forward complete GTK key events, committed text, IME preedit/cursor, focus, mouse buttons/motion/leave, smooth/discrete scroll and clipboard targets to Ghostty. Load and finalize configuration only through `ghostty_config_*`; never approximate fonts, cursor, palette, shell integration or key behavior.

## Production ownership pattern

Ghostty creates and operates the PTY/child. A bounded embedded ABI exposes the child PID, process group and Linux birth token plus graceful close, group control, reap and absence queries. Before a surface becomes `live`, validate the identity and register it with the existing private sibling guard. Closing follows D-09: request graceful Ghostty shutdown, wait two seconds, then escalate the whole validated group with SIGHUP, SIGTERM after 500 ms and SIGKILL after two seconds. Unregister only after birth-token-aware absence proof. D-10 uses Ghostty foreground/confirm-quit observation. Unproven cleanup remains visible as `failed_cleanup` with redacted diagnostics per D-11. Guard control-channel EOF runs the identical escalation for every registered group per D-12.

The existing product PTY implementation remains test evidence only; it is not linked into the production terminal graph.

## Model and multi-surface pattern

Reducer and persistence remain platform-neutral. Ghostty callbacks become product observations keyed by stable surface identity: title, cwd, bell, attention, close request and child exit. Restored surfaces remain ended; relaunch creates a new identity.

Multiple leaves share only app/config. Handles, GL areas, focus/input, clipboard requests, sizes, child registrations and teardown generations are per-surface. Destroying either leaf must leave the other responsive.

## Verification pattern

1. 105-05: exact source/toolchain, surface/process ABI, full library build and production-graph audit.
2. 105-06: config/app callbacks and GtkGLArea realize/draw/resize/focus/unrealize lifecycle.
3. 105-07: input/IME/mouse/clipboard, real shell/TUI behavior, production ownership/guard cleanup and two-surface isolation.
4. 105-08: production resource stress, honest accessibility, complete automated gate, then real compositor evidence.

No human checkpoint is valid before the exact production executable passes terminal, multisurface, cleanup and accessibility preflight gates.
