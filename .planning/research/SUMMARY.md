# Project Research Summary

**Project:** git-stacks v0.3.0
**Domain:** Multi-repo workspace manager CLI — terminal dashboard overhaul, IPC messaging, shell completion improvements
**Researched:** 2026-03-19
**Confidence:** HIGH

## Executive Summary

git-stacks v0.3.0 extends an already-solid Bun/TypeScript/SolidJS/OpenTUI codebase with three distinct features: a multi-tab dashboard overhaul (Workspaces, Templates, Repos tabs), a file-backed workspace messaging system with optional live IPC push notification, and a shell completion overhaul. All three are achievable with the existing dependency set — no new npm packages are needed. The recommended approach follows the codebase's own patterns closely: new data modules in `src/lib/`, new commands in `src/commands/`, new TUI components in `src/tui/dashboard/`. The build order recommended by architecture research (messages store first, completions second, tab layout third, IPC push last) keeps each phase independently shippable and testable.

The highest-impact risk is in the dashboard overhaul: OpenTUI's `useKeyboard` is a global broadcast, not a focused event system. Every mounted component that calls it receives every keypress. Adding three tab panels that each manage cursor state will cause double-dispatch unless all keyboard routing is centralized in `App.tsx` and every panel guards its handler body on an `active` prop. This must be the first design decision settled before any tab panel code is written. A closely related risk is the existing `UIView` union referencing list entries by numeric index — this breaks silently when tab switching changes which list is active. Both issues are low-effort to fix upfront and difficult to retrofit after tab panels are built.

The IPC transport decision has a cross-platform implication that requirements must resolve explicitly: `Bun.serve({ unix })` and `fetch({ unix })` are confirmed for macOS and Linux. On Windows, Bun supports AF_UNIX via Windows 10 1803+ but Named Pipe fallback may be needed for broader coverage. The recommended decision for v0.3.0 is to accept Unix-socket-only (macOS + Linux) and document Windows as future work. If Windows support is a hard requirement, an abstraction layer (a `getIpcAddress()` helper returning a unix path on unix and a TCP loopback address on Windows) should be designed before any IPC code is written.

## Key Findings

### Recommended Stack

The existing stack is kept as-is. No new dependencies are needed for any v0.3.0 feature. All three features use APIs already provided by Bun's runtime and components already present in the installed `@opentui/solid@0.1.87`. For full detail see `.planning/research/STACK.md`.

**Core technologies:**
- **Bun 1.3.10+**: Runtime, IPC server via `Bun.serve({ unix })` and `fetch({ unix })` — confirmed in official Bun HTTP docs; HIGH confidence
- **@opentui/solid 0.1.87** (installed): `<tab_select>` and `<scrollbox>` confirmed present in installed type definitions; no upgrade required for v0.3.0
- **TypeScript strict / Commander.js 14.0.3 / Zod / yaml**: All unchanged from v0.2.0; message store uses YAML with a 50-message cap per workspace
- **solid-js 1.9.11**: Reactive state; `batch()` discipline is critical when updating multiple signals from async socket or status-fetch callbacks

IPC transport is `Bun.serve({ unix: "/tmp/git-stacks.sock" })` for the TUI listener and `fetch("http://localhost/path", { unix: sockPath })` for the CLI sender. A single global socket (not per-workspace) handles all workspace messages, each carrying a `workspace` field. The sender always writes to the durable YAML store first; IPC is a best-effort live push that drops silently when the socket is absent or the TUI is not running.

A possible OpenTUI upgrade to 0.1.88 (current latest) adds `scrollChildIntoView` on `<scrollbox>`, useful for the detail pane — not required but worth considering during Phase 3.

### Expected Features

For the full feature table with complexity ratings and dependency graph, see `.planning/research/FEATURES.md`.

**Must have (v0.3.0 table stakes):**
- Tab row in dashboard — Workspaces, Templates, Repos with `1`/`2`/`3` or `[`/`]` navigation; any serious multi-entity TUI requires this
- Master-detail split layout — list at ~60% width, reactive detail pane at ~40%; current full-screen detail navigation loses list context
- All entity CRUD accessible in-TUI — template edit/clone/remove via existing suspend/resume editor pattern; repos tab is read-only
- Persistent context-aware help bar — one-line footer showing current-tab bindings; `?` key for full reference overlay
- Messaging system CLI — `message send|list|clear` with per-workspace YAML storage; primary use case is AI agents posting status updates
- Message display in dashboard — latest message preview in workspace list row; full message history in detail pane with sender grouping and timestamps
- Enum value completions — `--sort`, `--strategy`, `--output` and other fixed-choice flags currently produce no completions
- `message` command completions — workspace name completion for send/list/clear

