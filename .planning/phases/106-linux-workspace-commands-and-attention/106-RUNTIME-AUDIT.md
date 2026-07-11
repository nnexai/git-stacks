# Phase 106 Runtime/Lifecycle Audit

Date: 2026-07-11

Scope: read-only audit of the Linux GTK client against the reported graphical UAT failures and stack trace. This is not a test report; it traces the current production call paths and identifies why existing tests were false-green.

## Executive finding

The current client is not lifecycle-safe. Its terminal state is split across three independently mutated structures:

1. `model.State.pairs[].surfaces[]` (presentation and persistence),
2. `State.terminals[]` plus `tab_registry.Registry` (native ownership), and
3. `GtkStack` children (widget ownership and visibility).

There is no single transaction that creates, ends, removes, relaunches, or destroys a terminal across all three. The user-visible failures are direct consequences: restored ended records have tabs but no widgets; new terminals are destroyed before realization; close destroys a widget while GTK still owns/transitions it; persistence serializes every surface as ended and has no removal operation; and shutdown concurrently deinitializes an HTTP client that is in use by the replay thread.

## Critical findings

### R1 — Window close races `std.http.Client.deinit` against active replay I/O

Severity: critical (deterministic process abort / memory-lifecycle violation)

Observed stack:

`closeRequested` -> `cleanup` -> `HttpTransport.cancel` -> `std.http.Client.deinit` -> panic in the client's connection-list walk.

Exact production path:

- `app.zig:1071-1074` calls `cleanup` synchronously from GTK's `close-request` signal.
- `app.zig:171-177` sets `replay_cancel`, then calls `transport.cancel()` on `State.replay_transport`, and only afterwards joins the worker.
- `app.zig:239-286` owns that transport as a stack local in `replayWorker`; it may be inside `HttpTransport.execute` / `std.http.Client.fetch` when the GTK thread calls `cancel`.
- `service_client.zig:50-60` implements `cancel` by immediately calling `self.http.deinit()` from the GTK thread. `std.http.Client` is not safe to deinitialize concurrently with `fetch` or its pool mutation.
- The worker's deferred `transport.deinit()` does not repair this. The illegal concurrent deinit has already happened; `cancelled` merely suppresses the later deinit.

Additional shutdown defect: `cleanup` disconnects `close_handler` twice (`app.zig:180-184`). This is not the shown panic, but is another invalid lifecycle operation.

Required correction:

- The thread that owns/uses `std.http.Client` must also be the only thread that deinitializes it.
- Do not use `Client.deinit` as cross-thread cancellation. Use a cancellation mechanism whose synchronization contract is explicit (for example a separately owned socket/FD that may safely be shutdown, a bounded request/read timeout, or a wakeable polling design), then join, then let the worker deinit its client.
- GTK close should prevent default destruction until asynchronous/worker shutdown reaches a safe join point, or perform a bounded orderly shutdown without blocking GTK on an uninterruptible SSE read.
- Disconnect the signal exactly once, and ensure queued `g_main_context_invoke` dispatches cannot retain a freed `State`.

### R2 — New shell and configured-command launches are destroyed before they can realize

Severity: critical (primary functionality is a no-op)

Exact path:

- `actionActivate` routes `new-shell` to `createShell` and configured command activation to `createTerminal` (`app.zig:830-859`).
- `createTerminal` allocates `Surface.createWithLaunch`, stores it, and immediately calls `surface.ownershipIdentity()` (`app.zig:672-703`).
- `Surface.ownershipIdentity` requires a controller registration (`ghostty_surface.zig:124`).
- A controller is created only by `createSurface`, which runs from the GTK `realize` callback (`ghostty_surface.zig:157-225`, `293-296`).
- The new surface is not inserted into `GtkStack` until after ownership identity and registry commit (`app.zig:721-725`). Therefore it cannot realize before the identity check.
- Identity is necessarily null in normal GTK execution; `createTerminal` destroys the surface and returns null (`app.zig:687-690`).

