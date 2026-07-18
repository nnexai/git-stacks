---
status: resolved
trigger: "Phase 127 first-test findings: duplicate file-status repository rows, keyboard-layout-dependent shortcuts, delayed workspace actions and notifications, Fish PTY initialization/teardown failures, missing repository choices, and a crashing Bun TUI launcher."
created: 2026-07-18
updated: 2026-07-18
---

# Debug Session: Phase 127 UAT Regressions

## Symptoms

- expected: Workspace file status lists each repository once; configured shortcuts follow the user's logical Colemak-DH layout; workspace actions and repository choices are immediately available from authoritative state; Fish shells and configured commands start and stop normally; failures surface promptly; and `bun packages/tui/dist/index.js` starts and exits cleanly.
- actual: File status shows `git-stacks · 0 need attention` twice. `Ctrl+Shift+Alt+K` triggers Create Workspace because the physical Colemak-DH key position is interpreted like `N`. Workspace actions pause while loading. The Create Workspace dialog has an empty repository-choice area. Terminal failures arrive late. The Bun TUI still renders an empty string where OpenTUI expects text and then crashes hard enough to require killing the process.
- errors: `PTY allocation failed: PTY process group 3583159 did not exit after SIGTERM and SIGKILL`; configured command reports `chdir(2) failed.: No such file or directory`; Fish exits before the temporary-file environment bootstrap writes its `ready` marker; `[git-stacks shell initialization] Shell exited before PTY initialization completed`.
- timeline: Observed during the first manual tests of the merged Phase 127 candidate on 2026-07-18. The affected pre-existing shell, command, repository-selection, and TUI behavior worked before this milestone.
- reproduction: Open Workspace file status for `git-stacks`; use app shortcuts under Colemak-DH; open workspace actions; open Create Workspace; start a Fish shell; run a configured test command; wait for terminal-failure notification; run `bun packages/tui/dist/index.js`.
- screenshots: `/tmp/codex-clipboard-rCTH6L.png` and `/tmp/codex-clipboard-sXJtXj.png`.

## Current Focus

- hypothesis: Confirmed. Grouped rendering and ungrouped cursor order caused action jumps; an `undefined` terminal result field crashed secure event publication; pending RPCs survived the resulting channel closure; and the CLI launcher selected a stale global TUI.
- test: Completed focused component/client/terminal regressions and the rebuilt real-service flow: traversed action rows, ran `tui-output-smoke` through terminal completion, returned to an interactive view, quit without killing the process, and launched the TUI through the exact local CLI entrypoint.
- expecting: Satisfied. Arrow navigation follows visual row order, terminal operation completion resolves the progress state, `q` remains responsive, no invalid empty text nodes reach OpenTUI, the service survives terminal publication, and Fish startup/cleanup tests agree with the real shell.
- next_action: Preserve this replacement candidate for fresh exact-SHA external and human verification; do not reuse approvals from the superseded candidate.
- reasoning_checkpoint: User supplied direct production UAT evidence; deterministic Phase 127 gates did not cover these live paths sufficiently.
- tdd_checkpoint: true

## Evidence

- timestamp: 2026-07-18T00:00:00+02:00
  observation: Screenshot shows two identical `git-stacks · 0 need attention` expandable rows in one file-status dialog.
  implication: Either repository identity is duplicated upstream or the dialog renders two projections of the same repository without deduplication.
- timestamp: 2026-07-18T00:00:00+02:00
  observation: Screenshot shows Create Workspace with a selected template but an empty repository list/control region.
  implication: Template/repository inventory is unavailable, delayed, filtered incorrectly, or rendered invisibly.
- timestamp: 2026-07-18T00:00:00+02:00
  observation: The failing Fish bootstrap reads allowlisted values from `/tmp/git-stacks-pty-yx9Rol/value.*`, but the shell exits before writing `/tmp/git-stacks-pty-yx9Rol/ready` after `chdir(2)` fails.
  implication: Startup cwd validity and bootstrap completion are coupled; cleanup then waits on a process group that does not terminate as expected.
- timestamp: 2026-07-18T11:10:00+02:00
  observation: `projectWebFileStatus` appends every core repository section without repository-ID deduplication; `matchShortcutEvent` and shortcut capture normalize `event.code`; Create Workspace adds templates before the repository option; and `workspace.actions` calls `core.build()` for each request.
  implication: These directly explain duplicate status rows, Colemak-DH physical-position behavior, a hidden initial repository picker, and action-menu latency.
