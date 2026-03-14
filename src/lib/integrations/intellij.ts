import { $ } from "bun"
import { generateIntellijProject } from "../intellij"
import { resolveEnabled, type Integration, type IntegrationContext } from "./types"
import type { Workspace } from "../config"

export const intellijIntegration: Integration = {
  id: "intellij",
  label: "IntelliJ",
  hint: "opens .idea project for Java repos",
  enabledByDefault: true,

  applies: (workspace: Workspace) => workspace.repos.some((r) => r.type === "java"),

  isEnabled: (ctx) => resolveEnabled("intellij", true, ctx),

  generate: (ctx: IntegrationContext) => generateIntellijProject(ctx.workspace, ctx.tasksDir),

  async open(_ctx, artifactPath) {
    if (!artifactPath) return
    await $`idea ${artifactPath}`.quiet().nothrow()
  },

  async configurePrompt(_current) {
    // No extra settings beyond enabled/disabled
    return { enabled: true }
  },
}
