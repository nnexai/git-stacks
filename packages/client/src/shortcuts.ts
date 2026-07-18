import {
  WEB_SCOPED_SHORTCUT_ACTION_IDS,
  WEB_SHORTCUT_ACTION_IDS,
  type WebScopedShortcutActionId,
  type WebShortcutActionId,
  type WebShortcutBinding,
  type WebShortcutEffectiveBinding,
  type WebShortcutPlatform,
  type WebShortcutSettings,
} from "@git-stacks/protocol"

export type ShortcutCategory = "navigation" | "workspace" | "terminal"

export type ShortcutActionMetadata = {
  actionId: WebShortcutActionId
  label: string
  category: ShortcutCategory
  defaultCode: WebShortcutBinding["code"]
  tuiKey?: string
}

export type ScopedShortcutScope = "stale-view"

export type ScopedShortcutActionMetadata = {
  actionId: WebScopedShortcutActionId
  scope: ScopedShortcutScope
  label: string
  accessibilityText: string
  web: Readonly<{ code: WebShortcutBinding["code"]; label: string }>
  tui: Readonly<{ key: string }>
}

const scopedActionMetadata: Record<
  WebScopedShortcutActionId,
  Omit<ScopedShortcutActionMetadata, "actionId">
> = {
  [WEB_SCOPED_SHORTCUT_ACTION_IDS[0]]: {
    scope: "stale-view",
    label: "Refresh evidence",
    accessibilityText: "Refresh stale workspace evidence",
    web: Object.freeze({ code: "KeyR", label: "R" }),
    tui: Object.freeze({ key: "r" }),
  },
}

export const WEB_SCOPED_SHORTCUT_ACTION_METADATA: readonly ScopedShortcutActionMetadata[] = Object.freeze(
  WEB_SCOPED_SHORTCUT_ACTION_IDS.map((actionId) => Object.freeze({ actionId, ...scopedActionMetadata[actionId] })),
)

const actionMetadata: Record<WebShortcutActionId, Omit<ShortcutActionMetadata, "actionId">> = {
  "workspace.switch": { label: "Switch workspace", category: "navigation", defaultCode: "KeyK" },
  "commands.open": { label: "Configured commands", category: "navigation", defaultCode: "KeyP" },
  "workspace.new": { label: "New workspace", category: "workspace", defaultCode: "KeyN" },
  "terminal.new": { label: "New terminal", category: "terminal", defaultCode: "KeyT" },
  "terminal.close": { label: "Close terminal", category: "terminal", defaultCode: "KeyW" },
  "terminal.previous": { label: "Previous terminal", category: "terminal", defaultCode: "KeyJ" },
  "terminal.next": { label: "Next terminal", category: "terminal", defaultCode: "KeyL" },
  "attention.next": { label: "Next attention", category: "navigation", defaultCode: "KeyA" },
  "workspace.stale": { label: "Open stale workspaces", category: "workspace", defaultCode: "KeyS", tuiKey: "s" },
}

export const WEB_SHORTCUT_ACTION_METADATA: readonly ShortcutActionMetadata[] = Object.freeze(
  WEB_SHORTCUT_ACTION_IDS.map((actionId) => Object.freeze({ actionId, ...actionMetadata[actionId] })),
)

const metadataByAction = new Map(WEB_SHORTCUT_ACTION_METADATA.map((metadata) => [metadata.actionId, metadata]))

export type ShortcutKeyEvent = {
  type?: string
  code: string
  key?: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  isComposing?: boolean
  repeat?: boolean
  getModifierState?(keyArg: string): boolean
}

export type ShortcutUnhandledReason =
  | "not-keydown"
  | "composing"
  | "alt-graph"
  | "invalid-code"
  | "unsafe-binding"
  | "unmatched"

export type ShortcutMatch =
  | {
      handled: true
      actionId: WebShortcutActionId
      binding: WebShortcutBinding
      source: "primary" | "alias"
      aliasIndex?: number
      repeat: boolean
    }
  | { handled: false; reason: ShortcutUnhandledReason }

