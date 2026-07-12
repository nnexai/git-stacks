import { codexPlugin } from "./codex"

/**
 * Provider-neutral preparation seam for agent sessions launched by native
 * clients. ACP transports can claim a launch here as adapters become
 * available; ordinary terminal agents retain project-local hook fallbacks.
 */
export interface NativeAgentSessionAdapter {
  id: string
  prepare(repoPath: string, workspaceName: string): boolean
}

export type NativeAgentAttentionSetup = { transport: "acp" | "hooks"; provider: string }

export function ensureNativeAgentAttention(
  repoPath: string,
  workspaceName: string,
  adapters: readonly NativeAgentSessionAdapter[] = [],
): NativeAgentAttentionSetup {
  for (const adapter of adapters) {
    if (adapter.prepare(repoPath, workspaceName)) return { transport: "acp", provider: adapter.id }
  }
  codexPlugin.install(repoPath, workspaceName)
  return { transport: "hooks", provider: "codex" }
}