This explains both “cannot start new shells” and configured-command activation doing nothing. The search/launcher can present a command, but selecting it hits the same impossible ordering.

Required correction:

- Make launch a staged asynchronous transaction: allocate -> attach widget to an offscreen/visible stack page -> realize/start -> registration callback -> atomically publish model/registry state -> focus.
- On failure, remove the GtkStack page, destroy the surface, and present a visible structured error.
- Do not publish a live tab until process identity registration succeeds; do not require registration before GTK can realize the widget.

### R3 — Terminal close destroys a GtkStack child without removing it from GtkStack

Severity: critical (GTK ownership corruption / crash)

Exact path:

- `closeTerminal` marks the model entry ended, removes the pointer from `State.terminals`, and invokes `tab_registry.Registry.close` (`app.zig:790-805`).
- `Registry.close` calls the host teardown callback (`tab_registry.zig:42-45`).
- `terminalTeardown` calls `Surface.destroy` (`app.zig:294-297`).
- `Surface.destroy` calls `gtk_widget_unparent` directly if the GLArea has a parent (`ghostty_surface.zig:139-149`). It does not call `gtk_stack_remove` on the owning stack.
- `GtkStack` is configured with a crossfade transition (`app.zig:985-987`), so it may retain/snapshot the outgoing child during a transition.

This is consistent with `gtk_widget_snapshot_child: assertion '_gtk_widget_get_parent (child) == widget' failed`: GTK is snapshotting a child that application code forcibly unparented/destroyed behind the container's back.

The close path also fails to select/show another valid live child and does not call `refreshProjection`, leaving stale tab UI until another refresh. It intentionally retains an ended model entry, but provides no remove action.

Required correction:

- Container ownership must be released through `gtk_stack_remove` (or the appropriate GTK container API) on the GTK thread before surface destruction.
- Cancel/complete transitions before freeing the surface, or defer destruction until GTK no longer references the page.
- Update GtkStack, native registry, terminal array, selected model surface, model lifecycle/removal, focus target, persistence, and projection as one ordered transaction.

## High-severity findings

### R4 — Restored ended tabs have no GtkStack pages, so selection is guaranteed to warn and do nothing

Severity: high

- `restorePresentation` restores ended records into `model.State` only (`persistence.zig:186-203`).
- `buildWorkspaceUi` adds only the one newly created initial terminal widget to `terminal_stack` (`app.zig:985-990`). No widget is created for restored ended entries, appropriately.
- `refreshProjection` renders every model surface, including restored ended records, as a clickable tab (`app.zig:483-525`).
- `tabClicked` and `tabMenuPressed` unconditionally call `gtk_stack_set_visible_child_name` with the ended surface UUID (`app.zig:621-639`).

The reported `Child name '<uuid>' not found in GtkStack` warnings are therefore expected. Ended records need a distinct non-terminal presentation or selection semantics; they cannot be treated as GtkStack pages.

### R5 — Persistence turns all current surfaces into ended records and accumulates them indefinitely

Severity: high

- `recordsFromState` serializes every surface and forcibly writes `.lifecycle=.ended`, even when the model surface is live (`persistence.zig:174-183`).
- Startup appends all restored records back into their pairs (`persistence.zig:186-203`).
- Application startup also creates a fresh live initial surface every run (`app.zig:1130-1170`), later persisted as another ended record.
- `workspace_view.closeTab` only changes `live -> ended`; there is no remove/forget model operation (`workspace_view.zig:31`).
- The action catalog has close and relaunch, but no remove-ended action (`application.zig:2-4`).

Thus every run and close grows the persistent tab list until the fixed pair capacity is reached. The UI offers no way to delete history. This exactly explains the old ended tabs and inability to remove them.

Required correction:

