/** @jsxImportSource @opentui/solid */
import { render } from "@opentui/solid"
import { existsSync, unlinkSync } from "node:fs"
import type { UnixSocketListener } from "bun"
import App from "./App"
import type { MessageRecord } from "../../lib/messages"

const SOCKET_PATH = "/tmp/git-stacks.sock"

/**
 * Mutable callback set by Phase 9 to push incoming IPC messages into the
 * SolidJS reactive store. Null until Phase 9 wires it up.
 */
export let onIpcMessage: ((record: MessageRecord) => void) | null = null

/**
 * Start the Unix socket server for real-time IPC from `git-stacks message send`.
 *
 * Stale socket detection:
 * - If the socket file exists, probe with Bun.connect.
 * - connectError -> stale -> unlinkSync -> rebind.
 * - open (alive) -> another TUI is running -> skip binding, return null.
 *
 * Returns null if binding was skipped (another TUI running) or failed.
 */
async function openSocketServer(): Promise<UnixSocketListener<undefined> | null> {
  if (existsSync(SOCKET_PATH)) {
    const stale = await new Promise<boolean>((resolve) => {
      Bun.connect({
        unix: SOCKET_PATH,
        socket: {
          data() {},        // Required by Bun — no-op, we only care about open/error
          open(s) {
            s.end()
            resolve(false)  // socket is alive — another TUI is running
          },
          connectError() {
            resolve(true)   // ECONNREFUSED — socket file is stale
          },
          error() {
            resolve(true)   // treat any error as stale
          },
        },
      }).catch(() => resolve(true))
    })
    if (stale) {
      unlinkSync(SOCKET_PATH)
    } else {
      // Another TUI instance is running — skip binding
      return null
    }
  }

  try {
    const server = Bun.listen<undefined>({
      unix: SOCKET_PATH,
      socket: {
        data(_socket, data) {
          // data is a Buffer — must call toString() before JSON.parse
          const line = data.toString().trim()
          if (!line) return
          try {
            const record = JSON.parse(line) as MessageRecord
            onIpcMessage?.(record)
          } catch {
            // ignore malformed JSON lines
          }
        },
      },
    })
    // Prevent the socket listener from pinning the event loop independently
    // of the renderer (renderer's stdin already keeps the process alive).
    server.unref()
    return server
  } catch {
    // EADDRINUSE or other bind failure — skip gracefully
    return null
  }
}

export async function runDashboard() {
  const server = await openSocketServer()

  await render(() => <App />, {
    targetFps: 30,
    exitOnCtrlC: false,
    useAlternateScreen: true,
    onDestroy() {
      if (server) {
        server.stop(true)
        if (existsSync(SOCKET_PATH)) {
          unlinkSync(SOCKET_PATH)
        }
      }
    },
  })
}
