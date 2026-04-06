import { $ } from "bun"
import { generateIntellijProject } from "../intellij"
import { resolveEnabled, type Conditional, type Generates, type Integration, type IntegrationContext, type WindowArtifact } from "./types"
import type { Workspace } from "../config"

// ─── Injectable executor ──────────────────────────────────────────────────────
// Tests replace _exec methods to avoid launching real IDE processes.
export const _exec = {
  which: async (cmd: string): Promise<boolean> => {
    const result = await $`which ${cmd}`.quiet().nothrow()
    return result.exitCode === 0
  },
  spawn: (cmd: string[]): { pid: number } => {
    const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore", stdin: "ignore" })
    return { pid: proc.pid }
  },
}

export const intellijIntegration: Integration & Generates & Conditional = {
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
    if (!await _exec.which("idea")) return null
    try {
      const { pid } = _exec.spawn(["idea", artifactPath])
      return { kind: "window", pid, app_id: "idea", title: "" }
    } catch {
      return null
    }
  },

  async configurePrompt(_current) {
    // No extra settings beyond enabled/disabled
    return { enabled: true }
  },
}
