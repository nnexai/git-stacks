import { describe, expect, test } from "@test/api"
import { defaultShortcutSettings } from "../../packages/client/src/index"
import type { WebShortcutMutation } from "../../packages/protocol/src/web"
import { readFile } from "node:fs/promises"
import {
  createSingletonOverlayController,
  mountFuzzyOverlay,
  mountShortcutHelp,
  mountShortcutSettings,
} from "../../packages/web/src/overlay-controller"
import { overlayAwareActionAvailability, WebShortcutConflictRecoveryError, WebShortcutOwnerConflictError } from "../../packages/web/src/navigation"

type Listener = (event: FakeEvent) => void

class FakeEvent {
  defaultPrevented = false
  propagationStopped = false
  shiftKey = false
  repeat = false
  isComposing = false
  ctrlKey = false
  altKey = false
  metaKey = false
  code = ""
  key = ""

  constructor(readonly type: string, readonly target: FakeElement, values: Partial<FakeEvent> = {}) {
    Object.assign(this, values)
  }

  preventDefault(): void { this.defaultPrevented = true }
  stopPropagation(): void { this.propagationStopped = true }
  getModifierState(name: string): boolean { return name === "AltGraph" && Boolean((this as unknown as { altGraph?: boolean }).altGraph) }
}

class FakeElement {
  readonly children: FakeElement[] = []
  readonly attributes = new Map<string, string>()
  readonly listeners = new Map<string, Listener[]>()
  parentElement?: FakeElement
  className = ""
  private ownText = ""
  value = ""
  hidden = false
  disabled = false
  type = ""
  placeholder = ""
  id = ""
  title = ""

  get textContent(): string { return this.ownText + this.children.map((child) => child.textContent).join("") }
  set textContent(value: string) {
    this.ownText = value
    for (const child of this.children) child.parentElement = undefined
    this.children.length = 0
  }
  get classList() {
    return {
      toggle: (name: string, enabled: boolean) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean))
        if (enabled) names.add(name); else names.delete(name)
        this.className = [...names].join(" ")
      },
    }
  }

  constructor(readonly ownerDocument: FakeDocument, readonly tagName: string) {}

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.remove()
      node.parentElement = this
      this.children.push(node)
    }
  }
  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of this.children) child.parentElement = undefined
    this.children.length = 0
    this.append(...nodes)
  }
  remove(): void {
    if (!this.parentElement) return
    const index = this.parentElement.children.indexOf(this)
    if (index >= 0) this.parentElement.children.splice(index, 1)
    this.parentElement = undefined
  }
  focus(): void { this.ownerDocument.activeElement = this }
  contains(target: FakeElement): boolean { return target === this || this.children.some((child) => child.contains(target)) }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
    if (name === "id") this.id = value
  }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null }
  hasAttribute(name: string): boolean { return this.attributes.has(name) || (name === "disabled" && this.disabled) }
  removeAttribute(name: string): void { this.attributes.delete(name) }
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  dispatch(type: string, values: Partial<FakeEvent> = {}): FakeEvent {
    const event = new FakeEvent(type, this, values)
    for (const listener of this.listeners.get(type) ?? []) listener(event)
    if (!event.propagationStopped) this.ownerDocument.dispatch(event)
    return event
  }
  querySelectorAll(selector: string): FakeElement[] {
    const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll(selector)])
    if (selector.includes(":")) {
      return descendants.filter((node) => ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(node.tagName)
        && node.getAttribute("tabindex") !== "-1" && !node.disabled && !node.hidden)
    }
    if (selector.startsWith(".")) return descendants.filter((node) => node.className.split(" ").includes(selector.slice(1)))
    if (selector.startsWith("[")) {
      const [name, value] = selector.slice(1, -1).split("=")
      return descendants.filter((node) => node.getAttribute(name!) === value?.replaceAll(/["']/g, ""))
    }
    return descendants.filter((node) => node.tagName === selector.toUpperCase())
  }
  querySelector(selector: string): FakeElement | undefined { return this.querySelectorAll(selector)[0] }
  scrollIntoView(): void {}
}

class FakeDocument {
  readonly body = new FakeElement(this, "BODY")
  activeElement: FakeElement = this.body
  private readonly listeners = new Map<string, Listener[]>()

  createElement(tag: string): FakeElement { return new FakeElement(this, tag.toUpperCase()) }
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener))
  }
  dispatch(event: FakeEvent): void {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event)
  }
  listenerCount(type: string): number { return this.listeners.get(type)?.length ?? 0 }
}

