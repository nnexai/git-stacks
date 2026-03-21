# Phase 6: Message Store + CLI — Research

**Researched:** 2026-03-19
**Domain:** Bun Unix socket IPC, JSONL file I/O, Commander.js subcommands
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Storage:**
- JSONL at `~/.config/git-stacks/messages/{workspace}.jsonl` — one file per workspace
- NOT a field on WorkspaceSchema — avoids concurrent write corruption from agents
- Single global Unix socket at `/tmp/git-stacks.sock` — not per-workspace; all messages carry a `workspace` field for routing

**message list output format:**
- Human-readable: tabular columns — `sender`, `text`, `timestamp` — newest-first
- `--json` supported (follows Phase 4 pattern): array of message objects
- When no messages: print `No messages for '<workspace>'.` and exit 0; `--json` returns `[]`

**Workspace auto-detection:**
- Auto-detect from `WS_WORKSPACE` env var (set by hook runner in `lifecycle.ts`)
- `--workspace <name>` flag overrides on all three subcommands (send, list, clear)
- When neither is present: exit 1 with formatted error using `formatError()`

**message clear safety model:**
- Always force — no confirmation prompt
- `clear` without `--from`: clears all messages for the workspace
- `clear --from <sender>`: removes only that sender's messages, others remain

**IPC failure behavior:**
- IPC is best-effort — file write is the ground truth
- Socket write failures (ECONNREFUSED, timeout, any error): silently swallowed
- `message send` always exits 0 as long as the file write succeeded

### Claude's Discretion

- JSONL append strategy: `Bun.file(...).write()` append-only — no locking needed; each message is one atomic line
- Stale socket detection (MSG-10): try connect, if ECONNREFUSED unlink and rebind
- Socket message format: JSON line `{ workspace, text, from?, timestamp }` matching JSONL record shape
- IPC write timeout: ~50ms — brief enough to not block hook execution
- `message list` column widths: sender padded to 16, timestamp to 20, remainder is text

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MSG-01 | `git-stacks message send "<text>"` with WS_WORKSPACE env auto-detect | Commander subcommand pattern from `repo.ts`; `process.env.WS_WORKSPACE` reads env |
| MSG-02 | `--workspace <name>` flag on send/list/clear | Commander `.option()` applied to all three subcommands |
| MSG-03 | `--from <sender>` on send | Commander `.option()` on send subcommand only |
| MSG-04 | `message list` shows sender/text/timestamp, newest-first, tabular | JSONL read + sort + tabular print; `--json` pattern from workspace.ts:186 |
| MSG-05 | `message clear` clears all messages for workspace | Filter-and-rewrite JSONL; `node:fs/promises appendFile` for write |
| MSG-06 | `message clear --from <sender>` clears only that sender | Filter by `record.from === sender`, rewrite remaining |
| MSG-07 | JSONL persisted at `~/.config/git-stacks/messages/{workspace}.jsonl` | `appendFile` from `node:fs/promises`; `MESSAGES_DIR` constant in paths.ts |
| MSG-08 | `message send` exits 0 when TUI not running | `Bun.connect` `connectError` handler silently ignores; always exit 0 after file write |
| MSG-09 | When TUI running, message appears in dashboard via Unix socket within 1s | `Bun.connect({ unix: SOCKET_PATH, ... })` with 50ms timeout; write JSON line; end |
| MSG-10 | TUI opens Unix socket on startup, removes on clean exit, detects+replaces stale socket on crash | `Bun.listen({ unix: SOCKET_PATH, ... })` in `run.tsx`; `onDestroy` callback for cleanup; ECONNREFUSED = stale, unlink + rebind |
</phase_requirements>

---

## Summary

Phase 6 is a pure persistence + IPC phase: a JSONL message store and three CLI subcommands, plus a Unix socket server in the TUI for real-time push. No complex state management; the ground truth is always the JSONL file.

