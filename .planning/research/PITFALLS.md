# Pitfalls Research

**Domain:** CLI workspace manager — integration orchestration (artifact passing, ordering) and Wayland/niri compositor integration
**Researched:** 2026-03-21
**Confidence:** HIGH (codebase-grounded) / MEDIUM (niri-specific, verified against official docs and maintainer statements)

---

## Critical Pitfalls

### Pitfall 1: Breaking the Integration Interface Without a Transition Strategy

**What goes wrong:**
The current `Integration` interface in `src/lib/integrations/types.ts` defines `open()` as returning `Promise<void>`. Changing it to return `Promise<IntegrationArtifact | null>` is a hard TypeScript breaking change. All four existing integrations (vscode, intellij, cmux, tmux) will fail compilation immediately. If the interface change and the integration updates are not done atomically, the build is broken in-between and no partial commit is valid.

**Why it happens:**
The temptation is to update `types.ts` first to define the new return shape, then update integrations one-by-one. TypeScript strict mode enforces interface conformance at compile time — any integration returning `void` when the interface requires `Promise<IntegrationArtifact | null>` is an immediate type error on every existing file.

**How to avoid:**
Use a union return type as a transitional shape. Define the artifact return as part of a backward-compatible union:

```typescript
open(ctx: IntegrationContext, artifactPath: string | null): Promise<IntegrationArtifact | null | void>
```

This is structurally compatible with all existing `void`-returning implementations. The orchestration loop in `workspace-ops.ts` can treat a `void` result as no artifact. Once all four integrations are updated to return the typed artifact, tighten the signature to `Promise<IntegrationArtifact | null>`.

Alternatively, introduce a separate optional method `openWithArtifacts?(ctx, artifactPath): Promise<IntegrationArtifact | null>` alongside the existing `open()`. The orchestration loop calls `openWithArtifacts` if present, falls back to `open()`. Remove `open()` once all integrations have migrated.

**Warning signs:**
- TypeScript errors appearing on any of the four existing integration files after touching `types.ts`
- Tests for individual integrations failing before the orchestration loop in `workspace-ops.ts` is touched
- A PR that updates `types.ts` and `workspace-ops.ts` but leaves any integration file unchanged

**Phase to address:**
Interface migration — must be the first atomic step, completed before any artifact-consuming logic is added.

---

### Pitfall 2: Niri Window Spawning Is Async — There Is No Guaranteed PID-to-Window Mapping

**What goes wrong:**
After spawning a terminal emulator or any application via Bun's `$` shell (or `niri msg action spawn`), the spawned process PID does not reliably map to a niri window ID. The window connection to the Wayland compositor happens asynchronously after process start, and the compositor's internal window record may not exist when you query `niri msg --json windows` immediately after spawn.

Niri's maintainer has explicitly documented this design constraint: "there's no way to reliably associate a new window with some previous spawn command." PID matching is additionally fragile because Xwayland apps may share PIDs across windows (confirmed niri issue #2563), and flatpak-sandboxed apps report the wrong PID entirely.

**Why it happens:**
Wayland has no synchronous spawn-and-get-window-id primitive. The sequence is: process spawns → connects to Wayland socket → advertises `app_id` → compositor registers it as a window. This takes 50ms to several seconds depending on application startup. The IPC query returns whatever state the compositor has at the moment of the query — which may not yet include the just-spawned window.

**How to avoid:**
Use the snapshot-diff strategy:

1. `const before = await getNiriWindows()` — capture current window IDs as a Set
2. Spawn the process (terminal emulator or application)
3. Poll `niri msg --json windows` with exponential backoff: check at 100ms, 200ms, 400ms, 800ms, up to 3s total
4. On each poll: `const after = await getNiriWindows()`, compute `diff = after.filter(w => !before.has(w.id))`
5. Match the new window by `app_id` if multiple new windows appeared during the polling window
6. If no match after 3s total, log a warning and continue without a window ID — graceful degradation

