# Pitfalls Research

**Domain:** TUI dashboard overhaul, Unix socket IPC messaging, and shell completion improvements for an existing Bun/TypeScript/SolidJS CLI tool
**Researched:** 2026-03-19
**Confidence:** HIGH (direct codebase analysis + verified OpenTUI docs + confirmed Bun socket behavior from official sources and issue tracker)

---

## Critical Pitfalls

### Pitfall 1: Multiple `useKeyboard` Handlers Fire Simultaneously — Double-Dispatch in Modal/Tab Views

**What goes wrong:**
`useKeyboard` in OpenTUI/Solid is a **global broadcast** hook — every mounted component that calls it receives every keypress, regardless of which is "visually active." The existing dashboard works around this by having `App.tsx` guard with `if (v.view === "action-menu") return` before dispatching list keys, but child components (`ActionMenu`, `ConfirmDialog`, `DetailStatus`) also register their own `useKeyboard` handlers. Both fire on every keypress. The parent early-returns, but the child still processes the same key.

When tabs are added, each tab panel (`WorkspacesTab`, `TemplatesTab`, `ReposTab`) will mount its own `useKeyboard`. If the inactive tab components remain mounted (rendered but visually hidden), their handlers still fire. A user pressing `j` to navigate the Workspaces list will also fire the key handler inside the Templates list — both update their respective cursors simultaneously.

**Why it happens:**
OpenTUI's focus model routes events to the focused component (a low-level concept). The SolidJS `useKeyboard` hook wraps the global `KeyHandler` event emitter and fires for all subscribers. There is no built-in "active tab" or "focus scope" concept in the SolidJS reconciler. When tab components are mounted unconditionally (common for performance — avoids remounting), all their handlers are live.

**How to avoid:**
- Use a single top-level `useKeyboard` in `App.tsx` and pass a `currentTab` signal down as a prop or context. Child tab panels receive an `active: boolean` prop and all key dispatching routes through the one handler.
- Alternatively, only mount (render) the active tab's content — use SolidJS `<Show>` not CSS `display: none`. If remount cost is acceptable for the 3 tabs in this project, this is the simpler and safer pattern.
- Never have a child component call `useKeyboard` while also being guarded in the parent — either the parent handles it entirely or the child handles it entirely, not both. The existing `ActionMenu`/`ConfirmDialog`/`DetailStatus` pattern works only because the parent early-returns before processing list keys; extend this discipline explicitly when adding tabs.
- If tab panels must stay mounted for state preservation, introduce an `AppContext` with a `focusedTab` signal and gate every `useKeyboard` callback body on `if (props.active) ...` as the very first line.

**Warning signs:**
- A navigation key (e.g., `j`, `k`, arrow) triggers movement in two different lists at once.
- Pressing `Esc` in an action menu also resets the filter on the background list.
- Tab switching appears to work but leaves a ghost cursor in the previously active tab.

**Phase to address:** Dashboard overhaul phase — must be settled before implementing any tab panels.

---

### Pitfall 2: Stale Unix Socket File Causes Silent Failure of All `message send` Commands

**What goes wrong:**
The TUI daemon creates a Unix domain socket (e.g., `~/.config/git-stacks/tui.sock`) when it starts and listens for incoming messages. If the TUI process crashes or is killed (SIGKILL, power loss, OOM), the socket file is left on disk. The next time a user runs `git-stacks message send`, `Bun.connect()` to the stale socket file gets a `ECONNREFUSED` error because nothing is listening — but the file exists, so any "is TUI running?" check that uses `fs.existsSync(socketPath)` returns `true` and the command appears to fail for an opaque reason rather than "silently dropping" as designed.

Inversely, the next TUI launch tries to `Bun.listen()` on the socket path and receives `EADDRINUSE` because the stale file is still there. `SO_REUSEADDR` does not apply to AF_UNIX sockets — the only solution is `fs.unlinkSync()` before bind.

**Why it happens:**
Socket file lifecycle is not the same as process lifecycle. The OS does not clean up socket files when a process exits (unlike ephemeral TCP ports which are reclaimed). `fs.existsSync` checks the filesystem, not whether any process is listening. Both `EADDRINUSE` on start and `ECONNREFUSED` on connect are predictable but need explicit handling.