export type ScopedShortcutMatch =
  | {
      handled: true
      actionId: WebScopedShortcutActionId
      metadata: ScopedShortcutActionMetadata
    }
  | { handled: false; reason: ShortcutUnhandledReason | "inactive-scope" | "repeat" }

export type ShortcutConflict = {
  binding: WebShortcutBinding
  bindingKey: string
  ownerActionId: WebShortcutActionId
  ownerLabel: string
  ownerSource: "primary" | "alias"
  aliasIndex?: number
  conflictingActionId: WebShortcutActionId
  conflictingLabel: string
}

export type ShortcutValidation = { valid: true } | { valid: false; conflict?: ShortcutConflict; reason?: "unsafe-binding" | "incomplete-inventory" }

export function bindingKey(binding: WebShortcutBinding): string {
  return `${binding.code}:${Number(binding.ctrl)}${Number(binding.alt)}${Number(binding.shift)}${Number(binding.meta)}`
}

export function isUsableShortcutBinding(binding: WebShortcutBinding): boolean {
  return /^Key[A-Z]$/.test(binding.code) && (binding.ctrl || binding.alt || binding.shift || binding.meta)
}

function defaultModifiers(platform: WebShortcutPlatform): Omit<WebShortcutBinding, "code"> {
  return platform === "macos"
    ? { ctrl: true, alt: false, shift: false, meta: true }
    : { ctrl: true, alt: true, shift: true, meta: false }
}

export function defaultShortcutSettings(platform: WebShortcutPlatform, revision = "defaults"): WebShortcutSettings {
  const modifiers = defaultModifiers(platform)
  return {
    platform,
    revision,
    bindings: WEB_SHORTCUT_ACTION_METADATA.map(({ actionId, defaultCode }) => ({
      action_id: actionId,
      primary: { code: defaultCode, ...modifiers },
      aliases: [],
    })),
  }
}

function logicalKeyCode(event: ShortcutKeyEvent): WebShortcutBinding["code"] | undefined {
  const key = event.key?.toLocaleUpperCase("en-US")
  return key && /^[A-Z]$/.test(key) ? `Key${key}` : undefined
}

function eventBinding(event: ShortcutKeyEvent): WebShortcutBinding | undefined {
  const code = logicalKeyCode(event)
  if (!code) return undefined
  return {
    code,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  }
}

function eventRejection(event: ShortcutKeyEvent): Exclude<ShortcutUnhandledReason, "unsafe-binding" | "unmatched"> | undefined {
  if (event.type !== "keydown") return "not-keydown"
  if (event.isComposing || event.key === "Process" || event.key === "Dead") return "composing"
  if (event.getModifierState?.("AltGraph")) return "alt-graph"
  if (!logicalKeyCode(event)) return "invalid-code"
  return undefined
}

export function matchScopedShortcutEvent(
  event: ShortcutKeyEvent,
  activeScope: ScopedShortcutScope | undefined,
): ScopedShortcutMatch {
  const rejected = eventRejection(event)
  if (rejected) return { handled: false, reason: rejected }
  if (activeScope === undefined) return { handled: false, reason: "inactive-scope" }
  if (event.repeat) return { handled: false, reason: "repeat" }
  if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
    return { handled: false, reason: "unmatched" }
  }

  const logicalCode = logicalKeyCode(event)
  const metadata = WEB_SCOPED_SHORTCUT_ACTION_METADATA.find((candidate) =>
    candidate.scope === activeScope && candidate.web.code === logicalCode)
  return metadata
    ? { handled: true, actionId: metadata.actionId, metadata }
    : { handled: false, reason: "unmatched" }
}

