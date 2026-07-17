import { beforeAll, describe, expect, test } from "@test/api"
import { readFileSync } from "node:fs"

import { createSingletonOverlayController, type OverlayView } from "../../packages/web/src/overlay-controller"
import {
  PHASE127_ACTION_INVENTORIES,
  PHASE127_CLIENT_COPY,
  PHASE127_CLIENT_RESPONSES,
  PHASE127_CLIENT_ROWS,
  PHASE127_CLIENT_STATES,
  PHASE127_FORBIDDEN_RENDER_TEXT,
  PHASE127_LIFECYCLE_OUTCOMES,
  assertPhase127RendererTextSafe,
  phase127WorkspaceOrder,
  type Phase127ClientUiState,
  type Phase127LifecycleDescriptor,
} from "../helpers/phase127-client-fixtures"
import {
  PHASE127_IDS,
  createDeferred,
  type Phase127StaleResponse,
} from "../helpers/phase127-stale-fixtures"

type StaleRequest = {
  expected_revision: string
  force_refresh: boolean
  signal?: AbortSignal
}

type ActionInventoryRequest = {
  workspace_id: string
  expected_revision: string
}

type CanonicalActionInvocation = {
  descriptor: Phase127LifecycleDescriptor
  expected_revision: string
}

type WebStaleWorkspaceControllerOptions = {
  expectedRevision(): string
  fetchEvaluation(request: StaleRequest): Promise<Phase127StaleResponse>
  reloadAuthoritative(): Promise<string>
  fetchActionInventory(request: ActionInventoryRequest): Promise<readonly Phase127LifecycleDescriptor[]>
  invokeCanonicalAction(invocation: CanonicalActionInvocation): Promise<unknown>
  reconcileAuthoritative(): Promise<string>
  onOpenSucceeded(result: unknown): void
}

type ActionMenuState = {
  status: "ready" | "denied" | "error"
  descriptors: readonly Phase127LifecycleDescriptor[]
  message?: string
}

type WebStaleWorkspaceController = {
  state(): Phase127ClientUiState
  subscribe(listener: (state: Phase127ClientUiState) => void): () => void
  open(): Promise<void>
  refresh(): Promise<void>
  close(): void
  openWorkspace(workspaceId: string): Promise<unknown>
  loadActions(workspaceId: string): Promise<ActionMenuState>
  invokeLifecycle(workspaceId: string, actionId: Phase127LifecycleDescriptor["action_id"]): Promise<unknown>
  reconcileOperation(operationId: string): Promise<void>
}

type MountedWebStaleWorkspaceOverlay = {
  ready: Promise<void>
  idle(): Promise<void>
  render(): void
  handleScopedKey(event: KeyboardEvent): boolean
}

type CreateWebStaleWorkspaceController = (
  options: WebStaleWorkspaceControllerOptions,
) => WebStaleWorkspaceController

type MountWebStaleWorkspaceOverlay = (
  view: OverlayView,
  controller: WebStaleWorkspaceController,
  options?: { now?: () => number },
) => MountedWebStaleWorkspaceOverlay

type RuntimeModule = Record<string, unknown>

const MODULE_URL = new URL(
  "../../packages/web/src/stale-workspaces.ts",
  import.meta.url,
).href
const appSource = readFileSync(new URL("../../packages/web/src/app.ts", import.meta.url), "utf8")
const navigationSource = readFileSync(new URL("../../packages/web/src/navigation.ts", import.meta.url), "utf8")
const cssSource = readFileSync(new URL("../../packages/web/src/app.css", import.meta.url), "utf8")

let staleModule: RuntimeModule | undefined
let staleModuleLoadError: unknown

beforeAll(async () => {
  try {
    staleModule = await import(/* @vite-ignore */ MODULE_URL) as RuntimeModule
  } catch (error) {
    staleModuleLoadError = error
  }
})

function webStaleExports(): {
  createController: CreateWebStaleWorkspaceController
  mountOverlay: MountWebStaleWorkspaceOverlay
} {
  expect(
    staleModuleLoadError,
    "Phase 127 web must provide packages/web/src/stale-workspaces.ts",
  ).toBeUndefined()
  const createController = staleModule?.createWebStaleWorkspaceController
  const mountOverlay = staleModule?.mountWebStaleWorkspaceOverlay
  expect(
    createController,
    "Phase 127 web stale module must export createWebStaleWorkspaceController",
  ).toBeTypeOf("function")
  expect(
    mountOverlay,
    "Phase 127 web stale module must export mountWebStaleWorkspaceOverlay",
  ).toBeTypeOf("function")
  return {
    createController: createController as CreateWebStaleWorkspaceController,
    mountOverlay: mountOverlay as MountWebStaleWorkspaceOverlay,
  }
}

