import { z } from "zod"
import * as p from "@clack/prompts"
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
} from "../niri"
import { runHooks } from "../lifecycle"

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

      // Step 4: Run user-configured commands (NIRI-03/NIRI-09 replacement)
      const config = niriConfigSchema.parse(ctx.config.integrations["niri"] ?? {})
      if (config.commands?.length) {
        const hookEnv: Record<string, string> = {
          WS_WORKSPACE: ctx.workspace.name,
          WS_BRANCH: ctx.workspace.branch ?? "",
          WS_TASKS_DIR: ctx.tasksDir,
        }
        await runHooks(config.commands, ctx.tasksDir, hookEnv, false)
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
}
