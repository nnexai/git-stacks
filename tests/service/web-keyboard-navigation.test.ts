import { describe, expect, test } from "@test/api"
import {
  WEB_SHORTCUT_ACTION_METADATA,
  defaultShortcutSettings,
} from "../../packages/client/src/index"
import { WEB_SHORTCUT_ACTION_IDS, type WebShortcutActionId } from "../../packages/protocol/src/web"
import {
  createWebActionRegistry,
  createWebShortcutDispatcher,
  type WebActionInvocation,
  type WebActionRegistration,
} from "../../packages/web/src/navigation"

type EventFixture = {
  type: string
  code: string
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  isComposing: boolean
  repeat: boolean
  preventDefault: () => void
  stopPropagation: () => void
  getModifierState: (name: string) => boolean
  prevented: number
  stopped: number
}

function keyEvent(
  code: string,
  modifiers: Partial<Pick<EventFixture, "type" | "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "isComposing" | "repeat">> = {},
  altGraph = false,
): EventFixture {
  const event: EventFixture = {
    type: "keydown",
    code,
    key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    isComposing: false,
    repeat: false,
    prevented: 0,
    stopped: 0,
    preventDefault: () => { event.prevented += 1 },
    stopPropagation: () => { event.stopped += 1 },
    getModifierState: (name) => name === "AltGraph" && altGraph,
    ...modifiers,
  }
  return event
}

function linuxEvent(code: string, extra: Parameters<typeof keyEvent>[1] = {}): EventFixture {
  return keyEvent(code, { ctrlKey: true, altKey: true, shiftKey: true, ...extra })
}

function harness(options: { unavailable?: WebShortcutActionId } = {}) {
  const calls: Array<{ actionId: WebShortcutActionId; invocation: WebActionInvocation }> = []
  const registrations = Object.fromEntries(WEB_SHORTCUT_ACTION_IDS.map((actionId) => [
    actionId,
    {
      callback: (invocation: WebActionInvocation) => { calls.push({ actionId, invocation }) },
      availability: () => options.unavailable === actionId
        ? { available: false, disabledReason: "Unavailable in this fixture." }
        : { available: true },
    } satisfies WebActionRegistration,
  ])) as Record<WebShortcutActionId, WebActionRegistration>
  const registry = createWebActionRegistry(registrations)
  registry.setSettings(defaultShortcutSettings("linux", "fixture"))
  return { registry, dispatcher: createWebShortcutDispatcher(registry), calls }
}

