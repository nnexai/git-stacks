import * as p from "@clack/prompts"
import { z } from "zod"
import { $ } from "bun"
import { generateCodeWorkspace } from "../vscode"
import { safeText } from "../../tui/utils"
import { resolveEnabled, type Integration, type IntegrationContext } from "./types"

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

  isEnabled: (ctx) => resolveEnabled("vscode", true, ctx),

  generate: (ctx) => generateCodeWorkspace(ctx.workspace, ctx.tasksDir),

  async open(ctx, artifactPath) {
    if (!artifactPath) return
    const { cmd } = getConfig(ctx)
    const check = await $`which ${cmd}`.quiet().nothrow()
    if (check.exitCode !== 0) {
      // Binary not found -- skip silently (debug-level, not an error)
      return
    }
    await $`${cmd} ${artifactPath}`.quiet().nothrow()
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
}