async function flushMicrotasks(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

type Listener = (event: FakeEvent) => void

class FakeEvent {
  defaultPrevented = false
  propagationStopped = false
  key = ""
  code = ""
  repeat = false
  isComposing = false
  ctrlKey = false
  altKey = false
  shiftKey = false
  metaKey = false

  constructor(readonly type: string, readonly target: FakeElement, values: Partial<FakeEvent> = {}) {
    Object.assign(this, values)
  }

  preventDefault(): void { this.defaultPrevented = true }
  stopPropagation(): void { this.propagationStopped = true }
  getModifierState(name: string): boolean {
    return name === "AltGraph" && Boolean((this as unknown as { altGraph?: boolean }).altGraph)
  }
}

function selectorMatches(node: FakeElement, selector: string): boolean {
  const trimmed = selector.trim()
  if (!trimmed) return false
  if (trimmed.startsWith("#")) return node.id === trimmed.slice(1)
  if (trimmed.startsWith(".")) return node.className.split(/\s+/).includes(trimmed.slice(1))
  const attribute = trimmed.match(/^\[([^=\]]+)(?:=['\"]?([^'\"\]]+)['\"]?)?\]$/)
  if (attribute) {
    const [, name, expected] = attribute
    return expected === undefined ? node.hasAttribute(name!) : node.getAttribute(name!) === expected
  }
  const tagClass = trimmed.match(/^([a-z0-9-]+)\.([a-z0-9_-]+)$/i)
  if (tagClass) return node.tagName === tagClass[1]!.toUpperCase() && node.className.split(/\s+/).includes(tagClass[2]!)
  return node.tagName === trimmed.toUpperCase()
}

class FakeElement {
  readonly children: FakeElement[] = []
  readonly attributes = new Map<string, string>()
  readonly listeners = new Map<string, Listener[]>()
  readonly dataset: Record<string, string> = {}
  readonly style = {
    values: new Map<string, string>(),
    setProperty: (name: string, value: string) => { this.style.values.set(name, value) },
    getPropertyValue: (name: string) => this.style.values.get(name) ?? "",
  }
  parentElement?: FakeElement
  className = ""
  id = ""
  title = ""
  type = ""
  value = ""
  dateTime = ""
  hidden = false
  disabled = false
  tabIndex = 0
  private ownText = ""

  constructor(readonly ownerDocument: FakeDocument, readonly tagName: string) {}

  get textContent(): string { return this.ownText + this.children.map((child) => child.textContent).join("") }
  set textContent(value: string) {
    this.ownText = value
    for (const child of this.children) child.parentElement = undefined
    this.children.length = 0
  }
  get firstElementChild(): FakeElement | undefined { return this.children[0] }
  get isConnected(): boolean {
    let current: FakeElement | undefined = this
    while (current) {
      if (current === this.ownerDocument.body) return true
      current = current.parentElement
    }
    return false
  }
  get classList() {
    return {
      add: (...names: string[]) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean))
        names.forEach((name) => current.add(name))
        this.className = [...current].join(" ")
      },
      remove: (...names: string[]) => {
        const removed = new Set(names)
        this.className = this.className.split(/\s+/).filter((name) => name && !removed.has(name)).join(" ")
      },
      contains: (name: string) => this.className.split(/\s+/).includes(name),
      toggle: (name: string, enabled?: boolean) => {
        const has = this.className.split(/\s+/).includes(name)
        const next = enabled ?? !has
        if (next) this.classList.add(name); else this.classList.remove(name)
        return next
      },
    }
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.remove()
      node.parentElement = this
      this.children.push(node)
    }
  }
  appendChild(node: FakeElement): FakeElement { this.append(node); return node }
  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of this.children) child.parentElement = undefined
    this.children.length = 0
    this.ownText = ""
    this.append(...nodes)
  }
  remove(): void {
    if (!this.parentElement) return
    const index = this.parentElement.children.indexOf(this)
    if (index >= 0) this.parentElement.children.splice(index, 1)
    this.parentElement = undefined
  }
  focus(): void {
    if (!this.disabled && !this.hidden) this.ownerDocument.activeElement = this
  }
  contains(target: FakeElement): boolean {
    return target === this || this.children.some((child) => child.contains(target))
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
    if (name === "id") this.id = value
    if (name === "class") this.className = value
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase())
      this.dataset[key] = value
    }
  }
  getAttribute(name: string): string | null {
    if (name === "id" && this.id) return this.id
    if (name === "class" && this.className) return this.className
    return this.attributes.get(name) ?? null
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name) || (name === "disabled" && this.disabled) || (name === "hidden" && this.hidden)
  }
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
    const selectors = selector.split(",").map((part) => part.trim()).filter(Boolean)
    const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll(selector)])
    return descendants.filter((node) => selectors.some((candidate) => selectorMatches(node, candidate)))
  }
  querySelector(selector: string): FakeElement | undefined { return this.querySelectorAll(selector)[0] }
  scrollIntoView(): void {}
}

class FakeDocument {
  readonly body = new FakeElement(this, "BODY")
  activeElement: FakeElement = this.body
  readonly defaultView = {
    getComputedStyle: () => ({ display: "block", visibility: "visible", contentVisibility: "visible", opacity: "1" }),
  }
  private readonly listeners = new Map<string, Listener[]>()

