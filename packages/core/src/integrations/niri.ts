import { z } from "zod"

import { prompts as p } from "../prompt-capability"
import type { CommandLike as Command } from "./types"

/** Wrap a string in single quotes, escaping any embedded single quotes. */
function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

import {
  resolveEnabled,
  type Cleans,
  type HasCommands,
  type HasConfigExample,
  type Integration,
  type IntegrationContext,
  type ArtifactBag,
  type WindowDetector,
  type DetectorSnapshot,
  type WindowDetecting,
} from "./types"
import {
  isNiriRunning,
  listNiriWindows,
  listNiriWorkspaces,
  setNiriWorkspaceName,
  moveWindowToWorkspace,
  focusNiriWorkspace,
  focusNiriWorkspaceDown,
  unsetNiriWorkspaceName,
  niriSpawn,
  focusNiriWindow,
  moveColumnToIndex,
  setWindowWidth,
  consumeOrExpelWindowLeft,
  niriSpawnSh,
  snapshotWindowIds,
} from "../niri"
import { pollForNewWindowIds } from "./window-detection"

// ─── Config schemas ───────────────────────────────────────────────────────────

const niriWindowConfigSchema = z.object({
  app: z.string().optional(),
  source: z.string().optional(),
  args: z.array(z.string()).optional(),
  repo: z.string().optional(),
  cwd: z.string().optional(),
  command: z.string().optional(),
  focus: z.boolean().optional(),
})

const niriColumnSchema = z.object({
  width: z.string().optional(),
  windows: z.array(niriWindowConfigSchema).min(1),
})

const niriConfigSchema = z.object({
  enabled: z.boolean().optional(),
  focus: z.boolean().optional(),
  columns: z.array(niriColumnSchema).optional(),
})

// ─── Integration ─────────────────────────────────────────────────────────────