**Should have (differentiators):**
- Per-sender message scoping — `--from <agent-name>` on send; `clear --from <sender>`; group by sender in detail pane
- Repos tab as registry health browser — flags repos where path no longer exists on disk
- Template tab with inline YAML edit via `$EDITOR` (suspend/resume)

**Defer to v0.3.x or v0.4.0:**
- Branch completions for `--from` and `clone` — HIGH complexity; repo context at completion time is ambiguous; needs dedicated research spike
- In-TUI template creation wizard — suspend/resume for editing is sufficient; creation wizard bridges two rendering contexts
- Mouse support — OpenTUI library gap; keyboard-first is the correct default
- Auto-clear messages on workspace open

**Explicit anti-features (do not add in v0.3.0):**
- Real-time polling auto-refresh (use manual `R` refresh instead — avoids filesystem churn and TUI flicker)
- WebSocket or complex IPC (file-based YAML + optional unix socket push is sufficient)
- In-TUI wizard rendering (always use suspend/resume to hand off terminal to `@clack/prompts`)
- `git branch` calls in shell completion functions (blocks Tab for seconds with many workspaces)

### Architecture Approach

The architecture adds new files cleanly alongside existing ones. The existing `WorkspaceList`, `ActionMenu`, `ConfirmDialog`, `ProgressView`, `BatchBar`, `DetailStatus`, `useWorkspaces`, and all of `workspace-ops.ts`, `git.ts`, `lifecycle.ts`, and `integrations/` are untouched. New features attach via additive exports, a new command registered in `index.ts`, and new JSX branches in `App.tsx` guarded by `<Show when={tab() === "...">`. For full component map, data flow diagrams, and anti-patterns to avoid, see `.planning/research/ARCHITECTURE.md`.

**New files (zero risk to existing behaviour):**
1. `src/commands/message.ts` — Commander subcommand family: `message send|list|clear`
2. `src/lib/messages.ts` — Message store: `appendMessage`, `listMessages`, `clearMessages`; per-workspace YAML at `~/.config/git-stacks/messages/{name}.yml`
3. `src/lib/ipc.ts` — `startIpcServer()` / `stopIpcServer()` using `Bun.serve({ unix })`; notifies subscribers via callback
4. `src/tui/dashboard/TabBar.tsx` — Tab header component with `1`/`2`/`3` keyboard switching
5. `src/tui/dashboard/TemplatesTab.tsx` — Template list + detail pane with edit/clone/remove actions
6. `src/tui/dashboard/ReposTab.tsx` — Registry list + detail pane with health indicators
7. `src/tui/dashboard/hooks/useMessages.ts` — IPC push subscription + file read on reload
8. `src/tui/dashboard/hooks/useTemplates.ts` — Reactive `listTemplates()` signal
9. `src/tui/dashboard/hooks/useRepos.ts` — Reactive `readRegistry()` signal

**Modified files (additive, low risk):**
- `src/lib/paths.ts` — add `MESSAGES_DIR`, `messagePath(wsName)`, `SOCKET_PATH`
- `src/lib/workspace-ops.ts` — add `editTemplateYaml()` mirroring existing `editWorkspaceYaml()`
- `src/lib/completion-generator.ts` — add `OPTION_ENUMS` table, extend bash/zsh/fish emitters, register `message.*` in `DYNAMIC_COMPLETIONS`
- `src/index.ts` — one `program.addCommand(messageCommand)` line
- `src/tui/dashboard/App.tsx` — add `tab` signal, `TabBar` render, tab-gated `<Show>` blocks (workspaces path unchanged, alongside not inside)
- `src/tui/dashboard/types.ts` — add `Tab` type and `Message` type
- `src/tui/dashboard/WorkspaceRow.tsx` — add message badge column
- `src/tui/dashboard/DetailStatus.tsx` — add Messages section below repos section

