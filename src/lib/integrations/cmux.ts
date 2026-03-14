import * as p from "@clack/prompts"
import { z } from "zod"
import { join } from "path"
import { openCmuxWorkspace, addCmuxPane, sendToCmuxSurface, getCmuxMainSurface, focusCmuxSurface } from "../cmux"
import { writeWorkspace, workspaceExists, readWorkspace } from "../config"
import { resolveEnabled, type Integration, type IntegrationContext } from "./types"

const surfaceSchema = z.object({
  repo: z.string().optional(),
  cwd: z.string().optional(),
  command: z.string().optional(),
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

  isEnabled: (ctx) => resolveEnabled("cmux", true, ctx),

  async open(ctx, _artifactPath) {
    const spinner = p.spinner()
    spinner.start("Setting up cmux workspace")
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

      spinner.stop("cmux workspace ready")
    } catch (err) {
      spinner.stop("cmux unavailable — skipped")
      p.log.warn(`cmux: ${String(err)}`)
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
  const mainSurfaceRef = await getCmuxMainSurface(ref)
  let focusRef: string | null = null

  for (const pane of parsed.data.panes) {
    const isMainPane = pane.direction === undefined
    const paneFirstSurface = isMainPane
      ? mainSurfaceRef
      : await addCmuxPane(ref, pane.direction)

    if (!paneFirstSurface) continue

    if (pane.focus) focusRef = paneFirstSurface

    for (let i = 0; i < pane.surfaces.length; i++) {
      const surface = pane.surfaces[i]
      const surfaceRef = i === 0 ? paneFirstSurface : await addCmuxPane(ref, pane.direction)
      if (!surfaceRef) continue

      const cwd = surface.repo
        ? (ctx.workspace.repos.find((r) => r.name === surface.repo)?.task_path ?? wsRoot)
        : (surface.cwd ?? wsRoot)

      await sendToCmuxSurface(ref, surfaceRef, `cd ${cwd}\n`)
      if (surface.command) await sendToCmuxSurface(ref, surfaceRef, `${surface.command}\n`)
    }
  }

  if (focusRef) await focusCmuxSurface(ref, focusRef)
}
