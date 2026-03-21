import { $ } from "bun"
import { generateIntellijProject } from "../intellij"
import { resolveEnabled, type Integration, type IntegrationContext, type WindowArtifact } from "./types"
import type { Workspace } from "../config"

export const intellijIntegration: Integration = {
  id: "intellij",
  label: "IntelliJ",
  hint: "opens .idea project for Java repos",
  enabledByDefault: true,
  order: 11,

  applies: (workspace: Workspace) => workspace.repos.some((r) => r.type === "java"),

  isEnabled: (ctx) => resolveEnabled("intellij", true, ctx),

  generate: (ctx: IntegrationContext) => generateIntellijProject(ctx.workspace, ctx.tasksDir),

  async open(_ctx, artifactPath, _bag): Promise<WindowArtifact | null> {
    if (!artifactPath) return null
    const check = await $`which idea`.quiet().nothrow()
    if (check.exitCode !== 0) return null
    try {
      const proc = Bun.spawn(["idea", artifactPath], {
        stdout: "ignore",
        stderr: "ignore",
        stdin: "ignore",
      })
      return { kind: "window", pid: proc.pid, app_id: "idea", title: "" }
    } catch {
      return null
    }
  },

  async configurePrompt(_current) {
    // No extra settings beyond enabled/disabled
    return { enabled: true }
  },
}