- Define an explicit retention policy and user operation: close live terminal, optionally retain a bounded ended history, and remove ended entry.
- Serialize only intended durable records, not every transient live surface by coercion.
- Deduplicate identities/lineage and compact old records atomically.
- Make capacity exhaustion visible and recoverable, never a silent no-op.

### R6 — Child exit hides the widget but leaves registry, surface, and GtkStack ownership live

Severity: high

- Ghostty `childExit` calls `requestClose`, which merely sets the GLArea invisible, then invokes `surfaceExited` (`ghostty_surface.zig:284-292`).
- `surfaceExited` only marks the model lifecycle ended, saves, and refreshes (`app.zig:303-308`).
- It does not call `tab_registry.childExited`, remove/detach the GtkStack page, clear `State.terminals`, or select another terminal.

An exited terminal therefore remains allocated and registered while the UI says ended. Later close/relaunch/shutdown can act on inconsistent ownership and stale pointers. A natural shell exit and an explicit close follow fundamentally different teardown paths.

### R7 — Relaunch mutates model identity with brittle rollback and stale widget ownership

Severity: high

- Relaunch uses the same impossible pre-realization identity check as new shell, so it normally fails before publication (`app.zig:672-703`).
- If registration did succeed, code first appends a new model surface via `commitAfterRegistration`, then manually decrements `surface_count`, then replaces the predecessor identity via `publishRelaunch` (`app.zig:711-719`). This relies on the appended item being the last item and does not clear its storage.
- The predecessor's hidden/destroyed GtkStack page is not removed as part of relaunch.
- `publishRelaunch` copies predecessor presentation, changes its ID, and increments generation independently of the native surface generation (`workspace_view.zig:32`).

Relaunch must be a first-class transaction with explicit predecessor page removal/retention and rollback, not append/decrement/overwrite.

### R8 — Action targets depend on incidental selection and menu press timing

Severity: high

- Repository menu items use parameterless `win.new-shell`, `win.launch-command`, and `win.open-vscode` actions (`app.zig:463-476`). A gesture “pressed” handler mutates selected pair immediately before menu activation, but does not save or refresh it (`app.zig:604-610`). The action itself carries no pair identity.
- Live-tab “Close” is parameterless (`app.zig:515`); `tabMenuPressed` first changes global selection and then `close-tab` closes `state.graph.state.surface` (`app.zig:631-639`, `855-856`).
- Rename/relaunch correctly carry UUID parameters, demonstrating the safer pattern.

Menus and keyboard/focus events can therefore redirect destructive or launch actions to whichever selection wins the timing race. Every row/tab-specific action must carry an explicit pair/surface parameter and validate lifecycle at activation time.

## Product and interaction findings

### R9 — Search and configured commands fail silently

Severity: high for usability, medium for process safety

- `openLauncher` returns with no feedback unless connection is exactly ready (`app.zig:742-748`).
- New terminal failures before the launcher model exists are only written to a hidden launcher error label and popup attempt; there is no durable status/toast.
- Launcher creation calls both `gtk_widget_set_parent(popover, overlay)` and `gtk_overlay_add_overlay(overlay, popover)` (`app.zig:1000-1025`). Manually parenting before asking a container to adopt the widget is suspect GTK ownership and should be replaced by one supported attachment path.
- Even when the launcher works, activation reaches R2 and therefore returns null.

### R10 — Sidebar and header text are implementation descriptions, not product UI

Severity: medium

- The always-visible “Pinned and grouped workspaces” label is hard-coded (`app.zig:955-960`).
- A single repository is deliberately renamed “Workspace terminal,” discarding the authoritative repository/workspace name (`app.zig:449-458`).
- “Attention: 0 unread (none)” exposes the internal severity enum and is always shown (`app.zig:528-539`).
- Every workspace, repository, and terminal gets a visible ellipsis menu button (`app.zig:427-435`, `463-477`, `505-524`); there is no right-click gesture/context menu implementation.
- `AdwNavigationSplitView` provides adaptive navigation, not the requested user-draggable desktop pane divider. Width min/max are fixed and no `GtkPaned` is used in the production workspace (`app.zig:949-1000`).