**Bun's Unix socket API** is the same `Bun.listen` / `Bun.connect` used for TCP, but with `unix: "/path/to/sock"` instead of `hostname` + `port`. Both overloads are typed via `UnixSocketOptions<Data>` in bun-types. The `socket.handler` interface (`open`, `data`, `close`, `connectError`) is identical. This is confirmed directly from the installed bun-types at `node_modules/bun-types/bun.d.ts`.

**JSONL append** uses `appendFile` from `node:fs/promises`. `Bun.write()` overwrites — it cannot append. The Bun docs guide for "Append content to a file" explicitly recommends `node:fs/promises appendFile`. This is the correct primitive.

**TUI lifecycle** for socket setup/teardown: `run.tsx` calls `render()` from `@opentui/solid`, which accepts a `CliRendererConfig` object. That config has an `onDestroy?: () => void` callback. Alternatively, the renderer emits `"destroy"` as an `EventEmitter` event. Both allow registering cleanup before the renderer exits. The socket server should be started before `render()` and closed in `onDestroy`.

**Primary recommendation:** Use `Bun.listen({ unix, socket: { data } })` in `run.tsx` for MSG-10; use `Bun.connect({ unix, socket: { connectError, open } })` with a 50ms timeout in `messages.ts` for MSG-09; use `appendFile` from `node:fs/promises` for MSG-07.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs/promises` | built-in | JSONL append (appendFile) | Bun's recommended approach per official guide; `Bun.write` cannot append |
| `node:fs` | built-in | Sync `existsSync`, `unlinkSync` for stale socket detection | Already used in `commands/repo.ts` |
| `Bun.listen` | Bun 1.3.10 | Unix socket server (TUI side, MSG-10) | Native Bun API, zero deps, typed via `UnixSocketOptions` |
| `Bun.connect` | Bun 1.3.10 | Unix socket client write (CLI side, MSG-09) | Same API family; `connectError` handler silences ECONNREFUSED |
| `commander` | ^12.1.0 | Subcommand registration | Already used project-wide; `messageCommand.command(...)` pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:path` | built-in | Path join for MESSAGES_DIR | Already used in `paths.ts` |
| `node:os` | built-in | (not needed — `HOME` already exported from `paths.ts`) | Reuse existing constant |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `appendFile` (node:fs) | `FileSink` (Bun) | FileSink requires explicit `end()` and `unref()` management; appendFile is simpler for one-shot appends |
| `Bun.listen` (unix) | `net.createServer` (node:net) | `Bun.listen` is the idiomatic Bun API; `net.createServer` works but no type advantage |
| `Bun.connect` (unix) | `net.createConnection` (node:net) | Same tradeoff; `Bun.connect` is idiomatic |

**Installation:** No new packages needed — everything is built into Bun or already in `package.json`.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
  commands/
    message.ts         — messageCommand (send | list | clear) — new file
  lib/
    messages.ts        — JSONL read/write/append + IPC push — new file
    paths.ts           — add MESSAGES_DIR constant
  tui/dashboard/
    run.tsx            — add socket server startup + cleanup (MSG-10)
```

### Pattern 1: Subcommand Registration (follow repo.ts)

**What:** Export a `new Command("message")` and attach subcommands to it using `.command()`.
**When to use:** All three subcommands (send, list, clear).

```typescript
// src/commands/message.ts
// Source: src/commands/repo.ts pattern
import { Command } from "commander"
import { formatError } from "../lib/errors"
import { appendMessage, listMessages, clearMessages, pushToSocket } from "../lib/messages"
import { MESSAGES_DIR } from "../lib/paths"
import { mkdirSync } from "node:fs"

export const messageCommand = new Command("message").description("Workspace notifications")

function resolveWorkspace(opts: { workspace?: string }): string | null {
  return opts.workspace ?? process.env.WS_WORKSPACE ?? null
}