For tmux and cmux specifically: the artifact these integrations return is a session name or ref (not a window ID). The niri integration is responsible for tracking the terminal emulator window that appears during the multiplexer integration's execution. The terminal emulator's `app_id` (e.g., `foot`, `kitty`, `alacritty`) must be configurable in the niri integration's global config.

**Warning signs:**
- Code that does `spawn(...); const windows = await getNiriWindows(); windows.find(w => w.pid === spawnedPid)` — this will fail intermittently
- Any zero-delay query between spawn and window lookup
- Unit tests that pass 100% but integration tests occasionally fail with "window not found" at varying rates

**Phase to address:**
Niri integration — the snapshot-diff polling pattern must be built into `niriIntegration.open()` from the start, not retrofitted later.

---

### Pitfall 3: Niri Named Workspace Lifecycle — Workspaces Disappear When Empty

**What goes wrong:**
Niri's workspaces are ephemeral by default: a workspace is automatically removed when all its windows are closed. If the niri integration creates a named workspace for a git-stacks workspace using `set-workspace-name` (IPC), then the user closes all windows in that workspace, the workspace disappears. The next `git-stacks open` call tries to focus or move windows to the now-nonexistent workspace by name.

The reverse problem: if the niri integration uses static named workspaces declared in niri's `config.kdl` (permanent workspaces), those persist even when empty and accumulate as the user creates more git-stacks workspaces. This also requires editing niri's config file programmatically — parsing and writing KDL is non-trivial.

**Why it happens:**
Niri's design treats workspaces as ephemeral by default. Named workspaces declared in config are permanent; workspaces named via `set-workspace-name` IPC are ephemeral. These two behaviors are easy to conflate. The IPC documentation for `focus-workspace <name>` does not explicitly document behavior when the named workspace does not exist.

**How to avoid:**
Use `set-workspace-name` via IPC (not static config entries). Accept that workspaces will disappear between sessions — this is correct behavior. The niri integration's `open()` must:

1. Query `niri msg --json workspaces` first to check if a workspace with the target name already exists
2. If not: focus a new empty workspace and immediately call `niri msg action set-workspace-name <git-stacks-workspace-name>` to name it
3. Spawn windows (or detect windows already spawned by earlier integrations using snapshot-diff)
4. Move new windows to the named workspace via `niri msg action move-column-to-workspace <name>`

Never assume a named workspace persists across `git-stacks open` calls. Never save niri workspace numeric IDs in the git-stacks workspace YAML — IDs are session-scoped and change every time.

**Warning signs:**
- Code that calls `niri msg action focus-workspace <name>` without first verifying the workspace exists via `niri msg --json workspaces`
- Saving a niri workspace ID as a field in the git-stacks workspace YAML
- Attempting to create static workspace config entries in niri's `config.kdl` via file editing (requires KDL parser, fragile)

**Phase to address:**
Niri integration — workspace existence check is the mandatory first step in `niriIntegration.open()`.

---

### Pitfall 4: Integration Ordering — Niri Must Run After All Artifact-Producing Integrations

**What goes wrong:**
If niri runs before tmux or cmux, there are no window artifacts to arrange — the terminal windows don't exist yet when niri tries to move them to its workspace. Additionally, if ordering is made configurable (the v0.6.0 goal), a user could set `integration_order: [niri, tmux, cmux]` in their template YAML. Niri would run with an empty artifact context, find no windows to move, then tmux/cmux would create their windows on whatever workspace they land on by default — not the niri workspace.

**Why it happens:**
The current `integrations` array in `src/lib/integrations/index.ts` is a statically ordered flat array. The order is an implicit contract, not an enforced dependency. Adding configurable ordering makes the implicit dependency visible and breakable.

**How to avoid:**
Define ordering metadata on the `Integration` interface as a numeric priority:

```typescript
/** Lower numbers run first. Default 100. Use large values (e.g. 1000) for integrations
 *  that must consume artifacts from all others. */
order?: number
```

Hardcode niri's order to `Number.MAX_SAFE_INTEGER` in its integration definition — this makes it semantically "always last" regardless of any user-supplied ordering. The orchestration loop in `workspace-ops.ts` sorts integrations by `order` before executing.

