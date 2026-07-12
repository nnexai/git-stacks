import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { homedir } from "os"

export const AGENT_INTEGRATION_VERSION = 1
export const OWNERSHIP_MARKER = "git-stacks-managed-attention-v1"
export type IntegrationProvider = "codex" | "claude" | "copilot" | "opencode"
export type IntegrationState = "installed" | "outdated" | "not-installed" | "disabled" | "failed"

export interface IntegrationHealth { provider: IntegrationProvider; state: IntegrationState; detail?: string }
export interface IntegrationReport { enabled: boolean; version: number; providers: IntegrationHealth[] }
export interface IntegrationOptions { home?: string; enabled?: boolean }

type JsonObject = Record<string, unknown>
type Hook = { type: "command"; command: string; timeout?: number }
type HookGroup = { matcher?: string; hooks: Hook[] }

const providerEvents: Record<"codex" | "claude", [string, string, string?][]> = {
  codex: [["SessionStart", "working"], ["UserPromptSubmit", "working"], ["PermissionRequest", "waiting"], ["Stop", "completed"]],
  claude: [["SessionStart", "working"], ["UserPromptSubmit", "working"], ["PreToolUse", "waiting", "AskUserQuestion"], ["Stop", "completed"], ["PostToolUseFailure", "failed"]],
}

function command(provider: IntegrationProvider, state: string): string {
  const guard = '[ -n "${GIT_STACKS_ATTENTION_TOKEN:-}" ] && [ -n "${GIT_STACKS_SURFACE_ID:-}" ]'
  const tty = '__gs_tty=$(ps -o tty= -p "$PPID" 2>/dev/null | tr -d "[:space:]"); case "$__gs_tty" in *[0-9]*) __gs_tty="/dev/${__gs_tty#/dev/}";; *) __gs_tty=/dev/tty;; esac'
  const emit = `printf '\\033]9;git-stacks-attention:%s:${provider}:${state}\\033\\\\' "$GIT_STACKS_ATTENTION_TOKEN" > "$__gs_tty"`
  return `${guard} && { ${tty}; ${emit}; } >/dev/null 2>&1 || true # ${OWNERSHIP_MARKER}`
}

function readJson(path: string): JsonObject {
  if (!existsSync(path)) return {}
  const value: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("top level must be an object")
  return value as JsonObject
}

function atomicWrite(path: string, bytes: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  try {
    writeFileSync(temporary, bytes, { mode: 0o600 })
    const fd = openSync(temporary, "r")
    try { fsyncSync(fd) } finally { closeSync(fd) }
    renameSync(temporary, path)
  } finally { if (existsSync(temporary)) rmSync(temporary) }
}

function managed(group: unknown): boolean {
  if (!group || typeof group !== "object") return false
  const hooks = (group as { hooks?: unknown }).hooks
  return Array.isArray(hooks) && hooks.some((hook) => hook && typeof hook === "object" && typeof (hook as { command?: unknown }).command === "string" && (hook as { command: string }).command.includes(OWNERSHIP_MARKER))
}

function installMerged(home: string, provider: "codex" | "claude"): void {
  const path = join(home, provider === "codex" ? ".codex/hooks.json" : ".claude/settings.json")
  const document = readJson(path)
  const existing = document.hooks
  if (existing !== undefined && (!existing || typeof existing !== "object" || Array.isArray(existing))) throw new Error("hooks must be an object")
  const hooks: Record<string, HookGroup[]> = {}
  for (const [event, value] of Object.entries((existing ?? {}) as JsonObject)) {
    if (!Array.isArray(value)) throw new Error(`hooks.${event} must be an array`)
    hooks[event] = value.filter((entry) => !managed(entry)) as HookGroup[]
  }
  for (const [event, state, matcher] of providerEvents[provider]) {
    ;(hooks[event] ??= []).push({ ...(matcher ? { matcher } : {}), hooks: [{ type: "command", command: command(provider, state), timeout: provider === "codex" ? 5000 : 5 }] })
  }
  document.hooks = hooks
  atomicWrite(path, `${JSON.stringify(document, null, 2)}\n`)
  if (provider === "codex") enableCodexHooks(home)
}

function enableCodexHooks(home: string): void {
  const path = join(home, ".codex/config.toml")
  const original = existsSync(path) ? readFileSync(path, "utf8") : ""
  const lines = original.split("\n")
  let inFeatures = false, foundSection = false, foundHooks = false
  const output = lines.map((line) => {
    const section = /^\s*\[\s*([^\]]+)\s*\]/.exec(line)?.[1]?.trim()
    if (section) { inFeatures = section === "features"; if (inFeatures) foundSection = true; return line }
    if (inFeatures && /^\s*hooks\s*=/.test(line)) { foundHooks = true; return `hooks = true # ${OWNERSHIP_MARKER}` }
    return line
  })
  if (!foundSection) output.push("", "[features]", `hooks = true # ${OWNERSHIP_MARKER}`)
  else if (!foundHooks) {
    const sectionIndex = output.findIndex((line) => /^\s*\[\s*features\s*\]/.test(line))
    output.splice(sectionIndex + 1, 0, `hooks = true # ${OWNERSHIP_MARKER}`)
  }
  atomicWrite(path, output.join("\n").replace(/^\n+/, ""))
}