messageCommand
  .command("send <text>")
  .description("Send a notification to a workspace")
  .option("--workspace <name>", "Target workspace (default: WS_WORKSPACE env)")
  .option("--from <sender>", "Sender name")
  .action(async (text: string, opts: { workspace?: string; from?: string }) => {
    const ws = resolveWorkspace(opts)
    if (!ws) {
      console.error(formatError("no workspace specified", "use --workspace <name> or run inside a workspace hook"))
      process.exit(1)
    }
    mkdirSync(MESSAGES_DIR, { recursive: true })
    const record = await appendMessage(ws, text, opts.from)
    await pushToSocket(record)   // best-effort, never throws
    // always exit 0 after file write succeeds
  })
```

### Pattern 2: JSONL Message Record Shape

```typescript
// src/lib/messages.ts
export interface MessageRecord {
  workspace: string
  text: string
  from?: string
  timestamp: string   // ISO-8601
}
```

### Pattern 3: JSONL Append (node:fs/promises appendFile)

**What:** Append a single JSON line atomically.
**Why appendFile:** `Bun.write()` overwrites; `appendFile` uses `O_APPEND` which is atomic at the OS level for writes under 4KB (POSIX pipe buffer guarantee). Each JSONL line is well under that limit.

```typescript
// src/lib/messages.ts
// Source: https://bun.com/docs/guides/write-file/append
import { appendFile, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { MESSAGES_DIR } from "./paths"

function messagePath(workspace: string): string {
  return join(MESSAGES_DIR, `${workspace}.jsonl`)
}

export async function appendMessage(
  workspace: string,
  text: string,
  from?: string
): Promise<MessageRecord> {
  const record: MessageRecord = {
    workspace,
    text,
    from,
    timestamp: new Date().toISOString(),
  }
  const line = JSON.stringify(record) + "\n"
  await appendFile(messagePath(workspace), line, "utf8")
  return record
}
```

### Pattern 4: JSONL Read (for list and clear)

```typescript
export async function listMessages(workspace: string): Promise<MessageRecord[]> {
  const path = messagePath(workspace)
  if (!existsSync(path)) return []
  const raw = await readFile(path, "utf8")
  const lines = raw.trim().split("\n").filter(Boolean)
  return lines.map((l) => JSON.parse(l) as MessageRecord).reverse()  // newest-first
}
```

### Pattern 5: JSONL Clear (filter + rewrite)

```typescript
export async function clearMessages(workspace: string, fromSender?: string): Promise<void> {
  const path = messagePath(workspace)
  if (!existsSync(path)) return
  if (!fromSender) {
    // clear all: truncate file
    await writeFile(path, "", "utf8")
    return
  }
  const records = await listMessages(workspace)
  const remaining = records.filter((r) => r.from !== fromSender)
  // rewrite in original order (reverse of listMessages' reversed output)
  const content = remaining.reverse().map((r) => JSON.stringify(r)).join("\n")
  await writeFile(path, content ? content + "\n" : "", "utf8")
}
```

### Pattern 6: IPC Push (CLI side — Bun.connect with unix)

**What:** Best-effort fire-and-forget socket write. Silently swallow all errors.

```typescript
// src/lib/messages.ts
// Source: node_modules/bun-types/bun.d.ts UnixSocketOptions
const SOCKET_PATH = "/tmp/git-stacks.sock"
const IPC_TIMEOUT_MS = 50

export async function pushToSocket(record: MessageRecord): Promise<void> {
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        Bun.connect({
          unix: SOCKET_PATH,
          socket: {
            open(socket) {
              socket.write(JSON.stringify(record) + "\n")
              socket.end()
            },
            connectError(_socket, _err) {
              resolve()   // TUI not running — silently drop
            },
            close() {
              resolve()
            },
            error(_socket, _err) {
              resolve()   // silently swallow
            },
          },
        }).catch(() => resolve())
      }),
      new Promise<void>((resolve) => setTimeout(resolve, IPC_TIMEOUT_MS)),
    ])
  } catch {
    // never propagate
  }
}
```

### Pattern 7: Unix Socket Server (TUI side — MSG-10)

**What:** `Bun.listen({ unix, socket: { data } })` started before `render()`, cleaned up in `onDestroy`.
**Stale socket detection:** `Bun.listen` on an existing path throws (EADDRINUSE). Catch it, attempt `Bun.connect` to probe — if `connectError` fires, the socket is stale; `unlinkSync` it and rebind.

```typescript
// src/tui/dashboard/run.tsx
// Source: node_modules/bun-types/bun.d.ts UnixSocketOptions + CliRendererConfig.onDestroy
import { unlinkSync, existsSync } from "node:fs"
import type { UnixSocketListener } from "bun"