If a dependency-graph approach (`runAfter?: string[]`) is used instead, add cycle detection at startup: if integration A declares `runAfter: ["B"]` and B declares `runAfter: ["A"]`, throw an error immediately with a clear message identifying the cycle. Do not let circular ordering silently produce wrong behavior.

**Warning signs:**
- Template YAML specifying `integration_order: [niri, tmux]` — niri listed before tmux
- The niri integration's `open()` receiving an empty artifact map when tmux is also enabled
- Integration tests that test integrations in shuffled order but niri always gets an empty context

**Phase to address:**
Integration orchestration — ordering must be defined and enforced before the niri integration is written. Niri's `order` value is part of its integration definition, not a runtime configuration.

---

### Pitfall 5: Artifact Type Confusion — tmux Session Name vs. Compositor Window ID

**What goes wrong:**
The tmux integration creates a tmux session. The artifact useful for downstream integrations is the session name (e.g., `my-workspace`). But niri cannot use a tmux session name to identify a Wayland window — niri knows nothing about tmux. The niri integration needs the compositor window ID (or `app_id`) of the terminal emulator that is running the tmux client.

If the artifact system passes tmux's session name to niri as its "window to arrange," niri will receive a string like `"my-workspace"` and have no idea what to do with it. This produces a silent no-op (niri can't find a window with that ID) or a crash if the code assumes the artifact is a window ID.

**Why it happens:**
tmux is a terminal multiplexer that runs *inside* a terminal emulator. These are two different layers: the tmux session is a tmux concept, the Wayland window is a compositor concept. The artifact appropriate for niri (compositor window ID) and the artifact appropriate for other integrations (tmux session name for attaching) are different types.

**How to avoid:**
Artifact types must be discriminated unions, not bare strings:

```typescript
type TmuxArtifact = { type: "tmux-session"; sessionName: string }
type NiriWindowArtifact = { type: "niri-window"; windowId: number; appId: string }
type IntegrationArtifact = TmuxArtifact | NiriWindowArtifact | CmuxArtifact | VscodeArtifact
```

The tmux integration returns `{ type: "tmux-session", sessionName: "my-workspace" }`. The niri integration filters the artifact context for `type === "niri-window"` to find windows to arrange — it does not consume tmux session names directly.

The niri integration uses the snapshot-diff strategy (Pitfall 2) to identify the terminal emulator window that appeared while the tmux integration was running, creates a `NiriWindowArtifact` from it, and uses that to issue `move-column-to-workspace` commands.

**Warning signs:**
- `IntegrationArtifact` defined as `string | null` — no discriminant field
- Niri integration code that reads `artifact.sessionName` — wrong artifact type
- Artifact accumulation context typed as `Record<string, unknown>` — loses type safety across integration boundaries

**Phase to address:**
Artifact type design — must be resolved and committed to before writing either the tmux artifact return or the niri consumption logic. The type file is the contract between integrations.

---

### Pitfall 6: tmux Environment Variable Contamination When Spawning from an Existing tmux Session

**What goes wrong:**
When the niri integration spawns a new terminal emulator to attach to a tmux session, the spawned process inherits the environment of the `git-stacks open` process. If `git-stacks open` is run from inside an existing tmux session (which is common — AI agents and power users often run all commands from within tmux), the spawned terminal inherits `TMUX`, `TMUX_PANE`, and `TERM` from the outer session. Attaching to a different tmux session from inside a terminal that already has `TMUX` set causes tmux to refuse with:

```
sessions should be nested with care, unset $TMUX to force
```

The terminal window opens but immediately exits or shows an error. The niri workspace appears to be set up, but the terminal has no tmux session in it.

**Why it happens:**
Bun's `$` shell and `Bun.spawn` inherit the current process environment by default. There is no automatic environment sanitization.

**How to avoid:**
When spawning a terminal emulator from the niri integration, explicitly unset `TMUX`, `TMUX_PANE`, and `TERM` in the spawn command:

```typescript
// Correct: strip outer tmux environment before spawning the terminal
await $`env -u TMUX -u TMUX_PANE foot -e tmux new-session -A -s ${sessionName}`.nothrow()
```

