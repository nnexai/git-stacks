import { z } from "zod"

import { prompts as p } from "../prompt-capability"
import { spawn } from "../node-runtime"
import type { CommandLike as Command } from "./types"
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
import { readGlobalConfig, readWorkspace, workspaceExists } from "../config"
import { pollForNewWindowIds } from "./window-detection"

export const _runtime = { spawn }

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

const aerospaceWorkspaceEntrySchema = z.object({
  workspace: z.string(),
  layout: z.enum(["h_tiles", "v_tiles", "h_accordion", "v_accordion"]).optional(),
  normalization: z.boolean().optional(),
  flatten_before_open: z.boolean().optional(),
  focus: z.boolean().optional(),
  commands: z.array(aerospaceCommandSchema).optional(),
})

const aerospaceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  workspaces: z.array(aerospaceWorkspaceEntrySchema).min(1),
})

export type AerospaceWorkspaceEntry = z.infer<typeof aerospaceWorkspaceEntrySchema>

/**
 * Validates an AeroSpace config's workspaces array for focus-uniqueness
 * and duplicate workspace names. Throws Error with plain-English message
 * on violation. Call before the processing loop.
 */
export function validateAerospaceConfig(
  workspaces: AerospaceWorkspaceEntry[]
): void {
  // Check focus uniqueness — at most one entry may have focus: true
  const focusEntries = workspaces.filter((e) => e.focus === true)
  if (focusEntries.length > 1) {
    const names = focusEntries.map((e) => e.workspace).join(", ")
    throw new Error(
      `AeroSpace: multiple entries have focus: true (${names}) — at most one allowed`
    )
  }

  // Check duplicate workspace names
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const entry of workspaces) {
    if (seen.has(entry.workspace)) {
      duplicates.push(entry.workspace)
    }
    seen.add(entry.workspace)
  }
  if (duplicates.length > 0) {
    const unique = [...new Set(duplicates)].join(", ")
    throw new Error(`AeroSpace: duplicate workspace names: ${unique}`)
  }
}

// ─── Integration ─────────────────────────────────────────────────────────────