function harness() {
  const document = new FakeDocument()
  const terminal = document.createElement("button")
  terminal.textContent = "terminal"
  document.body.append(terminal)
  terminal.focus()
  const restores: string[] = []
  const controller = createSingletonOverlayController(document as unknown as Document, {
    restoreFocus: (target) => {
      restores.push(target ?? "fallback")
      terminal.focus()
    },
  })
  return { document, terminal, restores, controller }
}

describe("web singleton keyboard overlays", () => {
  test("keeps one backdrop/listener, refocuses same surface, and preserves the original return target across replacement", () => {
    const { document, terminal, restores, controller } = harness()
    const first = controller.open({ id: "workspace", title: "Switch workspace", closeLabel: "Close workspace switcher", returnTarget: "term-original" })
    expect(first.kind).toBe("opened")
    const firstInput = document.createElement("input")
    first.view?.body.append(firstInput)
    first.view?.setPrimaryFocus(() => firstInput.focus())
    firstInput.focus()

    const refocused = controller.open({ id: "workspace", title: "Switch workspace", closeLabel: "Close workspace switcher", returnTarget: "wrong" })
    expect(refocused.kind).toBe("refocused")
    expect(document.activeElement).toBe(firstInput)
    expect(document.body.querySelectorAll(".modal-backdrop")).toHaveLength(1)
    expect(document.listenerCount("keydown")).toBe(1)

    const replacement = controller.open({ id: "help", title: "Keyboard shortcuts", closeLabel: "Close keyboard shortcuts", returnTarget: "wrong" })
    expect(replacement.kind).toBe("opened")
    expect(document.body.querySelectorAll(".modal-backdrop")).toHaveLength(1)
    expect(restores).toEqual([])
    replacement.view?.close()
    expect(restores).toEqual(["term-original"])
    expect(document.activeElement).toBe(terminal)
  })

  test("makes exclusive confirmations unavailable to unrelated replacement and traps Escape and Tab", () => {
    const { document, controller } = harness()
    const confirmation = controller.open({ id: "remove", title: "Remove?", closeLabel: "Close remove", exclusive: true, returnTarget: "term" })
    const cancel = document.createElement("button")
    const confirm = document.createElement("button")
    confirmation.view?.body.append(cancel, confirm)
    confirm.focus()
    expect(controller.open({ id: "workspace", title: "Switch workspace", closeLabel: "Close workspace switcher", returnTarget: "term" }).kind).toBe("unavailable")

    const tab = confirm.dispatch("keydown", { key: "Tab" })
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement.getAttribute("aria-label")).toBe("Close remove")
    const escape = cancel.dispatch("keydown", { key: "Escape" })
    expect(escape.defaultPrevented).toBe(true)
    expect(controller.activeSurface()).toBeUndefined()
  })

  test("lets compatible shortcut surfaces replace each other while dynamic capture exclusivity blocks replacement", () => {
    const { document, restores, controller } = harness()
    const first = controller.open({ id: "workspace.switch", title: "Switch workspace", closeLabel: "Close workspace switcher", returnTarget: "term-original" })
    expect(first.kind).toBe("opened")
    expect(overlayAwareActionAvailability("commands.open", { exclusive: controller.isExclusive(), navigationRegistered: true })).toEqual({ available: true })

    const second = controller.open({ id: "commands.open", title: "Configured commands", closeLabel: "Close commands", returnTarget: "wrong" })
    expect(second.kind).toBe("opened")
    expect(controller.activeSurface()).toBe("commands.open")
    expect(document.body.querySelectorAll(".modal-backdrop")).toHaveLength(1)
    expect(restores).toEqual([])

    second.view.setExclusive(true)
    expect(overlayAwareActionAvailability("workspace.switch", { exclusive: controller.isExclusive(), navigationRegistered: true })).toEqual({
      available: false,
      disabledReason: "Another dialog is active.",
    })
    expect(controller.open({ id: "workspace.switch", title: "Switch workspace", closeLabel: "Close workspace switcher" }).kind).toBe("unavailable")
  })

  test("executes top fuzzy partials, synchronizes active rows, wraps navigation, and contains palette keys", () => {
    const { document, controller } = harness()
    const opened = controller.open({ id: "workspace", title: "Switch workspace", closeLabel: "Close workspace switcher", returnTarget: "term" })
    const selected: string[] = []
    const overlay = mountFuzzyOverlay(opened.view!, {
      inputLabel: "Search active workspaces and repositories",
      emptyHeading: "No active workspaces",
      emptyBody: "Create or unarchive a workspace to switch here.",
      noMatch: "No workspaces or repositories match.",
      items: [
        { id: "active-alpha", name: "Alpha", detail: "api / main" },
        { id: "active-beta", name: "Beta", detail: "web / topic" },
      ],
      stableId: (item) => item.id,
      fields: (item) => [{ text: item.name, weight: 3 }, { text: item.detail, weight: 2 }],
      render: (item) => ({ primary: item.name, secondary: item.detail }),
      select: (item) => selected.push(item.id),
    })
    overlay.input.value = "bt"
    overlay.input.dispatch("input")
    expect(overlay.input.getAttribute("aria-activedescendant")).toContain("active-beta")
    const enter = overlay.input.dispatch("keydown", { key: "Enter" })
    expect(enter.defaultPrevented).toBe(true)
    expect(enter.propagationStopped).toBe(true)
    expect(selected).toEqual(["active-beta"])

    overlay.input.value = ""
    overlay.input.dispatch("input")
    overlay.input.dispatch("keydown", { key: "ArrowUp" })
    expect(overlay.input.getAttribute("aria-activedescendant")).toContain("active-beta")
    overlay.input.dispatch("keydown", { key: "Home" })
    expect(overlay.input.getAttribute("aria-activedescendant")).toContain("active-alpha")
    expect(document.body.querySelectorAll("[role='option']")).toHaveLength(2)
    expect(document.body.querySelectorAll("[role='option']").every((option) => option.getAttribute("tabindex") === "-1")).toBe(true)
    expect(document.activeElement).toBe(overlay.input)
    overlay.input.dispatch("keydown", { key: "Tab" })
    expect(document.activeElement.getAttribute("aria-label")).toBe("Close workspace switcher")
  })

  test("latches async selection across Enter repeats and pointer activation, then unlocks coherently", async () => {
    const { controller } = harness()
    const opened = controller.open({ id: "commands", title: "Configured commands", closeLabel: "Close commands", returnTarget: "term" })
    let selected = 0
    const releases: Array<() => void> = []
    const overlay = mountFuzzyOverlay(opened.view!, {
      inputLabel: "Search configured commands",
      emptyHeading: "No configured commands",
      emptyBody: "This workspace and repository have no configured commands.",
      noMatch: "No configured commands match.",
      items: [{ id: "build", name: "Build" }],
      stableId: (item) => item.id,
      fields: (item) => [{ text: item.name, weight: 3 }],
      render: (item) => ({ primary: item.name }),
      select: () => {
        selected += 1
        return new Promise<void>((resolve) => releases.push(resolve))
      },
    })
    const option = overlay.results.querySelector("[role='option']")!
    overlay.input.dispatch("keydown", { key: "Enter" })
    overlay.input.dispatch("keydown", { key: "Enter", repeat: true })
    overlay.input.dispatch("keydown", { key: "Enter" })
    option.dispatch("click")
    expect(selected).toBe(1)
    expect(overlay.results.getAttribute("aria-busy")).toBe("true")
    expect(option.disabled).toBe(true)

    releases.shift()?.()
    await overlay.idle()
    expect(overlay.results.getAttribute("aria-busy")).toBe("false")
    expect(option.disabled).toBe(false)
    option.dispatch("click")
    expect(selected).toBe(2)
    releases.shift()?.()
    await overlay.idle()
  })

  test("renders exact zero and no-match states while keeping Enter inert", () => {
    const { controller } = harness()
    const opened = controller.open({ id: "commands", title: "Configured commands", closeLabel: "Close commands", returnTarget: "term" })
    const selected: string[] = []
    const overlay = mountFuzzyOverlay(opened.view!, {
      inputLabel: "Search configured commands",
      emptyHeading: "No configured commands",
      emptyBody: "This workspace and repository have no configured commands.",
      noMatch: "No configured commands match.",
      items: [] as Array<{ id: string; name: string }>,
      stableId: (item) => item.id,
      fields: (item) => [{ text: item.name, weight: 3 }],
      render: (item) => ({ primary: item.name }),
      select: (item) => selected.push(item.id),
    })
    expect(opened.view?.body.textContent).toContain("No configured commands")
    overlay.input.value = "x"
    overlay.input.dispatch("input")
    expect(opened.view?.body.textContent).toContain("No configured commands match.")
    overlay.input.dispatch("keydown", { key: "Enter" })
    expect(selected).toEqual([])
  })

  test("keeps one long result accessible without truncating its full label", () => {
    const { controller } = harness()
    const opened = controller.open({ id: "workspace", title: "Switch workspace", closeLabel: "Close workspace switcher", returnTarget: "term" })
    const longName = "A workspace name that intentionally exceeds the visible row width while remaining available to assistive technology"
    mountFuzzyOverlay(opened.view!, {
      inputLabel: "Search active workspaces and repositories",
      emptyHeading: "No active workspaces",
      emptyBody: "Create or unarchive a workspace to switch here.",
      noMatch: "No workspaces or repositories match.",
      items: [{ id: "only", name: longName, detail: "repository-with-a-long-name / branch-with-a-long-name" }],
      stableId: (item) => item.id,
      fields: (item) => [{ text: item.name, weight: 3 }],
      render: (item) => ({ primary: item.name, secondary: item.detail }),
      select: () => undefined,
    })
    const option = opened.view?.body.querySelector("[role='option']")
    expect(option?.title).toContain(longName)
    expect(option?.getAttribute("aria-selected")).toBe("true")
  })
})