const SOCKET_PATH = "/tmp/git-stacks.sock"

async function startSocketServer(): Promise<UnixSocketListener<undefined> | null> {
  // If file exists, probe whether it's alive
  if (existsSync(SOCKET_PATH)) {
    const alive = await new Promise<boolean>((resolve) => {
      Bun.connect({
        unix: SOCKET_PATH,
        socket: {
          open(s) { s.end(); resolve(true) },
          connectError() { resolve(false) },  // stale
          error() { resolve(false) },
        },
      }).catch(() => resolve(false))
    })
    if (!alive) {
      unlinkSync(SOCKET_PATH)  // remove stale socket
    } else {
      return null  // another TUI instance is running — skip
    }
  }

  return Bun.listen<undefined>({
    unix: SOCKET_PATH,
    socket: {
      data(_socket, data) {
        // parse incoming JSON line and emit to SolidJS signal
        // (Phase 9 wires this to the reactive store)
        const line = data.toString().trim()
        try {
          const record = JSON.parse(line)
          onMessageReceived?.(record)
        } catch { /* ignore malformed */ }
      },
    },
  })
}

export async function runDashboard() {
  const { plugin } = await import("bun")
  const { default: solidPlugin } = await import("@opentui/solid/bun-plugin")
  plugin(solidPlugin)

  const server = await startSocketServer()

  const { render } = await import("@opentui/solid")
  await render(() => <App />, {
    targetFps: 30,
    exitOnCtrlC: false,
    useAlternateScreen: true,
    onDestroy: () => {
      if (server) {
        server.stop(true)
        if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
      }
    },
  })
}

