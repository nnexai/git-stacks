/** @jsxImportSource @opentui/solid */
import { render } from "@opentui/solid"
import { existsSync, unlinkSync } from "node:fs"
import type { UnixSocketListener } from "bun"
import App from "./App"
import type { MessageRecord } from "../../lib/messages"
import { dispatchIpcMessage, setSocketStatus } from "./ipc-state"
import { NdjsonFrameDecoder } from "./ndjson"

const SOCKET_PATH = "/tmp/git-stacks.sock"

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
  // Always clean up stale socket files — previous process may have been killed
  // without cleanup. For a single-user CLI tool, last-writer-wins is fine.
  if (existsSync(SOCKET_PATH)) {
    try { unlinkSync(SOCKET_PATH) } catch {}
  }

  try {
    const decoders = new WeakMap<object, NdjsonFrameDecoder<MessageRecord>>()
    const server = Bun.listen<undefined>({
      unix: SOCKET_PATH,
      socket: {
        data(socket, data) {
          let decoder = decoders.get(socket)
          if (!decoder) {
            decoder = new NdjsonFrameDecoder<MessageRecord>()
            decoders.set(socket, decoder)
          }
          const result = decoder.push(data)
          for (const record of result.values) dispatchIpcMessage(record)
          if (result.oversized) socket.end()
        },
      },
    })
    server.unref()
    setSocketStatus("bound")
    return server
  } catch (e) {
    setSocketStatus("error")
    return null
  }
}

export async function runDashboard() {
  const server = await openSocketServer()

  await render(() => <App />, {
    targetFps: 30,
    exitOnCtrlC: false,
    screenMode: "alternate-screen",
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