Use `tmux new-session -A -s <name>` (create if not exists, attach if exists) rather than `tmux attach-session -t <name>`, which requires the session to already exist. This is more robust for the case where `git-stacks open` runs before `git-stacks new` has fully initialized the tmux session.

The same issue applies to nested IDE environments: spawning from within a VSCode integrated terminal will inherit `VSCODE_*`, `ELECTRON_*`, and similar variables. These generally do not cause errors but can produce unexpected behavior in hooks or dev scripts that check these variables.

**Warning signs:**
- Integration tests run inside tmux (common in CI containers) report "nested tmux" errors
- `git-stacks open` from a tmux session opens a terminal that immediately closes
- No `env -u TMUX` in any terminal spawn command

**Phase to address:**
Niri integration — address in the terminal spawn helper used by `niriIntegration.open()`.

---

### Pitfall 7: IPC State Inconsistency — Querying Windows and Workspaces in Separate Requests

**What goes wrong:**
Niri's IPC documentation explicitly warns: "time passes between requests even when sending multiple requests to the socket at once... a window may open on a new workspace in-between the two responses." If the niri integration queries workspaces and windows in two separate `niri msg` calls, the results may be inconsistent: a window's `workspace_id` may reference a workspace that was removed between the two queries.

Niri's maintainer also warns: "sending `Action::FocusWindow` and `Action::CloseWindow` together may close the wrong window because a different window got focused in-between."

**Why it happens:**
Niri's IPC is not transactional. Each request-response cycle is independent. Between any two IPC calls, the compositor processes other events from any connected client. In a multi-monitor setup where windows open quickly (tmux sessions create windows fast), this window is large enough to produce observable inconsistency.

**How to avoid:**
For state-sensitive reads, use the event stream (`niri msg event-stream`) instead of sequential polling. Connect once, receive the full initial state in a single atomic snapshot, then process incremental events. For the snapshot-diff window-tracking strategy (Pitfall 2), query windows once for the "before" snapshot — do not also query workspaces in the same logical operation, as the two queries are not atomic.

For mutations, prefer action-based IPC that takes names rather than IDs:
- `niri msg action move-column-to-workspace <name>` — uses workspace name, robust to ID changes
- `niri msg action focus-workspace <name>` — same

Avoid patterns that read state and then act on the read state with a second IPC call (read-modify-write). If the state is needed for the action, encode the requirement in the action itself (e.g., pass the workspace name directly to the move action rather than first looking up its ID).

**Warning signs:**
- Two sequential `niri msg --json windows` and `niri msg --json workspaces` calls within a single logical operation
- Code that reads `window.workspace_id` and then immediately queries workspaces by that ID to get workspace details
- Flaky integration tests that fail only under system load (active niri session with many windows)

**Phase to address:**
Niri integration — use event-stream for state-sensitive reads, action IPC for mutations. Establish this pattern at the start of niri integration development.

---

### Pitfall 8: The Existing `open()` Skip Flags Are Bypassed by the New Ordering System

**What goes wrong:**
`workspace-ops.ts` currently has a `skip` Set that disables specific integrations when CLI flags like `--no-ide` or `--no-cmux` are passed (lines 462-469). The new orchestration loop will sort integrations by order before iterating. If the skip logic is moved or refactored during the orchestration rewrite, the existing CLI flags stop working. This is a silent regression — `git-stacks open --no-ide` appears to succeed but VSCode still opens.

**Why it happens:**
The skip logic is tightly coupled to the current flat-array iteration. Adding ordering and artifact accumulation requires restructuring the loop. It is easy to accidentally drop the skip check during the refactor.

**How to avoid:**
The skip check must be the first guard in the new orchestration loop — before ordering, before `isEnabled`, before `applies`:

```typescript
for (const integration of sortedIntegrations) {
  if (skip.has(integration.id)) continue   // must remain as first guard
  if (!integration.isEnabled(ctx)) continue
  if (integration.applies && !integration.applies(workspace)) continue
  // ... artifact accumulation and open() call
}
```

