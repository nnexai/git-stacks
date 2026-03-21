import { claudeCodePlugin } from "./claude-code"
import type { AgentHookPlugin } from "./types"
export type { AgentHookPlugin, HookEntry, HooksConfig, MatcherGroup, HookHandler } from "./types"
export { claudeCodePlugin } from "./claude-code"
export const agentHookPlugins: AgentHookPlugin[] = [claudeCodePlugin]