  createElement(tag: string): FakeElement { return new FakeElement(this, tag.toUpperCase()) }
  createDocumentFragment(): FakeElement { return new FakeElement(this, "FRAGMENT") }
  querySelectorAll(selector: string): FakeElement[] { return this.body.querySelectorAll(selector) }
  querySelector(selector: string): FakeElement | undefined { return this.body.querySelector(selector) }
  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener))
  }
  dispatch(event: FakeEvent): void {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event)
  }
}

function controllerHarness(overrides: Partial<WebStaleWorkspaceControllerOptions> = {}) {
  const requests: StaleRequest[] = []
  const inventoryRequests: ActionInventoryRequest[] = []
  const actionInvocations: CanonicalActionInvocation[] = []
  const navigation: unknown[] = []
  let reloads = 0
  let reconciliations = 0
  let revision = "7"
  const options: WebStaleWorkspaceControllerOptions = {
    expectedRevision: () => revision,
    fetchEvaluation: async (request) => {
      requests.push(request)
      return request.force_refresh ? PHASE127_CLIENT_RESPONSES.refreshed : PHASE127_CLIENT_RESPONSES.populated
    },
    reloadAuthoritative: async () => {
      reloads += 1
      revision = "8"
      return revision
    },
    fetchActionInventory: async (request) => {
      inventoryRequests.push(request)
      return PHASE127_ACTION_INVENTORIES.candidate
    },
    invokeCanonicalAction: async (invocation) => {
      actionInvocations.push(invocation)
      return invocation.descriptor.action_id === "workspace.open"
        ? PHASE127_LIFECYCLE_OUTCOMES.openSucceeded
        : PHASE127_LIFECYCLE_OUTCOMES.acceptedOperation
    },
    reconcileAuthoritative: async () => {
      reconciliations += 1
      revision = "8"
      return revision
    },
    onOpenSucceeded: (result) => { navigation.push(result) },
    ...overrides,
  }
  return {
    options,
    requests,
    inventoryRequests,
    actionInvocations,
    navigation,
    get reloads() { return reloads },
    get reconciliations() { return reconciliations },
    setRevision(next: string) { revision = next },
  }
}

function overlayHarness() {
  const document = new FakeDocument()
  const invoker = document.createElement("button")
  invoker.textContent = PHASE127_CLIENT_COPY.entry
  document.body.append(invoker)
  invoker.focus()
  const restored: string[] = []
  const controller = createSingletonOverlayController(document as unknown as Document, {
    activateFocus: () => undefined,
    restoreFocus: () => { restored.push("invoker"); invoker.focus() },
  })
  const opened = controller.open({
    id: "workspace.stale",
    title: PHASE127_CLIENT_COPY.title,
    closeLabel: "Close stale workspaces",
    returnTarget: "terminal-origin",
  })
  if (opened.kind !== "opened") throw new Error("Test stale overlay did not open")
  return { document, invoker, restored, overlayController: controller, view: opened.view }
}

function textIndex(text: string, value: string): number {
  const index = text.indexOf(value)
  expect(index, `Expected rendered stale text to include ${value}`).toBeGreaterThanOrEqual(0)
  return index
}

describe("Phase 127 web stale-workspace guarded contract", () => {
  test("loads the guarded web controller and DOM adapter without a discovery failure", () => {
    const exports = webStaleExports()
    expect(exports.createController).toBeTypeOf("function")
    expect(exports.mountOverlay).toBeTypeOf("function")
  })

  test("fixture matrix distinguishes all eight approved UI considerations", () => {
    expect(PHASE127_CLIENT_RESPONSES.empty.candidates).toHaveLength(0)
    expect(PHASE127_CLIENT_RESPONSES.incompleteOnly.incomplete).toHaveLength(1)
    expect(PHASE127_CLIENT_STATES.initialLoading.phase).toBe("initial-loading")
    expect(PHASE127_CLIENT_STATES.firstLoadError.phase).toBe("first-load-error")
    expect(PHASE127_CLIENT_RESPONSES.populated.candidates).toHaveLength(2)
    expect(PHASE127_CLIENT_RESPONSES.populated.candidates[0]?.unknown_evidence).not.toHaveLength(0)
    expect(PHASE127_CLIENT_RESPONSES.many.candidates).toHaveLength(3)
    expect(PHASE127_CLIENT_ROWS.longWorkspaceName.length).toBeGreaterThan(70)
  })
})