export const niriIntegration: Integration & Cleans & HasCommands & HasConfigExample & WindowDetecting = {
  id: "niri",
  label: "niri",
  hint: "arranges workspace windows onto a named niri workspace",
  enabledByDefault: false,
  order: 30,

  configExample: `integrations:
  niri:
    enabled: true
    columns:
      - windows:
          - source: vscode
        width: "60%"
      - windows:
          - source: terminal
            command: "kitty"
        width: "40%"`,

  isEnabled: (ctx) => resolveEnabled("niri", false, ctx),

  /**
   * WindowDetector for niri: captures window IDs before spawning (begin),
   * then polls for new windows after spawn (resolve). Used by runner.ts to
   * populate WindowArtifact.windowIds["niri"] for tier-1 integrations
   * (vscode, intellij) without those integrations importing from niri.ts.
   */
  windowDetector: {
    id: "niri",
    async begin(): Promise<DetectorSnapshot> {
      const running = await isNiriRunning()
      if (!running) {
        return { available: false, _brand: "niri" }
      }
      const windows = await listNiriWindows()
      const ids = new Set(windows.map((w) => w.id))
      return { available: true, _brand: "niri", data: ids }
    },
    async resolve(snapshot: DetectorSnapshot, _hints?: { pid?: number; app_id?: string }): Promise<number[]> {
      if (!snapshot.available) return []
      const beforeIds = snapshot.data as Set<number>
      return pollForNewWindowIds(beforeIds, async () => (await listNiriWindows()).map((window) => window.id))
    },
  } satisfies WindowDetector,

  async open(ctx: IntegrationContext, _artifactPath: string | null, bag: ArtifactBag): Promise<null> {
    // NIRI-08: Silent gate — return null immediately if niri is not running
    if (!(await isNiriRunning())) return null

    const spinner = ctx.silent ? null : p.spinner()
    spinner?.start("Setting up niri workspace")

    try {
      // Step 1: Create or reuse named workspace (NIRI-01, NIRI-04)
      const workspaceName = ctx.workspace.name
      const workspaces = await listNiriWorkspaces()
      const alreadyNamed = workspaces.some((ws) => ws.name === workspaceName)

      // Resolve focus config — workspace settings take precedence
      const wsConfig = niriConfigSchema.safeParse(
        ctx.workspace.settings?.integrations?.["niri"] ?? {}
      )
      const globalConfig = niriConfigSchema.safeParse(ctx.config.integrations["niri"] ?? {})
      const hasWorkspaceOverride = ctx.workspace.settings?.integrations?.["niri"] !== undefined
      const parsedConfig = hasWorkspaceOverride && wsConfig.success
        ? wsConfig.data
        : globalConfig.success ? globalConfig.data : undefined
      const shouldFocusWorkspace = parsedConfig?.focus === true

      // Remember the currently focused workspace so we can switch back if !focus
      const currentlyFocused = workspaces.find((ws) => ws.is_focused)

      if (alreadyNamed) {
        // Re-open: focus the workspace to place windows, then optionally switch back
        await focusNiriWorkspace(workspaceName)
      } else {
        // First open: create a NEW workspace
        await focusNiriWorkspaceDown()
        await setNiriWorkspaceName(workspaceName)
      }

      // Step 2: Move prior integration windows by windowIds["niri"] (NIRI-02)
      for (const artifact of Object.values(bag)) {
        if (artifact?.kind !== "window") continue
        const niriIds = artifact.windowIds?.["niri"]
        if (!niriIds?.length) continue
        for (const windowId of niriIds) {
          try {
            await moveWindowToWorkspace(windowId, workspaceName)
          } catch (err) {
            if (!ctx.silent) p.log.warn(`niri: failed to move window ${windowId}: ${String(err)}`)
            // Continue — partial failure is acceptable
          }
        }
      }

      // Step 3: Process declarative column layout — two-phase approach
      const columns = parsedConfig?.columns

      // Track which window should receive final focus (from focus: true on a window entry)
      let focusWindowId: number | null = null

      if (columns?.length) {
        // Build env var expand function
        const vars: Record<string, string> = {
          GS_WORKSPACE_NAME: ctx.workspace.name,
          GS_WORKSPACE_BRANCH: ctx.workspace.branch ?? "",
          GS_WORKSPACE_PATH: `${ctx.tasksDir}/${ctx.workspace.name}`,
        }
        const expandVars = (s: string): string =>
          s.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, key) => vars[key] ?? "")

        // ── Phase 1: Creation — spawn/resolve all windows, build columnMap ──
        // columnMap: 0-based column config index -> window IDs in config order
        const columnMap = new Map<number, number[]>()

        for (let ci = 0; ci < columns.length; ci++) {
          const column = columns[ci]
          const columnWindowIds: number[] = []

          for (const window of column.windows) {
            try {
              if (window.repo !== undefined && !ctx.workspace.repos.some((repo) => repo.name === window.repo)) {
                if (!ctx.silent) p.log.warn(`niri: repo '${window.repo}' not found — skipping window`)
                continue
              }

              let windowId: number | undefined

              if (window.source !== undefined) {
                // Source window: resolve from ArtifactBag
                const artifact = bag[window.source]
                const sourceIds = artifact?.kind === "window" ? artifact.windowIds?.["niri"] : undefined
                if (sourceIds?.length) {
                  windowId = sourceIds[0]
                  columnWindowIds.push(windowId)
                } else {
                  if (!ctx.silent) p.log.warn(`niri: source "${window.source}" not found in bag or has no window IDs`)
                }
              } else if (window.app !== undefined) {
                // Direct spawn via niriSpawn (no shell)
                const expandedArgs = (window.args ?? []).map(expandVars)
                const newIds = await snapshotWindowIds(() =>
                  niriSpawn([window.app!, ...expandedArgs])
                )
                if (newIds.length > 0) windowId = newIds[0]
                columnWindowIds.push(...newIds)
              } else if (window.command !== undefined) {
                // Shell spawn via niriSpawnSh
                const expandedCommand = expandVars(window.command)

                // Resolve cwd: repo takes precedence over cwd
                let resolvedCwd: string | undefined
                if (window.repo !== undefined) {
                  const repoEntry = ctx.workspace.repos.find((r) => r.name === window.repo)
                  resolvedCwd = repoEntry!.task_path
                } else if (window.cwd !== undefined) {
                  resolvedCwd = expandVars(window.cwd)
                }

                // Build shell string
                const parts: string[] = []
                if (resolvedCwd) parts.push(`cd ${shellQuote(resolvedCwd)}`)
                parts.push(expandedCommand)
                const shellCmd = parts.join(" && ")

                const newIds = await snapshotWindowIds(() => niriSpawnSh(shellCmd))
                if (newIds.length > 0) windowId = newIds[0]
                columnWindowIds.push(...newIds)
              } else {
                if (!ctx.silent) p.log.warn("niri: window config has none of source/app/command — skipping")
              }

              // Track window-level focus
              if (window.focus && windowId !== undefined) {
                focusWindowId = windowId
              }
            } catch (err) {
              if (!ctx.silent) p.log.warn(`niri: failed to place window: ${String(err)}`)
              // Continue — partial failure acceptable
            }
          }

          columnMap.set(ci, columnWindowIds)
        }

        // ── Phase 2: Layout — reorder, stack, width, focus ──
        if (columnMap.size > 0) {
          // Step 2a — Reorder columns left-to-right using focus + move-column-to-index
          // Process columns in config order (0, 1, 2...). For each target column:
          // - Focus the first window in that column
          // - Move the focused column to target index (1-based)
          // Left-to-right processing ensures already-placed columns are never displaced.
          for (let ci = 0; ci < columns.length; ci++) {
            const windowIds = columnMap.get(ci)
            if (!windowIds?.length) continue
            const firstWindowId = windowIds[0]
            try {
              await focusNiriWindow(firstWindowId)
              await moveColumnToIndex(ci + 1) // 1-based index
            } catch (err) {
              if (!ctx.silent) p.log.warn(`niri: failed to reorder column ${ci}: ${String(err)}`)
            }
          }

          // Step 2b — Stack windows within columns (consumeOrExpelWindowLeft for windows 2+)
          for (let ci = 0; ci < columns.length; ci++) {
            const windowIds = columnMap.get(ci)
            if (!windowIds || windowIds.length <= 1) continue
            for (let i = 1; i < windowIds.length; i++) {
              try {
                await consumeOrExpelWindowLeft(windowIds[i])
              } catch (err) {
                if (!ctx.silent) p.log.warn(`niri: failed to stack window ${windowIds[i]}: ${String(err)}`)
              }
            }
          }

          // Step 2c — Apply widths via setWindowWidth --id (no focus dependency)
          for (let ci = 0; ci < columns.length; ci++) {
            const column = columns[ci]
            if (!column.width) continue
            const windowIds = columnMap.get(ci)
            if (!windowIds?.length) continue
            try {
              await setWindowWidth(windowIds[0], column.width)
            } catch (err) {
              if (!ctx.silent) p.log.warn(`niri: failed to set column width: ${String(err)}`)
            }
          }
        }
      }

      // Step 4: Apply focus
      // Window-level focus: focus a specific window marked with focus: true
      if (focusWindowId !== null) {
        try { await focusNiriWindow(focusWindowId) } catch { /* best effort */ }
      }

      // Workspace-level focus: if focus is not set, switch back to the original workspace
      if (!shouldFocusWorkspace && currentlyFocused?.name) {
        try { await focusNiriWorkspace(currentlyFocused.name) } catch { /* best effort */ }
      }

      spinner?.stop("niri workspace ready")
    } catch (err) {
      spinner?.stop("niri unavailable -- skipped")
      if (!ctx.silent) p.log.warn(`niri: ${String(err)}`)
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
    // No interactive prompts for columns array in v0.6.0
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