- timestamp: 2026-07-18T11:10:00+02:00
  observation: Thirteen OpenTUI `<text>{""}</text>` instances existed across dashboard source. Focused client/service tests, the complete TUI suite, and workspace typecheck pass after replacing blank text nodes and adding regressions.
  implication: The reported Bun/OpenTUI empty-text crash had multiple reachable sources; renderer normalization must be applied dashboard-wide.
- timestamp: 2026-07-18T11:11:00+02:00
  observation: `tests/service/web-terminal.test.ts` passes (26 tests), `npm run tui:build` succeeds, and `timeout 3s bun packages/tui/dist/index.js` renders the live dashboard without the empty-text crash before the expected timeout.
  implication: The shell-cleanup diagnostic change preserves the command-PTY safety invariant, and the rebuilt TUI has a live launch smoke result.
- timestamp: 2026-07-18T11:12:00+02:00
  observation: The remaining workspace-action latency source is architectural: `SecureRouter.workspaceActions()` invokes `core.build()`, which rebuilds the full workspace catalog and status projections even when the browser has already fetched the exact snapshot revision.
  implication: A complete latency repair needs a revision-bound, router-visible core-state cache seeded by `web.snapshot`; this was not implemented before the requested stop.
- timestamp: 2026-07-18T11:15:00+02:00
  observation: `web.snapshot` now seeds `CoreStateProvider` from its exact `WorkspaceCatalog`; `workspace.actions` reads that state only when `expected_revision` matches. The provider retains one newest generation, so a cache miss rebuilds authoritative state and the existing revision mismatch check rejects stale/replayed requests.
  implication: The initial workspace-action menu no longer repeats the snapshot's full status reconstruction, without weakening service ownership or revision validation.
- timestamp: 2026-07-18T11:15:00+02:00
  observation: `tests/service/web-workflow-authority.test.ts` and `tests/service/web-workspace-actions.test.ts` pass (23 tests); workspace typecheck passes; `git diff --check` is clean.
  implication: The cache hit, cache miss/stale fallback, action authority behavior, and TypeScript contract are verified.
- timestamp: 2026-07-18T12:00:00+02:00
  observation: The previously running global service was replaced by the rebuilt repository daemon. A real authenticated Fish shell reached `running` in 409-425 ms and closed with exit code 0.
  implication: The Fish `--init-command` readiness path removes the terminal-capability-query deadlock without bypassing the user's login/interactive startup.
- timestamp: 2026-07-18T12:01:00+02:00
  observation: The configured command's `chdir(2)` failure came from `~/.config/git-stacks/config.yml` pointing at a deleted `/tmp/workspace-ops-real-*` fixture. Restoring `/home/nnex/workspaces` removed the cwd failure. The command then reached its text and exposed that the saved POSIX loop was incompatible with configured Fish; the equivalent Fish command streamed ticks 1-20 and `done`, then exited 0 after 20.6 seconds.
  implication: Service PTY command execution now uses the shared command-mode private-file handshake, preserves the original command as a shell argument, applies overlays after profile startup, and matches CLI configured-shell semantics.
- timestamp: 2026-07-18T12:02:00+02:00
  observation: The rebuilt full dashboard launched through `bun packages/tui/dist/index.js`, rendered the real catalog without an orphan-text crash, exited immediately on `q`, and restored the alternate screen. The fatal-mount launcher probe also exits nonzero, restores terminal state, and leaves no child.
  implication: Both the render defect and the unresponsive crash-cleanup defect are covered by published-entrypoint behavior rather than source-only projection tests.
- timestamp: 2026-07-18T12:03:00+02:00
  observation: `npm test` passed 2,284 Vitest tests (one skipped), 122 Node tests, and all TUI suites. SHA-256 checksums for the real config and `git-stacks` workspace definition and the persisted workspace count were identical before and after.
  implication: The repaired code passes the complete gate and the current test harness does not reproduce the historical production-config mutation.
- timestamp: 2026-07-18T12:30:00+02:00
  observation: Live action-menu navigation starts on a Lifecycle row even though Workspace rows render first, then visibly jumps between groups as Up/Down advances. A real `tui-output-smoke` operation prints ticks 1-20 and `done`, but the progress spinner never completes and normal quit input is blocked.
  implication: Earlier launcher-only TUI verification was insufficient; cursor order and durable-operation stream completion require real interaction coverage.
- timestamp: 2026-07-18T12:31:00+02:00
  observation: Independent review found two remaining conditional children capable of producing invalid OpenTUI text, a focused Fish startup failure, and cleanup that may signal a reused process group before checking whether the tracked group still exists.
  implication: The prior resolved status and full-gate claim cannot be used as closure evidence until these focused failures are reconciled and rerun.