describe("Phase 127 web stale-workspace state machine", () => {
  test("empty: all-clear and incomplete-only states remain distinct while Refresh and Open stay available", async () => {
    const { createController, mountOverlay } = webStaleExports()
    const responses = [PHASE127_CLIENT_RESPONSES.empty, PHASE127_CLIENT_RESPONSES.incompleteOnly]
    const fixture = controllerHarness({
      fetchEvaluation: async (request) => {
        fixture.requests.push(request)
        return responses.shift()!
      },
    })
    const controller = createController(fixture.options)
    const overlay = overlayHarness()
    const mounted = mountOverlay(overlay.view, controller, { now: () => Date.parse("2026-07-17T12:05:00.000Z") })
    await mounted.ready
    expect(overlay.view.body.textContent).toContain(PHASE127_CLIENT_COPY.emptyHeading)
    expect(overlay.view.body.textContent).toContain(PHASE127_CLIENT_COPY.emptyBody)
    expect(overlay.view.body.textContent).toContain(PHASE127_CLIENT_COPY.refresh)

    await controller.refresh()
    mounted.render()
    const text = overlay.view.body.textContent
    expect(text).toContain(PHASE127_CLIENT_COPY.incompleteOnly)
    expect(text).toContain(PHASE127_CLIENT_COPY.incompleteSection)
    expect(text).toContain(PHASE127_CLIENT_COPY.open)
    expect(text).toContain(PHASE127_CLIENT_COPY.incompleteActions)
    expect(text).not.toContain(PHASE127_CLIENT_COPY.emptyHeading)
  })

  test("loading: first load reserves the overlay and retained refresh suppresses rapid duplicate requests", async () => {
    const { createController, mountOverlay } = webStaleExports()
    const initial = createDeferred<Phase127StaleResponse>()
    const refresh = createDeferred<Phase127StaleResponse>()
    const fixture = controllerHarness({
      fetchEvaluation: (request) => {
        fixture.requests.push(request)
        return request.force_refresh ? refresh.promise : initial.promise
      },
    })
    const controller = createController(fixture.options)
    const overlay = overlayHarness()
    const mounted = mountOverlay(overlay.view, controller)
    await flushMicrotasks()
    expect(controller.state()).toMatchObject({ phase: "initial-loading" })
    expect(overlay.view.body.textContent).toContain(PHASE127_CLIENT_COPY.initialLoading)
    expect(overlay.view.body.getAttribute("aria-busy")).toBe("true")
    initial.resolve(PHASE127_CLIENT_RESPONSES.populated)
    await mounted.ready

    fixture.setRevision("8")
    const firstRefresh = controller.refresh()
    const repeatedRefresh = controller.refresh()
    await flushMicrotasks()
    expect(controller.state()).toMatchObject({
      phase: "refreshing",
      response: PHASE127_CLIENT_RESPONSES.populated,
    })
    mounted.render()
    expect(overlay.view.body.textContent).toContain("zulu-service-first")
    expect(overlay.view.body.textContent).toContain(PHASE127_CLIENT_COPY.refreshing)
    expect(fixture.requests.filter(({ force_refresh }) => force_refresh)).toHaveLength(1)
    refresh.resolve(PHASE127_CLIENT_RESPONSES.refreshed)
    await Promise.all([firstRefresh, repeatedRefresh])
    expect(controller.state()).toMatchObject({ phase: "loaded", response: PHASE127_CLIENT_RESPONSES.refreshed })
  })

  test("error: first-load Retry and retained-data Retry use one force-refresh path without fabricated evidence", async () => {
    const { createController, mountOverlay } = webStaleExports()
    let attempt = 0
    const fixture = controllerHarness({
      fetchEvaluation: async (request) => {
        fixture.requests.push(request)
        attempt += 1
        if (attempt === 1 || attempt === 3) throw new Error("sanitized request failure")
        return PHASE127_CLIENT_RESPONSES.populated
      },
    })
    const controller = createController(fixture.options)
    const overlay = overlayHarness()
    const mounted = mountOverlay(overlay.view, controller)
    await mounted.ready
    expect(controller.state()).toMatchObject({ phase: "first-load-error" })
    expect(overlay.view.body.textContent).toContain(PHASE127_CLIENT_COPY.firstLoadError)
    expect(overlay.view.body.textContent).toContain("Retry refresh")
    expect(overlay.view.body.textContent).not.toContain("zulu-service-first")

    await controller.refresh()
    mounted.render()
    expect(controller.state()).toMatchObject({ phase: "loaded" })
    await controller.refresh()
    mounted.render()
    expect(controller.state()).toMatchObject({ phase: "retained-error", response: PHASE127_CLIENT_RESPONSES.populated })
    expect(overlay.view.body.textContent).toContain(PHASE127_CLIENT_COPY.retainedError)
    expect(overlay.view.body.textContent).toContain("zulu-service-first")
    expect(fixture.requests.map(({ force_refresh }) => force_refresh)).toEqual([false, true, true])
  })

  test("partial and populated: service row order, terminal-before-inactivity evidence, unknowns, cautions, and timestamps remain visible", async () => {
    const { createController, mountOverlay } = webStaleExports()
    const fixture = controllerHarness()
    const controller = createController(fixture.options)
    const overlay = overlayHarness()
    const mounted = mountOverlay(overlay.view, controller, { now: () => Date.parse("2026-07-17T12:05:00.000Z") })
    await mounted.ready
    const text = overlay.view.body.textContent
    expect(phase127WorkspaceOrder(PHASE127_CLIENT_RESPONSES.populated)).toEqual([
      PHASE127_IDS.workspaces.merged,
      PHASE127_IDS.workspaces.closed,
      PHASE127_IDS.workspaces.incomplete,
    ])
    expect(textIndex(text, "zulu-service-first")).toBeLessThan(textIndex(text, "alpha-service-second"))
    expect(textIndex(text, PHASE127_CLIENT_COPY.reasonLabels.merged)).toBeLessThan(textIndex(text, PHASE127_CLIENT_COPY.reasonLabels.inactive))
    expect(text).toContain(PHASE127_CLIENT_COPY.confirmedHeading)
    expect(text).toContain(PHASE127_CLIENT_COPY.unknownHeading)
    expect(text).toContain(PHASE127_CLIENT_COPY.cautionHeading)
    expect(text).toContain(PHASE127_CLIENT_COPY.cautionExplanation)
    expect(text).toContain(PHASE127_CLIENT_COPY.incompleteSection)
    expect(overlay.view.body.querySelectorAll("TIME").length).toBeGreaterThanOrEqual(7)
    expect(overlay.view.body.querySelectorAll("TIME").every((node) => Boolean(node.dateTime || node.getAttribute("datetime")))).toBe(true)
  })

  test("zero-one-many: one card keeps its full hierarchy and many rows remain unpaginated in service order", async () => {
    const { createController, mountOverlay } = webStaleExports()
    const responses = [PHASE127_CLIENT_RESPONSES.one, PHASE127_CLIENT_RESPONSES.many]
    const fixture = controllerHarness({
      fetchEvaluation: async (request) => {
        fixture.requests.push(request)
        return responses.shift()!
      },
    })
    const controller = createController(fixture.options)
    const overlay = overlayHarness()
    const mounted = mountOverlay(overlay.view, controller)
    await mounted.ready
    expect(overlay.view.body.querySelectorAll("[data-stale-candidate]")).toHaveLength(1)
    expect(overlay.view.body.textContent).toContain(PHASE127_CLIENT_COPY.confirmedHeading)
    await controller.refresh()
    mounted.render()
    expect(overlay.view.body.querySelectorAll("[data-stale-candidate]")).toHaveLength(3)
    expect(overlay.view.body.textContent.toLocaleLowerCase("en-US")).not.toContain("page 1")
    expect(textIndex(overlay.view.body.textContent, "zulu-service-first")).toBeLessThan(textIndex(overlay.view.body.textContent, "alpha-service-second"))
  })

  test("revision recovery rejects a mismatched result, reloads authoritative state, and retries stale evaluation only once", async () => {
    const { createController } = webStaleExports()
    const reload = createDeferred<string>()
    let calls = 0
    const fixture = controllerHarness({
      fetchEvaluation: async (request) => {
        fixture.requests.push(request)
        calls += 1
        if (calls === 1) throw Object.assign(new Error("revision changed"), { code: "conflict" })
        return PHASE127_CLIENT_RESPONSES.refreshed
      },
      reloadAuthoritative: async () => {
        reload.resolve
        return reload.promise
      },
    })
    const controller = createController(fixture.options)
    const pending = controller.open()
    await flushMicrotasks()
    expect(controller.state()).toMatchObject({ phase: "revision-recovery" })
    reload.resolve("8")
    await pending
    expect(fixture.requests).toEqual([
      expect.objectContaining({ expected_revision: "7", force_refresh: false }),
      expect.objectContaining({ expected_revision: "8", force_refresh: false }),
    ])
    expect(controller.state()).toMatchObject({ phase: "loaded", response: PHASE127_CLIENT_RESPONSES.refreshed })

    const secondConflict = controllerHarness({
      fetchEvaluation: async (request) => {
        secondConflict.requests.push(request)
        throw Object.assign(new Error("revision changed again"), { code: "conflict" })
      },
    })
    const failed = createController(secondConflict.options)
    await failed.open()
    expect(secondConflict.requests).toHaveLength(2)
    expect(failed.state()).toMatchObject({ phase: "first-load-error" })
  })

  test("late generations cannot replace the newest accepted response after close and reopen", async () => {
    const { createController } = webStaleExports()
    const older = createDeferred<Phase127StaleResponse>()
    const newer = createDeferred<Phase127StaleResponse>()
    let call = 0
    const fixture = controllerHarness({
      fetchEvaluation: (request) => {
        fixture.requests.push(request)
        call += 1
        return call === 1 ? older.promise : newer.promise
      },
    })
    const controller = createController(fixture.options)
    const first = controller.open()
    controller.close()
    const second = controller.open()
    newer.resolve(PHASE127_CLIENT_RESPONSES.refreshed)
    await second
    older.resolve(PHASE127_CLIENT_RESPONSES.populated)
    await first
    expect(controller.state()).toMatchObject({ phase: "loaded", response: PHASE127_CLIENT_RESPONSES.refreshed })
  })
})