// Mutable callback — Phase 9 will set this to push into SolidJS signal
export let onMessageReceived: ((record: unknown) => void) | null = null
```

### Pattern 8: message list Tabular Output

```typescript
// Column widths from CONTEXT.md: sender=16, timestamp=20, rest=text
function printTable(records: MessageRecord[]): void {
  if (records.length === 0) return
  for (const r of records) {
    const sender = (r.from ?? "").padEnd(16)
    const ts = r.timestamp.slice(0, 19).replace("T", " ").padEnd(20)  // trim ms/Z
    console.log(`${sender}  ${ts}  ${r.text}`)
  }
}
```

### Pattern 9: paths.ts Addition

```typescript
// src/lib/paths.ts — add after TEMPLATES_DIR
export const MESSAGES_DIR = join(WS_CONFIG_DIR, "messages")
```

### Pattern 10: index.ts Registration

```typescript
// src/index.ts — add alongside repoCommand/templateCommand
import { messageCommand } from "./commands/message"
// ...
program.addCommand(messageCommand)
```

### Anti-Patterns to Avoid

- **Using `Bun.write()` for append:** `Bun.write()` overwrites the file. Use `appendFile` from `node:fs/promises`.
- **Throwing on IPC failure in send:** The socket write must never propagate errors. Always wrap `pushToSocket` in a fire-and-forget, never `await` it in a way that can cause exit 1.
- **Using `hostname`/`port` instead of `unix`:** `Bun.listen({ hostname: "localhost", port: ... })` is TCP, not Unix socket. Use `unix: SOCKET_PATH`.
- **Forgetting `server.unref()`:** Without `unref()`, the TUI's event loop would stay alive even after `renderer.destroy()`. The `onDestroy` callback calls `server.stop(true)` which handles this.
- **Blocking on IPC in hook scripts:** The `pushToSocket` function must complete in ≤50ms to avoid delaying hook execution. The `Promise.race` with `setTimeout(resolve, 50)` enforces this.
- **Reading JSONL without handling missing file:** Always `existsSync` check before `readFile`, or use try/catch. `appendFile` creates the file if absent, but `readFile` will throw.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File append | Custom read-modify-write cycle | `appendFile` (node:fs/promises) | `O_APPEND` is atomic for small writes; custom R-M-W has TOCTOU race |
| Unix socket | Custom `net.Socket` with manual event loop | `Bun.listen` / `Bun.connect` | Typed natively in bun-types; identical API surface; no extra deps |
| IPC timeout | Async loop with `sleep` | `Promise.race([..., setTimeout])` | One line; no polling |
| Stale socket detection | PID file + kill check | `Bun.connect` + `connectError` handler | Simpler; works across processes; no PID management |

**Key insight:** Unix socket stale-detection via connect-probe is the standard Unix daemon pattern — if `connect()` fails with ECONNREFUSED, the socket file is safe to unlink and rebind. No PID files needed.

---

## Common Pitfalls

### Pitfall 1: `Bun.write()` Overwrites Files

**What goes wrong:** Calling `Bun.write(path, content)` replaces the file entirely. Any messages appended by concurrent agents are lost.
**Why it happens:** `Bun.write` uses `O_WRONLY | O_CREAT | O_TRUNC` semantics — it truncates.
**How to avoid:** Always use `appendFile` from `node:fs/promises` for the append path. Use `writeFile` only for the `clear` rewrite (intentional overwrite).
**Warning signs:** JSONL file suddenly has only one line after concurrent sends.

### Pitfall 2: `Bun.listen` unix socket — file must not exist

**What goes wrong:** `Bun.listen({ unix: "/tmp/git-stacks.sock", ... })` throws `EADDRINUSE` if the socket file already exists, even from a crashed process.
**Why it happens:** The OS does not automatically clean up Unix socket files on process crash.
**How to avoid:** `existsSync` check before listen; probe with `Bun.connect` to distinguish live vs stale; `unlinkSync` if stale.
**Warning signs:** TUI fails to start with `EADDRINUSE` after a previous crash.

### Pitfall 3: `Bun.connect` Promise Rejects on Connection Failure

**What goes wrong:** If the TUI is not running, `Bun.connect({ unix: SOCKET_PATH, ... })` will reject its Promise AND call `connectError`. If `connectError` is omitted, the rejected promise becomes an unhandled rejection.
**Why it happens:** Per the bun-types comment on `connectError`: "When `connectError` is not specified, the rejected promise will be added to the promise rejection queue."
**How to avoid:** Always specify `connectError(socket, err) { resolve() }` in the handler. Also add `.catch(() => resolve())` on the `Bun.connect()` call as defense-in-depth.
**Warning signs:** Unhandled promise rejection warnings in hook output.

### Pitfall 4: `render()` in @opentui/solid Returns Immediately

**What goes wrong:** `run.tsx` calls `await render(...)` and expects the promise to stay pending until the TUI exits. But `render()` resolves immediately after mounting; the process stays alive because the renderer holds stdin.
**Why it happens:** `mountSolidRoot` in `@opentui/solid` mounts the tree synchronously inside `_render(...)` and returns; the renderer's stdin keeps the event loop alive.
**How to avoid:** Socket server cleanup goes in `onDestroy` (CliRendererConfig callback) or `renderer.once("destroy", ...)`. Do NOT put cleanup code after `await render(...)` — it runs immediately after mount, not after exit.
**Warning signs:** Socket file not removed on TUI exit; socket server starts leaking.

### Pitfall 5: Socket Data Handler Receives a Buffer, Not String

**What goes wrong:** In the `data(socket, data)` handler on the server side, `data` is a `Buffer` by default (binaryType defaults to `"buffer"`). Calling `JSON.parse(data)` directly fails because Buffer is not a string.
**Why it happens:** `SocketHandler.binaryType` defaults to `"buffer"` per bun-types documentation.
**How to avoid:** Call `data.toString()` (or `data.toString("utf8")`) before `JSON.parse`. Alternatively set `binaryType: "uint8array"` and use `new TextDecoder().decode(data)`.
**Warning signs:** `JSON.parse` throws `SyntaxError` on valid JSON.

### Pitfall 6: IPC Timeout Not Enforced Causes Hook Delays

**What goes wrong:** If the TUI is busy (large render), `Bun.connect` succeeds but the `close` event takes >50ms to fire, blocking the hook process.
**Why it happens:** `socket.end()` is async; the `close` callback fires after the remote side ACKs.
**How to avoid:** `Promise.race` with `setTimeout(resolve, IPC_TIMEOUT_MS)` as the outer wrapper ensures the function returns within the budget regardless of socket state.
**Warning signs:** Hooks take noticeably longer to complete when TUI is open.

---

## Code Examples

### Complete IPC Push Function

```typescript
// src/lib/messages.ts
// Source: bun-types/bun.d.ts UnixSocketOptions interface (confirmed in project node_modules)
const SOCKET_PATH = "/tmp/git-stacks.sock"
const IPC_TIMEOUT_MS = 50