Write a regression test for the `--no-ide` and `--no-cmux` paths before refactoring the loop.

**Warning signs:**
- The `skip` Set is removed or moved after the ordering sort
- `git-stacks open --no-ide` still launches VSCode after the orchestration refactor
- No test coverage for `skip` behavior before refactoring the integration loop

**Phase to address:**
Integration orchestration — add regression tests for skip behavior before touching `workspace-ops.ts`.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode niri ordering as `Number.MAX_SAFE_INTEGER` | Avoids designing full ordering system now | Cannot support integrations that must run after niri | Acceptable for v0.6.0; mark with a `// TODO: v0.7.0 ordering system` comment |
| Poll with fixed 100ms intervals for window appearance | Simple to implement | Burns CPU during window spawn; may miss windows that appear and disappear quickly | Acceptable as initial implementation; document the interval constant |
| Use `app_id` as sole window identifier | Simpler than PID mapping | Breaks when multiple windows of the same app exist (e.g., two `foot` terminals) | Only acceptable if niri integration is used with one terminal emulator instance per git-stacks workspace; must be documented |
| Bare `string` artifact type (no discriminant) | Quicker initial implementation | Type system cannot prevent niri from consuming a tmux session name as a window ID | Never — discriminated union is required from the start |
| Skip window tracking entirely; just focus the niri workspace without arranging windows | Avoids all race conditions | Niri integration provides no value without window arrangement | Never — window arrangement is the entire point of the niri integration |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| niri IPC | Look up window by PID after spawn | Snapshot-diff: record window IDs before spawn, poll for new window matching `app_id` after |
| niri IPC | Assume named workspace persists between `open` calls | Always query `niri msg --json workspaces` first; create and name workspace on every `open` |
| niri IPC | Use workspace numeric ID to reference workspace | Always use workspace name via `set-workspace-name`; IDs are session-scoped |
| niri IPC | Query windows and workspaces in separate requests expecting consistency | Use event-stream for atomic state reads; use action IPC with names for mutations |
| tmux | Spawn terminal with inherited `TMUX` env var | `env -u TMUX -u TMUX_PANE foot -e tmux new-session -A -s $name` |
| tmux | Pass session name to niri as the "window artifact" | tmux returns `{ type: "tmux-session" }`; niri independently tracks the terminal emulator window |
| Integration interface | Change `open()` return from `void` to `T` directly | Use `void | T` union as transition type; tighten after all four integrations are updated |
| Orchestration loop | Reorder integrations during refactor | Preserve the `skip.has(integration.id)` guard as the first check in the new loop |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Polling `niri msg --json windows` in a tight loop | High CPU during `git-stacks open`; niri IPC socket contention | Exponential backoff starting at 100ms; max 3s total (≤15 poll attempts) | Immediately noticeable on any machine |
| Spawning a new terminal emulator unconditionally on every `open` | Multiple redundant terminal windows for a single workspace | Check if a tmux session already exists; only spawn a new terminal if no existing terminal is showing that session | On second `git-stacks open` call for the same workspace |
| Querying full `niri msg --json windows` list for every integration in the loop | Slow `git-stacks open` as integration count grows | Take one "before" snapshot; reuse for all integrations; take one "after" snapshot at the end | With 10+ integrations enabled simultaneously |

---

## "Looks Done But Isn't" Checklist

