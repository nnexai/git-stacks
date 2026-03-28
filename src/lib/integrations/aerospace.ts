import { z } from "zod"
import { prompts as p } from "../../tui/utils"
import {
  resolveEnabled,
  type Integration,
  type IntegrationContext,
  type ArtifactBag,
  type WindowDetector,
  type DetectorSnapshot,
} from "./types"
import {
  isAerospaceRunning,
  listWindows,
  listWorkspaces,
  moveNodeToWorkspace,
} from "../aerospace"

// ─── Config schema ────────────────────────────────────────────────────────────

const aerospaceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  workspace: z.string(),
})

// ─── Integration ─────────────────────────────────────────────────────────────

export const aerospaceIntegration: Integration = {
  id: "aerospace",
  label: "AeroSpace",
  hint: "moves workspace windows to an AeroSpace workspace",
  enabledByDefault: false,
  order: 31,

  isEnabled: (ctx) => resolveEnabled("aerospace", false, ctx),

  /**
   * WindowDetector for AeroSpace: captures window IDs before spawning (begin),
   * then polls for new windows after spawn (resolve). Used by runner.ts to
   * populate WindowArtifact.windowIds["aerospace"] for tier-1 integrations
   * (vscode, intellij) without those integrations importing from aerospace.ts.
   */
  windowDetector: {
    id: "aerospace",
    async begin(): Promise<DetectorSnapshot> {
      const running = await isAerospaceRunning()
      if (!running) {
        return { _brand: "aerospace", data: new Set<number>() }
      }
      const windows = await listWindows()
      const ids = new Set(windows.map((w) => w.windowId))
      return { _brand: "aerospace", data: ids }
    },
    async resolve(snapshot: DetectorSnapshot, _hints?: { pid?: number; app_id?: string }): Promise<number[]> {
      const beforeIds = snapshot.data as Set<number>
      const timeoutMs = 10_000
      const initialDelayMs = 200
      const maxDelayMs = 2_000
      const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
      const deadline = Date.now() + timeoutMs
      let delay = initialDelayMs

      while (Date.now() < deadline) {
        await sleep(delay)
        const after = await listWindows()
        const newIds = after.map((w) => w.windowId).filter((id) => !beforeIds.has(id))
        if (newIds.length > 0) return newIds
        delay = Math.min(delay * 2, maxDelayMs)
      }
      return []
    },
  } satisfies WindowDetector,

  async open(ctx: IntegrationContext, _artifactPath: string | null, bag: ArtifactBag): Promise<null> {
    // Gate check — return null immediately if AeroSpace is not running
    if (!(await isAerospaceRunning())) return null

    const spinner = ctx.silent ? null : p.spinner()
    spinner?.start("Setting up AeroSpace workspace")

    try {
      // Parse config from workspace-level or global-level
      const wsConfig = aerospaceConfigSchema.safeParse(
        ctx.workspace.settings?.integrations?.["aerospace"] ?? {}
      )
      const globalConfig = aerospaceConfigSchema.safeParse(
        ctx.config.integrations["aerospace"] ?? {}
      )
      const parsedConfig = wsConfig.success ? wsConfig.data : globalConfig.success ? globalConfig.data : undefined

      if (!parsedConfig?.workspace) {
        spinner?.stop("AeroSpace: no workspace configured — skipped")
        return null
      }

      const targetWorkspace = parsedConfig.workspace

      // Validate target workspace exists (DETECT-04)
      const workspaces = await listWorkspaces()
      const workspaceExists = workspaces.some((ws) => ws.workspace === targetWorkspace)
      if (!workspaceExists) {
        spinner?.stop(`AeroSpace workspace "${targetWorkspace}" not found — skipping window placement`)
        if (!ctx.silent) p.log.warn(`AeroSpace workspace "${targetWorkspace}" not found — skipping window placement`)
        return null
      }

      // Move bag windows with aerospace window IDs to target workspace (DETECT-02)
      for (const artifact of Object.values(bag)) {
        if (artifact?.kind !== "window") continue
        const aerospaceIds = artifact.windowIds?.["aerospace"]
        if (!aerospaceIds?.length) continue
        for (const windowId of aerospaceIds) {
          try {
            await moveNodeToWorkspace(windowId, targetWorkspace)
          } catch (err) {
            if (!ctx.silent) p.log.warn(`AeroSpace: failed to move window ${windowId}: ${String(err)}`)
          }
        }
      }

      spinner?.stop("AeroSpace workspace ready")
    } catch (err) {
      spinner?.stop("AeroSpace unavailable — skipped")
      if (!ctx.silent) p.log.warn(`AeroSpace: ${String(err)}`)
    }

    // Tier-3 integrations are consumers, not producers — always return null
    return null
  },

  async cleanup(_ctx: IntegrationContext): Promise<void> {
    // Explicit no-op: AeroSpace workspaces are user-managed (defined in aerospace.toml),
    // not created by the integration. Nothing to clean up.
  },

  async configurePrompt(_current: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    return { enabled: true }
  },
}
