# Stack Research

**Domain:** Multi-repo workspace manager CLI tool — v0.3.0 additions
**Researched:** 2026-03-19
**Confidence:** HIGH (core stack from prior research; v0.3.0 additions verified against official Bun docs and installed package type definitions)

---

## Verdict on Current Stack

The existing Bun + TypeScript + Commander.js + YAML + Zod + OpenTUI/SolidJS stack is kept as-is. The v0.3.0 milestone requires **no new npm dependencies** — all three features (tab navigation, IPC messaging, shell completion improvements) are achievable with what is already installed. The IPC transport uses Bun's built-in `Bun.serve({ unix })` + `fetch({ unix })` APIs; tab navigation uses the `<tab_select>` component already in `@opentui/solid@0.1.87`; completion improvements are purely code changes to `completion-generator.ts`.

---

## Recommended Stack

### Core Technologies (unchanged from v0.2.0)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Bun | 1.3.10+ | Runtime, shell scripting, IPC server | `Bun.serve({ unix })` and `fetch({ unix })` provide first-class Unix domain socket support with no dependencies. HIGH confidence — verified in official Bun HTTP docs. |
| TypeScript strict | 5.9.3 | Type safety | Unchanged. |
| Commander.js | 14.0.3 | CLI command tree | Unchanged. The completion generator introspects this tree — it remains a structural dependency. |
| @opentui/solid | 0.1.87 (installed) | TUI dashboard | `<tab_select>` is a first-class JSX element already in the installed build. No upgrade needed for v0.3.0. The `onChange` and `onSelect` event props integrate cleanly with SolidJS signals. |
| solid-js | 1.9.11 | Reactive state for TUI | Unchanged. |
| yaml + Zod | 2.8.2 + 3.25.76 | Config I/O | Unchanged. Message store uses JSON (not YAML) to avoid parse overhead on frequent reads. |

### v0.3.0 Feature Stack

#### Feature 1: Tab Navigation in Dashboard

**Approach:** Use the `<tab_select>` JSX element from `@opentui/solid`, already installed.

**Type-verified props** (from `node_modules/@opentui/solid/src/types/elements.d.ts` and `node_modules/@opentui/core/renderables/TabSelect.d.ts`):

```typescript
// TabSelectOption shape
interface TabSelectOption {
  name: string        // tab label
  description: string // subtitle shown below bar
  value?: any
}

// JSX props
<tab_select
  options={tabs}                       // TabSelectOption[]
  tabWidth={20}                        // chars per tab, default 20
  showDescription={false}             // hide description row to save height
  showUnderline={true}
  showScrollArrows={true}             // auto when tabs exceed width
  wrapSelection={false}
  focused={activeTab() === TAB_IDX}   // controls keyboard routing
  onChange={(i, opt) => setActiveTab(i)}
  onSelect={(i, opt) => setActiveTab(i)}
/>
```

**Keyboard events emitted:** `selectionChanged` on left/right arrow or `[`/`]`; `itemSelected` on Enter. Navigation left/right is handled internally by the component — the parent only needs to track `activeTab()` signal.

**Layout pattern for tabbed panes:** Use a `<box flexDirection="column">` as root. Row 1: `<tab_select>`. Row 2: `<Show when={activeTab() === 0}><WorkspacesPane /></Show>` etc. The `flexGrow={1}` on the pane box fills remaining height after the tab bar. The tab bar height is dynamic (2 rows with description, 1 without).

**Key routing pattern:** The existing `useKeyboard` global handler in `App.tsx` must yield to `<tab_select>` when the tab bar has focus. The `focused` prop routes keyboard events to the component's internal handler. Parent intercepts Tab key (`key.name === "tab"`) to cycle which element has focus; this is the standard OpenTUI focus management pattern.

**Detail pane:** A `<scrollbox>` is the correct choice for detail panes — it handles overflow scrolling within a fixed terminal region. Props: `focused`, `stickyScroll`, `stickyStart`.

**No new dependencies required.** The `<tab_select>` component is already in the installed `@opentui/solid@0.1.87`.

---

#### Feature 2: IPC Transport for Messaging System

**Decision: `Bun.serve({ unix })` as the TUI listener + `fetch({ unix })` as the sender.**