These are intentional current code paths, not styling accidents. A Supacode-like desktop layout requires a redesigned information architecture: compact repo/worktree sidebar, contextual right-click menus, tab-integrated terminal area, hidden-zero attention affordance, draggable pane boundaries, and meaningful authoritative names.

## Test false-green analysis

The current automated coverage could not detect these failures:

1. `native/linux/app_contract_test.zig` is source-text inspection. It asserts that callback names and strings exist, not that a GTK action launches, realizes, registers, closes, removes, or relaunches a surface.
2. `native/tests/workspace_ui_test.zig` exercises only pure model mutations. Its close/relaunch test has no GtkStack, GLArea, process identity, registry, persistence file, or GTK main loop.
3. `native/tests/application_actions_test.zig` verifies action names/readiness and launcher filtering, not actual GAction parameter types/targets or activation behavior.
4. `native/tests/lifecycle_stress.zig` tests only parsing of a synthetic diagnostic line. It does not execute window close with an active SSE fetch or validate safe shutdown.
5. `native/tests/ghostty_surface_test.zig` tests a standalone callback struct, not `Surface.destroy` while parented by GtkStack or during a crossfade.
6. Persistence tests codify the problematic behavior that restored records are ended; they do not test bounded retention, user removal, deduplication across repeated launches, or capacity recovery.
7. No production-path test creates a second surface through `createTerminal`; consequently the impossible realize/identity ordering is untested.
8. No test clicks a restored ended tab and asserts absence of GTK warnings.
9. No test drives repository/tab context menus and confirms the explicit target rather than global selection.
10. Existing smoke startup proves one initial surface can render, but does not prove interactive creation, exit, close, relaunch, search, persistence restart, or shutdown under active replay.

## Safe fix ordering

1. **Make terminal opening actually work.** Repair the staged creation ordering from R2: attach the new widget so it can realize, wait for process identity registration, then atomically publish registry/model state and focus it. Use this one path for new shell, configured command, initial launch, and relaunch. This is the first user-value gate; do not spend the next iteration polishing the shell around a nonfunctional launcher.
2. **Define one terminal lifecycle state machine and owner.** Specify states such as allocated, widget-attached, realizing, registered/live, exited, removing, ended-retained, destroyed. Every transition must name its model, registry, GTK, process, persistence, and focus effects. Staged creation must be implemented within this contract rather than as another special case.
3. **Implement actual tabbed-pane behavior safely.** Make GtkStack/container ownership authoritative for widgets; add/remove pages only through GTK container APIs on the GTK thread; select/focus a sibling after close; never directly unparent a container-owned GLArea from `Surface.destroy`. Present terminal pages as real tabs rather than a button-plus-ellipsis pair for every entry.
4. **Stop shutdown corruption.** Give replay transport single-thread ownership; implement safe cancellation/join; guard queued main-context dispatch lifetime; fix the duplicate signal disconnect. This remains a release-blocking safety issue even though opening terminals is the first functional repair.
5. **Unify exit and close.** Both paths must converge on the lifecycle transaction, differing only in process termination intent. Select a valid sibling and refresh once after the transaction.
6. **Separate ended history from live GtkStack pages.** Ended entries must not invoke `gtk_stack_set_visible_child_name`. Provide explicit relaunch and remove actions with UUID targets.
7. **Repair persistence semantics.** Persist intended bounded presentation history, deduplicate lineage, implement removal/compaction, and migrate/clean existing accumulated records safely.
8. **Repair action parameter wiring.** Pair/surface-specific actions carry immutable identifiers; remove dependence on gesture side effects and global selection.
9. **Repair launcher/search ownership and feedback.** Use one valid popover attachment path; show not-ready/empty/error states; prove command activation reaches a live registered terminal.
10. **Build coherent UI/UX toward the supplied reference.** Replace descriptive headers and ubiquitous ellipsis buttons, use authoritative names, hide zero attention state, add contextual right-click menus, use a draggable desktop split, and align sidebar/tab hierarchy with the reference after terminal and tab behavior are real.
11. **Add real integration acceptance before declaring Phase 106 complete.** At minimum, under a real GTK main loop and service: create two shells, launch a configured command, switch tabs, exit naturally, close explicitly during/after transition, relaunch, remove ended history, restart and verify bounded persistence, exercise search, and close while replay is blocked. Treat any GTK critical/warning or nonzero exit as failure.

