# Architecture Research

**Domain:** Multi-repo workspace manager CLI — v0.3.0 milestone additions (Dashboard overhaul, messaging IPC, shell completion)
**Researched:** 2026-03-19
**Confidence:** HIGH for integration points and component boundaries (verified against live source); MEDIUM for IPC transport (Bun.serve unix confirmed in official docs; Bun.listen unix API shape unconfirmed — Bun.serve is the recommended path)

---

## System Overview

Current v0.2.0 architecture and where the three new features attach:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  CLI Entry  src/index.ts                                                  │
│                                                                           │
│  Commands (src/commands/)                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐  │
│  │ workspace.ts │ │ template.ts  │ │   repo.ts    │ │  completion.ts  │  │
│  └──────┬───────┘ └──────────────┘ └──────────────┘ └────────┬────────┘  │
│         │                                                      │           │
│   NEW: src/commands/message.ts ──────────────────────┐         │           │
│         │                                             │         │           │
├─────────┴─────────────────────────────────────────────────────┴───────────┤
│  Business Logic (src/lib/)                                                 │
│                                                                            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │workspace-ops │ │   config.ts  │ │    git.ts    │ │  paths.ts    │     │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘     │
│                                                                            │
│  NEW: src/lib/messages.ts  (message store: YAML read/write per workspace) │
│  NEW: src/lib/ipc.ts       (Bun.serve unix socket server — TUI side)      │
│  CHANGED: src/lib/paths.ts (add MESSAGES_DIR, messagePath(), SOCKET_PATH) │
│  CHANGED: src/lib/completion-generator.ts (enum completions, msg cmds)   │
├────────────────────────────────────────────────────────────────────────────┤
│  TUI  src/tui/dashboard/                                                   │
│                                                                            │
│  CHANGED: App.tsx          (tab signal, TabBar, tab-gated content shows)  │
│  CHANGED: types.ts         (Tab type, Message type, extended UIView)      │
│  NEW: TabBar.tsx            (Workspaces | Templates | Repos tab header)   │
│  NEW: TemplatesTab.tsx      (list + detail pane for templates)            │
│  NEW: ReposTab.tsx          (list + detail pane for repo registry)        │
│  CHANGED: WorkspaceRow.tsx  (add latest-message badge + age column)       │
│  CHANGED: DetailStatus.tsx  (add Messages section, clear action)          │
│  NEW: hooks/useMessages.ts  (IPC signal subscription + file catch-up)     │
│  NEW: hooks/useTemplates.ts (mirrors useWorkspaces.ts pattern)            │
│  NEW: hooks/useRepos.ts     (mirrors useWorkspaces.ts pattern)            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### Unchanged / Stable Components

| Component | Responsibility | Notes |
|-----------|----------------|-------|
| `src/lib/config.ts` | Zod schemas + YAML I/O for all entities | No schema changes to Workspace; backward-compatible throughout |
| `src/lib/workspace-ops.ts` | Business logic: open, clean, remove, merge, rename, sync | Called unchanged from dashboard and CLI; one helper added (see below) |
| `src/lib/git.ts` | All git operations via Bun `$` | Untouched |
| `src/lib/lifecycle.ts` | Hook runner | Untouched |
| `src/lib/integrations/` | Plugin system for IDE/terminal artifacts | Untouched |
| `src/commands/workspace.ts` | CLI workspace subcommands | Completion metadata additions only; no logic changes |
| `src/tui/workspace-wizard.ts` | `ws new` interactive flow | Untouched |
| `src/tui/workspace-clone.ts` | `ws clone` interactive flow | Untouched |
| `src/tui/dashboard/WorkspaceList.tsx` | Scrollable workspace list | Untouched |
| `src/tui/dashboard/ActionMenu.tsx` | Per-workspace action menu | Untouched |
| `src/tui/dashboard/ConfirmDialog.tsx` | Confirmation modal | Untouched |
| `src/tui/dashboard/ProgressView.tsx` | Progress display during operations | Untouched |
| `src/tui/dashboard/BatchBar.tsx` | Batch selection bar | Untouched |
| `src/tui/dashboard/StatusIndicator.tsx` | Status icon component | Untouched |
| `src/tui/dashboard/hooks/useWorkspaces.ts` | Workspace data + async status loading | Untouched |

### Modified Files