**How to avoid:**
- TUI startup: Before `Bun.listen({ unix: socketPath, ... })`, check if the file exists. If it does, attempt `Bun.connect({ unix: socketPath, ... })`. If connect fails with ECONNREFUSED/ENOENT, the process is gone — call `fs.unlinkSync(socketPath)` and proceed to listen. If connect succeeds, a TUI is already running — abort with a clear message.
- TUI shutdown: Register cleanup in `process.on("SIGINT", ...)`, `process.on("SIGTERM", ...)`, and the OpenTUI `onDestroy` callback (which fires on `renderer.destroy()`). All three must call `fs.unlinkSync(socketPath)` wrapped in `try/catch` (file may already be gone).
- `message send` client side: Catch `ECONNREFUSED` and `ENOENT` from `Bun.connect()` and treat both as "TUI not running — drop silently." Do not rely on `fs.existsSync` for liveness check; only a successful connect proves liveness.
- Socket path: Use a per-session or PID-qualified path (e.g., `~/.config/git-stacks/tui-<pid>.sock`) and write the path to a known location (`~/.config/git-stacks/tui.lock`) — this eliminates the EADDRINUSE problem entirely at the cost of slightly more lookup logic.

**Warning signs:**
- `git-stacks message send` prints an error after a crashed TUI session.
- Second TUI launch after a crash fails with `EADDRINUSE` and no actionable message.
- `ls ~/.config/git-stacks/*.sock` shows lingering files after TUI exits.

**Phase to address:** Messaging/IPC phase — design the socket lifecycle protocol before writing the first line of socket code.

---

### Pitfall 3: OpenTUI `renderer.suspend()` + `Bun.spawn()` for Editor Integration Is a Known Open Issue

**What goes wrong:**
The existing `launchEditor()` in `App.tsx` correctly calls `renderer.suspend()` before spawning the editor and `renderer.resume()` after. However, OpenTUI issue #564 (open as of early 2026) documents that spawning an external editor via `Bun.spawn()` while OpenTUI is active causes the editor to be "extremely slow and drops inputs." The root cause is that OpenTUI continues to capture stdout and interferes with the spawned process's terminal I/O even when suspended.

For the dashboard overhaul, editor launch will be needed for more surfaces (workspace YAML, template YAML, repo config). If the suspend/resume issue is not resolved upstream, every editor invocation risks dropped keystrokes and a laggy editing experience.

**Why it happens:**
OpenTUI operates in terminal raw mode and captures stdin globally. `renderer.suspend()` is documented as "fully suspend (disables mouse, input, and raw mode)" but the issue tracker indicates this does not fully release terminal control in all Bun versions. The fix was reportedly applied between OpenTUI 0.1.47–0.1.49 but later regressed.

**How to avoid:**
- Before the dashboard overhaul phase ships, verify the current installed OpenTUI version resolves issue #564. Test: suspend → spawn `$EDITOR` → type 20 characters → no dropped inputs.
- If the issue is present: implement a workaround using `renderer.destroy()` (full teardown) before spawning the editor and `render()` again after the editor exits. This is heavier (full TUI restart) but reliably hands off the terminal. The existing `launchEditor` structure already handles this in the `finally` block.
- Do not expand editor-launch surfaces (Templates tab, Repos tab) until the terminal handoff is confirmed working for the already-existing Workspace YAML editor path.
- Pin the OpenTUI version in `package.json` — do not accept minor version bumps without verifying the suspend/resume behavior hasn't regressed.

**Warning signs:**
- Opening `$EDITOR` from the TUI drops characters typed in the first 500ms.
- Vim/nano key sequences arrive garbled or delayed.
- `renderer.resume()` leaves residual rendering artifacts (ghost text) after the editor exits.

**Phase to address:** Dashboard overhaul phase — test editor integration as the very first sub-task; do not build Template/Repo tabs until Workspace YAML editing is verified clean.

---