function uninstallMerged(home: string, provider: "codex" | "claude"): void {
  const path = join(home, provider === "codex" ? ".codex/hooks.json" : ".claude/settings.json")
  if (!existsSync(path)) return
  const document = readJson(path)
  const hooks: Record<string, unknown[]> = {}
  for (const [event, value] of Object.entries((document.hooks ?? {}) as JsonObject)) {
    if (!Array.isArray(value)) throw new Error(`hooks.${event} must be an array`)
    const kept = value.filter((entry) => !managed(entry)); if (kept.length) hooks[event] = kept
  }
  if (Object.keys(hooks).length) document.hooks = hooks; else delete document.hooks
  atomicWrite(path, `${JSON.stringify(document, null, 2)}\n`)
  if (provider === "codex") {
    const config = join(home, ".codex/config.toml")
    if (existsSync(config)) atomicWrite(config, readFileSync(config, "utf8").split("\n").filter((line) => !(line.includes(OWNERSHIP_MARKER) && /^\s*hooks\s*=/.test(line))).join("\n"))
  }
}

function copilotSource(): string {
  const hooks = { version: 1, _git_stacks: OWNERSHIP_MARKER, hooks: {
    sessionStart: [{ type: "command", bash: command("copilot", "working"), timeoutSec: 5 }],
    userPromptSubmitted: [{ type: "command", bash: command("copilot", "working"), timeoutSec: 5 }],
    preToolUse: [{ type: "command", bash: command("copilot", "working"), timeoutSec: 5 }],
    agentStop: [{ type: "command", bash: command("copilot", "completed"), timeoutSec: 5 }],
    notification: [{ type: "command", bash: command("copilot", "waiting"), timeoutSec: 5 }],
    sessionEnd: [{ type: "command", bash: command("copilot", "completed"), timeoutSec: 5 }],
    errorOccurred: [{ type: "command", bash: command("copilot", "failed"), timeoutSec: 5 }],
  } }
  return `${JSON.stringify(hooks, null, 2)}\n`
}

function openCodeSource(): string {
  return `// ${OWNERSHIP_MARKER}\nconst emit=(state)=>{if(!process.env.GIT_STACKS_ATTENTION_TOKEN||!process.env.GIT_STACKS_SURFACE_ID)return;process.stdout.write('\\u001b]9;git-stacks-attention:'+process.env.GIT_STACKS_ATTENTION_TOKEN+':opencode:'+state+'\\u001b\\\\')}\nexport const GitStacksAttention=async()=>({event:async({event})=>{const type=event?.type??'';if(type==='session.created'||type==='message.updated')emit('working');else if(type==='permission.asked'||type==='question.asked')emit('waiting');else if(type==='session.idle')emit('completed');else if(type==='session.error')emit('failed')}})\n`
}

function ownedWrite(path: string, source: string): void {
  if (existsSync(path) && !readFileSync(path, "utf8").includes(OWNERSHIP_MARKER)) throw new Error("refusing to replace an unowned file")
  atomicWrite(path, source)
}

function dedicatedPath(home: string, provider: "copilot" | "opencode"): string {
  return provider === "copilot" ? join(home, ".copilot/hooks/git-stacks.json") : join(home, ".config/opencode/plugins/git-stacks-attention.js")
}

function providerState(home: string, provider: IntegrationProvider): IntegrationState {
  if (provider === "codex" || provider === "claude") {
    const path = join(home, provider === "codex" ? ".codex/hooks.json" : ".claude/settings.json")
    if (!existsSync(path)) return "not-installed"
    const bytes = readFileSync(path, "utf8")
    return bytes.includes(OWNERSHIP_MARKER) ? "installed" : "not-installed"
  }
  const path = dedicatedPath(home, provider)
  if (!existsSync(path)) return "not-installed"
  const actual = readFileSync(path, "utf8")
  if (!actual.includes(OWNERSHIP_MARKER)) return "not-installed"
  return actual === (provider === "copilot" ? copilotSource() : openCodeSource()) ? "installed" : "outdated"
}

export function integrationStatus(options: IntegrationOptions = {}): IntegrationReport {
  const home = options.home ?? homedir(), enabled = options.enabled ?? process.env.GIT_STACKS_AGENT_INTEGRATIONS !== "0"
  return { enabled, version: AGENT_INTEGRATION_VERSION, providers: (["codex", "claude", "copilot", "opencode"] as const).map((provider) => ({ provider, state: enabled ? providerState(home, provider) : "disabled" })) }
}

export function installAgentIntegrations(options: IntegrationOptions = {}): IntegrationReport {
  const home = options.home ?? homedir(), enabled = options.enabled ?? process.env.GIT_STACKS_AGENT_INTEGRATIONS !== "0"
  if (!enabled) return integrationStatus({ home, enabled })
  const health: IntegrationHealth[] = []
  for (const provider of ["codex", "claude", "copilot", "opencode"] as const) try {
    if (provider === "codex" || provider === "claude") installMerged(home, provider)
    else ownedWrite(dedicatedPath(home, provider), provider === "copilot" ? copilotSource() : openCodeSource())
    health.push({ provider, state: "installed" })
  } catch (error) { health.push({ provider, state: "failed", detail: error instanceof Error ? error.message : String(error) }) }
  return { enabled, version: AGENT_INTEGRATION_VERSION, providers: health }
}

export function uninstallAgentIntegrations(options: Pick<IntegrationOptions, "home"> = {}): IntegrationReport {
  const home = options.home ?? homedir()
  for (const provider of ["codex", "claude"] as const) uninstallMerged(home, provider)
  for (const provider of ["copilot", "opencode"] as const) {
    const path = dedicatedPath(home, provider)
    if (existsSync(path) && readFileSync(path, "utf8").includes(OWNERSHIP_MARKER)) rmSync(path)
  }
  return integrationStatus({ home })
}
