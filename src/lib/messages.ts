import { appendFile, readFile, writeFile } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { NameSchema } from "./config"
import { MESSAGES_DIR } from "./paths"

export interface MessageRecord {
  workspace: string
  text: string
  from?: string
  timestamp: string  // ISO-8601
}

const SOCKET_PATH = "/tmp/git-stacks.sock"
const IPC_TIMEOUT_MS = 500

function messagePath(workspace: string): string {
  const parsed = NameSchema.safeParse(workspace)
  if (!parsed.success) {
    throw new Error(`Invalid workspace name '${workspace}': ${parsed.error.issues[0].message}`)
  }

  const root = resolve(MESSAGES_DIR)
  const path = resolve(root, `${parsed.data}.jsonl`)
  const rel = relative(root, path)
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Invalid workspace name '${workspace}': message path escapes messages directory`)
  }
  return path
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

export function listMessagesSync(workspace: string): MessageRecord[] {
  const path = messagePath(workspace)
  if (!existsSync(path)) return []
  const raw = readFileSync(path, "utf8")
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
  if (process.env.GIT_STACKS_DISABLE_MESSAGE_SOCKET === "1") return

  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        Bun.connect({
          unix: SOCKET_PATH,
          socket: {
            data() {},  // required by Bun socket API — no-op for write-only client
            open(socket) {
              socket.write(JSON.stringify(record) + "\n")
              socket.end()
            },
            connectError() {
              resolve()  // TUI not running — silently drop
            },
            close() {
              resolve()
            },
            error() {
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