| File | What Changes | Risk Scope |
|------|-------------|-----------|
| `src/lib/paths.ts` | Add `MESSAGES_DIR`, `messagePath(wsName)`, `SOCKET_PATH` exports | Additive; no existing exports changed |
| `src/lib/completion-generator.ts` | Add `"message"` to `DynamicCompletion` union; add `OPTION_ENUMS` table for `--strategy`/`--sort`; extend bash/zsh/fish emitters with enum option branches; add `message.send` etc. to `DYNAMIC_COMPLETIONS` map | All existing completion output lines preserved; additions are in independent branches |
| `src/lib/workspace-ops.ts` | Add `editTemplateYaml(name)` helper | One new export; mirrors existing `editWorkspaceYaml` |
| `src/index.ts` | Register `messageCommand` | One `program.addCommand(messageCommand)` line |
| `src/tui/dashboard/App.tsx` | Add `tab` signal, `TabBar` in header, tab-gated content blocks | Workspaces tab rendering path unchanged; new branches alongside existing |
| `src/tui/dashboard/types.ts` | Extend `UIView` union with tab-specific states; add `Tab` type; add `Message` type | Purely additive TypeScript; existing variants untouched |
| `src/tui/dashboard/WorkspaceRow.tsx` | Add message badge column (latest message text + age) | Layout addition; existing column rendering untouched |
| `src/tui/dashboard/DetailStatus.tsx` | Add Messages section below repos section | Content addition; existing repos section untouched |

### New Files

| File | Purpose |
|------|---------|
| `src/commands/message.ts` | Commander subcommand family: `message send <workspace> <text> [--sender <name>]`, `message list <workspace>`, `message clear <workspace> [--id <id>]` |
| `src/lib/messages.ts` | Message store: `WorkspaceMessage` type, `appendMessage`, `listMessages`, `clearMessages`; per-workspace YAML at `~/.config/git-stacks/messages/{name}.yml` |
| `src/lib/ipc.ts` | TUI-side IPC server: `startIpcServer()` using `Bun.serve({ unix: SOCKET_PATH })`, `stopIpcServer()`; notifies subscribers via callback registered by `useMessages` hook |
| `src/tui/dashboard/TabBar.tsx` | Tab header component — renders tab names with active indicator; keyboard: `1`/`2`/`3` or `Tab`/`Shift+Tab` |
| `src/tui/dashboard/TemplatesTab.tsx` | Template list + detail pane; actions: new (launches template-wizard), edit (`$EDITOR` via `editTemplateYaml`), remove |
| `src/tui/dashboard/ReposTab.tsx` | Repo registry list + detail pane; actions: remove (with confirmation) |
| `src/tui/dashboard/hooks/useMessages.ts` | Subscribes to IPC push notifications + reads from YAML store on reload; exposes per-workspace reactive signal to `WorkspaceRow` and `DetailStatus` |
| `src/tui/dashboard/hooks/useTemplates.ts` | `listTemplates()` as reactive signal; synchronous load (no async status checks) |
| `src/tui/dashboard/hooks/useRepos.ts` | `readRegistry()` as reactive signal; synchronous load |

---

## Recommended Project Structure (Post v0.3.0)

```
src/
├── commands/
│   ├── workspace.ts          # unchanged
│   ├── template.ts           # unchanged
│   ├── repo.ts               # unchanged
│   ├── doctor.ts             # unchanged
│   ├── config.ts             # unchanged
│   ├── completion.ts         # unchanged
│   └── message.ts            # NEW: message send|list|clear
├── lib/
│   ├── config.ts             # unchanged schema and I/O
│   ├── paths.ts              # CHANGED: add MESSAGES_DIR, messagePath(), SOCKET_PATH
│   ├── git.ts                # unchanged
│   ├── workspace-ops.ts      # CHANGED: add editTemplateYaml() helper
│   ├── lifecycle.ts          # unchanged
│   ├── files.ts              # unchanged
│   ├── detect.ts             # unchanged
│   ├── completion-generator.ts  # CHANGED: enum completions + message cmds
│   ├── messages.ts           # NEW: message store (YAML)
│   ├── ipc.ts                # NEW: Bun.serve unix IPC server for TUI
│   ├── version.ts            # unchanged
│   ├── errors.ts             # unchanged
│   └── integrations/         # unchanged
└── tui/
    ├── template-wizard.ts    # unchanged
    ├── repo-wizard.ts        # unchanged
    ├── workspace-wizard.ts   # unchanged
    ├── workspace-clone.ts    # unchanged
    ├── utils.ts              # unchanged
    └── dashboard/
        ├── run.tsx           # unchanged (or minimal: call startIpcServer on mount)
        ├── App.tsx           # CHANGED: tab routing
        ├── types.ts          # CHANGED: Tab + Message types
        ├── TabBar.tsx        # NEW
        ├── WorkspaceList.tsx # unchanged
        ├── WorkspaceRow.tsx  # CHANGED: message badge
        ├── TemplatesTab.tsx  # NEW
        ├── ReposTab.tsx      # NEW
        ├── DetailStatus.tsx  # CHANGED: messages section
        ├── ActionMenu.tsx    # unchanged
        ├── ConfirmDialog.tsx # unchanged
        ├── ProgressView.tsx  # unchanged
        ├── BatchBar.tsx      # unchanged
        ├── StatusIndicator.tsx  # unchanged
        └── hooks/
            ├── useWorkspaces.ts  # unchanged
            ├── useMessages.ts    # NEW
            ├── useTemplates.ts   # NEW
            └── useRepos.ts       # NEW
```

