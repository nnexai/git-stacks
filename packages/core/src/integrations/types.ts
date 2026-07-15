import { z } from "zod"

import type { Workspace, GlobalConfig } from "../config"

export interface CommandLike {
  command(specification: string): CommandLike
  description(text: string): CommandLike
  option(flags: string, description?: string, defaultValue?: unknown): CommandLike
  action(handler: (...args: any[]) => unknown): CommandLike
}

export type TmuxArtifact = {
  kind: "tmux"
  sessionName: string
}

export type CmuxArtifact = {
  kind: "cmux"
  workspaceRef: string
}

export type DetectorSnapshot =
  | { available: true; _brand: string; data: unknown }
  | { available: false; _brand: string }

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

  /** Resolves enabled state from global config + workspace-level override */
  isEnabled(ctx: IntegrationContext): boolean

  /**
   * Interactive config prompts run by `git-stacks config`.
   * Receives the current raw config object for this integration (may be `{}`).
   * Returns the updated config object, or null if the user cancelled.
   */
  configurePrompt(current: Record<string, unknown>): Promise<Record<string, unknown> | null>

  /** Launch / activate the integration (open IDE, create terminal session, …) */
  open(ctx: IntegrationContext, artifactPath: string | null, bag: ArtifactBag): Promise<IntegrationArtifact | null>
}

/**
 * Narrow capability interfaces. Plugins compose them at the export site
 * via intersection types: `Integration & Generates & HasCommands`.
 *
 * The presence of an interface's method/property ON the plugin object IS
 * the capability declaration — there is no parallel registry. The runner
 * uses the `is*` predicates below to gate dispatch.
 */

/** Plugin produces an artifact file before `open()` runs. */
export interface Generates {
  generate(ctx: IntegrationContext): string | null
}

/** Plugin has resources that must be torn down on workspace clean/remove. */
export interface Cleans {
  cleanup(ctx: IntegrationContext): Promise<void>
}

/** Plugin contributes subcommands under `git-stacks integration <id>`. */
export interface HasCommands {
  commands(parent: CommandLike): void
}

/** Plugin provides a YAML configuration example for `config example`. */
export interface HasConfigExample {
  configExample: string
}

/** Plugin attaches a WindowDetector consulted by the runner around open(). */
export interface WindowDetecting {
  windowDetector: WindowDetector
}

/** Plugin opts out of certain workspaces (e.g., IntelliJ on non-Java repos). */
export interface Conditional {
  applies(workspace: Workspace): boolean
}

/**
 * Type predicates for runner gating. Each narrows `Integration` to
 * `Integration & X` so the caller can invoke the gated method without
 * a non-null assertion or optional chaining. Method/property presence
 * is the single source of truth.
 */

export function isGenerator(i: Integration): i is Integration & Generates {
  return typeof (i as Partial<Generates>).generate === "function"
}

export function isCleaner(i: Integration): i is Integration & Cleans {
  return typeof (i as Partial<Cleans>).cleanup === "function"
}

export function isConditional(i: Integration): i is Integration & Conditional {
  return typeof (i as Partial<Conditional>).applies === "function"
}

export function isWindowDetecting(i: Integration): i is Integration & WindowDetecting {
  return (i as Partial<WindowDetecting>).windowDetector !== undefined
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