### Pitfall 4: `UIView` Discriminated Union Does Not Scale to Multi-Tab State — Index Coupling Breaks on Tab Switch

**What goes wrong:**
The current `UIView` type stores index into `filteredEntries()` as a numeric offset (`{ view: "action-menu"; index: number }`). This works when there is one list. With three tabs (Workspaces, Templates, Repos), each tab has its own list. If the user opens an action menu on workspace #3, switches to the Templates tab (resetting `filteredEntries` to templates), then the saved `index: 3` now points at template #3, not workspace #3. Actions will execute against the wrong entity.

Additionally, the `cursor` signal is a single number. With multiple tabs, there needs to be one cursor per tab, but the current signal design has one global cursor.

**Why it happens:**
The existing architecture optimized for one list. Index-based references into a list are implicitly tied to the list identity. Adding tabs means multiple lists exist simultaneously.

**How to avoid:**
- Change `UIView` action states to store workspace/template/repo names (strings, the natural primary key) instead of numeric indexes: `{ view: "action-menu"; tab: TabId; name: string }`. Resolve the actual object by name at action time.
- Replace the single `cursor` signal with a `Record<TabId, number>` map, initialized with `{ workspaces: 0, templates: 0, repos: 0 }`.
- The `filteredEntries` memo must be replaced with per-tab filtered lists; the current unified `filteredEntries()` approach has a name collision risk.
- Audit every place `filteredEntries()[index]` appears and change to a by-name lookup before adding any tab.

**Warning signs:**
- "Remove workspace X" dialog appears but removes a different workspace than the one the cursor was on.
- Switching tabs while an action menu is open causes the action to execute against the newly visible tab's entity.
- TypeScript does not catch this because `index: number` is valid for any list.

**Phase to address:** Dashboard overhaul phase — address as a prerequisite design step before implementing tab switching. Changing from index-based to name-based UIView is a low-risk refactor that pays dividends throughout the feature.

---

### Pitfall 5: Shell Completion Dynamic Lookups Spawn Subprocesses — Blocks Tab for Seconds on Slow Disk or NFS

**What goes wrong:**
The current fish completion for workspace names uses `ls $ws_dir | sed 's/\\.yml$//'` inside a `function __git_stacks_workspaces` that fish runs as a subprocess on every Tab press. Adding branch completions (which would require running `git branch` inside each workspace path) will compound this. A user with 15 workspaces who presses Tab after `git-stacks open` would trigger 15 `git branch` subprocesses.

The existing repo name completion uses `grep '^- name:' registry.yml` which is fast, but if the path to `registry.yml` is on a slow filesystem (e.g., NFS home directory, remote-mounted drive), even a `grep` can take 200–500ms, making Tab feel broken.

**Why it happens:**
Shell completion functions are executed synchronously on Tab press. Any subprocess call — `ls`, `grep`, `git` — adds latency. Fish-shell issue tracker documents completions blocking for 30 seconds when subprocesses are slow. The user cannot interrupt a hanging completion function in many shells.

**How to avoid:**
- Keep dynamic lookups to exactly what currently exists: `ls` the workspaces dir, `ls` the templates dir, `grep` the registry file. These are O(1) disk operations and fast even for 100+ workspaces.
- Do NOT add `git branch` or any per-repo subprocess call to completion functions. Branch completion adds complexity but the performance cost is disqualifying.
- Wrap every `ls` / `grep` with a hard timeout guard in the shell functions: `ls "$ws_dir" 2>/dev/null` (already done) — ensure this `2>/dev/null` suppression is present on all existing and new lookups.
- For the `message` subcommand, workspace names are already covered by the existing workspace completion lookup. Register `message.send` in `DYNAMIC_COMPLETIONS` mapping to `"workspace"` — do not add a separate lookup.
- Test all three shells (bash/zsh/fish) explicitly with an empty `~/.config/git-stacks/` directory (fresh install simulation) to verify completions return empty rather than error codes that corrupt the shell prompt.