### Structure Rationale

- **`src/lib/messages.ts` in lib/ not commands/:** Messages are a persistent store accessed from both CLI (`message.ts`) and TUI (`useMessages.ts`). It belongs in `lib/` following the same pattern as `config.ts` — pure data I/O, no CLI or TUI concerns.
- **`src/lib/ipc.ts` in lib/ not tui/:** The IPC server is conceptually infrastructure, not UI. The TUI starts and stops it, but the server definition is independent of any SolidJS component.
- **Per-workspace YAML in `messages/` subdirectory:** Keeps messages segregated from workspace config YAMLs. Enables `clearMessages` as a simple `unlinkSync` without touching workspace config.
- **New hooks alongside existing `useWorkspaces.ts`:** All three hooks follow the same React/SolidJS hooks pattern. Co-locating them in `hooks/` makes the pattern obvious and parallel.

---

## Architectural Patterns

### Pattern 1: Additive Enum Completion Without Breaking Existing Output

`completion-generator.ts` currently has three completion value types in the `DynamicCompletion` union: `workspace`, `repo`, `template`, and the special `shells`. The dynamic completion dispatch uses the `DYNAMIC_COMPLETIONS` map (keyed by commander path string).

**What:** Extend with a `message` dynamic type and a new static `OPTION_ENUMS` lookup table for fixed-value options.

**Target shape (fully additive — no existing types removed):**

```typescript
// Extend the union (additive)
type DynamicCompletion = "workspace" | "repo" | "template" | "shells" | "message"

// New: static table for options with known fixed values
const OPTION_ENUMS: Record<string, Record<string, string[]>> = {
  sync:    { "--strategy": ["rebase", "merge"] },
  list:    { "--sort": ["date", "name", "status"] },
}
```

`buildNode()` already collects `options: OptionInfo[]` per command. Extend `CommandNode` with `optionEnums: { option: string; values: string[] }[]`, populated by a lookup against `OPTION_ENUMS[node.path]`. Each of `generateBash`, `generateZsh`, `generateFish` gets one new branch that handles the `$prev` token matching an enum option — independent of the existing dynamic completion branches.

**Commands needing coverage via `DYNAMIC_COMPLETIONS`:**

| Commander Path | Type |
|----------------|------|
| `message.send` | `workspace` (first arg) |
| `message.list` | `workspace` (first arg) |
| `message.clear` | `workspace` (first arg) |

**When to use:** Use OPTION_ENUMS for fixed values on existing commands. Do not add `.choices()` to Commander option definitions — that changes runtime validation behavior (Commander rejects non-choice values), which is outside the intended scope of completion-only changes.

**Trade-offs:** OPTION_ENUMS is a second source of truth for valid option values. Acceptable: completion output is advisory, the table is tiny and co-located with the generator, and it requires zero changes to the commands themselves.

### Pattern 2: Message Store as Per-Workspace YAML (Not Schema Field)

**What:** Messages are stored as a YAML list at `~/.config/git-stacks/messages/{workspace-name}.yml`, managed exclusively by `src/lib/messages.ts`.

**Message type:**

```typescript
type WorkspaceMessage = {
  id: string          // nanoid or `Date.now().toString(36)` for cheap uniqueness
  workspace: string   // workspace name (redundant with filename; useful for filtering)
  sender?: string     // optional agent name or hook script name
  text: string
  created_at: string  // ISO timestamp
}
```

**New constants in `paths.ts`:**

