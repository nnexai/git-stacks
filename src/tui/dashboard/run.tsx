/** @jsxImportSource @opentui/solid */
import { render } from "@opentui/solid"
import { existsSync, unlinkSync, statSync } from "node:fs"
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
async function socketIsLive(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: boolean) => {
      if (!settled) { settled = true; resolve(value) }
    }
    try {
      Bun.connect({
        unix: SOCKET_PATH,
        socket: {
          open(socket) { socket.end(); finish(true) },
          data() {},
          close() { finish(false) },
          error() { finish(false) },
          connectError() { finish(false) },
        },
      })
    } catch { finish(false) }
  })
}

async function openSocketServer(): Promise<{ server: UnixSocketListener<undefined>; inode: number; device: number } | null> {
  if (existsSync(SOCKET_PATH)) {
    if (await socketIsLive()) return null
    try { unlinkSync(SOCKET_PATH) } catch { return null }
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
    const stat = statSync(SOCKET_PATH)
    return { server, inode: stat.ino, device: stat.dev }
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
        server.server.stop(true)
        try {
          const stat = statSync(SOCKET_PATH)
          if (stat.ino === server.inode && stat.dev === server.device) unlinkSync(SOCKET_PATH)
        } catch { /* replaced or already removed */ }
      }
    },
  })
}
