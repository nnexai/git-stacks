import { z } from "zod"
import * as p from "@clack/prompts"
import type { Command } from "commander"
import {
  resolveEnabled,
  type Integration,
  type IntegrationContext,
  type ArtifactBag,
} from "./types"
import {
  isNiriRunning,
  listNiriWorkspaces,
  setNiriWorkspaceName,
  moveWindowToWorkspace,
  focusNiriWorkspace,
  focusNiriWorkspaceDown,
  unsetNiriWorkspaceName,
  niriSpawn,
} from "../niri"

const niriConfigSchema = z.object({
  enabled: z.boolean().optional(),
  commands: z.array(z.string()).optional(),
})

export const niriIntegration: Integration = {
  id: "niri",
  label: "niri",
  hint: "arranges workspace windows onto a named niri workspace",
  enabledByDefault: false,
  order: 30,

  isEnabled: (ctx) => resolveEnabled("niri", false, ctx),

  async open(ctx: IntegrationContext, _artifactPath: string | null, bag: ArtifactBag): Promise<null> {
    // NIRI-08: Silent gate — return null immediately if niri is not running
    if (!(await isNiriRunning())) return null

    const spinner = p.spinner()
    spinner.start("Setting up niri workspace")

    try {
      // Step 2: Create or reuse named workspace (NIRI-01, NIRI-04)
      const workspaceName = ctx.workspace.name
      const workspaces = await listNiriWorkspaces()
      const alreadyNamed = workspaces.some((ws) => ws.name === workspaceName)

      if (alreadyNamed) {
        // Re-open: just focus the existing named workspace
        await focusNiriWorkspace(workspaceName)
      } else {
        // First open: create a NEW workspace — do NOT rename the user's current workspace
        // Step 1: Focus a new empty workspace at the end of the workspace list
        await focusNiriWorkspaceDown()
        // Step 2: Name this new workspace
        await setNiriWorkspaceName(workspaceName)
      }

      // Step 3: Move prior integration windows by niriWindowIds (not PID)
      for (const artifact of Object.values(bag)) {
        if (artifact?.kind !== "window") continue
        if (!artifact.niriWindowIds?.length) continue
        for (const windowId of artifact.niriWindowIds) {
          try {
            await moveWindowToWorkspace(windowId, workspaceName)
          } catch (err) {
            p.log.warn(`niri: failed to move window ${windowId}: ${String(err)}`)
            // Continue — partial failure is acceptable
          }
        }
      }

      // Step 4: Spawn user-configured commands via niri IPC
      // Uses niriSpawn (niri msg action spawn) so niri owns the windows and
      // can place them on the correct workspace. Also non-blocking — no stdio
      // inheritance that would corrupt the TUI dashboard.
      // Commands are split on whitespace and env vars substituted directly —
      // no shell wrapper. Use hooks if you need shell features.
      const wsConfig = niriConfigSchema.safeParse(ctx.workspace.settings?.integrations?.["niri"] ?? {})
      const globalConfig = niriConfigSchema.safeParse(ctx.config.integrations["niri"] ?? {})
      const config = wsConfig.success && wsConfig.data.commands?.length
        ? wsConfig.data
        : globalConfig.success ? globalConfig.data : { commands: [] }
      if (config.commands?.length) {
        const vars: Record<string, string> = {
          WS_WORKSPACE: ctx.workspace.name,
          WS_BRANCH: ctx.workspace.branch ?? "",
          WS_TASKS_DIR: ctx.tasksDir,
        }
        for (const cmd of config.commands) {
          const expanded = cmd.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, key) => vars[key] ?? "")
          const args = expanded.split(/\s+/).filter(Boolean)
          if (args.length > 0) await niriSpawn(args)
        }
      }

      spinner.stop("niri workspace ready")
    } catch (err) {
      spinner.stop("niri unavailable -- skipped")
      p.log.warn(`niri: ${String(err)}`)
    }

    // Tier-3 integrations are consumers, not producers — always return null
    return null
  },

  async cleanup(ctx: IntegrationContext): Promise<void> {
    if (!(await isNiriRunning())) return
    const workspaces = await listNiriWorkspaces()
    const named = workspaces.find((ws) => ws.name === ctx.workspace.name)
    if (named) {
      await unsetNiriWorkspaceName(ctx.workspace.name)
    }
  },

  async configurePrompt(_current: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    // No interactive prompts for commands array in v0.6.0
    return { enabled: true }
  },

  commands(parent: Command): void {
    parent
      .command("focus-workspace [workspace]")
      .description("Focus a workspace's niri workspace")
      .action(async (workspace?: string) => {
        if (!workspace) {
          console.error("Usage: git-stacks integration niri focus-workspace <workspace>")
          process.exit(1)
        }
        await focusNiriWorkspace(workspace)
      })
  },
}
