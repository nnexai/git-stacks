import { createHash } from "node:crypto"

import {
  readGlobalConfig,
  updateGlobalConfig,
  type GlobalConfig,
} from "./config.js"

export const WEB_SHORTCUT_ACTION_IDS = [
  "workspace.switch",
  "commands.open",
  "workspace.new",
  "terminal.new",
  "terminal.close",
  "terminal.previous",
  "terminal.next",
  "attention.next",
] as const

export type WebShortcutActionId = typeof WEB_SHORTCUT_ACTION_IDS[number]
export type WebShortcutPlatform = "macos" | "linux"
export type WebShortcutBinding = {
  code: `Key${string}`
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}
export type WebShortcutEffectiveBinding = {
  action_id: WebShortcutActionId
  primary: WebShortcutBinding | null
  aliases: WebShortcutBinding[]
}
export type WebShortcutSettings = {
  platform: WebShortcutPlatform
  revision: string
  bindings: WebShortcutEffectiveBinding[]
}
export type WebShortcutMutationIntent = {
  platform: WebShortcutPlatform
  action_id: WebShortcutActionId
  expected_revision: string
} & (
  | { intent: "set-primary"; binding: WebShortcutBinding }
  | { intent: "set-aliases"; aliases: WebShortcutBinding[] }
  | { intent: "unbind" }
  | { intent: "reset" }
)

const binding = (
  code: `Key${string}`,
  modifiers: Pick<WebShortcutBinding, "ctrl" | "alt" | "shift" | "meta">,
): WebShortcutBinding => ({ code, ...modifiers })

const macosModifiers = { ctrl: true, alt: false, shift: false, meta: true } as const
const linuxModifiers = { ctrl: true, alt: true, shift: true, meta: false } as const
const actionKeys = ["K", "P", "N", "T", "W", "J", "L", "A"] as const

function defaults(modifiers: typeof macosModifiers | typeof linuxModifiers): Record<WebShortcutActionId, WebShortcutBinding> {
  return Object.fromEntries(WEB_SHORTCUT_ACTION_IDS.map((actionId, index) => [
    actionId,
    binding(`Key${actionKeys[index]}`, modifiers),
  ])) as Record<WebShortcutActionId, WebShortcutBinding>
}

export const WEB_SHORTCUT_DEFAULTS = Object.freeze({
  macos: Object.freeze(defaults(macosModifiers)),
  linux: Object.freeze(defaults(linuxModifiers)),
})

export class WebShortcutStaleRevisionError extends Error {
  readonly code = "shortcut_revision_conflict" as const
  constructor() {
    super("Shortcut settings changed since they were loaded")
    this.name = "WebShortcutStaleRevisionError"
  }
}

export class WebShortcutConflictError extends Error {
  readonly code = "shortcut_conflict" as const
  constructor(
    readonly actionId: WebShortcutActionId,
    readonly conflictActionId: WebShortcutActionId,
  ) {
    super(`Shortcut for ${actionId} conflicts with ${conflictActionId}`)
    this.name = "WebShortcutConflictError"
  }
}

export class WebShortcutValidationError extends Error {
  readonly code = "shortcut_validation" as const
  constructor(message: string) {
    super(message)
    this.name = "WebShortcutValidationError"
  }
}

type ShortcutOverride = NonNullable<
  NonNullable<NonNullable<GlobalConfig["web"]>["shortcuts"]>[WebShortcutPlatform]
>[WebShortcutActionId]

const actionIds = new Set<string>(WEB_SHORTCUT_ACTION_IDS)

function cloneBinding(value: WebShortcutBinding): WebShortcutBinding {
  return { ...value }
}

function bindingKey(value: WebShortcutBinding): string {
  return `${value.code}:${Number(value.ctrl)}${Number(value.alt)}${Number(value.shift)}${Number(value.meta)}`
}

function validateBinding(value: WebShortcutBinding): void {
  if (!/^Key[A-Z]$/.test(value.code)
    || typeof value.ctrl !== "boolean"
    || typeof value.alt !== "boolean"
    || typeof value.shift !== "boolean"
    || typeof value.meta !== "boolean") {
    throw new WebShortcutValidationError("Shortcut binding must use a normalized physical letter and explicit modifiers")
  }
  if (!value.ctrl && !value.alt && !value.meta) {
    throw new WebShortcutValidationError("Shortcut binding must include Ctrl, Alt, or Command")
  }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stable(item)]))
}