describe("Phase 127 web canonical Open and lifecycle authority", () => {
  test("direct Open submits one canonical descriptor across rapid pointer activation and navigates only after authoritative success", async () => {
    const { createController } = webStaleExports()
    const outcome = createDeferred<unknown>()
    const fixture = controllerHarness({
      invokeCanonicalAction: (invocation) => {
        fixture.actionInvocations.push(invocation)
        return outcome.promise
      },
    })
    const controller = createController(fixture.options)
    await controller.open()
    const first = controller.openWorkspace(PHASE127_IDS.workspaces.merged)
    const second = controller.openWorkspace(PHASE127_IDS.workspaces.merged)
    await flushMicrotasks()
    expect(fixture.actionInvocations).toHaveLength(1)
    expect(fixture.actionInvocations[0]?.descriptor).toMatchObject({ action_id: "workspace.open", subject: { workspace_id: PHASE127_IDS.workspaces.merged } })
    expect(fixture.navigation).toEqual([])
    expect(controller.state()).toMatchObject({ phase: "open-pending", workspaceId: PHASE127_IDS.workspaces.merged })
    outcome.resolve(PHASE127_LIFECYCLE_OUTCOMES.openSucceeded)
    await Promise.all([first, second])
    expect(fixture.navigation).toEqual([PHASE127_LIFECYCLE_OUTCOMES.openSucceeded])
  })

  test("Open failure retains the same row, restores the control, and exposes only sanitized recovery copy", async () => {
    const { createController, mountOverlay } = webStaleExports()
    const fixture = controllerHarness({
      invokeCanonicalAction: async (invocation) => {
        fixture.actionInvocations.push(invocation)
        throw new Error("internal provider output must not render")
      },
    })
    const controller = createController(fixture.options)
    const overlay = overlayHarness()
    const mounted = mountOverlay(overlay.view, controller)
    await mounted.ready
    await controller.openWorkspace(PHASE127_IDS.workspaces.merged)
    mounted.render()
    expect(controller.state()).toMatchObject({ phase: "open-error", workspaceId: PHASE127_IDS.workspaces.merged })
    expect(overlay.view.body.textContent).toContain("zulu-service-first")
    expect(overlay.view.body.textContent).toContain(PHASE127_CLIENT_COPY.openFailure)
    expect(overlay.view.body.textContent).not.toContain("internal provider output")
    expect(overlay.view.body.querySelector("[data-stale-open='10000000-0000-4000-8000-000000000001']")?.disabled).toBe(false)
  })

  test("action inventory fails closed, incomplete rows deny lifecycle access, and Force Remove requires fresh dirty reauthorization", async () => {
    const { createController } = webStaleExports()
    let inventoryCall = 0
    const removable = PHASE127_ACTION_INVENTORIES.candidate.map((descriptor) => descriptor.action_id === "workspace.remove"
      ? { ...descriptor, availability: { available: true } as const }
      : descriptor)
    const fixture = controllerHarness({
      fetchActionInventory: async (request) => {
        fixture.inventoryRequests.push(request)
        inventoryCall += 1
        if (inventoryCall === 1) throw new Error("malformed inventory")
        if (inventoryCall === 2) return removable
        return [...removable, ...PHASE127_ACTION_INVENTORIES.forceReauthorized]
      },
      invokeCanonicalAction: async (invocation) => {
        fixture.actionInvocations.push(invocation)
        return invocation.descriptor.action_id === "workspace.remove"
          ? PHASE127_LIFECYCLE_OUTCOMES.dirtyRemoval
          : PHASE127_LIFECYCLE_OUTCOMES.acceptedOperation
      },
    })
    const controller = createController(fixture.options)
    await controller.open()

    await expect(controller.loadActions(PHASE127_IDS.workspaces.merged)).resolves.toMatchObject({ status: "error", descriptors: [] })
    expect(fixture.actionInvocations).toHaveLength(0)
    await expect(controller.loadActions(PHASE127_IDS.workspaces.incomplete)).resolves.toEqual({
      status: "denied",
      descriptors: [],
      message: PHASE127_CLIENT_COPY.incompleteActions,
    })
    expect(fixture.inventoryRequests).toHaveLength(1)

    const authorized = await controller.loadActions(PHASE127_IDS.workspaces.merged)
    expect(authorized.descriptors.some(({ action_id }) => action_id === "workspace.force-remove")).toBe(false)
    await controller.invokeLifecycle(PHASE127_IDS.workspaces.merged, "workspace.remove")
    expect(fixture.inventoryRequests).toHaveLength(3)
    const refreshed = await controller.loadActions(PHASE127_IDS.workspaces.merged)
    expect(refreshed.descriptors.some(({ action_id }) => action_id === "workspace.force-remove")).toBe(true)
  })

  test("action menu preserves canonical disabled reasons, hides Force, and latches lifecycle submission through reconciliation", async () => {
    const { createController, mountOverlay } = webStaleExports()
    const outcome = createDeferred<unknown>()
    let staleFetches = 0
    const fixture = controllerHarness({
      fetchEvaluation: async (request) => {
        fixture.requests.push(request)
        staleFetches += 1
        return staleFetches === 1 ? PHASE127_CLIENT_RESPONSES.populated : PHASE127_CLIENT_RESPONSES.refreshed
      },
      invokeCanonicalAction: (invocation) => {
        fixture.actionInvocations.push(invocation)
        return outcome.promise
      },
    })
    const controller = createController(fixture.options)
    const overlay = overlayHarness()
    const mounted = mountOverlay(overlay.view, controller)
    await mounted.ready
    await controller.loadActions(PHASE127_IDS.workspaces.merged)
    mounted.render()
    const text = overlay.view.body.textContent
    expect(text).toContain("Archive workspace")
    expect(text).toContain("Remove workspace")
    expect(text).not.toContain("Force Remove")
    const unavailable = PHASE127_ACTION_INVENTORIES.candidate.find(({ action_id }) => action_id === "workspace.remove")
    if (unavailable && !unavailable.availability.available) expect(text).toContain(unavailable.availability.message)

    const first = controller.invokeLifecycle(PHASE127_IDS.workspaces.merged, "workspace.archive")
    const repeated = controller.invokeLifecycle(PHASE127_IDS.workspaces.merged, "workspace.archive")
    await flushMicrotasks()
    expect(fixture.actionInvocations).toHaveLength(1)
    outcome.resolve(PHASE127_LIFECYCLE_OUTCOMES.acceptedOperation)
    await Promise.all([first, repeated])
    expect(fixture.reconciliations).toBe(1)
    expect(fixture.requests).toHaveLength(2)
    expect(controller.state()).toMatchObject({ phase: "loaded", response: PHASE127_CLIENT_RESPONSES.refreshed })
  })

  test("terminal completion reconciles normal and stale state once and never replays the lifecycle mutation", async () => {
    const { createController } = webStaleExports()
    let staleFetches = 0
    const fixture = controllerHarness({
      fetchEvaluation: async (request) => {
        fixture.requests.push(request)
        staleFetches += 1
        return staleFetches === 1 ? PHASE127_CLIENT_RESPONSES.populated : PHASE127_CLIENT_RESPONSES.refreshed
      },
    })
    const controller = createController(fixture.options)
    await controller.open()
    await controller.reconcileOperation(PHASE127_LIFECYCLE_OUTCOMES.acceptedOperation.operation_id)
    expect(fixture.reconciliations).toBe(1)
    expect(fixture.requests).toHaveLength(2)
    expect(fixture.requests[1]).toMatchObject({ expected_revision: "8", force_refresh: true })
    expect(fixture.actionInvocations).toHaveLength(0)
    expect(controller.state()).toMatchObject({ phase: "loaded", response: PHASE127_CLIENT_RESPONSES.refreshed })
  })
})