## Completion judgment

Phase 106 is not at a human-polish-only checkpoint. The supplied UAT contradicts core functional and lifecycle requirements: shell creation, configured commands, ended-tab behavior, removal, close, search, shutdown, and desktop layout are incomplete or unsafe. Automated green results are insufficient because the tests do not execute the failing production paths.

## Remediation status — 2026-07-11

The first production repair replaces the pre-realize ownership lookup with a provisional `AdwTabView` page lifecycle: attach and realize the Ghostty widget, wait for the process registration, then publish registry/model state. Failed starts remove their provisional page and show an error. Replay transport is no longer deinitialized across threads; cooperative cancellation is followed by worker join and owner-thread deinit. Live and restored-ended records now have identity-backed pages, ended pages expose Relaunch and Remove, and removal deletes the persisted presentation record.

Focused build, workspace UI, tabs, real-display app, and multisurface smokes pass. The combined native gate currently stops in the pre-existing model ABI fixture with `repository.name_len = 130` indexing a 96-byte repository-name buffer; this is not treated as Phase 106 acceptance. Full interactive UAT remains required.

Follow-up remediation `4f9c7cf8` closes that ABI crash at the model trust boundary: repository storage is initialized, canonical serialization rejects invalid counts/lengths before slicing, and the C ABI harness proves oversized surface titles return structured invalid-JSON status rather than panicking. The model gate now passes. The combined gate subsequently reached a lifecycle-stress clipboard teardown sample (`clipboard=1` on cycle 1); it remains a blocking verification result rather than being waived.

Runtime closure on 2026-07-11 replaced the false-green workspace smoke with an isolated authoritative service fixture that drives the registered production GActions and GTK callbacks. Its structured checkpoints now cover new shell realization/registration, configured-command launch, selection/reorder/rename, launcher open/search/activation, live close, ended retention, distinct relaunch lineage, ended removal, context-menu construction, and clean window shutdown. Diagnostics reject GTK/Adwaita/GLib warnings and criticals, panic, segmentation faults, missing pages, nonzero exits, and child/service leaks; only the documented Vulkan `VK_SUBOPTIMAL_KHR` presentation warning is filtered.

That gate exposed and repaired additional production defects: `AdwTabView::close-page` was recursively re-requested without `close_page_finish`, launcher children became dangling after dialog close, relaunch retained its predecessor page, terminal destruction raced queued GTK/IME callbacks, new installations had no default authoritative pair, and shutdown replay had no finite join point. SSE replay now uses bounded one-frame leases with `Last-Event-ID`, preserving ordered reconnect while allowing deterministic shutdown.

The prior `clipboard=1` stress result was also a real leak: an unrealized `Surface` returned from teardown before invalidating its clipboard context. Teardown now invalidates clipboard ownership independently of Ghostty realization. The 25-cycle production stress lane passes exact-zero surface/callback/clipboard/GL/child accounting; trend checks are stratified by the intentionally different one- and two-surface workloads (final ranges: two-surface thread range 0, single-surface thread range 2). Two consecutive full workspace lifecycle smokes passed after the final close/relaunch ordering repair.

## Follow-up runtime audit — 2026-07-12