export function matchShortcutEvent(event: ShortcutKeyEvent, settings: Pick<WebShortcutSettings, "bindings">): ShortcutMatch {
  const rejected = eventRejection(event)
  if (rejected) return { handled: false, reason: rejected }

  const normalized = eventBinding(event)
  if (!normalized) return { handled: false, reason: "invalid-code" }
  const key = bindingKey(normalized)
  for (const effective of settings.bindings) {
    if (effective.primary && bindingKey(effective.primary) === key) {
      if (!isUsableShortcutBinding(effective.primary)) return { handled: false, reason: "unsafe-binding" }
      return {
        handled: true,
        actionId: effective.action_id,
        binding: effective.primary,
        source: "primary",
        repeat: event.repeat === true,
      }
    }
    const aliasIndex = effective.aliases.findIndex((alias) => bindingKey(alias) === key)
    if (aliasIndex !== -1) {
      const alias = effective.aliases[aliasIndex]!
      if (!isUsableShortcutBinding(alias)) return { handled: false, reason: "unsafe-binding" }
      return {
        handled: true,
        actionId: effective.action_id,
        binding: alias,
        source: "alias",
        aliasIndex,
        repeat: event.repeat === true,
      }
    }
  }
  return { handled: false, reason: "unmatched" }
}

type BindingOwner = {
  actionId: WebShortcutActionId
  source: "primary" | "alias"
  binding: WebShortcutBinding
  aliasIndex?: number
}

function bindingOwners(bindings: readonly WebShortcutEffectiveBinding[]): BindingOwner[] {
  return bindings.flatMap((effective) => [
    ...(effective.primary ? [{ actionId: effective.action_id, source: "primary" as const, binding: effective.primary }] : []),
    ...effective.aliases.map((alias, aliasIndex) => ({ actionId: effective.action_id, source: "alias" as const, binding: alias, aliasIndex })),
  ])
}

function conflictFor(owner: BindingOwner, candidate: WebShortcutBinding, conflictingActionId: WebShortcutActionId): ShortcutConflict {
  return {
    binding: candidate,
    bindingKey: bindingKey(candidate),
    ownerActionId: owner.actionId,
    ownerLabel: metadataByAction.get(owner.actionId)?.label ?? owner.actionId,
    ownerSource: owner.source,
    ...(owner.aliasIndex === undefined ? {} : { aliasIndex: owner.aliasIndex }),
    conflictingActionId,
    conflictingLabel: metadataByAction.get(conflictingActionId)?.label ?? conflictingActionId,
  }
}

export function findShortcutConflict(
  bindings: readonly WebShortcutEffectiveBinding[],
  candidate: WebShortcutBinding,
  conflictingActionId: WebShortcutActionId,
): ShortcutConflict | undefined {
  const key = bindingKey(candidate)
  const owner = bindingOwners(bindings).find((entry) => entry.actionId !== conflictingActionId && bindingKey(entry.binding) === key)
  return owner ? conflictFor(owner, candidate, conflictingActionId) : undefined
}

export function validateShortcutSettings(settings: Pick<WebShortcutSettings, "bindings">): ShortcutValidation {
  const inventory = new Set(settings.bindings.map(({ action_id }) => action_id))
  if (settings.bindings.length !== WEB_SHORTCUT_ACTION_IDS.length || WEB_SHORTCUT_ACTION_IDS.some((actionId) => !inventory.has(actionId))) {
    return { valid: false, reason: "incomplete-inventory" }
  }

  const owners = new Map<string, BindingOwner>()
  for (const owner of bindingOwners(settings.bindings)) {
    if (!isUsableShortcutBinding(owner.binding)) return { valid: false, reason: "unsafe-binding" }
    const key = bindingKey(owner.binding)
    const existing = owners.get(key)
    if (existing) return { valid: false, conflict: conflictFor(existing, owner.binding, owner.actionId) }
    owners.set(key, owner)
  }
  return { valid: true }
}

export function formatShortcutBinding(binding: WebShortcutBinding, platform: WebShortcutPlatform): string {
  const parts: string[] = []
  if (binding.ctrl) parts.push(platform === "macos" ? "Control" : "Ctrl")
  if (binding.alt) parts.push(platform === "macos" ? "Option" : "Alt")
  if (binding.shift) parts.push("Shift")
  if (binding.meta) parts.push(platform === "macos" ? "Command" : "Meta")
  parts.push(binding.code.slice(3))
  return parts.join("+")
}
