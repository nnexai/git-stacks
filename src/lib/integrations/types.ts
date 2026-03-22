import { z } from "zod"
import type { Workspace, GlobalConfig } from "../config"

export type TmuxArtifact = {
  kind: "tmux"
  sessionName: string
}

export type CmuxArtifact = {
  kind: "cmux"
  workspaceRef: string
}

export type WindowArtifact = {
  kind: "window"
  pid: number
  app_id: string
  title: string
  niriWindowIds?: number[]  // Populated by snapshotWindowIds when niri is running
}

export type IntegrationArtifact = TmuxArtifact | CmuxArtifact | WindowArtifact

export type ArtifactBag = Record<string, IntegrationArtifact | null>

export interface IntegrationContext {
  workspace: Workspace
  tasksDir: string
  config: GlobalConfig
}

export interface Integration {
  /** Unique key — used as the key in config.integrations */
  id: string
  label: string
  hint: string
  /** Used when no explicit config entry exists for this integration */
  enabledByDefault: boolean

  /**
   * Numeric execution priority. Runner sorts ascending before iteration.
   *   tier 1 (10-19): independent setup (vscode, intellij, tmux)
   *   tier 2 (20-29): partial side-effects (cmux)
   *   tier 3 (30-39): window management (niri, future)
   */
  order: number

  /** Return false to skip this integration for a given workspace (e.g. IntelliJ on non-Java repos) */
  applies?(workspace: Workspace): boolean

  /** Resolves enabled state from global config + workspace-level override */
  isEnabled(ctx: IntegrationContext): boolean

  /**
   * Interactive config prompts run by `git-stacks config`.
   * Receives the current raw config object for this integration (may be `{}`).
   * Returns the updated config object, or null if the user cancelled.
   */
  configurePrompt(current: Record<string, unknown>): Promise<Record<string, unknown> | null>

  /**
   * Write artifact files to disk (e.g. .code-workspace, .idea/).
   * Returns the path to the primary artifact, or null if nothing was produced.
   */
  generate?(ctx: IntegrationContext): string | null

  /** Launch / activate the integration (open IDE, create terminal session, …) */
  open(ctx: IntegrationContext, artifactPath: string | null, bag: ArtifactBag): Promise<IntegrationArtifact | null>

  /** Clean up integration resources (e.g., unname niri workspace). Called on workspace clean/remove. */
  cleanup?(ctx: IntegrationContext): Promise<void>
}

const enabledSchema = z.object({ enabled: z.boolean() })

/** Resolve whether an integration is enabled, respecting workspace-level overrides. */
export function resolveEnabled(
  id: string,
  enabledByDefault: boolean,
  ctx: IntegrationContext
): boolean {
  const wsResult = enabledSchema.safeParse(ctx.workspace.settings?.integrations?.[id])
  if (wsResult.success) return wsResult.data.enabled
  const globalResult = enabledSchema.safeParse(ctx.config.integrations[id])
  if (globalResult.success) return globalResult.data.enabled
  return enabledByDefault
}

/** Resolve enabled state from global config only (no workspace context). */
export function resolveEnabledGlobally(
  id: string,
  enabledByDefault: boolean,
  config: GlobalConfig
): boolean {
  const result = enabledSchema.safeParse(config.integrations[id])
  return result.success ? result.data.enabled : enabledByDefault
}