describe("Phase 127 web singleton focus, shortcuts, overflow, and disclosure", () => {
  test("singleton entry is adjacent to Archived, refocuses in place, and Escape/backdrop restore the exact invoker", async () => {
    const { createController, mountOverlay } = webStaleExports()
    expect(appSource).toMatch(/id=["']stale-workspaces["'][\s\S]{0,500}id=["']archived["']/)
    expect(appSource).toContain(PHASE127_CLIENT_COPY.entry)
    expect(appSource).toContain("workspace.stale")
    expect(appSource).toContain("showStaleWorkspaces")

    const fixture = controllerHarness()
    const stale = createController(fixture.options)
    const overlay = overlayHarness()
    const mounted = mountOverlay(overlay.view, stale)
    await mounted.ready
    const refresh = overlay.view.body.querySelector("[data-stale-refresh]")
    expect(overlay.document.activeElement).toBe(refresh)
    const refocused = overlay.overlayController.open({
      id: "workspace.stale",
      title: PHASE127_CLIENT_COPY.title,
      closeLabel: "Close stale workspaces",
      returnTarget: "wrong-target",
    })
    expect(refocused.kind).toBe("refocused")
    expect(overlay.document.activeElement).toBe(refresh)
    refresh?.dispatch("keydown", { key: "Escape" })
    expect(overlay.overlayController.activeSurface()).toBeUndefined()
    expect(overlay.restored).toEqual(["invoker"])
    expect(overlay.document.activeElement).toBe(overlay.invoker)

    const reopened = overlay.overlayController.open({
      id: "workspace.stale",
      title: PHASE127_CLIENT_COPY.title,
      closeLabel: "Close stale workspaces",
      returnTarget: "terminal-origin",
    })
    expect(reopened.kind).toBe("opened")
    const backdrop = overlay.document.body.querySelector(".modal-backdrop")
    backdrop?.dispatch("click")
    expect(overlay.overlayController.activeSurface()).toBeUndefined()
    expect(overlay.document.activeElement).toBe(overlay.invoker)
  })

  test("context-only R refresh ignores repeats, composition, input, and browser-global routing", async () => {
    const { createController, mountOverlay } = webStaleExports()
    const refresh = createDeferred<Phase127StaleResponse>()
    const fixture = controllerHarness({
      fetchEvaluation: (request) => {
        fixture.requests.push(request)
        return request.force_refresh ? refresh.promise : Promise.resolve(PHASE127_CLIENT_RESPONSES.populated)
      },
    })
    const controller = createController(fixture.options)
    const overlay = overlayHarness()
    const mounted = mountOverlay(overlay.view, controller)
    await mounted.ready
    const target = overlay.view.body as unknown as FakeElement
    const accepted = mounted.handleScopedKey(new FakeEvent("keydown", target, { key: "r", code: "KeyR" }) as unknown as KeyboardEvent)
    const repeat = mounted.handleScopedKey(new FakeEvent("keydown", target, { key: "r", code: "KeyR", repeat: true }) as unknown as KeyboardEvent)
    const composing = mounted.handleScopedKey(new FakeEvent("keydown", target, { key: "Process", code: "KeyR", isComposing: true }) as unknown as KeyboardEvent)
    const input = overlay.document.createElement("input")
    const fromInput = mounted.handleScopedKey(new FakeEvent("keydown", input, { key: "r", code: "KeyR" }) as unknown as KeyboardEvent)
    expect([accepted, repeat, composing, fromInput]).toEqual([true, false, false, false])
    expect(fixture.requests.filter(({ force_refresh }) => force_refresh)).toHaveLength(1)
    refresh.resolve(PHASE127_CLIENT_RESPONSES.refreshed)
    await mounted.idle()
    expect(navigationSource).toContain("workspace.stale.refresh")
    expect(navigationSource).not.toMatch(/(?:document|window)\.addEventListener\([^\n]+workspace\.stale\.refresh/)
  })

  test("canonical platform entry shortcut is registered while unmodified R has no browser-global default", () => {
    webStaleExports()
    expect(appSource).toContain('"workspace.stale"')
    expect(appSource).toContain("invokeRegisteredAction")
    expect(appSource).not.toMatch(/actionId\s*===\s*["']workspace\.stale\.refresh["'][\s\S]{0,300}(?:document|window)/)
    expect(navigationSource).toContain("workspace.stale")
  })

  test("overflow: exact 760px by 78vh geometry and desktop, 375px, and 320px rules prevent horizontal scrolling", () => {
    webStaleExports()
    expect(cssSource).toMatch(/\.stale-modal\s*\{[^}]*width:\s*min\(760px,\s*calc\(100vw\s*-\s*28px\)\)/)
    expect(cssSource).toMatch(/\.stale-modal\s*\{[^}]*max-height:\s*78vh/)
    expect(cssSource).toMatch(/\.stale-(?:body|content)\s*\{[^}]*overflow-y:\s*auto[^}]*overflow-x:\s*hidden/)
    expect(cssSource).toMatch(/@media \(max-width:\s*640px\)[\s\S]*stale/)
    expect(cssSource).toMatch(/@media \(max-width:\s*375px\)[\s\S]*stale/)
    expect(cssSource).toMatch(/@media \(max-width:\s*320px\)[\s\S]*stale/)
    expect(cssSource).toMatch(/@media \(max-width:\s*320px\)[\s\S]*\.stale-[^{]+\{[^}]*(?:grid-template-columns:\s*minmax\(0,\s*1fr\)|width:\s*100%)/)
  })

  test("long text remains accessible and renderer output excludes paths, credentials, argv, stdout, stderr, environment, and safety claims", async () => {
    const { createController, mountOverlay } = webStaleExports()
    const fixture = controllerHarness({
      fetchEvaluation: async (request) => {
        fixture.requests.push(request)
        return PHASE127_CLIENT_RESPONSES.many
      },
    })
    const controller = createController(fixture.options)
    const overlay = overlayHarness()
    const mounted = mountOverlay(overlay.view, controller)
    await mounted.ready
    const text = overlay.view.body.textContent
    expect(text).toContain(PHASE127_CLIENT_ROWS.longWorkspaceName)
    expect(text).toContain(PHASE127_CLIENT_ROWS.longRepositoryName)
    const longHeading = overlay.view.body.querySelector(`[data-workspace-id='${PHASE127_IDS.workspaces.inactive}']`)
    expect([longHeading?.title, longHeading?.getAttribute("aria-label"), longHeading?.textContent].join(" ")).toContain(PHASE127_CLIENT_ROWS.longWorkspaceName)
    expect(() => assertPhase127RendererTextSafe(text)).not.toThrow()
    for (const canary of PHASE127_FORBIDDEN_RENDER_TEXT) expect(text.toLocaleLowerCase("en-US")).not.toContain(canary.toLocaleLowerCase("en-US"))
  })
})