```typescript
export const MESSAGES_DIR = join(WS_CONFIG_DIR, "messages")

export function messagePath(wsName: string): string {
  return join(MESSAGES_DIR, `${wsName}.yml`)
}
```

**Why not a field on `WorkspaceSchema`:** WorkspaceSchema is a creation-time snapshot. Adding a `messages` array field would:
1. Make every `message send` a read-modify-write of workspace YAML — potential concurrent write corruption with agents
2. Require re-running Zod validation on every append
3. Bloat the workspace file visible in `ws status --json` and `ws list --json`
4. Require adding `.optional()` with `.default([])` to avoid breaking existing workspace YAMLs

A separate file per workspace avoids all of this. `clearMessages(wsName)` is a single `unlinkSync`. No workspace YAML is touched.

### Pattern 3: IPC Transport — Bun.serve Unix Socket

**What:** When the TUI dashboard runs, it starts a single global HTTP server on a Unix domain socket. The `message send` command POSTs to this socket to push a live notification. If the socket is absent (TUI not running), send writes to YAML only — message is durable, appears on next `reload()`.

**Socket path:**

```typescript
// In paths.ts — /tmp so it is auto-cleaned on reboot
export const SOCKET_PATH = join("/tmp", "git-stacks.sock")
```

A single global socket (not per-workspace) means one server instance, one path to advertise, one cleanup. All messages carry a `workspace` field so the IPC server routes to the correct signal.

**TUI-side server (`src/lib/ipc.ts`):**

```typescript
// Bun.serve with unix option — confirmed in official Bun docs (added v0.8.1)
let _server: ReturnType<typeof Bun.serve> | null = null

export function startIpcServer(onMessage: (msg: WorkspaceMessage) => void) {
  // Remove stale socket file if present (crash recovery)
  if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)

  _server = Bun.serve({
    unix: SOCKET_PATH,
    async fetch(req) {
      const msg = await req.json() as WorkspaceMessage
      appendMessage(msg.workspace, msg)   // durable write
      onMessage(msg)                       // live notification to TUI
      return new Response("ok")
    },
  })
}

export function stopIpcServer() {
  _server?.stop(true)
  _server = null
  if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
}
```

**CLI-side send (`src/commands/message.ts`):**

```typescript
// Try live notification; always write to durable store
const msg: WorkspaceMessage = { id, workspace, sender, text, created_at }
appendMessage(workspace, msg)          // always: durable YAML write

if (existsSync(SOCKET_PATH)) {
  try {
    await fetch("http://localhost/message", {
      unix: SOCKET_PATH,   // fetch with unix option — confirmed in Bun docs
      method: "POST",
      body: JSON.stringify(msg),
      headers: { "Content-Type": "application/json" },
    })
  } catch {
    // TUI exited between check and connect; durable store already written
  }
}
```

**"TUI not running" contract:** `existsSync(SOCKET_PATH)` is the guard. If absent, no error is shown. Message is in the YAML store; the TUI picks it up on next `reload()`. The `message send` command always exits 0 — notification delivery is best-effort, storage is guaranteed.

**`useMessages` hook flow:**

```
TUI starts (App.tsx onMount or run.tsx):
  → startIpcServer(onMessage)
  → useMessages creates createSignal<WorkspaceMessage[]>([]) per workspace

When IPC message arrives:
  → onMessage callback fires
  → setMessages(ws.name, [...prev, msg])  [reactive signal update]
  → WorkspaceRow and DetailStatus re-render

When user presses R (reload):
  → reload() in useWorkspaces fires
  → useMessages reads YAML store for all workspaces (catches messages sent while TUI was closed)

TUI destroys (renderer.destroy()):
  → stopIpcServer()
  → SOCKET_PATH removed
```

### Pattern 4: Tab Layout in App.tsx

**What:** Add a `tab` signal alongside the existing `view` signal. Tab state is separate from view state — the existing confirm/action-menu/progress view flow works identically within each tab.

**New state:**

```typescript
type Tab = "workspaces" | "templates" | "repos"
const [tab, setTab] = createSignal<Tab>("workspaces")
// existing: const [view, setView] = createSignal<UIView>({ view: "list" })
```

Tab switching resets `view` to `{ view: "list" }` and `cursor` to `0`.

**Keyboard handler addition (inside existing `useKeyboard` in the `list` view block):**

