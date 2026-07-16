import {
  WEB_SHORTCUT_ACTION_METADATA,
  matchShortcutEvent,
  validateShortcutSettings,
  type ShortcutCategory,
  type ShortcutKeyEvent,
} from "@git-stacks/client"
import type {
  WebShortcutActionId,
  WebShortcutEffectiveBinding,
  WebShortcutSettings,
} from "@git-stacks/protocol"

export type WebActionSource = "document" | "xterm"
export type WebActionInvocation = {
  actionId: WebShortcutActionId
  kind: "execute" | "refocus"
  source: WebActionSource
}

export type WebActionAvailability =
  | { available: true; disabledReason?: never }
  | { available: false; disabledReason: string }

export type WebActionRegistration = {
  callback: (invocation: WebActionInvocation) => void
  availability?: () => WebActionAvailability
}

export type WebActionRegistryEntry = {
  actionId: WebShortcutActionId
  label: string
  category: ShortcutCategory
  effectiveBinding?: WebShortcutEffectiveBinding
  availability: WebActionAvailability
  repeatPolicy: "suppress" | "refocus"
  callback: WebActionRegistration["callback"]
}

export type WebActionDispatchResult = {
  consumed: boolean
  executed: boolean
  actionId?: WebShortcutActionId
  disabledReason?: string
  ownership?: WebActionSource
}

export type WebActionRegistry = {
  entries(): WebActionRegistryEntry[]
  entry(actionId: WebShortcutActionId): WebActionRegistryEntry | undefined
  setSettings(settings: WebShortcutSettings | undefined): void
  dispatch(event: ShortcutKeyEvent, source: WebActionSource): WebActionDispatchResult
}

const repeatRefocusActions = new Set<WebShortcutActionId>(["workspace.switch", "commands.open"])
const settingsUnavailable: WebActionAvailability = {
  available: false,
  disabledReason: "Shortcut settings are not loaded.",
}

export function createWebActionRegistry(
  registrations: Record<WebShortcutActionId, WebActionRegistration>,
): WebActionRegistry {
  let settings: WebShortcutSettings | undefined

  const effectiveBinding = (actionId: WebShortcutActionId) =>
    settings?.bindings.find((binding) => binding.action_id === actionId)

  const entry = (actionId: WebShortcutActionId): WebActionRegistryEntry | undefined => {
    const metadata = WEB_SHORTCUT_ACTION_METADATA.find((candidate) => candidate.actionId === actionId)
    if (!metadata) return undefined
    const registration = registrations[actionId]
    return {
      actionId,
      label: metadata.label,
      category: metadata.category,
      effectiveBinding: effectiveBinding(actionId),
      availability: settings ? (registration.availability?.() ?? { available: true }) : settingsUnavailable,
      repeatPolicy: repeatRefocusActions.has(actionId) ? "refocus" : "suppress",
      callback: registration.callback,
    }
  }

  return {
    entries: () => WEB_SHORTCUT_ACTION_METADATA.map(({ actionId }) => entry(actionId)!),
    entry,
    setSettings(next) {
      if (next && !validateShortcutSettings(next).valid) throw new Error("Invalid authoritative shortcut settings")
      settings = next
    },
    dispatch(event, source) {
      if (!settings) return { consumed: false, executed: false }
      const match = matchShortcutEvent(event, settings)
      if (!match.handled) return { consumed: false, executed: false }
      const action = entry(match.actionId)!
      if (!action.availability.available) {
        return {
          consumed: true,
          executed: false,
          actionId: action.actionId,
          disabledReason: action.availability.disabledReason,
          ownership: source,
        }
      }
      if (match.repeat && action.repeatPolicy === "suppress") {
        return { consumed: true, executed: false, actionId: action.actionId, ownership: source }
      }
      const invocation: WebActionInvocation = {
        actionId: action.actionId,
        kind: match.repeat ? "refocus" : "execute",
        source,
      }
      action.callback(invocation)
      return { consumed: true, executed: true, actionId: action.actionId, ownership: source }
    },
  }
}

type BoundaryKeyEvent = ShortcutKeyEvent & {
  preventDefault?(): void
  stopPropagation?(): void
}

export type WebShortcutDispatcher = {
  handleDocument(event: BoundaryKeyEvent): WebActionDispatchResult
  handleXterm(event: BoundaryKeyEvent): boolean
}

export function createWebShortcutDispatcher(registry: WebActionRegistry): WebShortcutDispatcher {
  const owners = new WeakMap<object, WebActionSource>()

  const ownedResult = (event: BoundaryKeyEvent): WebActionDispatchResult | undefined => {
    const ownership = owners.get(event)
    return ownership ? { consumed: true, executed: false, ownership } : undefined
  }
  const dispatch = (event: BoundaryKeyEvent, source: WebActionSource): WebActionDispatchResult => {
    const owned = ownedResult(event)
    if (owned) return owned
    const result = registry.dispatch(event, source)
    if (!result.consumed) return result
    owners.set(event, source)
    event.preventDefault?.()
    event.stopPropagation?.()
    return result
  }

  return {
    handleDocument: (event) => dispatch(event, "document"),
    handleXterm(event) {
      return !dispatch(event, "xterm").consumed
    },
  }
}