The second real-user UAT disproves the preceding smoke-based closure. The implementation still has two meanings for close, invalid detailed-action wiring, immediate destruction of command output, synchronous network shutdown, and stale-page GTK calls. These are production state-machine defects, not visual polish.

### F1 — Tab X removes the live page and deliberately recreates an ended page (P0)

`nativeClosePage` changes the model surface from live to ended, removes its terminal host, calls `adw_tab_view_close_page_finish(..., true)`, and immediately calls `refreshProjection` (`app.zig:633-659`). Projection sees an ended record with no page and appends a new ended page (`app.zig:527-558`). This exactly produces the reported close-then-reopen behavior; it is not a race. `workspace_view.closeTab` means retain history (`workspace_view.zig:31`), while a tab close conventionally means remove it.

Fix contract: separate `processExited(id)` from `userClosedTab(id)`. Natural exit may retain an ended presentation. User close must terminate the child, detach one host, remove one page and record, choose a sibling, persist once, and never recreate that ID. Test a real tab-X click and assert the ID is absent from model, registry, terminal slots, GTK pages, and persisted state after the main loop drains.

### F2 — Ctrl+Shift+W and tab X execute different transactions (P0)

The accelerator activates `win.close-tab` (`application.zig:4`, `app.zig:1012-1014`). `closeTerminal` marks the model ended, requests a programmatic GTK close, forgets/closes the host, and saves, but does not refresh (`app.zig:950-960`). Tab X instead finishes the pending close and refreshes (`app.zig:633-659`). Thus keyboard close leaves an ended record without an ended page until a later refresh, matching UAT.

Fix contract: X, accelerator, and context Close must call one ID-targeted transition; `close-page` is only a request adapter. Regression-test all three from identical fixtures and compare normalized model/registry/page/persistence snapshots.

### F3 — Ended Relaunch and Remove are disabled by malformed action names (P0)

The buttons build detailed strings such as `win.relaunch-tab('uuid')` but pass them to `gtk_actionable_set_action_name` (`app.zig:546-553`). That API accepts a plain action name, not a detailed action target. Use `gtk_actionable_set_detailed_action_name`, or set a plain action name plus a typed target. Test realized buttons for sensitivity and activate them through GTK: relaunch must create distinct live lineage; remove must erase model/page/persistence state.

### F4 — Natural command exit hides output and leaves ownership inconsistent (P0)

Ghostty child exit hides the GLArea (`ghostty_surface.zig:314-321`). `surfaceExited` only marks ended, saves, and refreshes (`app.zig:362-366`); it does not call `tab_registry.childExited`, forget the terminal, or replace the page coherently. A short command therefore appears gray/ended immediately, final output is invisible, and host ownership remains until later cleanup. The command is shell-quoted into one Ghostty command string (`app.zig:107-166`, `ghostty_surface.zig:196-205`), so a successful short command naturally exits quickly.

Fix contract: natural exit unregisters ownership exactly once while retaining the rendered buffer/page (or captured transcript) until user close; do not hide the widget on child exit. If Ghostty cannot safely retain it, use an interactive command wrapper that prints exit status and waits for dismissal without changing argv/cwd/env semantics. Test stdout, stderr, exit 0/nonzero, visible final text, ended lifecycle, zero ownership, and enabled actions.

### F5 — Programmatic close paths can use stale/already-closing AdwTabPage pointers (P0)

Multiple paths call `adw_tab_view_close_page` while the shared signal remains active (`app.zig:817,830,862,956,1021,1028`). Remove mutates the model first and does not consistently set `programmatic_tab_close` (`app.zig:1014-1029`); relaunch publishes/reprojects before removing its predecessor (`app.zig:837-867`). Reentrancy can detach a page between lookup and request, explaining `ADW_IS_TAB_PAGE(page)`.