**Warning signs:**
- Tab after `git-stacks open` takes more than 100ms on a local SSD — likely a subprocess is misbehaving.
- Completion works in bash but hangs in fish — fish runs completion functions out of process; bash runs them in-shell.
- The generated completion script grows beyond ~300 lines — a sign that per-command static enums are being inlined repetitively instead of shared.

**Phase to address:** Shell completion overhaul phase — resolve before releasing, and add a performance smoke test (time `bash -c 'source <(git-stacks completion bash); COMP_WORDS=(git-stacks open ""); COMP_CWORD=2; _git_stacks_complete; echo "${COMPREPLY[@]}"'` — must complete in under 200ms).

---

### Pitfall 6: OpenTUI Render Loop Silently Stalls Under Keyboard Event Bursts (Known Issue #789)

**What goes wrong:**
OpenTUI issue #789 documents a scenario where the render loop stalls silently when a rendering flag blocks `requestRender` during an event burst. In the context of the dashboard overhaul, this is most likely to trigger when:
- Rapid async status fetching sets many reactive signals in quick succession (the existing `fetchStatuses` batch-update pattern).
- Tab switching while status fetches are in-flight triggers multiple concurrent signal updates.
- The messaging system fires a signal update on every incoming socket message (e.g., if an agent sends 10 messages in 100ms).

When the render loop stalls, the TUI appears frozen. No explicit error is reported.

**Why it happens:**
The render loop in OpenTUI has a flag that prevents re-entry during rendering. If a reactive update triggered inside a render call schedules another render, and that cycle repeats, the loop may lock up. The exact trigger conditions are not fully documented (the issue is open).

**How to avoid:**
- Batch all signal writes from async operations using SolidJS `batch()` calls. The existing `setEntries` pattern in `useWorkspaces.ts` does this correctly (it wraps the `prev.map()` update). Replicate this discipline for template/repo hooks.
- For the messaging system: buffer incoming socket messages in a plain array; flush to the SolidJS signal at most once per frame using `requestAnimationFrame`-equivalent timing. Do not call `setMessages()` inside the socket `data` handler directly — queue first, flush in a scheduled microtask or `setInterval`.
- Subscribe to OpenTUI release notes during the dashboard overhaul phase; the issue is active and a fix may land mid-development. Pin versions and note the version where stall behavior was tested.
- Add an explicit render watchdog in development: log a console warning if 500ms passes without a render when the renderer is active.

**Warning signs:**
- Dashboard freezes momentarily when switching tabs while workspaces are loading.
- High-frequency message sends from an agent script freeze the TUI.
- The `loading()` indicator gets stuck — `setLoading(false)` was called but the UI never reflects it.

**Phase to address:** Dashboard overhaul phase (tab switching and data loading) and messaging phase (high-frequency socket writes).

---

### Pitfall 7: `DYNAMIC_COMPLETIONS` Map Does Not Cover New `message` Subcommand Family

**What goes wrong:**
The `completion-generator.ts` uses a flat `DYNAMIC_COMPLETIONS` map keyed by command path strings (`"repo.show"`, `"template.edit"`, etc.). Adding `git-stacks message send <workspace-name>` requires registering `"message.send"` in this map. If the developer adds the `message` command family to `index.ts` but forgets to update `DYNAMIC_COMPLETIONS`, `message send <Tab>` produces no completions — it silently falls through the case statement and returns nothing.

The same applies to any new top-level flags added to existing commands (e.g., `--strategy` values for `sync`, output format enums for new commands). Enum completions are not generated at all currently — only workspace/template/repo names and shell names have dynamic lookup. Fixed enum values (`local`, `rebase`, `merge` for sync strategies) need to be inlined as static completion strings, but there is no mechanism to do this today.

**Why it happens:**
The `DYNAMIC_COMPLETIONS` map is manually maintained and has no connection to the Commander.js command definitions. Adding a new command does not automatically update completions. TypeScript does not warn about missing entries because the map has type `Record<string, DynamicCompletion>`, not a mapped type over all known command paths.

