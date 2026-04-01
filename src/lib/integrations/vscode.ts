import { prompts as p, safeText } from "../../tui/utils"
import { z } from "zod"
import { $ } from "bun"
import type { Command } from "commander"
import { generateCodeWorkspace } from "../vscode"
import { resolveEnabled, type Integration, type IntegrationContext, type WindowArtifact } from "./types"
import { readGlobalConfig, readWorkspace, workspaceExists } from "../config"
import { getTasksDir } from "../paths"

const configSchema = z.object({
  enabled: z.boolean().default(true),
  cmd: z.string().default("code-insiders"),
})

function getConfig(ctx: IntegrationContext) {
  return configSchema.parse(ctx.config.integrations["vscode"] ?? {})
}

export const vscodeIntegration: Integration = {
  id: "vscode",
  label: "VSCode",
  hint: "opens .code-workspace on git-stacks open",
  enabledByDefault: true,
  order: 10,

  configExample: `integrations:
  vscode:
    enabled: true
    cmd: code-insiders`,

  isEnabled: (ctx) => resolveEnabled("vscode", true, ctx),

  generate: (ctx) => generateCodeWorkspace(ctx.workspace, ctx.tasksDir),

  async open(ctx, artifactPath, _bag): Promise<WindowArtifact | null> {
    if (!artifactPath) return null
    const { cmd } = getConfig(ctx)
    const check = await $`which ${cmd}`.quiet().nothrow()
    if (check.exitCode !== 0) {
      // Binary not found -- skip silently (debug-level, not an error)
      return null
    }
    try {
      const app_id = cmd.split("/").at(-1) ?? cmd
      // Spawn the editor — window ID detection is handled externally by runner.ts
      // via WindowDetector instances (e.g. niri's windowDetector on niriIntegration)
      const proc = Bun.spawn([cmd, artifactPath], {
        stdout: "ignore",
        stderr: "ignore",
        stdin: "ignore",
      })
      return { kind: "window", pid: proc.pid, app_id, title: "" }
    } catch {
      return null
    }
  },

  async configurePrompt(current) {
    const parsed = configSchema.parse({ ...current, enabled: true })

    const cmdRaw = await p.select({
      message: "VSCode command",
      options: [
        { value: "code-insiders", label: "VSCode Insiders", hint: "code-insiders" },
        { value: "code",          label: "VSCode Stable",   hint: "code" },
      ],
      initialValue: parsed.cmd === "code" ? "code" : "code-insiders",
    })
    if (p.isCancel(cmdRaw)) return null

    let cmd = cmdRaw as string
    // If the stored value was a custom binary, offer to keep/change it
    if (parsed.cmd !== "code" && parsed.cmd !== "code-insiders") {
      const customRaw = await safeText({
        message: "Custom VSCode binary (leave blank to use selection above)",
        fallbackValue: parsed.cmd,
      })
      if (p.isCancel(customRaw)) return null
      if ((customRaw as string).trim()) cmd = (customRaw as string).trim()
    }

    return { enabled: true, cmd }
  },

  commands(parent: Command): void {
    parent
      .command("open <workspace>")
      .description("Generate .code-workspace and open VSCode without running hooks")
      .action(async (workspaceName: string) => {
        if (!workspaceExists(workspaceName)) {
          console.error(`Workspace '${workspaceName}' not found.`)
          process.exit(1)
        }
        const globalConfig = readGlobalConfig()
        const ws = readWorkspace(workspaceName)
        const tasksDir = getTasksDir(globalConfig.workspace_root)
        const ctx: IntegrationContext = { workspace: ws, tasksDir, config: globalConfig }
        const artifactPath = vscodeIntegration.generate?.(ctx) ?? null
        if (!artifactPath) {
          console.error("Failed to generate .code-workspace file.")
          process.exit(1)
        }
        await vscodeIntegration.open(ctx, artifactPath, {})
        console.log(`Opened: ${artifactPath}`)
      })
  },
}