```typescript
if (key.name === "1") { setTab("workspaces"); setView({ view: "list" }); setCursor(0); return }
if (key.name === "2") { setTab("templates");  setView({ view: "list" }); setCursor(0); return }
if (key.name === "3") { setTab("repos");      setView({ view: "list" }); setCursor(0); return }
```

**Content routing (JSX addition, not replacement):**

```tsx
<TabBar activeTab={tab()} onTabChange={(t) => { setTab(t); setView({ view: "list" }); setCursor(0) }} />

<Show when={tab() === "workspaces"}>
  {/* existing WorkspaceList, ActionMenu, ConfirmDialog etc. — untouched */}
</Show>
<Show when={tab() === "templates"}>
  <TemplatesTab cursor={cursor()} ... />
</Show>
<Show when={tab() === "repos"}>
  <ReposTab cursor={cursor()} ... />
</Show>
```

**Why `tab` is separate from `UIView`:** The existing `UIView` union (`list`, `action-menu`, `confirm`, `progress`, `detail-status`) is used in pattern matches by `ConfirmDialog`, `ActionMenu`, `ProgressView`, `DetailStatus` — all of which check `view().view`. Adding tabs to this union would require every one of those components to handle new variant cases. Keeping `tab` as an independent signal means zero changes to those components.

---

## Data Flow

### Message Send Flow

```
git-stacks message send my-feature "build passed" --sender ci

  1. src/commands/message.ts
       build WorkspaceMessage { id, workspace: "my-feature", sender: "ci", text, created_at }

  2. appendMessage("my-feature", msg)            [src/lib/messages.ts]
       ensureDir(MESSAGES_DIR)
       read messages/my-feature.yml ([] if absent)
       push msg
       trim to MAX_MESSAGES (50)
       writeYaml(messagePath("my-feature"), msgs)

  3. if existsSync(SOCKET_PATH):
       fetch("http://localhost/message", { unix: SOCKET_PATH, body: msg })
         → Bun.serve handler in ipc.ts
             appendMessage already done; call onMessage(msg)
             → useMessages signal setter fires
             → WorkspaceRow for "my-feature" re-renders with new badge
             → DetailStatus (if open on "my-feature") re-renders messages section

  4. exit 0  (always; IPC failure is silent)
```

### Dashboard Tab Navigation Flow

```
User presses "2" (Templates tab)

  App.tsx useKeyboard handler
    setTab("templates")
    setView({ view: "list" })
    setCursor(0)

  TemplatesTab renders (useTemplates() already has listTemplates() signal loaded)
    displays template list with cursor at 0

  User presses Enter
    TemplatesTab sets local action-menu view
    ActionMenu offers: [n] New / [e] Edit / [r] Remove / [Esc] Back

  User presses "e" (Edit)
    editTemplateYaml(name) returns { path, validate }
    renderer.suspend()
    spawn $EDITOR on templatePath(name)
    await editor exit
    validate() — Zod parse on modified YAML
    renderer.resume()
    reload templates signal
```

### Completion Extension Flow

```
User types: git-stacks sync my-feat --strategy <TAB>

  Shell completion function (bash/zsh/fish) runs
    sees "sync" as subcommand
    sees "--strategy" as $prev / previous token
    hits new enum-option branch in generated completion function

  Generated output (bash example):
    if [[ "$prev" == "--strategy" ]]; then
      COMPREPLY=($(compgen -W "rebase merge" -- "$cur"))
    fi

  Source: completion-generator.ts
    OPTION_ENUMS["sync"]["--strategy"] = ["rebase", "merge"]
    generateBash/Zsh/Fish each emit the above from the options loop
```

---

## Integration Points: New vs Modified (Explicit)

### New Files — No Risk to Existing Behaviour

