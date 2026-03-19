import { appendFile, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { MESSAGES_DIR } from "./paths"

export interface MessageRecord {
  workspace: string
  text: string
  from?: string
  timestamp: string  // ISO-8601
}

const SOCKET_PATH = "/tmp/git-stacks.sock"
const IPC_TIMEOUT_MS = 50

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
    ...(from !== undefined ? { from } : {}),
    timestamp: new Date().toISOString(),
  }
  const line = JSON.stringify(record) + "\n"
  await appendFile(messagePath(workspace), line, "utf8")
  return record
}

export async function listMessages(workspace: string): Promise<MessageRecord[]> {
  const path = messagePath(workspace)
  if (!existsSync(path)) return []
  const raw = await readFile(path, "utf8")
  const lines = raw.trim().split("\n").filter(Boolean)
  return lines.map((l) => JSON.parse(l) as MessageRecord).reverse()
}

export async function clearMessages(workspace: string, fromSender?: string): Promise<void> {
  const path = messagePath(workspace)
  if (!existsSync(path)) return
  if (!fromSender) {
    await writeFile(path, "", "utf8")
    return
  }
  // Read in chronological order (oldest first), filter, rewrite
  const raw = await readFile(path, "utf8")
  const lines = raw.trim().split("\n").filter(Boolean)
  const records = lines.map((l) => JSON.parse(l) as MessageRecord)
  const remaining = records.filter((r) => r.from !== fromSender)
  const content = remaining.map((r) => JSON.stringify(r)).join("\n")
  await writeFile(path, content ? content + "\n" : "", "utf8")
}

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
              resolve()  // TUI not running — silently drop
            },
            close() {
              resolve()
            },
            error(_socket, _err) {
              resolve()  // silently swallow
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
