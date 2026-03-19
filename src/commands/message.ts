import { Command } from "commander"
import { mkdirSync } from "node:fs"
import { formatError } from "../lib/errors"
import { appendMessage, listMessages, clearMessages, pushToSocket, type MessageRecord } from "../lib/messages"
import { MESSAGES_DIR } from "../lib/paths"

export const messageCommand = new Command("message").description("Workspace notifications")

function resolveWorkspace(opts: { workspace?: string }): string | null {
  return opts.workspace ?? process.env.WS_WORKSPACE ?? null
}

function printTable(records: MessageRecord[]): void {
  for (const r of records) {
    const sender = (r.from ?? "").padEnd(16)
    const ts = r.timestamp.slice(0, 19).replace("T", " ").padEnd(20)
    console.log(`${sender}  ${ts}  ${r.text}`)
  }
}

// --- send ---

messageCommand
  .command("send <text>")
  .description("Send a notification to a workspace")
  .option("--workspace <name>", "Target workspace (default: WS_WORKSPACE env)")
  .option("--from <sender>", "Sender name")
  .action(async (text: string, opts: { workspace?: string; from?: string }) => {
    const ws = resolveWorkspace(opts)
    if (!ws) {
      console.error(
        formatError(
          "no workspace specified",
          "use --workspace <name> or run inside a workspace hook"
        )
      )
      process.exit(1)
    }
    mkdirSync(MESSAGES_DIR, { recursive: true })
    const record = await appendMessage(ws, text, opts.from)
    await pushToSocket(record)  // best-effort, never throws
    // always exit 0 after file write succeeds (MSG-08)
  })

// --- list ---

messageCommand
  .command("list")
  .description("List notifications for a workspace")
  .option("--workspace <name>", "Target workspace (default: WS_WORKSPACE env)")
  .option("--json", "Output as JSON array")
  .action(async (opts: { workspace?: string; json?: boolean }) => {
    const ws = resolveWorkspace(opts)
    if (!ws) {
      console.error(
        formatError(
          "no workspace specified",
          "use --workspace <name> or run inside a workspace hook"
        )
      )
      process.exit(1)
    }
    const records = await listMessages(ws)
    if (opts.json) {
      console.log(JSON.stringify(records, null, 2))
      return
    }
    if (records.length === 0) {
      console.log(`No messages for '${ws}'.`)
      return
    }
    printTable(records)
  })

// --- clear ---

messageCommand
  .command("clear")
  .description("Clear notifications for a workspace")
  .option("--workspace <name>", "Target workspace (default: WS_WORKSPACE env)")
  .option("--from <sender>", "Clear only messages from this sender")
  .action(async (opts: { workspace?: string; from?: string }) => {
    const ws = resolveWorkspace(opts)
    if (!ws) {
      console.error(
        formatError(
          "no workspace specified",
          "use --workspace <name> or run inside a workspace hook"
        )
      )
      process.exit(1)
    }
    await clearMessages(ws, opts.from)
    // no confirmation prompt — messages are low-stakes (CONTEXT.md locked decision)
  })