**Rationale over alternatives:**

| Approach | Verdict | Why |
|----------|---------|-----|
| `Bun.serve({ unix })` + `fetch({ unix })` | **USE THIS** | First-class Bun API, verified in official docs. Sender fails fast with `connectError` when TUI not running. Request/response model is natural for send/clear/list. No extra deps. |
| `Bun.listen()` (raw TCP socket) | Avoid for this use case | Lower-level; requires manual framing for newline-delimited JSON. `Bun.serve` with HTTP semantics is simpler and gives structured request/response for free. |
| Bun IPC (`Bun.spawn` + `process.send()`) | Not applicable | Only works for parent-child process pairs spawned by the same process. The TUI and the `message send` command are independent processes. |
| Shared file (append-only JSON lines) | Fallback only | Reliable but requires polling or `Bun.watch()`. No push; harder to implement `list` as a consistent snapshot. Use only if Unix sockets prove problematic. |
| Named pipe (mkfifo) | Avoid | POSIX-only, blocking by default, no structured framing. More complexity than Unix sockets for no gain. |

**Socket path:** `~/.config/git-stacks/ipc.sock` — co-located with all other config files. The TUI process writes this path on startup and removes it on `renderer.destroy()`. The sender checks whether the socket file exists before attempting `fetch`; if absent, it exits silently (TUI not running).

**"Drop silently when TUI not running" implementation:**

```typescript
// In message send command
async function sendMessage(payload: MessagePayload): Promise<void> {
  const sockPath = getIpcSocketPath() // ~/.config/git-stacks/ipc.sock
  const sockFile = Bun.file(sockPath)
  if (!(await sockFile.exists())) return // TUI not running — drop silently

  try {
    await fetch("http://localhost/message", {
      unix: sockPath,
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    })
  } catch {
    // Socket file existed but connection refused (TUI exited between check and connect) — drop silently
  }
}
```

**TUI server setup:** `Bun.serve({ unix: sockPath, fetch(req) { ... } })`. The server is started inside `runDashboard()` before `render()` and stopped in the cleanup path. Use `server.unref()` so the HTTP server does not prevent the Bun process from exiting when the TUI renderer destroys itself.

**Message store:** Messages persisted as a JSON file at `~/.config/git-stacks/messages/{workspace-name}.json`. The IPC endpoint is a thin layer that (a) writes to this file and (b) triggers a reactive reload in the TUI via a SolidJS signal. The `git-stacks message list` command reads the file directly without needing the TUI to be running.

