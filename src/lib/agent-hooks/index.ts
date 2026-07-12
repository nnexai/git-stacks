import { claudeCodePlugin } from "./claude-code"
import { copilotPlugin } from "./copilot"
import { codexPlugin } from "./codex"
import type { AgentHookPlugin } from "./types"
export type { AgentHookPlugin, HookEntry, HooksConfig, MatcherGroup, HookHandler } from "./types"
export { claudeCodePlugin } from "./claude-code"
export { copilotPlugin } from "./copilot"
export { codexPlugin } from "./codex"
export const agentHookPlugins: AgentHookPlugin[] = [claudeCodePlugin, copilotPlugin, codexPlugin]