export async function pushToSocket(record: MessageRecord): Promise<void> {
  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        Bun.connect({
          unix: SOCKET_PATH,
          socket: {
            open(socket) {
              socket.write(JSON.stringify(record) + "\n")
              socket.end()
            },
            connectError(_socket, _err) {
              resolve()
            },
            close() {
              resolve()
            },
            error(_socket, _err) {
              resolve()
            },
          },
        }).catch(() => resolve())
      }),
      new Promise<void>((resolve) => setTimeout(resolve, IPC_TIMEOUT_MS)),
    ])
  } catch {
    // never propagate
  }
}
```

### Complete Socket Server Setup in run.tsx

```typescript
// Source: bun-types/bun.d.ts UnixSocketOptions + CliRendererConfig.onDestroy
// (node_modules/@opentui/core/renderer.d.ts line 44)
import { existsSync, unlinkSync } from "node:fs"

const SOCKET_PATH = "/tmp/git-stacks.sock"

async function openSocketServer() {
  if (existsSync(SOCKET_PATH)) {
    const stale = await new Promise<boolean>((resolve) => {
      Bun.connect({
        unix: SOCKET_PATH,
        socket: {
          open(s) { s.end(); resolve(false) },   // socket alive
          connectError() { resolve(true) },        // stale
          error() { resolve(true) },
        },
      }).catch(() => resolve(true))
    })
    if (stale) unlinkSync(SOCKET_PATH)
    else return null   // another TUI running — skip binding
  }

  return Bun.listen<undefined>({
    unix: SOCKET_PATH,
    socket: {
      data(_socket, data) {
        try {
          const record = JSON.parse(data.toString()) as MessageRecord
          onIpcMessage?.(record)
        } catch { /* ignore */ }
      },
    },
  })
}

export let onIpcMessage: ((r: MessageRecord) => void) | null = null

export async function runDashboard() {
  const { plugin } = await import("bun")
  const { default: solidPlugin } = await import("@opentui/solid/bun-plugin")
  plugin(solidPlugin)

  const server = await openSocketServer()

  const { render } = await import("@opentui/solid")
  await render(() => <App />, {
    targetFps: 30,
    exitOnCtrlC: false,
    useAlternateScreen: true,
    onDestroy() {
      if (server) {
        server.stop(true)
        if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
      }
    },
  })
}
```

### JSONL Append (appendFile)

```typescript
// Source: https://bun.com/docs/guides/write-file/append (official Bun guide)
import { appendFile } from "node:fs/promises"