export function webShortcutRevision(config: GlobalConfig): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(stable(config.web?.shortcuts ?? {})))
    .digest("hex")
  return BigInt(`0x${digest.slice(0, 16)}`).toString(10)
}

function effectiveBindings(config: GlobalConfig, platform: WebShortcutPlatform): WebShortcutEffectiveBinding[] {
  const overrides = config.web?.shortcuts?.[platform]
  return WEB_SHORTCUT_ACTION_IDS.map((actionId) => {
    const override = overrides?.[actionId] as ShortcutOverride | undefined
    return {
      action_id: actionId,
      primary: override && "primary" in override
        ? override.primary === null ? null : cloneBinding(override.primary as WebShortcutBinding)
        : cloneBinding(WEB_SHORTCUT_DEFAULTS[platform][actionId]),
      aliases: override?.aliases?.map((alias) => cloneBinding(alias as WebShortcutBinding)) ?? [],
    }
  })
}

function validateRegistry(bindings: WebShortcutEffectiveBinding[]): void {
  const claimed = new Map<string, WebShortcutActionId>()
  for (const row of bindings) {
    for (const value of [...(row.primary ? [row.primary] : []), ...row.aliases]) {
      validateBinding(value)
      const key = bindingKey(value)
      const prior = claimed.get(key)
      if (prior) throw new WebShortcutConflictError(row.action_id, prior)
      claimed.set(key, row.action_id)
    }
  }
}

function settings(config: GlobalConfig, platform: WebShortcutPlatform): WebShortcutSettings {
  const bindings = effectiveBindings(config, platform)
  validateRegistry(bindings)
  return { platform, revision: webShortcutRevision(config), bindings }
}

export function readWebShortcutSettings(
  platform: WebShortcutPlatform,
  dependencies: { readGlobalConfig: () => GlobalConfig } = { readGlobalConfig },
): WebShortcutSettings {
  if (platform !== "macos" && platform !== "linux") throw new WebShortcutValidationError("Unknown shortcut platform")
  return settings(dependencies.readGlobalConfig(), platform)
}

function applyMutation(config: GlobalConfig, mutation: WebShortcutMutationIntent): GlobalConfig {
  if (!actionIds.has(mutation.action_id)) throw new WebShortcutValidationError("Unknown shortcut action")

  const shortcuts = structuredClone(config.web?.shortcuts ?? {})
  const platform = { ...(shortcuts[mutation.platform] ?? {}) }
  const current = { ...(platform[mutation.action_id] ?? {}) }

  switch (mutation.intent) {
    case "set-primary":
      validateBinding(mutation.binding)
      platform[mutation.action_id] = { ...current, primary: cloneBinding(mutation.binding) }
      break
    case "set-aliases":
      if (mutation.aliases.length > 4) throw new WebShortcutValidationError("Shortcut aliases exceed the supported limit")
      mutation.aliases.forEach(validateBinding)
      platform[mutation.action_id] = { ...current, aliases: mutation.aliases.map(cloneBinding) }
      break
    case "unbind":
      platform[mutation.action_id] = { primary: null, aliases: [] }
      break
    case "reset":
      delete platform[mutation.action_id]
      break
  }

  shortcuts[mutation.platform] = platform
  return { ...config, web: { ...config.web, shortcuts } }
}

export function updateWebShortcutSettings(
  mutation: WebShortcutMutationIntent,
  dependencies: {
    updateGlobalConfig: (intent: (current: GlobalConfig) => GlobalConfig) => GlobalConfig
  } = { updateGlobalConfig },
): WebShortcutSettings {
  if ((mutation.platform !== "macos" && mutation.platform !== "linux") || !actionIds.has(mutation.action_id)) {
    throw new WebShortcutValidationError("Unknown shortcut platform or action")
  }

  const next = dependencies.updateGlobalConfig((current) => {
    if (webShortcutRevision(current) !== mutation.expected_revision) throw new WebShortcutStaleRevisionError()
    const candidate = applyMutation(current, mutation)
    validateRegistry(effectiveBindings(candidate, "macos"))
    validateRegistry(effectiveBindings(candidate, "linux"))
    return candidate
  })
  return settings(next, mutation.platform)
}