export const aerospaceIntegration: Integration & Cleans & HasCommands & HasConfigExample & WindowDetecting = {
  id: "aerospace",
  label: "AeroSpace",
  hint: "moves workspace windows to an AeroSpace workspace",
  enabledByDefault: false,
  order: 31,

  configExample: `integrations:
  aerospace:
    enabled: true
    workspaces:
      - workspace: "2"
        layout: h_tiles
        flatten_before_open: true
        focus: true
        commands:
          - app: "Safari"
          - command: "open -a Terminal"
            cwd: /tmp
      - workspace: "3"
        layout: v_tiles
        commands:
          - source: vscode`,

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
        return { available: false, _brand: "aerospace" }
      }
      const windows = await listWindows()
      const ids = new Set(windows.map((w) => w.windowId))
      return { available: true, _brand: "aerospace", data: ids }
    },
    async resolve(snapshot: DetectorSnapshot, _hints?: { pid?: number; app_id?: string }): Promise<number[]> {
      if (!snapshot.available) return []
      const beforeIds = snapshot.data as Set<number>
      return pollForNewWindowIds(beforeIds, async () => (await listWindows()).map((window) => window.windowId))
    },
  } satisfies WindowDetector,

  async open(ctx: IntegrationContext, _artifactPath: string | null, bag: ArtifactBag): Promise<null> {
    // Gate check — return null immediately if AeroSpace is not running
    if (!(await isAerospaceRunning())) return null

    const spinner = ctx.silent ? null : p.spinner()
    spinner?.start("Setting up AeroSpace workspace")

    try {
      // Parse config from workspace-level or global-level (D-08, D-09: full replace semantics)
      const wsConfig = aerospaceConfigSchema.safeParse(
        ctx.workspace.settings?.integrations?.["aerospace"] ?? {}
      )
      const globalConfig = aerospaceConfigSchema.safeParse(
        ctx.config.integrations["aerospace"] ?? {}
      )
      const parsedConfig = wsConfig.success ? wsConfig.data : globalConfig.success ? globalConfig.data : undefined

      if (!parsedConfig?.workspaces?.length) {
        spinner?.stop("AeroSpace: no workspaces configured — skipped")
        return null
      }

      // Validate config constraints (focus uniqueness, duplicate names)
      validateAerospaceConfig(parsedConfig.workspaces)

      // Hoist listWorkspaces — call exactly once before the loop (D-09)
      const knownWorkspaces = await listWorkspaces()
      const knownNames = new Set(knownWorkspaces.map((ws) => ws.workspace))

      // Validate all target workspace names upfront — error before any windows move (PROC-03)
      for (const entry of parsedConfig.workspaces) {
        if (!knownNames.has(entry.workspace)) {
          spinner?.stop(`AeroSpace workspace "${entry.workspace}" not found — aborting`)
          if (!ctx.silent) p.log.warn(`AeroSpace workspace "${entry.workspace}" not found — skipping window placement`)
          return null
        }
      }

      // Shared state across all entries
      const beforeSet = new Set<number>()
      let deferredWorkspaceFocus: string | null = null
      let deferredWindowFocus: number | null = null

      const entries = parsedConfig.workspaces
      const totalEntries = entries.length

      // Shared variable expansion for commands
      const vars: Record<string, string> = {
        GS_WORKSPACE_NAME: ctx.workspace.name,
        GS_WORKSPACE_BRANCH: ctx.workspace.branch ?? "",
        GS_WORKSPACE_PATH: `${ctx.tasksDir}/${ctx.workspace.name}`,
      }
      const expandVars = (s: string): string =>
        s.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, key) => vars[key] ?? "")

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const targetWorkspace = entry.workspace
        const shouldFlatten = entry.flatten_before_open === true
        const normalization = entry.normalization !== false  // default true
        const layout = entry.layout
        const commands = entry.commands

        // Update spinner message per entry (D-03)
        if (totalEntries > 1) {
          spinner?.message(`AeroSpace: setting up workspace ${targetWorkspace} (${i + 1}/${totalEntries})`)
        }

        try {
          // ── Step 1: Flatten (per-entry) ──
          if (shouldFlatten) {
            try {
              await flattenWorkspaceTree(targetWorkspace)
            } catch (err) {
              if (!ctx.silent) p.log.warn(`AeroSpace: flatten failed for ${targetWorkspace}: ${String(err)}`)
            }
          }

          // ── Step 2: Bag-move (index 0 only — D-07, PROC-02) ──
          if (i === 0) {
            for (const artifact of Object.values(bag)) {
              if (artifact?.kind !== "window") continue
              const aerospaceIds = artifact.windowIds?.["aerospace"]
              if (!aerospaceIds?.length) continue
              for (const windowId of aerospaceIds) {
                try {
                  await moveNodeToWorkspace(windowId, targetWorkspace)
                  beforeSet.add(windowId)
                } catch (err) {
                  if (!ctx.silent) p.log.warn(`AeroSpace: failed to move window ${windowId}: ${String(err)}`)
                }
              }
            }
          }

          // ── Step 3: Commands (per-entry) ──
          if (commands?.length) {
            for (const cmd of commands) {
              try {
                if (cmd.repo !== undefined && !ctx.workspace.repos.some((repo) => repo.name === cmd.repo)) {
                  if (!ctx.silent) p.log.warn(`AeroSpace: repo '${cmd.repo}' not found — skipping command`)
                  continue
                }

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
                    _runtime.spawn(args, { stdout: "ignore", stderr: "ignore" })
                  }, { beforeSet })

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
                    resolvedCwd = repoEntry!.task_path
                  } else if (cmd.cwd !== undefined) {
                    resolvedCwd = expandVars(cmd.cwd)
                  }

                  // Build shell string with cwd
                  const parts: string[] = []
                  if (resolvedCwd) parts.push(`cd ${shellQuote(resolvedCwd)}`)
                  parts.push(expandedCommand)
                  const shellCmd = parts.join(" && ")

                  newWindowIds = await snapshotWindowIds(async () => {
                    _runtime.spawn(["sh", "-c", shellCmd], { stdout: "ignore", stderr: "ignore" })
                  }, { beforeSet })

                  for (const wid of newWindowIds) {
                    try { await moveNodeToWorkspace(wid, targetWorkspace) } catch (err) {
                      if (!ctx.silent) p.log.warn(`AeroSpace: failed to move launched window ${wid}: ${String(err)}`)
                    }
                  }
                } else {
                  if (!ctx.silent) p.log.warn("AeroSpace: command entry has none of source/app/command — skipping")
                }

                // Track window-level focus (deferred — D-06)
                if (cmd.focus && newWindowIds.length > 0) {
                  deferredWindowFocus = newWindowIds[0]
                }

                // Accumulate all new window IDs into beforeSet for cross-entry isolation (D-08, PROC-04)
                for (const wid of newWindowIds) {
                  beforeSet.add(wid)
                }
              } catch (err) {
                if (!ctx.silent) p.log.warn(`AeroSpace: command failed: ${String(err)}`)
                // Continue — partial failure acceptable
              }
            }
          }

          // ── Step 4: Layout (per-entry) ──
          if (layout) {
            try {
              const wsWindows = await listWindows()
              const targetWindow = wsWindows.find((w) => w.workspace === targetWorkspace)
              if (targetWindow) {
                await focusWindow(targetWindow.windowId)
                await setLayout(layout, targetWindow.windowId)
              }
              // suppress unused variable warning — normalization read above
              void normalization
            } catch (err) {
              if (!ctx.silent) p.log.warn(`AeroSpace: layout failed for ${targetWorkspace}: ${String(err)}`)
            }
          }

          // Track workspace-level focus (deferred — D-05)
          if (entry.focus === true) {
            deferredWorkspaceFocus = targetWorkspace
          }
        } catch (err) {
          // Skip-and-continue on per-entry failure (D-01)
          if (!ctx.silent) p.log.warn(`AeroSpace: workspace ${targetWorkspace} failed: ${String(err)}`)
        }
      }

      // ── Post-loop: Deferred focus (D-05, D-06) ──
      // Window-level focus: focus a specific window marked with focus: true
      if (deferredWindowFocus !== null) {
        try { await focusWindow(deferredWindowFocus) } catch { /* best effort */ }
      }

      // Workspace-level focus: switch AeroSpace to the target workspace
      if (deferredWorkspaceFocus !== null) {
        try {
          await _exec.run(["workspace", deferredWorkspaceFocus])
        } catch (err) {
          if (!ctx.silent) p.log.warn(`AeroSpace: workspace focus failed: ${String(err)}`)
        }
      }

      // Spinner stop message (D-04)
      spinner?.stop(totalEntries > 1 ? "AeroSpace workspaces ready" : "AeroSpace workspace ready")
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

  commands(parent: Command): void {
    parent
      .command("focus <workspace>")
      .description("Focus the AeroSpace workspace mapped to a git-stacks workspace")
      .action(async (workspaceName: string) => {
        if (!workspaceExists(workspaceName)) {
          console.error(`Workspace '${workspaceName}' not found.`)
          process.exit(1)
        }
        const globalConfig = readGlobalConfig()
        const ws = readWorkspace(workspaceName)
        // Config resolution: workspace override takes precedence (same cascade as open())
        const wsConfig = aerospaceConfigSchema.safeParse(
          ws.settings?.integrations?.["aerospace"] ?? {}
        )
        const gc = aerospaceConfigSchema.safeParse(
          globalConfig.integrations["aerospace"] ?? {}
        )
        const parsed = wsConfig.success ? wsConfig.data : gc.success ? gc.data : undefined
        if (!parsed?.workspaces?.length) {
          console.error(`No AeroSpace workspaces configured for workspace '${workspaceName}'.`)
          process.exit(1)
        }
        // D-05: find focus:true entry, else workspaces[0]
        const focusEntry = parsed.workspaces.find((e) => e.focus === true) ?? parsed.workspaces[0]
        try {
          await _exec.run(["workspace", focusEntry.workspace])
        } catch (err) {
          console.error(`AeroSpace focus failed: ${String(err)}`)
          process.exit(1)
        }
      })
  },
}
