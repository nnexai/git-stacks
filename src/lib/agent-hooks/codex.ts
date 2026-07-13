import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { signalPublishCommand, type AgentHookPlugin, type HookEntry, type HookHandler, type MatcherGroup } from "./types"

type CodexHooksDocument = Record<string, unknown> & { hooks?: Record<string, MatcherGroup[]> }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const isHandler = (value: unknown): value is HookHandler => isRecord(value) && value.type === "command" && typeof value.command === "string"
const isGroup = (value: unknown): value is MatcherGroup => isRecord(value) && (value.matcher === undefined || typeof value.matcher === "string") && Array.isArray(value.hooks) && value.hooks.every(isHandler)
const isCodexPublisher = (handler: HookHandler): boolean => handler.command.includes("git-stacks service") && handler.command.includes(" publish") && handler.command.includes("--source codex")

function pathFor(repoPath: string): string { return join(repoPath, ".codex", "hooks.json") }

function readDocument(path: string): CodexHooksDocument {
  if (!existsSync(path)) return {}
  const bytes = readFileSync(path, "utf-8")
  try {
    const parsed: unknown = JSON.parse(bytes)
    if (!isRecord(parsed)) throw new Error("top level must be an object")
    if (parsed.hooks !== undefined) {
      if (!isRecord(parsed.hooks)) throw new Error("hooks must be an object")
      for (const [event, groups] of Object.entries(parsed.hooks)) {
        if (!Array.isArray(groups) || !groups.every(isGroup)) throw new Error(`hooks.${event} has an invalid handler shape`)
      }
    }
    return parsed as CodexHooksDocument
  } catch (error) {
    throw new Error(`Cannot safely update ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function withoutCodex(hooks: Record<string, MatcherGroup[]>): Record<string, MatcherGroup[]> {
  const result: Record<string, MatcherGroup[]> = {}
  for (const [event, groups] of Object.entries(hooks)) {
    const kept = groups.flatMap((group) => {
      const handlers = group.hooks.filter((handler) => !isCodexPublisher(handler))
      return handlers.length ? [{ ...group, hooks: handlers }] : []
    })
    if (kept.length) result[event] = kept
  }
  return result
}

function atomicWrite(path: string, document: CodexHooksDocument): void {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  try {
    writeFileSync(temp, JSON.stringify(document, null, 2) + "\n", { mode: 0o600 })
    const fd = openSync(temp, "r")
    try { fsyncSync(fd) } finally { closeSync(fd) }
    renameSync(temp, path)
  } finally {
    if (existsSync(temp)) unlinkSync(temp)
  }
}

export const codexPlugin: AgentHookPlugin = {
  id: "codex",
  label: "Codex",
  generateHookEntries(workspaceName: string): HookEntry[] {
    const command = (state: "working" | "waiting" | "completed") => signalPublishCommand("codex", state, workspaceName, { bestEffort: true })
    return [
      { event: "UserPromptSubmit", command: command("working") },
      { event: "PermissionRequest", command: command("waiting") },
      { event: "PostToolUse", command: command("working") },
      { event: "Stop", command: command("completed") },
    ]
  },
  install(repoWorktreePath: string, workspaceName: string): void {
    const path = pathFor(repoWorktreePath)
    const document = readDocument(path)
    const hooks = withoutCodex(document.hooks ?? {})
    for (const entry of this.generateHookEntries(workspaceName)) {
      ;(hooks[entry.event] ??= []).push({ hooks: [{ type: "command", command: entry.command }] })
    }
    document.hooks = hooks
    atomicWrite(path, document)
  },
  remove(repoWorktreePath: string): void {
    const path = pathFor(repoWorktreePath)
    if (!existsSync(path)) return
    const document = readDocument(path)
    const hooks = withoutCodex(document.hooks ?? {})
    if (Object.keys(hooks).length) document.hooks = hooks
    else delete document.hooks
    atomicWrite(path, document)
  },
}