const line = JSON.stringify(record) + "\n"
await appendFile(messagePath(workspace), line, "utf8")
// creates file if absent; O_APPEND atomic for writes < 4KB
```

### message list Output (--json follows workspace.ts pattern)

```typescript
// Source: src/commands/workspace.ts:186-187 pattern
if (opts.json) {
  console.log(JSON.stringify(records, null, 2))
  return
}
if (records.length === 0) {
  console.log(`No messages for '${ws}'.`)
  return
}
for (const r of records) {  // already newest-first from listMessages()
  const sender = (r.from ?? "").padEnd(16)
  const ts = r.timestamp.slice(0, 19).replace("T", " ").padEnd(20)
  console.log(`${sender}  ${ts}  ${r.text}`)
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `fs.createWriteStream({ flags: 'a' })` | `appendFile` from `node:fs/promises` | Node 10+ / Bun native compat | Simpler; no stream lifecycle management |
| Node `net.createServer`  for Unix sockets | `Bun.listen({ unix: ... })` | Bun 0.8.1 (Aug 2023) | Typed, idiomatic, same API as TCP servers |
| PID files for daemon detection | Connect-probe (ECONNREFUSED = stale) | Long-established Unix pattern | Simpler, no PID cleanup needed |

**Deprecated/outdated:**
- `Bun.write()` for append: replaced by `node:fs/promises appendFile` — Bun.write always truncates.
- `fs.createWriteStream` per-message: overkill for JSONL; appendFile is sufficient.

---

## Open Questions

1. **What happens if two `message send` calls run concurrently against the same JSONL file?**
   - What we know: `O_APPEND` is POSIX-atomic for writes under 4096 bytes (Linux pipe buffer). Each JSONL line is typically <200 bytes.
   - What's unclear: POSIX does not strictly guarantee atomicity for `O_APPEND` writes across NFS mounts.
   - Recommendation: Accept the risk for local ~/.config files. The CONTEXT.md explicitly states "no locking needed; each message is one atomic line." This is correct for local filesystem use.

2. **Does `Bun.listen` on a Unix socket auto-unref the process? (MSG-10)**
   - What we know: `Bun.listen` returns a `SocketListener` with an `.unref()` method. The renderer's stdin already keeps the process alive.
   - What's unclear: Whether the socket listener itself pins the event loop.
   - Recommendation: Call `server.unref()` after `Bun.listen` to ensure the socket does not pin the event loop independently of the renderer. The `onDestroy` handler still calls `server.stop(true)` for cleanup.

3. **Phase 9 integration point: how does the IPC message reach the SolidJS reactive store?**
   - What we know: `onIpcMessage` in `run.tsx` is a mutable callback. Phase 9 will set it to push into a SolidJS signal.
   - What's unclear: Whether the socket's `data` callback runs on the main thread (it does — Bun's event loop is single-threaded).
   - Recommendation: Expose `onIpcMessage` as a settable export from `run.tsx`; Phase 9 imports it and sets it to a `createSignal` setter. No additional synchronization needed.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (Bun 1.3.10, Jest-compatible API) |
| Config file | none — `bun test tests/` in package.json scripts |
| Quick run command | `bun test tests/lib/messages.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MSG-01 | `appendMessage` writes JSONL line to correct path | unit | `bun test tests/lib/messages.test.ts -t "appendMessage"` | ❌ Wave 0 |
| MSG-02 | workspace flag resolution: `--workspace` overrides env | unit | `bun test tests/lib/messages.test.ts -t "resolveWorkspace"` | ❌ Wave 0 |
| MSG-03 | `from` field written to JSONL record | unit | `bun test tests/lib/messages.test.ts -t "appendMessage from"` | ❌ Wave 0 |
| MSG-04 | `listMessages` returns records newest-first | unit | `bun test tests/lib/messages.test.ts -t "listMessages"` | ❌ Wave 0 |
| MSG-05 | `clearMessages` without sender empties file | unit | `bun test tests/lib/messages.test.ts -t "clearMessages all"` | ❌ Wave 0 |
| MSG-06 | `clearMessages` with sender filters correctly | unit | `bun test tests/lib/messages.test.ts -t "clearMessages from"` | ❌ Wave 0 |
| MSG-07 | JSONL file created at `MESSAGES_DIR/{workspace}.jsonl` | unit | `bun test tests/lib/messages.test.ts -t "file path"` | ❌ Wave 0 |
| MSG-08 | `pushToSocket` exits 0 when no socket exists | unit | `bun test tests/lib/messages.test.ts -t "pushToSocket no TUI"` | ❌ Wave 0 |
| MSG-09 | `pushToSocket` delivers to listening server | integration | `bun test tests/lib/messages.test.ts -t "pushToSocket IPC"` | ❌ Wave 0 |
| MSG-10 | Stale socket detection + rebind | integration | `bun test tests/lib/messages.test.ts -t "stale socket"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `bun test tests/lib/messages.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/lib/messages.test.ts` — covers MSG-01 through MSG-10 lib functions
- [ ] Test isolation pattern: redirect `process.env.HOME` or pass tmpdir to `messagePath()` — follow `tests/lib/config.test.ts` pattern using `makeTmpDir()` from `tests/helpers.ts`
- [ ] `tests/helpers.ts` already exists with `makeTmpDir`/`cleanup`/`touch`/`write` — no new helpers needed

---

## Sources

### Primary (HIGH confidence)

- `node_modules/bun-types/bun.d.ts` lines 6245-6300 — `UnixSocketOptions<Data>`, `Bun.listen` overloads, `Bun.connect` overloads, `UnixSocketListener`
- `node_modules/@opentui/core/renderer.d.ts` lines 15-44 — `CliRendererConfig.onDestroy`; `CliRenderEvents.DESTROY`
- `node_modules/@opentui/solid/index.js` lines 950-1005 — `render()` lifecycle: resolves immediately after mount; `renderer.once("destroy", ...)` pattern
- [Bun File I/O official guide](https://bun.com/docs/guides/write-file/append) — `appendFile` from `node:fs/promises` is the recommended Bun approach for appending
- [Bun TCP/Socket official docs](https://bun.sh/docs/api/tcp) — `Bun.listen` / `Bun.connect` handler interface (`open`, `data`, `close`, `connectError`)

### Secondary (MEDIUM confidence)

- `src/commands/repo.ts` — subcommand registration pattern (verified in codebase)
- `src/commands/workspace.ts:186-187` — `--json` output pattern (verified in codebase)
- `src/lib/errors.ts` — `formatError(message, hint?)` signature (verified in codebase)
- `src/tui/dashboard/App.tsx` — `useRenderer()` returns `CliRenderer`; `renderer.destroy()` in `q`/`escape` handler

### Tertiary (LOW confidence)

- None — all critical claims verified against installed bun-types and official Bun docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against installed `bun-types` (1.3.10) type definitions in the project's `node_modules`
- Architecture: HIGH — patterns directly sourced from existing codebase files (`repo.ts`, `workspace.ts`, `errors.ts`)
- Unix socket API: HIGH — confirmed via `bun-types/bun.d.ts` `UnixSocketOptions` interface in project's node_modules
- JSONL append: HIGH — confirmed via official Bun guide + cross-checked with bun-types (`Bun.write` has no append flag)
- TUI lifecycle: HIGH — `@opentui/solid/index.js` source read directly; `renderer.d.ts` `onDestroy` confirmed
- Pitfalls: HIGH — derived from type definitions and codebase patterns, not WebSearch speculation

**Research date:** 2026-03-19
**Valid until:** 2026-06-19 (Bun APIs are stable; socket API unchanged since 0.8.1)