**Key design decisions codified by research:**
- `tab` signal is independent of `UIView` — tab switches reset view to `{ view: "list" }`, leaving all existing view-state components (`ActionMenu`, `ConfirmDialog`, `ProgressView`, `DetailStatus`) completely unchanged
- Messages stored in separate per-workspace YAML files, not as a field on `WorkspaceSchema` — avoids concurrent write corruption from multiple agents, prevents message data from polluting `ws status --json` output, and makes `clearMessages` a simple file delete
- Single global socket at `/tmp/git-stacks.sock` (not per workspace) — one server, one path, one cleanup; all messages carry a `workspace` field for routing
- OPTION_ENUMS static table in `completion-generator.ts` (not Commander `.choices()`) — avoids unintended runtime validation behavior change; completions are advisory, not enforced

### Critical Pitfalls

For full pitfall detail including warning signs, recovery strategies, and a "looks done but isn't" checklist, see `.planning/research/PITFALLS.md`.

1. **`useKeyboard` global broadcast causes double-dispatch across tab panels** — Use `<Show>` (not CSS hide) so inactive panels unmount and their handlers deregister. Alternatively, centralize all keyboard routing in `App.tsx` and gate each panel's handler on `if (props.active)`. Must be resolved before any tab panel code is written.

2. **`UIView` numeric index becomes stale on tab switch** — Change `UIView` action states to store entity name (string) not list index (number). Replace single `cursor` signal with `Record<TabId, number>` initialized to `{ workspaces: 0, templates: 0, repos: 0 }`. Required prerequisite refactor before implementing tabs.

3. **Stale Unix socket file causes silent message delivery failures and TUI launch failures** — On TUI startup: probe-connect before binding; remove stale file if ECONNREFUSED. On CLI send: catch ECONNREFUSED/ENOENT and exit 0 silently (never use `fs.existsSync` alone as a liveness check). On TUI exit: `unlinkSync(SOCKET_PATH)` in SIGTERM, SIGINT, and OpenTUI `onDestroy`.

4. **OpenTUI issue #564 — `renderer.suspend()` + editor spawn drops keystrokes** — Verify suspend/resume works correctly with the installed OpenTUI version before building Template/Repo tab editor actions. If broken, fall back to `renderer.destroy()` + re-`render()`. Pin OpenTUI version; do not accept minor bumps without verifying suspend/resume behavior.

5. **OpenTUI issue #789 — render loop stalls under rapid signal updates** — Wrap all multi-signal updates from async callbacks in SolidJS `batch()`. Buffer incoming socket messages; flush to the signal at most once per render frame rather than calling `setMessages()` directly inside the socket data handler.

6. **Shell completion subprocess performance** — Never add `git branch` or per-repo subprocess calls to completion functions. Keep dynamic lookups to the existing `ls`/`grep` patterns. Benchmark Tab completion at 20 workspaces; must be under 200ms on a local SSD.

## Implications for Roadmap

The four-phase build order from architecture research is the recommended roadmap structure. Each phase is independently shippable and testable. Phases 2 and 3 can be developed in parallel by different contributors.

### Phase 1: Message Store and CLI Commands

**Rationale:** Zero dependencies on TUI or IPC. Immediately testable with unit tests using the existing `process.env.HOME` redirect pattern in `tests/lib/`. Agents and hooks can start using `git-stacks message send` before the dashboard is updated. The durable YAML store is the ground truth; IPC is a notification layer on top. Getting the data contract right before the server prevents the server from being built on an unstable schema.

**Delivers:** `git-stacks message send|list|clear` CLI commands with per-workspace YAML storage at `~/.config/git-stacks/messages/{workspace}.yml`. Message schema with `id`, `workspace`, `sender`, `text`, `created_at`. `appendMessage` trims to MAX_MESSAGES=50 to bound disk growth.

**Addresses:** Messaging system CLI (must-have), per-sender message scoping (differentiator), silent-drop behavior when TUI not running

**Avoids:** Concurrent write corruption from multiple agents (by keeping messages in a separate file, not on WorkspaceSchema)

### Phase 2: Shell Completion Overhaul

**Rationale:** Pure logic change in one file with no TUI risk. Independently verifiable by diffing `git-stacks completion bash` output before and after. Can be developed in parallel with Phase 3.

**Delivers:** Enum value completions for `--sort`, `--strategy`, `--output` and other fixed-choice flags. `message send|list|clear` workspace name completions. Extended fish flag completions for nested subcommand families (`repo.add`, `template.new`, etc.).

**Addresses:** Enum value completions (must-have), `message` command completions (must-have)

**Avoids:** DYNAMIC_COMPLETIONS gap for the new `message.*` command family, subprocess performance pitfall in completion functions