| File | Integrates With | Coupling Point |
|------|-----------------|---------------|
| `src/commands/message.ts` | `src/lib/messages.ts`, `src/lib/ipc.ts` (client fetch), `src/lib/paths.ts` | Registered via `program.addCommand(messageCommand)` in `index.ts` — one line |
| `src/lib/messages.ts` | `src/lib/paths.ts` (MESSAGES_DIR), `yaml` (existing dep), `zod` (existing dep) | Standalone new module; no existing file imports it initially |
| `src/lib/ipc.ts` | `Bun.serve` (built-in), `src/lib/messages.ts`, `src/lib/paths.ts` | Imported only by TUI startup (App.tsx or run.tsx) |
| `src/tui/dashboard/TabBar.tsx` | OpenTUI box/text primitives, receives `activeTab` and `onTabChange` props | Props-only component; no shared mutable state |
| `src/tui/dashboard/TemplatesTab.tsx` | `hooks/useTemplates.ts`, `src/lib/config.ts` (listTemplates, readTemplate), `editTemplateYaml` from workspace-ops | Same pattern as Workspaces tab components |
| `src/tui/dashboard/ReposTab.tsx` | `hooks/useRepos.ts`, `src/lib/config.ts` (readRegistry) | Read + remove actions; no write path to existing workspace data |
| `src/tui/dashboard/hooks/useMessages.ts` | `src/lib/messages.ts`, IPC server `onMessage` callback | Reactive subscription; no filesystem side effects on read |
| `src/tui/dashboard/hooks/useTemplates.ts` | `src/lib/config.ts` (listTemplates) | Synchronous read; simpler than useWorkspaces (no async status) |
| `src/tui/dashboard/hooks/useRepos.ts` | `src/lib/config.ts` (readRegistry) | Synchronous read |

### Modified Files — Change Scope

| File | Change | Risk |
|------|--------|------|
| `src/lib/paths.ts` | Add `MESSAGES_DIR`, `messagePath(wsName)`, `SOCKET_PATH` exports | Zero — additive exports; existing exports untouched |
| `src/lib/workspace-ops.ts` | Add `editTemplateYaml(name)` export | Zero — new export following exact pattern of `editWorkspaceYaml`; no existing functions changed |
| `src/lib/completion-generator.ts` | Add `"message"` to DynamicCompletion, OPTION_ENUMS table, extended emitters | LOW — new branches in independent if-blocks; existing generated output lines unchanged. Verify by running `git-stacks completion bash` before/after and diffing |
| `src/index.ts` | Import + register `messageCommand` | Zero — Commander registration is purely additive |
| `src/tui/dashboard/App.tsx` | Add `tab` signal, `TabBar` render, tab-gated `<Show>` blocks | LOW — existing Workspaces tab rendering path is inside `<Show when={tab() === "workspaces"}>` and is unchanged; new code is alongside, not inside |
| `src/tui/dashboard/types.ts` | Add `Tab` type; add `Message` type; extend `UIView` with tab-specific members if needed | LOW — TypeScript union extension; no existing code references new members |
| `src/tui/dashboard/WorkspaceRow.tsx` | Add message badge column | LOW — additional `<text>` element in existing `<box flexDirection="row">`; existing column widths may need adjustment |
| `src/tui/dashboard/DetailStatus.tsx` | Add Messages section | LOW — additional content block below existing repos section; no existing JSX changed |

---

## Build Order (Minimises Risk)

The three features have different dependency profiles. This order ensures each phase is independently shippable and testable.

### Phase 1 — Message Store + CLI Command (no IPC, no UI)

**Deliver:**
- `src/lib/paths.ts`: add `MESSAGES_DIR`, `messagePath()`, `SOCKET_PATH`
- `src/lib/messages.ts`: `WorkspaceMessage` type, `appendMessage`, `listMessages`, `clearMessages`
- `src/commands/message.ts`: `message send|list|clear` (writes to YAML store only; no IPC)
- `src/index.ts`: `program.addCommand(messageCommand)`

**Why first:** Zero dependencies on TUI or IPC. Immediately testable. Agents and hooks can start using `git-stacks message send` before the dashboard is updated. The YAML store is the ground truth; IPC is a live notification layer on top. Getting the store right before adding the server prevents the server from being built on an unstable data contract.

**Test surface:** Unit tests for `appendMessage`/`listMessages`/`clearMessages` using `process.env.HOME` redirect (matches existing test pattern in `tests/lib/`). CLI integration test: `git-stacks message send test-ws "hello"` writes `~/.config/git-stacks/messages/test-ws.yml` with the expected content.

### Phase 2 — Shell Completion Overhaul

**Deliver:**
- `src/lib/completion-generator.ts`: `"message"` dynamic type in DYNAMIC_COMPLETIONS, OPTION_ENUMS table for `--strategy`/`--sort`, extended emitters for bash/zsh/fish.

**Why second:** Pure logic change in one file. Independently verifiable by running `git-stacks completion bash` and diffing output against a snapshot. No UI risk. Can be done in parallel with Phase 3 but is sequenced here for smaller PRs.

**Breakage guard:** The existing DYNAMIC_COMPLETIONS map keys match by commander path string. Adding `"message.send": "workspace"` is purely additive. The only risk is a typo in the path key — caught by running the generator and verifying workspace name completion appears for `message send`. Optionally: snapshot test the completion output for the `bash` format.

