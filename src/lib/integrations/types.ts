import { z } from "zod"
import type { Command } from "commander"
import type { Workspace, GlobalConfig } from "../config"

export type TmuxArtifact = {
  kind: "tmux"
  sessionName: string
}

export type CmuxArtifact = {
  kind: "cmux"
  workspaceRef: string
}

export type DetectorSnapshot = { _brand: string; data: unknown }

export interface WindowDetector {
  id: string
  begin(): Promise<DetectorSnapshot>
  resolve(snapshot: DetectorSnapshot, hints?: { pid?: number; app_id?: string }): Promise<number[]>
}

export type WindowArtifact = {
  kind: "window"
  pid: number
  app_id: string
  title: string
  windowIds?: Record<string, number[]>  // Populated by runner via WindowDetector instances
}

export type IntegrationArtifact = TmuxArtifact | CmuxArtifact | WindowArtifact

export type ArtifactBag = Record<string, IntegrationArtifact | null>

export interface IntegrationContext {
  workspace: Workspace
  tasksDir: string
  config: GlobalConfig
  silent?: boolean
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

  /** Register helper subcommands under `git-stacks integration <id>`. */
  commands?(parent: Command): void

  /** Static YAML snippet showing how to configure this integration. Printed by `config example`. */
  configExample?: string

  /**
   * Optional window ID detector. When present, runner.ts calls begin() before open()
   * and resolve() after open() for any integration that returns a WindowArtifact.
   * Results are merged into artifact.windowIds keyed by this detector's id.
   * Tier-1 integrations (vscode, intellij) no longer handle detection themselves.
   */
  windowDetector?: WindowDetector
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
