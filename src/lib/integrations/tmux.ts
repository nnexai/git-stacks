import { prompts as p } from "../../tui/utils"
import { z } from "zod"
import { join } from "path"
import type { Command } from "commander"
import { openTmuxSession, addTmuxPane, sendToTmuxPane, getTmuxMainPane, focusTmuxPane, killTmuxSession, tmuxSessionExists, focusTmuxSession } from "../tmux"
import { resolveEnabled, type Cleans, type HasCommands, type HasConfigExample, type Integration, type IntegrationContext, type TmuxArtifact } from "./types"

/** Wrap a string in single quotes, escaping any embedded single quotes. */
function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

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

export const tmuxIntegration: Integration & Cleans & HasCommands & HasConfigExample = {
  id: "tmux",
  label: "tmux",
  hint: "creates/focuses a tmux session",
  enabledByDefault: false,
  order: 12,

  configExample: `integrations:
  tmux:
    enabled: true

# Per-workspace pane layout (in workspace or template YAML):
settings:
  integrations:
    tmux:
      panes:
        - surfaces:                    # main pane (no direction = first pane)
            - command: nvim .
        - direction: right             # split right for tests
          surfaces:
            - command: bun run test --watch
        - direction: down              # split down for dev server
          focus: true
          surfaces:
            - command: bun run dev`,

  isEnabled: (ctx) => resolveEnabled("tmux", false, ctx),

  async open(ctx, _artifactPath, _bag): Promise<TmuxArtifact | null> {
    const spinner = ctx.silent ? null : p.spinner()
    spinner?.start("Setting up tmux session")
    try {
      const { created } = await openTmuxSession(ctx.workspace.name, ctx.tasksDir)
      if (created) {
        await applyPaneLayout(ctx)
      }
      spinner?.stop(`tmux session ready: ${ctx.workspace.name}`)
      return { kind: "tmux", sessionName: ctx.workspace.name }
    } catch (err) {
      spinner?.stop("tmux unavailable — skipped")
      if (!ctx.silent) p.log.warn(`tmux: ${String(err)}`)
      return null
    }
  },

  async configurePrompt(_current) {
    // No extra settings beyond enabled/disabled
    return { enabled: true }
  },

  async cleanup(ctx: IntegrationContext): Promise<void> {
    if (await tmuxSessionExists(ctx.workspace.name)) {
      await killTmuxSession(ctx.workspace.name)
    }
  },

  commands(parent: Command): void {
    parent
      .command("attach [workspace]")
      .description("Attach to a workspace's tmux session")
      .action(async (workspace?: string) => {
        if (!workspace) {
          console.error("Usage: git-stacks integration tmux attach <workspace>")
          process.exit(1)
        }
        await focusTmuxSession(workspace)
      })
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

      await sendToTmuxPane(paneId, `cd ${shellQuote(cwd)}`)
      if (surface.command) await sendToTmuxPane(paneId, surface.command)
    }
  }

  if (focusPaneId) await focusTmuxPane(focusPaneId)
}