**Verified APIs:**
- `Bun.serve({ unix: "/path/to.sock", fetch(req) {...} })` — confirmed in official Bun HTTP docs (https://bun.sh/docs/api/http#unix-domain-sockets). HIGH confidence.
- `fetch("http://host/path", { unix: "/path/to.sock" })` — confirmed in official Bun guides (https://bun.sh/guides/http/fetch-unix). HIGH confidence.
- `server.unref()` — confirmed in Bun HTTP Server TypeScript definition. HIGH confidence.

---

#### Feature 3: Shell Completion Improvements

**Approach: Code changes to `completion-generator.ts` only. No new dependencies.**

The existing generator correctly handles dynamic completions for workspace, template, and repo names. The gaps are:

1. **Missing enum completions** — `--sync-strategy`, `--mode`, `--output` options have fixed string values that the generator currently emits no completions for. Fix: add an `enumValues` field to `OptionInfo` and populate it from Commander's `argChoices` property (Commander populates this for `.choices()` options).

2. **Missing `message` subcommand family** — the v0.3.0 `git-stacks message send|clear|list` commands need entries in `DYNAMIC_COMPLETIONS` for workspace name completion (the first positional argument on `send` and `clear`).

3. **Missing branch completions** — `git-stacks new` and `git-stacks sync` accept branch names. Shell-side branch completion requires running `git branch` in a sub-shell. This is implementable with a shell function in generated output, similar to how workspace names are resolved. The generator needs a new `DynamicCompletion` type: `"branch"`.

4. **Fish subcommand flag completions** — the current Fish generator emits flags only for top-level commands. Commands with subcommands (e.g., `repo`, `template`) do not get flag completions. This requires extending the per-subcommand case handling in `generateFish`.

**Implementation approach:**

```typescript
// Add to DynamicCompletion union
type DynamicCompletion = "workspace" | "repo" | "template" | "shells" | "branch"

// Add to OptionInfo
interface OptionInfo {
  long: string
  description: string
  enumValues?: string[]  // populated from cmd.options[n].argChoices
}

// In buildNode(), populate enumValues:
const options = cmd.options
  .filter(opt => opt.long !== undefined && opt.long !== "--help" && opt.long !== "--version")
  .map(opt => ({
    long: opt.long!,
    description: opt.description,
    enumValues: (opt as any).argChoices as string[] | undefined,
  }))
```

For bash, the `bashCaseBody` function needs a case for "current word starts with `-` and previous word is an enum option" to emit enum value completions. For zsh, `_arguments` spec already supports choice lists: `'--sync-strategy[strategy]:strategy:(fast-forward merge rebase)'`. For fish, add `complete -c git-stacks -n '__fish_seen_subcommand_from sync' -l sync-strategy -a 'fast-forward merge rebase'`.

**Branch completions shell function** (bash/fish): call `git branch --format='%(refname:short)'` to list local branches. This is safe to include inline in generated completion scripts — it fails silently if not in a git repo.

**No new dependencies.** All changes are to `completion-generator.ts` logic. Commander's `option.argChoices` field is already populated when commands use `.choices()`.

---

## Installation

No new package installations are required for v0.3.0. All three features use:
- APIs already provided by Bun's runtime (`Bun.serve`, `Bun.file`, `fetch`)
- Components already in the installed `@opentui/solid@0.1.87` (`<tab_select>`, `<scrollbox>`)
- Code changes to existing TypeScript files

```bash
# No new dependencies — verify current state is consistent
bun install
```

If OpenTUI is upgraded to 0.1.88 (current latest as of 2026-03-19):

```bash
bun add @opentui/core@0.1.88 @opentui/solid@0.1.88
```

0.1.88 adds Plugins/Slots, CJK word-wrap fix, and ScrollBox `scrollChildIntoView`. None of these block v0.3.0 but `scrollChildIntoView` is useful for the detail pane.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| IPC transport | `Bun.serve({ unix })` | `Bun.listen()` raw TCP socket | Raw TCP requires manual newline-delimited JSON framing, no structured request/response, more error handling code. HTTP over Unix socket is the same cost but gives structured semantics for free. |
| IPC transport | `Bun.serve({ unix })` | Shared JSON file + `Bun.watch()` | Works but requires polling (or file watcher) in the TUI. Push semantics (HTTP POST) are cleaner for "notify TUI on send" vs "TUI polls for changes". File-based store is used for persistence; HTTP layer handles the live push. |
| IPC transport | `Bun.serve({ unix })` | Abstract namespace socket (Linux-only) | Abstract sockets auto-clean without a file, but they are Linux-only. The socket file at `~/.config/git-stacks/ipc.sock` works on both macOS and Linux. |
| Tab navigation | `<tab_select>` (OpenTUI built-in) | Manual tab bar rendered with `<text>` | Manual implementation is ~100 lines of layout + keyboard math that the built-in already does correctly, including scroll arrows for overflow. No benefit to reimplementing. |
| Completion enum values | Populate from `option.argChoices` | Hardcode in generator | Hardcoding creates maintenance drift when command options change. `argChoices` is the Commander source of truth. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| WebSocket for IPC | Overkill. No browser; no multi-client fan-out needed. Unix socket HTTP is simpler. | `Bun.serve({ unix })` |
| Redis or SQLite for message store | Unnecessary external state. Messages are ephemeral workspace annotations, not a database. | JSON file in `~/.config/git-stacks/messages/` |
| `readline` or `node:readline` for completion | Already generating completion scripts statically. Commander provides all needed metadata via `argChoices`. | Code changes to `completion-generator.ts` |
| `blessed` or any new TUI library | OpenTUI already handles tab navigation. No justification for adding a second TUI library. | `@opentui/solid` `<tab_select>` |
| `@inquirer/prompts` | `@clack/prompts` already handles all prompt types needed. | `@clack/prompts` (existing) |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@opentui/solid@0.1.87` (installed) | solid-js@1.9.11 | `<tab_select>` and `<scrollbox>` confirmed present in installed type definitions. v0.1.88 available but not required. |
| `Bun.serve({ unix })` | Bun 1.x | Available since Bun 0.8.1 (2023). Stable API. Verified in official Bun HTTP server docs. HIGH confidence. |
| `fetch({ unix })` | Bun 1.x | Available and stable. Verified in official Bun guides. HIGH confidence. |

---

## Stack Patterns for v0.3.0 Features

**Tab navigation in `App.tsx`:**
- Add `activeTab` signal: `createSignal<"workspaces" | "templates" | "repos">("workspaces")`
- Render `<tab_select>` at fixed height above the existing `<WorkspaceList>`
- Use `<Show when={activeTab() === "workspaces"}>` guards to swap content pane
- Forward `focused` prop based on whether a sub-panel has captured focus
- The `useKeyboard` global handler in `App.tsx` intercepts Tab key to cycle panel focus; `<tab_select>` handles its own left/right arrow keys internally when `focused={true}`

**IPC socket lifecycle:**
- `runDashboard()` calls `startIpcServer()` before `render()`, gets back a `{ server, sockPath }` handle
- On `renderer.destroy()` (q/escape from list view), call `server.stop()` and `Bun.file(sockPath).delete()` or `fs.unlink`
- The SolidJS reactive layer receives incoming messages via a `createSignal<Message[]>` updated by the IPC handler via `setMessages(...)`
- The IPC handler runs in the same Bun process as the TUI renderer — no threading needed; Bun's event loop integrates both

**Message data model:**

```typescript
interface Message {
  id: string         // crypto.randomUUID()
  workspace: string  // workspace name
  sender?: string    // optional agent/hook identifier
  text: string
  createdAt: string  // ISO 8601
}
```

Stored as `~/.config/git-stacks/messages/{workspace}.json` (array). The `git-stacks message list` command reads this directly; `send` writes it and POSTs to the IPC socket; `clear` truncates the file and POSTs to trigger a TUI reload.

**Shell completion enum values:**
- `option.argChoices` is typed as `string[] | undefined` on Commander's `Option` class
- In `buildNode()`, cast `cmd.options` entries to include `argChoices` (already present at runtime, just not in the public type surface)
- In bash case body: when the previous word matches a `--flag` with `enumValues`, emit `COMPREPLY=($(compgen -W "val1 val2 val3" -- "$cur"))`
- In zsh `_arguments`: emit `'--flag[description]:value:(val1 val2 val3)'` format
- In fish: emit `complete -c git-stacks -n '...' -l flag-name -a 'val1 val2 val3'`

---

## Sources

- Bun HTTP server + Unix domain sockets: https://bun.sh/docs/api/http#unix-domain-sockets — HIGH confidence (official docs, verified 2026-03-19)
- Bun fetch with Unix sockets: https://bun.sh/guides/http/fetch-unix — HIGH confidence (official docs, verified 2026-03-19)
- Bun IPC (parent-child only): https://bun.sh/docs/guides/process/ipc — HIGH confidence (verified: IPC is parent-child only, not applicable here)
- `@opentui/solid` type definitions: `node_modules/@opentui/solid/src/types/elements.d.ts` (installed) — HIGH confidence (source of truth)
- `@opentui/core` TabSelect type definitions: `node_modules/@opentui/core/renderables/TabSelect.d.ts` (installed) — HIGH confidence
- OpenTUI v0.1.88 release notes: https://github.com/sst/opentui/releases — MEDIUM confidence (release notes verified; exact API changes for 0.1.88 not reviewed in detail)
- OpenTUI layout documentation: https://opentui.com/docs/core-concepts/layout/ — MEDIUM confidence (docs verified for Yoga flexbox; tab_select height calculation verified from type definitions)
- Commander.js `option.argChoices`: https://github.com/tj/commander.js — MEDIUM confidence (runtime behavior inferred from Commander source; standard feature, well-established)

---

*Stack research for: git-stacks v0.3.0 — dashboard overhaul, IPC messaging, shell completions*
*Researched: 2026-03-19*
