import { codexPlugin } from "./codex"
import { claudeCodePlugin } from "./claude-code"
import { copilotPlugin } from "./copilot"
import type { AgentLifecycleState, AgentHookPlugin } from "./types"

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

export type NativeAgentAttentionSetup =
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

export function ensureNativeAgentAttention(
  repoPath: string,
  workspaceName: string,
  adapters: readonly NativeAgentSessionAdapter[] = [],
  provider: NativeAgentProvider = "codex",
): NativeAgentAttentionSetup {
  for (const adapter of adapters) {
    if (adapter.id === provider && adapter.prepare(repoPath, workspaceName)) return { transport: "acp", provider }
  }
  const fallback = hookFallbacks[provider]
  if (!fallback) return { transport: "unavailable", provider, reason: "No ACP transport or project-hook fallback is available" }
  fallback.install(repoPath, workspaceName)
  return { transport: "hooks", provider }
}
