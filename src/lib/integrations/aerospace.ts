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
  focusWindow,
  setLayout,
  flattenWorkspaceTree,
  snapshotWindowIds,
  _exec,
} from "../aerospace"

/** Wrap a string in single quotes, escaping any embedded single quotes. */
function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

// ─── Config schema ────────────────────────────────────────────────────────────

const aerospaceCommandSchema = z.object({
  app: z.string().optional(),
  command: z.string().optional(),
  source: z.string().optional(),
  repo: z.string().optional(),
  cwd: z.string().optional(),
  args: z.array(z.string()).optional(),
  focus: z.boolean().optional(),
})

const aerospaceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  workspace: z.string(),
  layout: z.enum(["h_tiles", "v_tiles", "h_accordion", "v_accordion"]).optional(),
  normalization: z.boolean().optional(),
  flatten_before_open: z.boolean().optional(),
  focus: z.boolean().optional(),
  commands: z.array(aerospaceCommandSchema).optional(),
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
      const shouldFlatten = parsedConfig.flatten_before_open === true
      const normalization = parsedConfig.normalization !== false  // default true
      const layout = parsedConfig.layout
      const shouldFocusWorkspace = parsedConfig.focus === true
      const commands = parsedConfig.commands

      // Validate target workspace exists (DETECT-04)
      const workspaces = await listWorkspaces()
      const workspaceExists = workspaces.some((ws) => ws.workspace === targetWorkspace)
      if (!workspaceExists) {
        spinner?.stop(`AeroSpace workspace "${targetWorkspace}" not found — skipping window placement`)
        if (!ctx.silent) p.log.warn(`AeroSpace workspace "${targetWorkspace}" not found — skipping window placement`)
        return null
      }

      // ── Step 1: Flatten before open (LAYOUT-03) ──
      if (shouldFlatten) {
        try {
          await flattenWorkspaceTree(targetWorkspace)
        } catch (err) {
          if (!ctx.silent) p.log.warn(`AeroSpace: flatten failed: ${String(err)}`)
        }
      }

      // ── Step 2: Move bag windows (DETECT-02) ──
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

      // ── Step 3: Launch commands (LAUNCH-01, LAUNCH-02) ──
      let focusWindowId: number | null = null

      if (commands?.length) {
        const vars: Record<string, string> = {
          GS_WORKSPACE_NAME: ctx.workspace.name,
          GS_WORKSPACE_BRANCH: ctx.workspace.branch ?? "",
          GS_WORKSPACE_PATH: ctx.tasksDir,
        }
        const expandVars = (s: string): string =>
          s.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, key) => vars[key] ?? "")

        for (const cmd of commands) {
          try {
            let newWindowIds: number[] = []

            if (cmd.source !== undefined) {
              // Source: resolve window IDs from ArtifactBag — no spawning needed
              const artifact = bag[cmd.source]
              const sourceIds = artifact?.kind === "window" ? artifact.windowIds?.["aerospace"] : undefined
              if (sourceIds?.length) {
                for (const wid of sourceIds) {
                  try { await moveNodeToWorkspace(wid, targetWorkspace) } catch { /* already moved or stale */ }
                }
                newWindowIds = sourceIds
              } else {
                if (!ctx.silent) p.log.warn(`AeroSpace: source "${cmd.source}" not found in bag or has no aerospace window IDs`)
              }
            } else if (cmd.app !== undefined) {
              // App: launch via macOS open -a
              const expandedApp = expandVars(cmd.app)
              const expandedArgs = (cmd.args ?? []).map(expandVars)

              newWindowIds = await snapshotWindowIds(async () => {
                const args = ["open", "-a", expandedApp]
                if (expandedArgs.length) args.push("--args", ...expandedArgs)
                Bun.spawn(args, { stdout: "ignore", stderr: "ignore" })
              })

              for (const wid of newWindowIds) {
                try { await moveNodeToWorkspace(wid, targetWorkspace) } catch (err) {
                  if (!ctx.silent) p.log.warn(`AeroSpace: failed to move launched window ${wid}: ${String(err)}`)
                }
              }
            } else if (cmd.command !== undefined) {
              // Command: shell execution
              const expandedCommand = expandVars(cmd.command)

              // Resolve cwd: repo takes precedence over cwd
              let resolvedCwd: string | undefined
              if (cmd.repo !== undefined) {
                const repoEntry = ctx.workspace.repos.find((r) => r.name === cmd.repo)
                resolvedCwd = repoEntry?.task_path
              } else if (cmd.cwd !== undefined) {
                resolvedCwd = expandVars(cmd.cwd)
              }

              // Build shell string with cwd
              const parts: string[] = []
              if (resolvedCwd) parts.push(`cd ${shellQuote(resolvedCwd)}`)
              parts.push(expandedCommand)
              const shellCmd = parts.join(" && ")

              newWindowIds = await snapshotWindowIds(async () => {
                Bun.spawn(["sh", "-c", shellCmd], { stdout: "ignore", stderr: "ignore" })
              })

              for (const wid of newWindowIds) {
                try { await moveNodeToWorkspace(wid, targetWorkspace) } catch (err) {
                  if (!ctx.silent) p.log.warn(`AeroSpace: failed to move launched window ${wid}: ${String(err)}`)
                }
              }
            } else {
              if (!ctx.silent) p.log.warn("AeroSpace: command entry has none of source/app/command — skipping")
            }

            // Track window-level focus
            if (cmd.focus && newWindowIds.length > 0) {
              focusWindowId = newWindowIds[0]
            }
          } catch (err) {
            if (!ctx.silent) p.log.warn(`AeroSpace: command failed: ${String(err)}`)
            // Continue — partial failure acceptable
          }
        }
      }

      // ── Step 4: Apply layout (LAYOUT-01, LAYOUT-02) ──
      if (layout) {
        try {
          // Both normalization paths: focus a window in target workspace, then set layout
          // normalization field affects whether the user's tree is auto-managed by AeroSpace;
          // layout application itself is the same for both paths
          const wsWindows = await listWindows()
          const targetWindow = wsWindows.find((w) => w.workspace === targetWorkspace)
          if (targetWindow) {
            await focusWindow(targetWindow.windowId)
            await setLayout(layout)
          }
          // suppress unused variable warning — normalization read above
          void normalization
        } catch (err) {
          if (!ctx.silent) p.log.warn(`AeroSpace: layout failed: ${String(err)}`)
        }
      }

      // ── Step 5: Focus (LAYOUT-04) ──
      // Window-level focus: focus a specific window marked with focus: true
      if (focusWindowId !== null) {
        try { await focusWindow(focusWindowId) } catch { /* best effort */ }
      }

      // Workspace-level focus: switch AeroSpace to the target workspace
      if (shouldFocusWorkspace) {
        try {
          await _exec.run(["workspace", targetWorkspace])
        } catch (err) {
          if (!ctx.silent) p.log.warn(`AeroSpace: workspace focus failed: ${String(err)}`)
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