**Verification steps:**
1. Run `bun run src/index.ts completion bash` before and after the change; compare with diff
2. Confirm new `message` subcommand completions appear
3. Confirm `sync --strategy <TAB>` produces `rebase merge`
4. Confirm existing `open <TAB>` still produces workspace names

### Phase 3 — Dashboard Tab Layout (Templates + Repos tabs)

**Deliver:**
- `src/lib/workspace-ops.ts`: `editTemplateYaml` helper
- `src/tui/dashboard/types.ts`: `Tab` type
- `src/tui/dashboard/TabBar.tsx`: tab header component
- `src/tui/dashboard/hooks/useTemplates.ts`, `hooks/useRepos.ts`
- `src/tui/dashboard/TemplatesTab.tsx`, `ReposTab.tsx`
- `src/tui/dashboard/App.tsx`: tab routing

**Why third:** No dependency on Phase 1 (messages) or IPC. `listTemplates` and `readRegistry` are stable. Can be tested interactively with `bun run dev` (which runs `manage`). The Workspaces tab continues to work identically — the only addition is a new routing layer above it.

**Breakage guard:** The Workspaces tab components (`WorkspaceList`, `WorkspaceRow`, `ActionMenu`, `ConfirmDialog`, `ProgressView`, `DetailStatus`) are untouched. They are wrapped in `<Show when={tab() === "workspaces"}>` — this means they no longer render when another tab is active (expected and correct). Verify: all existing dashboard keyboard actions work correctly on the Workspaces tab after the change.

### Phase 4 — IPC Transport + Message Display in Dashboard

**Deliver:**
- `src/lib/ipc.ts`: `startIpcServer`, `stopIpcServer`
- `src/tui/dashboard/hooks/useMessages.ts`
- `src/tui/dashboard/WorkspaceRow.tsx`: message badge
- `src/tui/dashboard/DetailStatus.tsx`: messages section

**Why last:** Depends on Phase 1 (YAML store + message types) and on Phase 3 (dashboard running with stable structure). The IPC server startup and cleanup must be verified before merging — see critical contract below.

**Critical contract:** `stopIpcServer()` must be called when the TUI exits. In the current codebase, exit happens via `renderer.destroy()` in App.tsx. The cleanup should be in `onCleanup` (SolidJS cleanup) or immediately before `renderer.destroy()`. If `stopIpcServer()` is not called on crash, the socket file remains. Guard: `startIpcServer()` removes the stale socket file before binding (`existsSync(SOCKET_PATH) && unlinkSync(SOCKET_PATH)`).

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Messages Field on WorkspaceSchema

**What people do:** Add `messages: WorkspaceMessage[]` to the existing `WorkspaceSchema` in `config.ts`.

**Why it's wrong:** WorkspaceSchema is a creation-time snapshot with a write model designed for infrequent updates. Adding a mutable list to it means: (a) every `message send` does a read-modify-write of the workspace YAML, risking concurrent write corruption when multiple agents send messages simultaneously; (b) Zod re-validates the entire workspace on every append; (c) messages appear in `ws status --json` and `ws list --json` output, polluting those APIs; (d) `clearMessages` becomes a partial YAML rewrite rather than a file delete.

**Do this instead:** Separate `~/.config/git-stacks/messages/{workspace}.yml` files managed exclusively by `src/lib/messages.ts`. WorkspaceSchema stays backward-compatible and self-contained.

### Anti-Pattern 2: IPC Socket Per Workspace

**What people do:** Start a separate `Bun.serve` instance per open workspace, each at `socketPath(wsName)`.

**Why it's wrong:** The dashboard shows all workspaces simultaneously. N workspaces = N servers to start, N paths to advertise in `paths.ts`, N cleanup operations in `stopIpcServer`. The `message send` command would need to discover which workspace's socket path to use — requiring an additional lookup.

**Do this instead:** Single global socket at `SOCKET_PATH`. All messages carry a `workspace` field. The single IPC server routes to the correct per-workspace signal inside `useMessages`. One server, one path, one cleanup.

### Anti-Pattern 3: Adding Commander `.choices()` for Completion

**What people do:** Add `.choices(["rebase", "merge"])` to `program.command("sync").option("--strategy", ...)` in `workspace.ts`, then modify `buildNode()` in `completion-generator.ts` to read `opt.argChoices` from Commander's option object.