describe("web authoritative shortcut overlays", () => {
  test("help renders all eight grouped actions with primary, aliases, and Unbound", () => {
    const { controller } = harness()
    const settings = defaultShortcutSettings("linux", "4")
    settings.bindings[0]!.aliases.push({ code: "KeyQ", ctrl: true, alt: true, shift: true, meta: false })
    settings.bindings[1]!.primary = null
    const opened = controller.open({ id: "help", title: "Keyboard shortcuts", closeLabel: "Close keyboard shortcuts", returnTarget: "term" })
    mountShortcutHelp(opened.view!, settings, () => undefined)
    const text = opened.view!.body.textContent
    expect(text).toContain("Navigation")
    expect(text).toContain("Workspace")
    expect(text).toContain("Terminal")
    expect(text).toContain("Switch workspace or repository")
    expect(text).toContain("Unbound")
    expect(opened.view!.body.querySelectorAll(".shortcut-row")).toHaveLength(8)
    expect(opened.view!.body.querySelectorAll("KBD").length).toBeGreaterThan(8)
  })

  test("chooses help initial focus from safe invoker context", () => {
    const { document, controller } = harness()
    const settings = defaultShortcutSettings("linux", "4")
    const withoutInvoker = controller.open({ id: "help-none", title: "Keyboard shortcuts", closeLabel: "Close keyboard shortcuts" })
    mountShortcutHelp(withoutInvoker.view!, settings, () => undefined, { hasInvoker: false })
    expect(document.activeElement.textContent).toBe("Close help")
    withoutInvoker.view?.close(false)

    const withInvoker = controller.open({ id: "help-invoked", title: "Keyboard shortcuts", closeLabel: "Close keyboard shortcuts", returnTarget: "term" })
    mountShortcutHelp(withInvoker.view!, settings, () => undefined, { hasInvoker: true })
    expect(document.activeElement.textContent).toBe("Customize shortcuts")
  })

  test("loads authoritatively, emits distinct revisioned intents, and accepts only complete successful responses", async () => {
    const { controller } = harness()
    let authoritative = defaultShortcutSettings("linux", "7")
    const mutations: WebShortcutMutation[] = []
    const accepted: string[] = []
    const opened = controller.open({ id: "settings", title: "Customize shortcuts", closeLabel: "Close shortcut settings", returnTarget: "term" })
    const settings = mountShortcutSettings(opened.view!, {
      platform: "linux",
      load: async () => authoritative,
      mutate: async (mutation) => {
        mutations.push(mutation)
        authoritative = { ...authoritative, revision: String(Number(authoritative.revision) + 1), bindings: authoritative.bindings.map((binding) => binding.action_id === mutation.action_id
          ? mutation.intent === "unbind" ? { ...binding, primary: null, aliases: [] }
            : mutation.intent === "reset" ? defaultShortcutSettings("linux").bindings.find((row) => row.action_id === binding.action_id)!
              : mutation.intent === "set-primary" ? { ...binding, primary: mutation.binding }
                : { ...binding, aliases: mutation.aliases }
          : binding) }
        return authoritative
      },
      accept: (next) => accepted.push(next.revision),
      announce: () => undefined,
    })
    expect(opened.view?.body.textContent).toContain("Loading shortcuts…")
    await settings.ready
    expect(opened.view?.body.querySelectorAll(".shortcut-row")).toHaveLength(8)

    const unbind = opened.view?.body.querySelectorAll("BUTTON").find((node) => node.textContent === "Unbind shortcut")
    unbind?.dispatch("click")
    await settings.idle()
    expect(mutations[0]).toMatchObject({ intent: "unbind", expected_revision: "7", action_id: "workspace.switch" })
    expect(accepted).toEqual(["7", "8"])

    const reset = opened.view?.body.querySelectorAll("BUTTON").find((node) => node.textContent === "Reset shortcut to default" && !node.disabled)
    reset?.dispatch("click")
    await settings.idle()
    expect(mutations[1]).toMatchObject({ intent: "reset", expected_revision: "8" })
  })

  test("keeps capture active for unsafe/conflicting input and preserves prior bindings on save failure", async () => {
    const { controller } = harness()
    const authoritative = defaultShortcutSettings("linux", "10")
    const accepted: string[] = []
    const opened = controller.open({ id: "settings", title: "Customize shortcuts", closeLabel: "Close shortcut settings", returnTarget: "term" })
    const settings = mountShortcutSettings(opened.view!, {
      platform: "linux",
      load: async () => authoritative,
      mutate: async () => { throw new Error("stale") },
      accept: (next) => accepted.push(next.revision),
      announce: () => undefined,
    })
    await settings.ready
    const primary = opened.view?.body.querySelectorAll("BUTTON").find((node) => node.getAttribute("data-shortcut-primary") === "workspace.switch")
    primary?.dispatch("click")
    let capture = opened.view?.body.querySelectorAll("BUTTON").find((node) => node.getAttribute("data-capture") === "workspace.switch")
    capture?.dispatch("keydown", { code: "KeyZ", key: "z" })
    expect(opened.view?.body.textContent).toContain("Add Ctrl, Alt, or Command so terminal typing stays available.")
    capture = opened.view?.body.querySelectorAll("BUTTON").find((node) => node.getAttribute("data-capture") === "workspace.switch")
    capture?.dispatch("keydown", { code: "KeyP", key: "p", ctrlKey: true, altKey: true, shiftKey: true })
    expect(opened.view?.body.textContent).toContain("Already assigned to Configured commands.")
    expect(accepted).toEqual(["10"])

    capture = opened.view?.body.querySelectorAll("BUTTON").find((node) => node.getAttribute("data-capture") === "workspace.switch")
    capture?.dispatch("keydown", { code: "KeyZ", key: "z", ctrlKey: true, altKey: true, shiftKey: true })
    await settings.idle()
    expect(opened.view?.body.textContent).toContain("Shortcut changes were not saved. Your previous bindings are still active.")
    expect(opened.view?.body.textContent).toContain("Retry saving shortcut")
    expect(accepted).toEqual(["10"])
  })

  test("reloads conflict state and retries with the new authoritative revision", async () => {
    const { controller } = harness()
    const accepted: string[] = []
    const attemptedRevisions: string[] = []
    const opened = controller.open({ id: "settings", title: "Customize shortcuts", closeLabel: "Close shortcut settings", returnTarget: "term" })
    const settings = mountShortcutSettings(opened.view!, {
      platform: "linux",
      load: async () => defaultShortcutSettings("linux", "10"),
      mutate: async (mutation) => {
        attemptedRevisions.push(mutation.expected_revision)
        if (mutation.expected_revision === "10") {
          const authoritative = defaultShortcutSettings("linux", "11")
          throw new WebShortcutConflictRecoveryError(authoritative, { ...mutation, expected_revision: "11" })
        }
        return defaultShortcutSettings("linux", "12")
      },
      accept: (next) => accepted.push(next.revision),
      announce: () => undefined,
    })
    await settings.ready

    opened.view?.body.querySelectorAll("BUTTON")
      .find((node) => node.textContent === "Unbind shortcut")?.dispatch("click")
    await settings.idle()
    expect(opened.view?.body.textContent).toContain("Authoritative bindings were reloaded before retry.")
    expect(accepted).toEqual(["10", "11"])

    opened.view?.body.querySelectorAll("BUTTON")
      .find((node) => node.textContent === "Retry saving shortcut")?.dispatch("click")
    await settings.idle()
    expect(attemptedRevisions).toEqual(["10", "11"])
    expect(accepted).toEqual(["10", "11", "12"])
  })

  test("keeps capture and authoritative bindings on an actual owner collision without offering stale retry", async () => {
    const { controller } = harness()
    const authoritative = defaultShortcutSettings("linux", "10")
    const accepted: string[] = []
    let mutations = 0
    const opened = controller.open({ id: "settings", title: "Customize shortcuts", closeLabel: "Close shortcut settings", returnTarget: "term" })
    const settings = mountShortcutSettings(opened.view!, {
      platform: "linux",
      load: async () => authoritative,
      mutate: async () => {
        mutations += 1
        throw new WebShortcutOwnerConflictError("commands.open")
      },
      accept: (next) => accepted.push(next.revision),
      announce: () => undefined,
    })
    await settings.ready

    opened.view?.body.querySelectorAll("BUTTON")
      .find((node) => node.getAttribute("data-shortcut-primary") === "workspace.switch")?.dispatch("click")
    opened.view?.body.querySelectorAll("BUTTON")
      .find((node) => node.getAttribute("data-capture") === "workspace.switch")
      ?.dispatch("keydown", { code: "KeyZ", key: "z", ctrlKey: true, altKey: true, shiftKey: true })
    await settings.idle()

    expect(mutations).toBe(1)
    expect(accepted).toEqual(["10"])
    expect(opened.view?.body.textContent).toContain("Already assigned to Configured commands.")
    expect(opened.view?.body.textContent).not.toContain("Retry saving shortcut")
    expect(opened.view?.body.querySelectorAll("BUTTON").some((node) => node.getAttribute("data-capture") === "workspace.switch")).toBe(true)
    expect(controller.isExclusive()).toBe(true)
  })

  test("ignores pure modifiers, composition, and AltGraph during capture", async () => {
    const { controller, document } = harness()
    const opened = controller.open({ id: "settings", title: "Customize shortcuts", closeLabel: "Close shortcut settings", returnTarget: "term" })
    let mutations = 0
    const settings = mountShortcutSettings(opened.view!, {
      platform: "linux",
      load: async () => defaultShortcutSettings("linux", "11"),
      mutate: async () => { mutations += 1; return defaultShortcutSettings("linux", "12") },
      accept: () => undefined,
      announce: () => undefined,
    })
    await settings.ready
    const primary = opened.view?.body.querySelectorAll("BUTTON").find((node) => node.getAttribute("data-shortcut-primary") === "workspace.switch")
    primary?.dispatch("click")
    const capture = opened.view?.body.querySelectorAll("BUTTON").find((node) => node.getAttribute("data-capture") === "workspace.switch")
    expect(controller.isExclusive()).toBe(true)
    expect(controller.open({ id: "commands.open", title: "Configured commands", closeLabel: "Close commands" }).kind).toBe("unavailable")
    document.dispatch(new FakeEvent("keydown", capture!, { key: "Escape" }))
    expect(controller.activeSurface()).toBe("settings")
    capture?.dispatch("keydown", { code: "ControlLeft", key: "Control", ctrlKey: true })
    capture?.dispatch("keydown", { code: "KeyZ", key: "Process", isComposing: true, ctrlKey: true })
    capture?.dispatch("keydown", { code: "KeyZ", key: "z", ctrlKey: true, altKey: true, altGraph: true } as Partial<FakeEvent>)
    expect(mutations).toBe(0)
    expect(opened.view?.body.textContent).toContain("Press shortcut…")
    capture?.dispatch("keydown", { key: "Escape" })
    expect(controller.isExclusive()).toBe(false)
    expect(opened.view?.body.textContent).not.toContain("Press shortcut…")
  })

  test("retries authoritative loading and uses set-aliases for add and remove", async () => {
    const { controller } = harness()
    let loads = 0
    let authoritative = defaultShortcutSettings("linux", "20")
    const mutations: WebShortcutMutation[] = []
    const opened = controller.open({ id: "settings", title: "Customize shortcuts", closeLabel: "Close shortcut settings", returnTarget: "term" })
    const settings = mountShortcutSettings(opened.view!, {
      platform: "linux",
      load: async () => {
        loads += 1
        if (loads === 1) throw new Error("offline")
        return authoritative
      },
      mutate: async (mutation) => {
        mutations.push(mutation)
        if (mutation.intent !== "set-aliases") throw new Error("unexpected mutation")
        authoritative = {
          ...authoritative,
          revision: String(Number(authoritative.revision) + 1),
          bindings: authoritative.bindings.map((binding) => binding.action_id === mutation.action_id ? { ...binding, aliases: mutation.aliases } : binding),
        }
        return authoritative
      },
      accept: () => undefined,
      announce: () => undefined,
    })
    await settings.ready
    expect(opened.view?.body.textContent).toContain("Shortcuts could not be loaded. Retry to edit the authoritative settings.")
    opened.view?.body.querySelectorAll("BUTTON").find((candidate) => candidate.textContent === "Retry loading shortcuts")?.dispatch("click")
    await Promise.resolve()
    expect(loads).toBe(2)

    const firstRow = opened.view?.body.querySelectorAll(".shortcut-row")[0]
    firstRow?.querySelectorAll("BUTTON").find((candidate) => candidate.textContent === "Add shortcut alias")?.dispatch("click")
    opened.view?.body.querySelectorAll("BUTTON").find((candidate) => candidate.getAttribute("data-capture") === "workspace.switch")
      ?.dispatch("keydown", { code: "KeyQ", key: "q", ctrlKey: true, altKey: true, shiftKey: true })
    await settings.idle()
    expect(mutations[0]).toMatchObject({ intent: "set-aliases", expected_revision: "20", aliases: [{ code: "KeyQ" }] })

    opened.view?.body.querySelectorAll("BUTTON").find((candidate) => candidate.textContent === "Remove shortcut alias")?.dispatch("click")
    await settings.idle()
    expect(mutations[1]).toMatchObject({ intent: "set-aliases", expected_revision: "21", aliases: [] })
  })

  test("wires the executable overlay implementation to service authority without browser persistence", async () => {
    const source = await readFile(new URL("../../packages/web/src/app.ts", import.meta.url), "utf8")
    const css = await readFile(new URL("../../packages/web/src/app.css", import.meta.url), "utf8")
    expect(source).toContain("createSingletonOverlayController")
    expect(source).toContain("mountFuzzyOverlay")
    expect(source).toContain("mountShortcutHelp")
    expect(source).toContain("mountShortcutSettings")
    expect(source).toContain("invokeRegisteredAction")
    expect(source).toContain('"shortcuts.set"')
    expect(source).toContain('id="next-attention"')
    expect(source).toContain('id="keyboard-shortcuts"')
    expect(source).not.toContain("localStorage")
    expect(css).toContain(".overlay-result.active")
    expect(css).toContain(".shortcut-row.capturing")
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.toolbar-discovery \{ width: 32px;/)
    expect(css).toMatch(/@media \(max-width: 400px\)[\s\S]*\.brand > :not\(\.brand-mark\) \{ display: none;/)
    expect(css).toMatch(/@media \(max-width: 400px\)[\s\S]*\.toolbar \.button \{ width: 32px; min-width: 32px;/)
    expect(css).not.toMatch(/@media \(max-width: 640px\)[\s\S]*\.toolbar-discovery[^}]*display:\s*none/)
  })

  test("keeps filled accent and light warning normal text above WCAG AA contrast", async () => {
    const css = await readFile(new URL("../../packages/web/src/app.css", import.meta.url), "utf8")
    const root = css.match(/^:root \{([\s\S]*?)\n\}/)?.[1] ?? ""
    const light = css.match(/:root\[data-theme="light"\] \{([^}]*)\}/)?.[1] ?? ""
    const token = (block: string, name: string) => block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]+)`, "i"))?.[1] ?? ""
    const luminance = (hex: string) => {
      const channels = hex.match(/[0-9a-f]{2}/gi)!.map((part) => Number.parseInt(part, 16) / 255)
        .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
    }
    const contrast = (left: string, right: string) => {
      const values = [luminance(left), luminance(right)].sort((a, b) => b - a)
      return (values[0]! + 0.05) / (values[1]! + 0.05)
    }
    expect(contrast(token(root, "accent"), token(root, "accent-text"))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token(light, "accent"), token(light, "accent-text"))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token(light, "warning"), token(light, "panel"))).toBeGreaterThanOrEqual(4.5)
    expect(css).toMatch(/\.button \{[^}]*font-size: 14px; font-weight: 650;/)
    expect(css).toMatch(/\.shortcut-binding-button \{[^}]*font-size: 14px; font-weight: 650; line-height: 1\.3;/)
    expect(css).toMatch(/kbd \{[^}]*padding: 4px 8px;[^}]*font: 650 11px\/1\.4/)
    expect(css).toContain(".shortcut-remove { min-height: 32px; padding: 4px 8px; }")
  })
})