**Verification:** Run `git-stacks completion bash` before and after; diff output; confirm `sync --strategy <TAB>` yields `rebase merge` and `message send <TAB>` yields workspace names; time completion at 20 workspaces (must be under 200ms)

### Phase 3: Dashboard Tab Layout

**Rationale:** Depends only on existing stable APIs (`listTemplates`, `readRegistry`). No dependency on Phase 1 messages or IPC. The Workspaces tab continues to work identically — all new code is alongside, not inside, existing components.

**Prerequisite refactors (must complete before any tab panel code):**
- Change `UIView` action states from numeric index to entity name
- Replace single `cursor` signal with `Record<TabId, number>`
- Verify `renderer.suspend()` + editor launch works correctly with installed OpenTUI version (issue #564)
- Establish keyboard routing discipline (single `useKeyboard` in App.tsx or `active` prop gating on every panel)

**Delivers:** `<TabBar>` component with 1/2/3 keyboard switching. `<TemplatesTab>` with list + detail pane and edit/clone/remove actions. `<ReposTab>` with registry browser and disk-health indicators. Context-aware help bar. `?` key reference overlay.

**Addresses:** Tab navigation (must-have), master-detail split layout (must-have), all entity CRUD in-TUI (must-have), repos tab health browser (differentiator), template YAML edit (differentiator)

**Avoids:** Double-dispatch keyboard pitfall, UIView index coupling pitfall, render loop stall (via `batch()` discipline in new hooks)

### Phase 4: IPC Push and Message Display in Dashboard

**Rationale:** Depends on Phase 1 (YAML store + message types) and Phase 3 (dashboard structure stable). IPC startup and cleanup lifecycle must be thoroughly verified before merging.

**Cross-platform decision required before this phase begins:** `Bun.serve({ unix })` works on macOS and Linux. Windows requires AF_UNIX (Windows 10 1803+) or a Named Pipe fallback. Recommended decision: accept Unix-socket-only for v0.3.0, document Windows as future work. If Windows is required, implement `getIpcAddress()` returning unix path on unix and TCP localhost on Windows before writing any IPC code.

**Delivers:** `src/lib/ipc.ts` with `startIpcServer()` / `stopIpcServer()`. `useMessages` hook with IPC push subscription and file-read fallback on `R` reload. Message badge (latest message + age + sender) in `WorkspaceRow`. Full message list with sender grouping in `DetailStatus`. `message clear` triggers workspace-specific reactive reload in TUI.

**Critical contract:** `stopIpcServer()` must be called when the TUI exits — in `onCleanup`, SIGTERM handler, and immediately before `renderer.destroy()`. `startIpcServer()` must probe-connect before binding to handle stale socket files from crashes.

**Addresses:** Message display in dashboard (must-have — list row preview and detail pane)

**Avoids:** Stale socket file pitfall, render loop stall from rapid socket messages (buffer + batch flush)

### Phase Ordering Rationale

- Phase 1 first because its data contract (message schema, file layout) anchors all subsequent messaging work with zero TUI risk
- Phase 2 can run in parallel with Phase 3 — the only shared file is `index.ts` for command registration
- Phase 3 third because the prerequisite UIView and keyboard refactors are non-trivial and must be done before any tab code; doing them first keeps each PR reviewable and isolated
- Phase 4 last because it depends on both the data model (Phase 1) and a stable dashboard structure (Phase 3), and its lifecycle requirements (socket cleanup on exit) must be verified against an already-working TUI

### Research Flags

Phases needing deeper research during planning:

- **Phase 3 (prerequisite verification):** OpenTUI issue #564 — verify `renderer.suspend()` + `Bun.spawn()` for editor launch works cleanly with the installed version. If not, the destroy/re-render workaround must be designed and tested before Templates/Repos tab editor actions are built.
- **Phase 3:** OpenTUI flexbox side-by-side pane stability at narrow terminal widths — verify minimum terminal width assumption (likely 100 columns) before committing to a 60/40 split layout.
- **Phase 4:** IPC transport platform scope — Windows support must be explicitly decided in requirements before Phase 4 design begins (see cross-platform decision above).
- **Deferred (v0.3.x):** Branch completions for `--from` and `clone` — HIGH complexity; how to resolve repo context at completion time needs a dedicated research spike before scheduling.

Phases with standard patterns (skip research-phase):

- **Phase 1:** Pure file I/O with Zod validation — follows identical patterns to existing `config.ts` read/write; no new patterns to discover.
- **Phase 2:** Completion generator extension — all mechanics already exist; adding OPTION_ENUMS and new DYNAMIC_COMPLETIONS entries is mechanical work with clear precedent in the existing generator.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All APIs verified against official Bun docs and installed type definitions; no new dependencies; IPC transport confirmed in official Bun HTTP docs |
| Features | HIGH | Based on direct codebase analysis + well-documented TUI patterns from lazygit/k9s; feature scope is tightly bounded to the milestone |
| Architecture | HIGH | Based on reading live source files (2026-03-19); integration points are additive; pattern reuse is explicit throughout |
| Pitfalls | HIGH | Critical pitfalls have direct codebase evidence (global useKeyboard, numeric UIView index); OpenTUI issues #564 and #789 are open and confirmed in the issue tracker |

**Overall confidence:** HIGH

### Gaps to Address

- **IPC Windows compatibility:** Must be resolved as a requirements decision before Phase 4. The technical options are fully understood (unix-only vs. `getIpcAddress()` abstraction); the business/scope decision is not. Either accept macOS/Linux-only for v0.3.0 or design the abstraction layer before IPC code begins.

- **JSONL vs YAML for message store:** Architecture research recommends YAML (consistent with rest of config); feature research notes JSONL (append-only, lighter for frequent writes). Both work. Recommend YAML for consistency with existing code patterns given the 50-message cap. Decide in Phase 1 requirements; if concurrent-write testing reveals issues, switching to JSONL is a localized change within `src/lib/messages.ts`.

- **OpenTUI issue #564 status:** Whether `renderer.suspend()` reliably hands off the terminal to an editor process depends on the installed version. Verify with a manual test before Phase 3 editor-launch work begins. If broken, `renderer.destroy()` + re-`render()` must replace `suspend()`/`resume()` in all editor invocation paths.

- **OpenTUI issue #789 (render loop stall) status:** The pitfall is real and documented; whether the current installed version has a fix is unknown. The `batch()` discipline mitigates but may not fully prevent stalls. Monitor OpenTUI release notes during development.

- **Branch completions design (deferred):** When scheduled for v0.3.x, needs a research spike on resolving which repo to query `git branch` against at completion time before implementation begins.

## Sources

### Primary (HIGH confidence)
- Live codebase (read directly 2026-03-19): `src/tui/dashboard/App.tsx`, `types.ts`, `hooks/useWorkspaces.ts`, `WorkspaceRow.tsx`, `DetailStatus.tsx`, `ActionMenu.tsx`
- Live codebase (read directly 2026-03-19): `src/lib/completion-generator.ts`, `paths.ts`, `config.ts`, `workspace-ops.ts`
- Live codebase (read directly 2026-03-19): `src/commands/workspace.ts`, `template.ts`, `repo.ts`, `index.ts`
- Installed type definitions: `node_modules/@opentui/solid/src/types/elements.d.ts`, `node_modules/@opentui/core/renderables/TabSelect.d.ts`
- Bun HTTP server + Unix domain sockets: https://bun.sh/docs/api/http#unix-domain-sockets
- Bun fetch with Unix sockets: https://bun.sh/guides/http/fetch-unix
- Bun OS signal handling: https://bun.sh/guides/process/os-signals
- Bun GitHub issue #15686 (Unix socket permissions fix in PR #16200)
- OpenTUI GitHub issues #564 (suspend/resume editor spawn) and #789 (render loop stall) — confirmed open

### Secondary (MEDIUM confidence)
- OpenTUI documentation: https://opentui.com/docs/core-concepts/ — layout, keyboard, lifecycle
- OpenTUI v0.1.88 release notes: https://github.com/sst/opentui/releases
- lazygit UX patterns: https://github.com/jesseduffield/lazygit
- k9s TUI patterns: https://k9scli.io/
- Commander.js `option.argChoices` behavior — runtime behavior inferred from Commander source; standard feature, well-established
- Fish shell completion performance: fish-shell issues #2413, #5158

### Tertiary (LOW confidence)
- JSONL inbox pattern for agent-to-human messaging: https://dev.to/uenyioha/porting-claude-codes-agent-teams-to-opencode-4hol — single source; pattern is independently sensible regardless of source quality

---
*Research completed: 2026-03-19*
*Ready for roadmap: yes*
