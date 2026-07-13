import { codexPlugin } from "./codex"
import { claudeCodePlugin } from "./claude-code"
import { copilotPlugin } from "./copilot"
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "fs"
import { delimiter, join } from "path"
import type { AgentLifecycleState, AgentHookPlugin } from "./types"
import { installAgentIntegrations } from "./integration-manager"

export type NativeAgentProvider = "codex" | "claude" | "copilot" | "opencode"

export const nativeAgentProviders = [
  { id: "codex", acp: "adapter", command: "codex-acp", hookFallback: true },
  { id: "claude", acp: "adapter", command: "claude-code-acp", hookFallback: true },
  { id: "copilot", acp: "native", command: "copilot --acp", hookFallback: true },
  { id: "opencode", acp: "native", command: "opencode acp", hookFallback: false },
] as const satisfies readonly { id: NativeAgentProvider; acp: "native" | "adapter"; command: string; hookFallback: boolean }[]

const hookFallbacks: Partial<Record<NativeAgentProvider, AgentHookPlugin>> = {
  codex: codexPlugin,
  claude: claudeCodePlugin,
  copilot: copilotPlugin,
}

/**
 * Provider-neutral preparation seam for agent sessions launched by native
 * clients. ACP transports can claim a launch here as adapters become
 * available; ordinary terminal agents retain project-local hook fallbacks.
 */
export interface NativeAgentSessionAdapter {
  id: string
  prepare(repoPath: string, workspaceName: string): boolean
}

export type NativeAgentSignalSetup =
  | { transport: "acp" | "hooks"; provider: NativeAgentProvider | string }
  | { transport: "unavailable"; provider: NativeAgentProvider; reason: string }

export function normalizeAgentSessionUpdate(kind: string): AgentLifecycleState | null {
  switch (kind) {
    case "permission_request": case "input_required": return "waiting"
    case "tool_call": case "plan": case "message_chunk": return "working"
    case "completed": case "turn_complete": return "completed"
    case "error": case "failed": return "failed"
    case "idle": return "idle"
    default: return null
  }
}

export function ensureNativeAgentSignals(
  repoPath: string,
  workspaceName: string,
  adapters: readonly NativeAgentSessionAdapter[] = [],
  provider: NativeAgentProvider = "codex",
): NativeAgentSignalSetup {
  for (const adapter of adapters) {
    if (adapter.id === provider && adapter.prepare(repoPath, workspaceName)) return { transport: "acp", provider }
  }
  const fallback = hookFallbacks[provider]
  if (!fallback) return { transport: "unavailable", provider, reason: "No ACP transport or project-hook fallback is available" }
  fallback.install(repoPath, workspaceName)
  return { transport: "hooks", provider }
}

const wrapperCommands = [
  { provider: "codex", command: "codex" },
  { provider: "copilot", command: "copilot-cli" },
  { provider: "copilot", command: "copilot" },
  { provider: "claude", command: "claude" },
  { provider: "opencode", command: "opencode" },
] as const

function shellQuote(value: string): string { return `'${value.replaceAll("'", `'\\''`)}'` }

/**
 * Prepare ordinary provider commands typed in a native terminal. Project hooks
 * provide rich lifecycle states when a provider supports them; these wrappers
 * are the provider-neutral zero-preparation floor and observe start/exit even
 * when no hook or ACP client is active.
 */
export function prepareNativeAgentEnvironment(
  repoPath: string,
  workspaceName: string,
  basePath: string,
  wrapperDir: string,
  resolveExecutable: (command: string, path: string) => string | null = (command, path) => Bun.which(command, { PATH: path }),
  options: { installIntegrations?: boolean; integrationHome?: string } = {},
): Record<string, string> {
  // Provider integrations are user-level, app-owned assets. Never dirty a
  // workspace merely because the native client opened a terminal. Until the
  // owned installer has prepared richer hooks, command wrappers remain the
  // zero-preparation lifecycle floor.
  void repoPath
  mkdirSync(wrapperDir, { recursive: true, mode: 0o700 })
  // Preserve lookup order while removing repeated toolchain entries. Real
  // developer shells frequently accumulate the same PATH fragments many
  // times through nested version managers and terminal startup scripts.
  const lookupPath = [...new Set(basePath.split(delimiter).filter((entry) => entry && entry !== wrapperDir))].join(delimiter)
  const report = options.installIntegrations ? installAgentIntegrations({ ...(options.integrationHome ? { home: options.integrationHome } : {}) }) : null
  const failedProviders = new Set(report?.providers.filter((entry) => entry.state === "failed").map((entry) => entry.provider) ?? wrapperCommands.map((entry) => entry.provider))
  for (const { provider, command } of wrapperCommands) {
    const executable = resolveExecutable(command, lookupPath)
    const target = join(wrapperDir, command)
    if (!executable || !failedProviders.has(provider)) { if (existsSync(target)) rmSync(target); continue }
    const publish = (state: "working" | "completed" | "failed") =>
      `git-stacks service signal publish --state ${state} --source ${provider} --workspace ${shellQuote(workspaceName)} --workspace-id "$GIT_STACKS_WORKSPACE_ID" --repository-id "$GIT_STACKS_REPOSITORY_ID" --surface-id "$GIT_STACKS_SURFACE_ID" --session-id "$GIT_STACKS_AGENT_SESSION_ID" --best-effort >/dev/null 2>&1 || true`
    const script = `#!/bin/sh\nGIT_STACKS_AGENT_SESSION_ID="${provider}-$$"\nexport GIT_STACKS_AGENT_SESSION_ID\n${publish("working")}\n${shellQuote(executable)} "$@"\nstatus=$?\nif [ "$status" -eq 0 ]; then\n  ${publish("completed")}\nelse\n  ${publish("failed")}\nfi\nexit "$status"\n`
    const temporary = `${target}.tmp-${process.pid}`
    writeFileSync(temporary, script, { mode: 0o700 })
    chmodSync(temporary, 0o700)
    renameSync(temporary, target)
  }
  const failed = report?.providers.filter((entry) => entry.state === "failed") ?? []
  return {
    PATH: `${wrapperDir}${delimiter}${lookupPath}`,
    GIT_STACKS_AGENT_SIGNALS: report ? (failed.length ? "hooks-degraded+process-fallback" : "hooks+osc") : "process",
    ...(report ? { GIT_STACKS_AGENT_INTEGRATION_HEALTH: failed.length ? failed.map((entry) => entry.provider).join(",") : "healthy" } : {}),
  }
}