**How to avoid:**
- When adding the `message` command family, immediately add `"message.send": "workspace"` and `"message.clear": "workspace"` to `DYNAMIC_COMPLETIONS` as part of the same PR.
- For fixed enum completions (e.g., `--strategy local|rebase|merge`, `--format json|table`): extend the `DynamicCompletion` type to support a `{ type: "enum"; values: string[] }` variant, or inline the enum values as a new string literal type entry. Do not defer this — the completions feature only delivers full value when option enums are covered.
- Add a test that runs `generateBash`, `generateZsh`, and `generateFish` against the live commander tree and checks that the output contains expected command paths. This is a snapshot/smoke test that will catch regressions when new commands are added.

**Warning signs:**
- `git-stacks message send <Tab>` produces no completions.
- `git-stacks sync --strategy <Tab>` produces no completions.
- A PR adds a new subcommand but `DYNAMIC_COMPLETIONS` diff is empty.

**Phase to address:** Shell completion overhaul phase — address as explicit tasks: (1) register `message.*` commands, (2) design and implement enum completion support.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Global `useKeyboard` in every modal/tab component | Each component is self-contained | Key events fire in all mounted components simultaneously; no ordering guarantee | Never for tab panels — centralize in App.tsx |
| `UIView` stores numeric index instead of entity name | Simple to implement | Index becomes stale if list order changes or tabs switch | Must fix before adding tabs; acceptable in single-list v0.2.0 code |
| `fs.existsSync(socketPath)` as liveness check for TUI | One-liner | False positives on stale socket files; broken "drop silently" contract | Never — always use connect probe |
| Adding `git branch` to completion functions | Rich branch name completions | Blocks Tab for seconds with many workspaces | Never — branch completions are not worth the perf cost in this tool |
| `renderer.destroy()` + re-`render()` for editor handoff | Reliably releases the terminal | Noticeable TUI restart flash after editor exits | Acceptable workaround until OpenTUI issue #564 is resolved upstream |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenTUI `useKeyboard` + SolidJS `<Show>` | Hiding a component with `<Show when={false}>` unmounts it and removes its `useKeyboard` handler — but `<Show>` conditionals can introduce flicker; developers switch to CSS hide instead, leaving handlers active | Always use `<Show>` (not CSS hide) for tab panels, or gate all `useKeyboard` bodies on an `active` prop |
| `Bun.listen({ unix: path })` + process exit | TUI exits; socket file remains; next launch fails EADDRINUSE | Register `unlinkSync(socketPath)` in SIGTERM, SIGINT, and OpenTUI `onDestroy`; also probe-connect before listen |
| `workspace-ops.ts` called from TUI context | `openWorkspace()` calls `runHooks()` which does `Bun.spawn` with inherited stdio — this will corrupt the TUI's terminal state if stdio is not redirected | When invoking workspace-ops from the TUI, pass hooks through a child process with captured stdio, not inherited |
| SolidJS `batch()` + signal updates from async code | Async signal updates outside `batch()` trigger individual reactive recomputations, increasing render pressure | Wrap all multi-signal updates from async callbacks in `batch()` |
| `message send` while TUI is not running | Client throws ECONNREFUSED; without a catch this bubbles as unhandled error | Wrap `Bun.connect()` in try/catch; treat ECONNREFUSED and ENOENT as "TUI not running" and exit 0 silently |
| Completion generator + new `message` subcommand | Developer adds `message` command to Commander.js but forgets to update `DYNAMIC_COMPLETIONS` | Test: assert completion output contains `message` for all three shells |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `git branch` in shell completion functions | Tab after `message send` blocks 2–10 seconds with many workspaces | Never add per-repo subprocesses to completion functions | Immediately with 3+ workspaces on slow disk |
| High-frequency socket writes directly to SolidJS signal | TUI freezes on rapid message floods (10+ msgs/sec from agent) | Buffer messages; flush to signal at most once per render frame | When agent sends status updates in tight loops |
| `loadTemplates()` + `loadRepos()` called on every tab switch | Tab switching feels sluggish; startup time grows with entity count | Load all entity lists once on TUI startup; use `reload()` on explicit refresh keystroke only | ~50+ templates/repos |
| OpenTUI rendering all 3 tab panels simultaneously | Increased layout calculation cost even for inactive panels | Mount only active tab content via `<Show>`; accept remount cost | 3 tabs × 20 rows each = manageable, but unnecessary |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unix socket world-readable | Any local user can send messages to the TUI, inject fake notifications | After socket creation, `fs.chmodSync(socketPath, 0o600)` — note: Bun had a bug (issue #15686) where sockets were created `0700` due to µSockets; fixed in PR #16200 — verify current Bun version applies correct mode |
| Message `sender` field from socket not sanitized before rendering | Specially crafted sender name with escape codes could corrupt terminal rendering | Sanitize `sender` and `text` fields: strip ANSI escape sequences and limit to printable ASCII before rendering in the TUI |
| Socket path traversal | If socket path is user-controlled (e.g., workspace-specific socket path derived from workspace name), a workspace name with `../` could place the socket outside `~/.config/git-stacks/` | Validate socket path stays within config directory; use `path.basename()` on any workspace-derived filename fragment |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Tab bar renders but active tab content flashes on switch | Jarring visual during tab navigation | `<Show>` with keyed components or preserve scroll offset in tab state |
| `message send` silently drops when TUI is not running, but user has no way to know if messages are being received | AI agents cannot verify their messages are being displayed | Add `message list` that reads from the persisted message store (not the TUI) so agents can verify delivery without needing the TUI running |
| Help bar (`↑↓/jk Navigate Enter Actions...`) does not update when tab changes | Users on the Templates or Repos tab see workspace-specific keybindings | Help bar must be tab-aware or generic |
| Notification count in workspace row (design goal) displays stale count after `message clear` | Cleared messages still show count until next `reload()` | `message clear` must trigger a workspace-specific `reload()` signal, not wait for the next full refresh |
| Progress view for long-running actions (open, merge) blocks entire TUI | Cannot browse other workspaces or switch tabs during a long operation | Design progress as a sidebar or status update on the workspace row, not a full-screen takeover — but this is a scope decision; at minimum add a cancel path |

---

## "Looks Done But Isn't" Checklist

- [ ] **Tab keyboard routing:** Each tab panel has an `active` prop or equivalent guard — press `j` in Workspaces tab, switch to Templates tab, press `j` — verify Templates cursor moves and Workspaces cursor does NOT move.
- [ ] **Socket cleanup:** Kill the TUI with `kill -9`; verify `git-stacks message send` exits 0 silently (drop); verify next TUI launch succeeds without `EADDRINUSE`.
- [ ] **Socket liveness check:** Socket file exists but TUI is not running — `git-stacks message send` must exit 0, not error.
- [ ] **`UIView` entity reference:** After opening action menu on workspace "foo", switch to Templates tab, switch back — open action menu targets "foo" not whatever is at the same numeric index in the template list.
- [ ] **Completion coverage:** Run `git-stacks completion bash | bash -c 'source /dev/stdin; COMP_WORDS=(git-stacks message send ""); COMP_CWORD=3; _git_stacks_complete; echo "${COMPREPLY[@]}"'` — must print workspace names, not empty.
- [ ] **Completion on fresh install:** Remove `~/.config/git-stacks/`; verify `git-stacks open <Tab>` completes with empty list (no error, no broken prompt).
- [ ] **Editor handoff:** Open workspace YAML editor, type 30 characters rapidly — verify zero dropped keystrokes.
- [ ] **OpenTUI lifecycle on crash:** Unhandled promise rejection in a tab component — verify terminal is restored to normal mode (cursor visible, not raw mode) via the `uncaughtException` handler.
- [ ] **Enum completions:** `git-stacks sync --strategy <Tab>` — verify `local`, `rebase`, `merge` are offered (not empty).
- [ ] **Message persistence:** `message send` when TUI is not running silently drops — but `message list` must still show the message (implies messages are persisted to disk, not only to TUI memory).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Stale socket blocks TUI launch | LOW | `rm ~/.config/git-stacks/*.sock`; re-launch TUI |
| Double keyboard dispatch corrupts cursor state | MEDIUM | Add `active` guards to all `useKeyboard` bodies; retest all tab navigation |
| `UIView` index mismatch executes action on wrong entity | MEDIUM | Change `UIView` to name-based references; add test: action menu → tab switch → verify action targets original entity |
| OpenTUI render loop stall | MEDIUM | Identify signal write not wrapped in `batch()`; wrap it; verify high-frequency test no longer stalls |
| Completion missing for `message` commands | LOW | Add entries to `DYNAMIC_COMPLETIONS`; re-run `git-stacks completion bash/zsh/fish` |
| Editor spawn corrupts terminal (drops inputs) | HIGH | Switch `launchEditor` from `suspend/resume` to `destroy/re-render`; verify with issue #564 test case |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Multiple `useKeyboard` handlers double-dispatch | Dashboard overhaul — first sub-task | Integration test: mount two tab panels; verify key only fires in active one |
| Stale socket file blocks launch or silently misfires | Messaging/IPC phase — socket protocol design | Manual test: SIGKILL TUI; probe-connect; verify graceful ECONNREFUSED handling |
| `renderer.suspend()` editor spawn drops inputs | Dashboard overhaul — editor integration sub-task | Manual test: open editor, type 30 chars; verify zero drops |
| `UIView` index coupling breaks on tab switch | Dashboard overhaul — prerequisite refactor | Test: action menu opened, tab switched, action executed — verify correct entity |
| Completion subprocess performance | Shell completion phase | Benchmark: time Tab completion with 20 workspaces; must be <200ms |
| `DYNAMIC_COMPLETIONS` missing `message.*` entries | Shell completion phase — explicit task | Snapshot test: completion output contains `message` subcommand paths |
| Render loop stall under signal burst | Dashboard overhaul + messaging phase | Stress test: 20 rapid message sends; TUI must not freeze |

---

## Sources

- Direct codebase analysis: `src/tui/dashboard/App.tsx`, `src/tui/dashboard/ActionMenu.tsx`, `src/tui/dashboard/ConfirmDialog.tsx`, `src/tui/dashboard/DetailStatus.tsx`, `src/tui/dashboard/hooks/useWorkspaces.ts`, `src/tui/dashboard/types.ts`, `src/lib/completion-generator.ts`
- OpenTUI official documentation: [Renderer lifecycle](https://opentui.com/docs/core-concepts/renderer/), [Keyboard input and focus](https://opentui.com/docs/core-concepts/keyboard/), [Lifecycle](https://opentui.com/docs/core-concepts/lifecycle/) — MEDIUM confidence (current docs, but OpenTUI is early-stage and behavior may differ from documentation)
- OpenTUI GitHub issue tracker: [Issue #564 — Bun.spawn editor slow/dropped inputs (open)](https://github.com/anomalyco/opentui/issues/564), [Issue #789 — render loop stalls on event burst (open)](https://github.com/sst/opentui/issues) — HIGH confidence (direct issue observation)
- Bun official docs: [OS signal handling](https://bun.sh/guides/process/os-signals), [TCP/Unix socket API](https://bun.sh/docs/api/tcp) — HIGH confidence
- Bun GitHub: [Issue #15686 — Unix socket permissions 0700 (fixed in PR #16200)](https://github.com/oven-sh/bun/issues/15686) — HIGH confidence
- Unix socket stale file behavior: POSIX spec (SO_REUSEADDR does not apply to AF_UNIX), confirmed in [nodejs/asyncio issue #425](https://github.com/python/asyncio/issues/425) and [Node.js docs](https://nodejs.org/api/net.html) — HIGH confidence
- Fish shell completion performance: [fish-shell issue #2413 (30s block)](https://github.com/fish-shell/fish-shell/issues/2413), [issue #5158](https://github.com/fish-shell/fish-shell/issues/5158) — HIGH confidence
- Training knowledge: SolidJS reactivity model, `batch()` semantics, `<Show>` vs CSS hide mount behavior, Commander.js tree walking

---
*Pitfalls research for: TUI dashboard overhaul, Unix socket IPC messaging, shell completion improvements (Bun/SolidJS/OpenTUI/Commander.js)*
*Researched: 2026-03-19*