**Why it's wrong:** Commander v14 exposes `opt.argChoices` but adding `.choices()` changes runtime validation — Commander rejects unknown values with an error. This codebase accepts arbitrary strings for `--strategy` and validates inside `syncWorkspace`. Changing to Commander-level validation is a behavior change requiring audit of all callers, not an incidental completion improvement.

**Do this instead:** Static `OPTION_ENUMS` table in `completion-generator.ts`. Completion output is advisory; runtime validation path is unchanged.

### Anti-Pattern 4: Tab State Inside UIView Union

**What people do:** Extend `UIView` to include tab information, e.g. `{ view: "list"; tab: Tab }`.

**Why it's wrong:** `UIView` is pattern-matched in `ConfirmDialog`, `ActionMenu`, `ProgressView`, and `DetailStatus` via `view().view === "..."`. Adding a `tab` field to the `"list"` variant (or adding new tab-specific variants) means every one of these components needs to handle the new shape. TypeScript's union exhaustiveness will not catch the gap unless every match is a full discriminated union switch.

**Do this instead:** Independent `tab` signal. Tab switches reset `view` to `{ view: "list" }`. The existing view state machine is entirely contained within whatever tab is active.

### Anti-Pattern 5: Polling the Message YAML File for Live Updates

**What people do:** In `useMessages.ts`, run `setInterval(() => setMessages(readMessages(wsName)), 1000)` to detect new messages via filesystem polling.

**Why it's wrong:** Adds up to 1-second latency for live notifications. Creates filesystem churn (1 read per workspace per second while the TUI is open). Requires interval cleanup in `onCleanup`. Silently accumulates I/O load as workspace count grows.

**Do this instead:** IPC push is the live notification channel (sub-100ms). The YAML file is read on `reload()` triggered by explicit user action or after completing an operation — this catches messages that arrived while the TUI was closed. `useMessages` should not contain a polling interval.

---

## Scaling Considerations

This is a local single-machine tool. "Scale" here means usability at high workspace counts.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-20 workspaces | Current approach fine. Message badge reads one YAML file per workspace row — negligible I/O. |
| 20-50 workspaces | Message file reads in `useMessages` should be batched like `fetchStatuses` in `useWorkspaces` (groups of 5) to avoid 50 simultaneous fs reads on startup. |
| 50-100 workspaces | Consider capping message YAML files at `MAX_MESSAGES = 50` entries. `appendMessage` trims oldest entries when over the cap. Prevents unbounded file growth for long-running agent workspaces. |
| 100+ workspaces | `WorkspaceRow` message badge adds one `readMessages(wsName)` per visible row. At 100+ workspaces, badge data should be loaded lazily (only for visible rows in the viewport, same as the status loading in `useWorkspaces`). |

---

## Sources

- `src/index.ts` — live codebase (read directly 2026-03-19)
- `src/lib/completion-generator.ts` — live codebase (read directly 2026-03-19)
- `src/lib/paths.ts` — live codebase (read directly 2026-03-19)
- `src/lib/config.ts` — live codebase (read directly 2026-03-19)
- `src/lib/workspace-ops.ts` — live codebase (read directly 2026-03-19)
- `src/commands/workspace.ts`, `template.ts`, `repo.ts` — live codebase (read directly 2026-03-19)
- `src/tui/dashboard/App.tsx`, `types.ts`, `WorkspaceRow.tsx`, `DetailStatus.tsx`, `ActionMenu.tsx` — live codebase (read directly 2026-03-19)
- `src/tui/dashboard/hooks/useWorkspaces.ts` — live codebase (read directly 2026-03-19)
- Bun Unix socket fetch: [bun.sh/guides/http/fetch-unix](https://bun.sh/guides/http/fetch-unix) — `fetch({ unix: socketPath })` confirmed (HIGH confidence)
- Bun.serve unix option: [bun.com/docs/runtime/http/server](https://bun.com/docs/runtime/http/server) — `Bun.serve({ unix: path })` confirmed, added Bun v0.8.1 (HIGH confidence)
- Bun TCP API: [bun.sh/docs/api/tcp](https://bun.sh/docs/api/tcp) — `Bun.listen` documented for TCP only; unix socket path not confirmed for `Bun.listen` — `Bun.serve` is the correct path for this use case (MEDIUM confidence)

---

*Architecture research for: git-stacks v0.3.0 — Dashboard tab layout, messaging IPC, shell completion overhaul*
*Researched: 2026-03-19*