- [ ] **Artifact accumulation:** `open()` returns an artifact — verify the orchestration loop in `workspace-ops.ts` accumulates it into the shared context map AND passes it to later integrations, not just collects it
- [ ] **Niri window tracking:** Snapshot-diff finds the correct window — verify it identifies the terminal emulator window, not a transient splash or tooltip window with the same `app_id` prefix
- [ ] **Niri workspace creation:** `set-workspace-name` names the correct workspace — verify behavior when multiple empty workspaces exist (niri creates empty workspaces as you scroll)
- [ ] **tmux environment isolation:** Spawned terminal attaches cleanly — verify the `env -u TMUX` unset is present AND tested by running `git-stacks open` from inside an active tmux session
- [ ] **Integration ordering:** Niri runs last — verify by adding a log statement to each integration and confirming the order in a real `git-stacks open` run with all integrations enabled
- [ ] **Skip flags preserved:** `git-stacks open --no-ide` still skips vscode and intellij after the orchestration refactor — verify by checking VSCode does not launch
- [ ] **Existing integrations unchanged:** After interface migration, `git-stacks open` without niri enabled produces identical output and behavior to v0.5.1 — verify with the existing test suite

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Integration interface break (all four integrations fail to compile) | MEDIUM | Revert `types.ts` to `void | T` union; update integrations one at a time; verify build after each |
| Niri window not found after spawn (timeout exceeded) | LOW | Log warning and continue; workspace still opens without window arrangement; add longer timeout if system is consistently slow |
| Wrong workspace named (named a workspace the user was already on) | LOW | Query workspace list before naming; verify the workspace to be named is a freshly-created empty one |
| Nested tmux error when spawning terminal | LOW | Add `env -u TMUX -u TMUX_PANE` to all terminal spawn commands; add a check for `TMUX` in env before spawning |
| Artifact type is `string` (no discriminant) — niri misuses tmux session name | HIGH | Requires rewriting artifact type to discriminated union and updating all artifact producers and consumers; do not ship without discriminants |
| Integration skip flags broken after orchestration refactor | MEDIUM | Add regression tests before refactoring; restore `skip.has()` as first guard in new loop |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Integration interface breaking change | Phase: Artifact type design and interface migration | TypeScript compiles with all four existing integrations after change; existing test suite passes |
| Niri async window spawn / PID unreliability | Phase: Niri integration implementation | Integration test spawns a terminal, polls, finds the window within 3s on a loaded system |
| Niri named workspace lifecycle | Phase: Niri integration implementation | Test: open workspace, close all windows, open again — workspace is recreated with the correct name |
| Integration ordering / niri runs last | Phase: Integration orchestration | Test: enable all integrations; verify execution order via logs; niri always runs last |
| Artifact type confusion (tmux session vs. window ID) | Phase: Artifact type design | Type system uses discriminated union; niri integration code does not compile if it reads `.sessionName` from a niri artifact |
| tmux environment contamination | Phase: Niri integration implementation | Test: run `git-stacks open` from inside tmux; terminal spawns, attaches cleanly, no "nested tmux" error |
| IPC state inconsistency | Phase: Niri integration implementation | Code review confirms no sequential window+workspace queries; mutations use name-based action IPC |
| Skip flags broken by orchestration refactor | Phase: Integration orchestration | Regression test for `--no-ide` and `--no-cmux` flags passes before and after refactor |

---

## Sources

- Niri IPC race condition warning (official documentation): https://github.com/YaLTeR/niri/wiki/IPC — explicit warning that state between requests is inconsistent
- Niri maintainer statement on spawn-to-window association: https://github.com/niri-wm/niri/discussions/3208 — "there's no way to reliably associate a new window with some previous spawn command"
- Niri ephemeral named workspaces lifecycle: https://github.com/niri-wm/niri/discussions/3198 — workspaces disappear when empty; `set-workspace-name` creates ephemeral names
- Niri focus-or-spawn scripting patterns and async timing: https://github.com/niri-wm/niri/discussions/2602 — "might take a few hundred ms sometimes due to system load"
- Niri Xwayland shared PID issue: https://github.com/YaLTeR/niri/issues/2563 — PID matching unreliable for Xwayland apps
- Current integration interface (direct codebase read): `src/lib/integrations/types.ts` lines 10-39
- Current orchestration loop (direct codebase read): `src/lib/workspace-ops.ts` lines 572-579
- Current skip logic (direct codebase read): `src/lib/workspace-ops.ts` lines 462-469
- tmux integration (direct codebase read): `src/lib/integrations/tmux.ts`
- cmux integration (direct codebase read): `src/lib/integrations/cmux.ts`

---
*Pitfalls research for: v0.6.0 — integration orchestration and niri compositor integration in git-stacks*
*Researched: 2026-03-21*