describe("web keyboard navigation boundary", () => {
  test("exposes one complete canonical registry with effective bindings and availability", () => {
    const { registry } = harness({ unavailable: "terminal.close" })
    expect(registry.entries()).toHaveLength(8)
    expect(registry.entries().map(({ actionId }) => actionId)).toEqual(WEB_SHORTCUT_ACTION_IDS)
    expect(registry.entries().map(({ actionId, label, category }) => ({ actionId, label, category }))).toEqual(
      WEB_SHORTCUT_ACTION_METADATA.map(({ actionId, label, category }) => ({ actionId, label, category })),
    )
    expect(registry.entry("terminal.close")).toMatchObject({
      actionId: "terminal.close",
      effectiveBinding: { action_id: "terminal.close", primary: { code: "KeyW" } },
      availability: { available: false, disabledReason: "Unavailable in this fixture." },
      repeatPolicy: "suppress",
    })
    expect(registry.entry("commands.open")?.repeatPolicy).toBe("refocus")
  })

  test("executes a handled xterm event once and gives that event one owner", () => {
    const { dispatcher, calls } = harness()
    const event = linuxEvent("KeyT")

    expect(dispatcher.handleXterm(event)).toBe(false)
    expect(calls).toEqual([{ actionId: "terminal.new", invocation: { actionId: "terminal.new", kind: "execute", source: "xterm" } }])
    expect(event.prevented).toBe(1)
    expect(event.stopped).toBe(1)
    expect(dispatcher.handleDocument(event)).toMatchObject({ consumed: true, executed: false, ownership: "xterm" })
    expect(calls).toHaveLength(1)
    expect(event.prevented).toBe(1)
    expect(event.stopped).toBe(1)
  })

  test("suppresses recognized direct repeats while keeping them consumed at both boundaries", () => {
    for (const action of [
      ["terminal.new", "KeyT"],
      ["terminal.close", "KeyW"],
      ["terminal.previous", "KeyJ"],
      ["terminal.next", "KeyL"],
      ["attention.next", "KeyA"],
    ] as const) {
      const xterm = harness()
      const xtermEvent = linuxEvent(action[1], { repeat: true })
      expect(xterm.dispatcher.handleXterm(xtermEvent), action[0]).toBe(false)
      expect(xterm.calls, action[0]).toEqual([])
      expect(xtermEvent.prevented, action[0]).toBe(1)
      expect(xtermEvent.stopped, action[0]).toBe(1)

      const documentBoundary = harness()
      const documentEvent = linuxEvent(action[1], { repeat: true })
      expect(documentBoundary.dispatcher.handleDocument(documentEvent), action[0]).toMatchObject({ consumed: true, executed: false })
      expect(documentBoundary.calls, action[0]).toEqual([])
      expect(documentEvent.prevented, action[0]).toBe(1)
      expect(documentEvent.stopped, action[0]).toBe(1)
    }
  })

  test("turns recognized overlay repeats into one refocus invocation", () => {
    for (const [actionId, code] of [["workspace.switch", "KeyK"], ["commands.open", "KeyP"]] as const) {
      const { dispatcher, calls } = harness()
      const event = linuxEvent(code, { repeat: true })
      expect(dispatcher.handleXterm(event)).toBe(false)
      expect(calls).toEqual([{ actionId, invocation: { actionId, kind: "refocus", source: "xterm" } }])
    }
  })

  test("consumes an unavailable registered action without invoking its callback", () => {
    const { dispatcher, calls } = harness({ unavailable: "terminal.close" })
    const event = linuxEvent("KeyW")
    expect(dispatcher.handleDocument(event)).toMatchObject({
      actionId: "terminal.close",
      consumed: true,
      executed: false,
      disabledReason: "Unavailable in this fixture.",
    })
    expect(calls).toEqual([])
    expect(event.prevented).toBe(1)
    expect(event.stopped).toBe(1)
  })

  test("passes unmatched, rejected, familiar, and legacy defaults through unchanged", () => {
    const legacy = [
      keyEvent("KeyK", { ctrlKey: true }),
      keyEvent("KeyP", { ctrlKey: true, shiftKey: true }),
      keyEvent("KeyT", { ctrlKey: true, shiftKey: true }),
      keyEvent("KeyT", { metaKey: true, shiftKey: true }),
      keyEvent("PageUp", { ctrlKey: true }),
      keyEvent("PageDown", { ctrlKey: true }),
    ]
    const rejected = [
      linuxEvent("KeyT", { type: "keyup" }),
      linuxEvent("KeyT", { isComposing: true }),
      keyEvent("KeyT", { ctrlKey: true, altKey: true, shiftKey: true }, true),
      linuxEvent("Semicolon"),
    ]
    for (const event of [...legacy, ...rejected]) {
      const { dispatcher, calls } = harness()
      expect(dispatcher.handleXterm(event), `${event.code} xterm`).toBe(true)
      expect(dispatcher.handleDocument(event), `${event.code} document`).toMatchObject({ consumed: false, executed: false })
      expect(calls, event.code).toEqual([])
      expect(event.prevented, event.code).toBe(0)
      expect(event.stopped, event.code).toBe(0)
    }
  })

  test("stays pass-through until authoritative settings are loaded", () => {
    const registrations = Object.fromEntries(WEB_SHORTCUT_ACTION_IDS.map((actionId) => [actionId, {
      callback: () => { throw new Error("must not execute") },
    }])) as Record<WebShortcutActionId, WebActionRegistration>
    const registry = createWebActionRegistry(registrations)
    const dispatcher = createWebShortcutDispatcher(registry)
    const event = linuxEvent("KeyT")
    expect(registry.entry("terminal.new")?.availability).toEqual({ available: false, disabledReason: "Shortcut settings are not loaded." })
    expect(dispatcher.handleXterm(event)).toBe(true)
    expect(event.prevented).toBe(0)
    expect(event.stopped).toBe(0)
  })
})