Fix contract: maintain one GTK-thread page map and a closing-ID set. Claim/remove mapping before close, never close pending/detached pages, complete each request once, and prevent projection from recreating an ID mid-transaction. Race-test close, exit, remove, relaunch, selection, and refresh; any GTK/Adwaita warning fails.

### F6 — Window shutdown joins an uncancellable HTTP fetch on the GTK thread (P0)

Window close synchronously calls cleanup (`app.zig:1266-1268`), which sets a flag then joins replay (`app.zig:173-180`). Replay may be blocked in `std.http.Client.fetch` (`service_client.zig:55-64`); `cancel` only sets a boolean checked before fetch. Join latency therefore follows the HTTP lease/server and explains about 13 seconds.

Fix contract: initiate asynchronous shutdown and return promptly. Use an actually interruptible replay connection or strict short deadline; cancel/close it safely, then join and free state after queued dispatch drains. Test a held-open event endpoint and require application exit within a fixed local budget with zero worker leaks or use-after-free.

### F7 — Reopen LaunchRejected is consistent with stale expected revision/service metadata (P1)

Launch includes `expected_revision` (`service_client.zig:129-132`), and every non-200 becomes generic `LaunchRejected` (`service_client.zig:163`, `app_graph.zig:66-71`). Replay reduces state but does not synchronize `graph.service.revision` after accepted frames (`app.zig:265-327`). A revision change can make launches stay rejected until refresh; generic mapping hides stale descriptor/service causes.

Fix contract: synchronize revision on every snapshot/event; on conflict refresh once and retry idempotently; preserve typed failures. The run wrapper must validate descriptor PID/instance/credential health and replace stale metadata. Test revision mutation and stale descriptor recovery without manual retries.

### F8 — The production smoke codifies the rejected behavior (P0 verification gap)

The smoke invokes GActions directly (`app.zig:1350-1410`); it does not click ended buttons, compare X and keyboard close, inspect retained output, or block replay during shutdown. Its `close=live-safe ended-page=true` checkpoint explicitly codifies F1 (`app.zig:1380-1387`). Passing it cannot close Phase 106.

Required acceptance: all close entry points converge; natural exit retains visible output with working actions; actual ended buttons are clicked; a short command proves stdout/stderr/status/cwd/env; close/exit/relaunch races emit no GTK warning; blocked replay closes within budget; restart launches immediately.

### Required state-machine invariants

- A surface ID has at most one model record, native host, terminal slot, and GTK page.
- Live implies all owners and matching process identity; ended implies no registered process owner.
- User close removes presentation; natural exit may retain it.
- Page close is claimed/completed once; projection never recreates an explicitly closed ID.
- UI entry points use the same ID-targeted transition, not incidental global selection.
- Final command output remains inspectable after exit.
- Persist only after the complete transaction, never between ownership mutations.
- Shutdown never waits synchronously on an unbounded network operation on the GTK thread.

## Pair ownership and terminal-kind remediation — 2026-07-12

Production commit `5e0b4339` replaces the shared selected-pair tab surface with persistent identity-keyed `AdwTabView`/`AdwTabBar` containers inside a `GtkStack`. Switching repositories changes only the visible pair container; hidden Ghostty pages remain parented and realized. The graphical fixture now supplies two worktree pairs and proves 50 rapid switches preserve exact pair-local page sets and unchanged host ownership.

The native model, canonical ABI, and presentation persistence now carry terminal kind (`shell` or `configured_command`) plus configured-command identity. Shell termination and every explicit close remove the page and presentation. Only configured-command natural exit retains visible output and ended actions. Migration infers configured-command history only from a legacy command identity and prunes old ended shell records, including synthetic zero-ID debris.

Creation now queues child-exit notification while a provisional terminal is being realized/registered and removes terminal slots strictly by stable surface ID on rollback. Slot capacity was widened for burst tolerance, and no creation rollback relies on `terminal_count - 1` ownership assumptions.