- timestamp: 2026-07-18T12:36:00+02:00
  observation: A foreground rebuilt service reproduced the permanent command spinner as a process crash while broadcasting the terminal `succeeded` event: secure canonical encoding rejected `failed_command: undefined`. The JSON journal looked valid only because persistence silently omitted that property.
  implication: Durable operation completion and live secure publication had diverged. Normalizing the live event to the exact durable JSON record and omitting the absent command field removes the crash at the protocol boundary.
- timestamp: 2026-07-18T12:37:00+02:00
  observation: `SecureRpcClient` resolved its `closed` promise when a channel ended normally but did not reject pending requests. A service crash could therefore leave `operation.get` pending forever even after the operation journal reached a terminal state.
  implication: Unexpected normal channel closure must reject every pending RPC so the official client can discard the dead connection and recover through durable operation polling.
- timestamp: 2026-07-18T12:40:00+02:00
  observation: The exact service-backed `tui-output-smoke` command streamed through tick 20 and returned `succeeded` with exit code 0 while the foreground service remained alive. The rebuilt local TUI then showed `Command tui-output-smoke completed.` and `Done. Press any key to continue.`, accepted input, returned to the workspace view, and exited 0 on `q` with terminal restoration.
  implication: Command execution, terminal operation publication, progress completion, post-command responsiveness, and emergency quit now pass the reported live path rather than only synthetic tests.
- timestamp: 2026-07-18T12:41:00+02:00
  observation: `bun packages/cli/dist/index.js manage` still reproduced the old orphan-text crash because `manage` selected `/home/nnex/.bun/bin/git-stacks-tui` from PATH instead of the resolvable workspace package. The package-local runtime probe passes after preferring the matching `@git-stacks/tui` entrypoint and using PATH only as an optional-package fallback.
  implication: Local and installed CLI launches now pair with their colocated TUI package instead of accidentally executing a stale unrelated binary.
- timestamp: 2026-07-18T12:54:00+02:00
  observation: `npm test` passed 2,288 Vitest tests (one skipped), 122 Node tests, and every preload-backed OpenTUI suite. All seven workspace typechecks, dependency-cycle checks, `verify:gates`, 29 focused terminal tests, JSON-safe event publication tests, secure-channel closure tests, action traversal tests, and launcher tests pass.
  implication: The complete repaired diff and the newly added live-path regressions are green together.
- timestamp: 2026-07-18T12:55:00+02:00
  observation: Independent final review initially found an eventual-exit terminal leak and deferred PID-reuse signaling risk. The revised lifecycle observes the original PTY exit to settle the logical terminal and performs no deferred signaling after failed initialization; reviewer reinspection reports both findings resolved with no remaining blocker.
  implication: Failed initialization remains honest while its original PTY is alive, becomes recoverable when that PTY exits, and cannot later signal an unrelated reused process-group ID.

## Eliminated


## Resolution

- root_cause: The UAT failures were independent regressions: duplicate repository projection, physical-key shortcut matching, delayed full-catalog action rebuilds, Fish terminal negotiation before PTY input, configured-command cwd corruption plus an incorrect PTY wrapper, principal-blind live signal delivery, reachable OpenTUI orphan text, grouped action rendering with ungrouped cursor order, a terminal operation event containing `undefined`, pending RPCs surviving channel closure, and the CLI launching a stale PATH TUI instead of its matching package.
- fix: Deduplicate and label file-status scopes, use logical shortcut keys, expose repository selection before templates, consume a revision-bound completed-catalog cache, initialize interactive Fish before terminal negotiation, execute configured commands through the shared command handshake inside the PTY, apply per-principal live-signal visibility without restricting signals to the selected workspace, normalize blank TUI branches, align cursor and visual group order, publish the exact JSON-safe durable event, reject pending RPCs on channel closure, allow `q` during progress, and prefer the resolvable package-local TUI launcher.
- verification: Real authenticated Fish shell; direct service-backed and interactive 20-second command checks; service survival; action-menu traversal; progress completion and post-command input; package-local `manage` runtime probe; `q`, Ctrl+C, signal, and fatal-mount terminal restoration; 2,288 Vitest tests, 122 Node tests, all TUI suites, every workspace typecheck, dependency-cycle checks, `verify:gates`, independent no-blocker review, clean diff, and restored production config root.
- files_changed: packages/cli/src/lib/cli-program.ts; packages/client/src/secure-session.ts and shortcuts.ts; packages/service/src/policy/client.ts, core-state.ts, event-journal.ts, operations.ts, and snapshot.ts; packages/service/src/secure/router.ts; packages/service/src/web/terminal-manager.ts; packages/web/src/app.ts and overlay-controller.ts; affected TUI views; and regression tests.
