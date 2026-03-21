import * as p from "@clack/prompts"
import { z } from "zod"
import { join } from "path"
import { openTmuxSession, addTmuxPane, sendToTmuxPane, getTmuxMainPane, focusTmuxPane, focusTmuxSession } from "../tmux"
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

const tmuxWorkspaceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  panes: z.array(paneSchema).optional(),
})

export const tmuxIntegration: Integration = {
  id: "tmux",
  label: "tmux",
  hint: "creates/focuses a tmux session",
  enabledByDefault: false,

  isEnabled: (ctx) => resolveEnabled("tmux", false, ctx),

  async open(ctx, _artifactPath, _bag) {
    const spinner = p.spinner()
    spinner.start("Setting up tmux session")
    try {
      const { created } = await openTmuxSession(ctx.workspace.name, ctx.tasksDir)
      if (created) {
        await applyPaneLayout(ctx)
      }
      spinner.stop("tmux session ready")
      await focusTmuxSession(ctx.workspace.name)
    } catch (err) {
      spinner.stop("tmux unavailable — skipped")
      p.log.warn(`tmux: ${String(err)}`)
    }
    return null
  },

  async configurePrompt(_current) {
    // No extra settings beyond enabled/disabled
    return { enabled: true }
  },
}

async function applyPaneLayout(ctx: IntegrationContext): Promise<void> {
  const rawConfig = (ctx.workspace.settings?.integrations?.["tmux"] ?? {}) as unknown
  const parsed = tmuxWorkspaceConfigSchema.safeParse(rawConfig)
  if (!parsed.success || !parsed.data.panes?.length) return

  const session = ctx.workspace.name
  const wsRoot = join(ctx.tasksDir, ctx.workspace.name)
  const mainPaneId = await getTmuxMainPane(session)
  let focusPaneId: string | null = null

  for (const pane of parsed.data.panes) {
    const isMainPane = pane.direction === undefined
    const paneFirstId = isMainPane
      ? mainPaneId
      : await addTmuxPane(session, pane.direction)

    if (!paneFirstId) continue

    if (pane.focus) focusPaneId = paneFirstId

    for (let i = 0; i < pane.surfaces.length; i++) {
      const surface = pane.surfaces[i]
      const paneId = i === 0 ? paneFirstId : await addTmuxPane(session, pane.direction)
      if (!paneId) continue

      const cwd = surface.repo
        ? (ctx.workspace.repos.find((r) => r.name === surface.repo)?.task_path ?? wsRoot)
        : (surface.cwd ?? wsRoot)

      await sendToTmuxPane(paneId, `cd ${cwd}`)
      if (surface.command) await sendToTmuxPane(paneId, surface.command)
    }
  }

  if (focusPaneId) await focusTmuxPane(focusPaneId)
}
