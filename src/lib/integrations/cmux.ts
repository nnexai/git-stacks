import { prompts as p } from "@/tui/utils"
import { z } from "zod"
import { join } from "path"
import { openCmuxWorkspace, addCmuxPane, addCmuxSurface, sendToCmuxSurface, getCmuxMainPane, focusCmuxSurface } from "../cmux"
import { writeWorkspace, workspaceExists, readWorkspace } from "../config"
import { resolveEnabled, type Integration, type IntegrationContext, type CmuxArtifact } from "./types"

const surfaceSchema = z.object({
  repo: z.string().optional(),
  cwd: z.string().optional(),
  command: z.string().optional(),
  focus: z.boolean().optional(),
})

const paneSchema = z.object({
  direction: z.enum(["down", "right", "up", "left"]).optional(),
  focus: z.boolean().optional(),
  surfaces: z.array(surfaceSchema).default([]),
})

const cmuxWorkspaceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  panes: z.array(paneSchema).optional(),
})

export const cmuxIntegration: Integration = {
  id: "cmux",
  label: "cmux",
  hint: "creates/focuses a cmux workspace",
  enabledByDefault: true,
  order: 20,

  isEnabled: (ctx) => resolveEnabled("cmux", true, ctx),

  async open(ctx, _artifactPath, _bag): Promise<CmuxArtifact | null> {
    const spinner = ctx.silent ? null : p.spinner()
    spinner?.start("Setting up cmux workspace")
    try {
      const { ref, created } = await openCmuxWorkspace(
        ctx.workspace.name,
        ctx.tasksDir,
        ctx.workspace.cmux_workspace_id
      )
      if (workspaceExists(ctx.workspace.name)) {
        const saved = readWorkspace(ctx.workspace.name)
        if (saved.cmux_workspace_id !== ref) {
          writeWorkspace({ ...saved, cmux_workspace_id: ref })
        }
      }

      if (created) {
        await applyPaneLayout(ref, ctx)
      }

      spinner?.stop("cmux workspace ready")
      return { kind: "cmux", workspaceRef: ref }
    } catch (err) {
      spinner?.stop("cmux unavailable — skipped")
      if (!ctx.silent) p.log.warn(`cmux: ${String(err)}`)
      return null
    }
  },

  async configurePrompt(_current) {
    // No extra settings beyond enabled/disabled
    return { enabled: true }
  },
}

async function applyPaneLayout(ref: string, ctx: IntegrationContext): Promise<void> {
  const rawConfig = (ctx.workspace.settings?.integrations?.["cmux"] ?? {}) as unknown
  const parsed = cmuxWorkspaceConfigSchema.safeParse(rawConfig)
  if (!parsed.success || !parsed.data.panes?.length) return

  const wsRoot = join(ctx.tasksDir, ctx.workspace.name)
  const mainPane = await getCmuxMainPane(ref)
  let focusRef: string | null = null

  for (const pane of parsed.data.panes) {
    const isMainPane = pane.direction === undefined
    let currentPaneRef: string
    let paneFirstSurfaceRef: string

    if (isMainPane) {
      currentPaneRef = mainPane.paneRef
      paneFirstSurfaceRef = mainPane.surfaceRef
    } else {
      const newPane = await addCmuxPane(ref, pane.direction)
      if (!newPane) continue
      currentPaneRef = newPane.paneRef
      paneFirstSurfaceRef = newPane.surfaceRef
    }

    for (let i = 0; i < pane.surfaces.length; i++) {
      const surface = pane.surfaces[i]
      let surfaceRef: string
      if (i === 0) {
        surfaceRef = paneFirstSurfaceRef
      } else {
        const newSurface = await addCmuxSurface(ref, currentPaneRef)
        if (!newSurface) continue
        surfaceRef = newSurface
      }

      if (surface.focus) focusRef = surfaceRef

      const cwd = surface.repo
        ? (ctx.workspace.repos.find((r) => r.name === surface.repo)?.task_path ?? wsRoot)
        : (surface.cwd ?? wsRoot)

      await sendToCmuxSurface(ref, surfaceRef, `cd ${cwd}\n`)
      if (surface.command) await sendToCmuxSurface(ref, surfaceRef, `${surface.command}\n`)
    }
  }

  if (focusRef) await focusCmuxSurface(ref, focusRef)
}
