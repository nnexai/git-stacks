/** @jsxImportSource @opentui/solid */

import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test"
import { readFileSync } from "node:fs"
import type { Component } from "solid-js"
import { createSignal } from "solid-js"
import { testRender } from "@opentui/solid"

import {
  PHASE127_CLIENT_COPY,
  PHASE127_CLIENT_RESPONSES,
  PHASE127_CLIENT_ROWS,
  PHASE127_CLIENT_STATES,
  PHASE127_FORBIDDEN_RENDER_TEXT,
  assertPhase127RendererTextSafe,
  type Phase127ClientUiState,
} from "../../helpers/phase127-client-fixtures"
import {
  PHASE127_IDS,
  createDeferred,
  type Phase127StaleResponse,
} from "../../helpers/phase127-stale-fixtures"

const activeRenderers: Array<{ destroy(): void }> = []

afterEach(() => {
  for (const renderer of activeRenderers.splice(0)) renderer.destroy()
})

type StaleSelection = {
  section: "candidate" | "incomplete"
  index: number
}

type StaleWorkspacesViewProps = {
  state: Phase127ClientUiState
  selection: StaleSelection
  detailOffset: number
  onSelectionChange(selection: StaleSelection): void
  onDetailPage(direction: "page-up" | "page-down"): void
  onRefresh(): void | Promise<void>
  onOpen(workspaceId: string): void | Promise<void>
  onActions(workspaceId: string): void | Promise<void>
  onAnnounce(message: string): void
  onBack(): void
}

type StaleRequestToken = {
  generation: number
  expectedRevision: string
}

type StaleWorkspaceRequestGate = {
  begin(expectedRevision: string): StaleRequestToken
  accepts(token: StaleRequestToken, response: Pick<Phase127StaleResponse, "revision">): boolean
  invalidate(): void
}

type CreateStaleWorkspaceRequestGate = () => StaleWorkspaceRequestGate

type RuntimeModule = Record<string, unknown>

const VIEW_MODULE_URL = new URL(
  "../../../packages/tui/src/StaleWorkspacesView.tsx",
  import.meta.url,
).href
const INVENTORY_MODULE_URL = new URL(
  "../../../packages/tui/src/workspace-action-inventory.ts",
  import.meta.url,
).href

const appSource = readFileSync(new URL("../../../packages/tui/src/App.tsx", import.meta.url), "utf8")
const typesSource = readFileSync(new URL("../../../packages/tui/src/types.ts", import.meta.url), "utf8")
let viewSource: string | undefined
let viewSourceLoadError: unknown
let viewModule: RuntimeModule | undefined
let viewModuleLoadError: unknown
let inventoryModule: RuntimeModule | undefined
let inventoryModuleLoadError: unknown

beforeAll(async () => {
  try {
    viewSource = readFileSync(new URL("../../../packages/tui/src/StaleWorkspacesView.tsx", import.meta.url), "utf8")
  } catch (error) {
    viewSourceLoadError = error
  }
  try {
    viewModule = await import(VIEW_MODULE_URL) as RuntimeModule
  } catch (error) {
    viewModuleLoadError = error
  }
  try {
    inventoryModule = await import(INVENTORY_MODULE_URL) as RuntimeModule
  } catch (error) {
    inventoryModuleLoadError = error
  }
})

function staleView(): Component<StaleWorkspacesViewProps> {
  expect(
    viewModuleLoadError,
    "Phase 127 TUI must provide packages/tui/src/StaleWorkspacesView.tsx",
  ).toBeUndefined()
  const value = viewModule?.StaleWorkspacesView
  expect(
    value,
    "Phase 127 TUI stale module must export StaleWorkspacesView",
  ).toBeTypeOf("function")
  return value as Component<StaleWorkspacesViewProps>
}

function staleRequestGate(): CreateStaleWorkspaceRequestGate {
  expect(
    inventoryModuleLoadError,
    "Phase 127 TUI request gate must load through packages/tui/src/workspace-action-inventory.ts",
  ).toBeUndefined()
  const value = inventoryModule?.createStaleWorkspaceRequestGate
  expect(
    value,
    "Phase 127 TUI inventory module must export createStaleWorkspaceRequestGate",
  ).toBeTypeOf("function")
  return value as CreateStaleWorkspaceRequestGate
}

function assertNoNestedText(source: string): void {
  let depth = 0
  for (const match of source.matchAll(/<\/?text\b[^>]*\/?\s*>/g)) {
    const token = match[0]
    if (token.startsWith("</")) {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth > 0) throw new Error(`Nested OpenTUI <text> node at source offset ${match.index}`)
    if (!token.endsWith("/>")) depth += 1
  }
}

function normalizedFrame(frame: string): string {
  return frame.replace(/\s+/g, "")
}

type ViewCallbacks = {
  selections: StaleSelection[]
  pages: Array<"page-up" | "page-down">
  refreshes: number
  opens: string[]
  actions: string[]
  announcements: string[]
  backs: number
}

async function renderStaleView(options: {
  state?: Phase127ClientUiState
  selection?: StaleSelection
  detailOffset?: number
  width?: number
  height?: number
  onRefresh?: () => void | Promise<void>
  onOpen?: (workspaceId: string) => void | Promise<void>
  onActions?: (workspaceId: string) => void | Promise<void>
} = {}) {
  const View = staleView()
  const callbacks: ViewCallbacks = {
    selections: [],
    pages: [],
    refreshes: 0,
    opens: [],
    actions: [],
    announcements: [],
    backs: 0,
  }
  let updateSelection: ((selection: StaleSelection) => void) | undefined
  let updateOffset: ((offset: number) => void) | undefined
  const rendered = await testRender(() => {
    const [selection, setSelection] = createSignal<StaleSelection>(options.selection ?? { section: "candidate", index: 0 })
    const [detailOffset, setDetailOffset] = createSignal(options.detailOffset ?? 0)
    updateSelection = setSelection
    updateOffset = setDetailOffset
    return (
      <View
        state={options.state ?? PHASE127_CLIENT_STATES.loaded}
        selection={selection()}
        detailOffset={detailOffset()}
        onSelectionChange={(next) => {
          callbacks.selections.push(next)
          setSelection(next)
        }}
        onDetailPage={(direction) => {
          callbacks.pages.push(direction)
          setDetailOffset((value) => Math.max(0, value + (direction === "page-down" ? 1 : -1)))
        }}
        onRefresh={() => {
          callbacks.refreshes += 1
          return options.onRefresh?.()
        }}
        onOpen={(workspaceId) => {
          callbacks.opens.push(workspaceId)
          return options.onOpen?.(workspaceId)
        }}
        onActions={(workspaceId) => {
          callbacks.actions.push(workspaceId)
          return options.onActions?.(workspaceId)
        }}
        onAnnounce={(message) => callbacks.announcements.push(message)}
        onBack={() => { callbacks.backs += 1 }}
      />
    )
  }, {
    width: options.width ?? 90,
    height: options.height ?? 28,
    kittyKeyboard: true,
  })
  activeRenderers.push(rendered.renderer)
  return {
    ...rendered,
    callbacks,
    setSelection(selection: StaleSelection) { updateSelection?.(selection) },
    setDetailOffset(offset: number) { updateOffset?.(offset) },
  }
}

describe("Phase 127 dedicated Stale Workspaces UIView guarded contract", () => {
  test("loads the guarded OpenTUI component without a discovery failure", () => {
    expect(staleView()).toBeTypeOf("function")
  })

  test("declares a dedicated stale-workspaces UIView with exact origin instead of overloading Archived Workspaces", () => {
    staleView()
    expect(typesSource).toContain('view: "stale-workspaces"')
    expect(typesSource).toMatch(/view:\s*["']stale-workspaces["'][^|]+origin/s)
    expect(appSource).toContain('view().view === "stale-workspaces"')
    expect(appSource).toContain("origin")
    expect(appSource).not.toMatch(/archived-workspaces[^|\n]+stale/i)
  })
})

describe("Phase 127 OpenTUI empty, loading, error, populated, and partial states", () => {
  test("empty: all-clear and incomplete-only states remain distinct with Refresh and canonical Open", async () => {
    const clear = await renderStaleView({
      state: { phase: "loaded", response: PHASE127_CLIENT_RESPONSES.empty },
    })
    await clear.renderOnce()
    expect(clear.captureCharFrame()).toContain(PHASE127_CLIENT_COPY.emptyHeading)
    expect(clear.captureCharFrame()).toContain("[r] Refresh evidence")
    expect(clear.captureCharFrame()).not.toContain("[a] Actions")

    const incomplete = await renderStaleView({
      state: { phase: "loaded", response: PHASE127_CLIENT_RESPONSES.incompleteOnly },
      selection: { section: "incomplete", index: 0 },
    })
    await incomplete.renderOnce()
    const frame = incomplete.captureCharFrame()
    expect(frame).toContain("No confirmed stale workspaces")
    expect(frame).toContain(PHASE127_CLIENT_COPY.incompleteSection)
    expect(frame).toContain("unknown-only-evaluation")
    expect(frame).toContain("[o/Enter] Open")
    expect(frame).not.toContain("[a] Actions")
  })

  test("loading: initial and retained refresh states keep stable geometry and suppress fabricated rows", async () => {
    const loading = await renderStaleView({ state: PHASE127_CLIENT_STATES.initialLoading })
    await loading.renderOnce()
    const initialFrame = loading.captureCharFrame()
    expect(initialFrame).toContain("Loading stale workspace")
    expect(initialFrame).not.toContain("zulu-service-first")
    expect(initialFrame).toContain("[Esc] Back")

    const refreshing = await renderStaleView({ state: PHASE127_CLIENT_STATES.refreshing })
    await refreshing.renderOnce()
    const retainedFrame = refreshing.captureCharFrame()
    expect(retainedFrame).toContain("Refreshing stale workspace")
    expect(retainedFrame).toContain("zulu-service-first")
    expect(retainedFrame).toContain("alpha-service-second")
    expect(retainedFrame).not.toContain("No stale workspaces")
  })

  test("error: first-load Retry differs from retained-data failure and Open failure keeps the selected row", async () => {
    const first = await renderStaleView({ state: PHASE127_CLIENT_STATES.firstLoadError })
    await first.renderOnce()
    expect(first.captureCharFrame()).toContain("Stale workspace evidence could")
    expect(first.captureCharFrame()).toContain("[r] Retry refresh")
    expect(first.captureCharFrame()).not.toContain("zulu-service-first")

    const retained = await renderStaleView({ state: PHASE127_CLIENT_STATES.retainedError })
    await retained.renderOnce()
    expect(retained.captureCharFrame()).toContain("Stale evidence could not be")
    expect(retained.captureCharFrame()).toContain("zulu-service-first")

    const openError = await renderStaleView({ state: PHASE127_CLIENT_STATES.openError })
    await openError.renderOnce()
    expect(openError.captureCharFrame()).toContain("Could not open")
    expect(openError.captureCharFrame()).toContain("zulu-service-first")
    expect(openError.captureCharFrame()).toContain("[o/Enter] Open")
  })

  test("populated and partial: service order, every reason/time, unknown, caution, and incomplete section remain visible", async () => {
    const view = await renderStaleView({ width: 100, height: 40 })
    await view.renderOnce()
    const frame = view.captureCharFrame()
    expect(frame.indexOf("zulu-service-first")).toBeLessThan(frame.indexOf("alpha-service-second"))
    expect(frame).toContain(PHASE127_CLIENT_COPY.reasonLabels.merged)
    expect(frame).toContain(PHASE127_CLIENT_COPY.reasonLabels.closed)
    expect(frame).toContain("Remote branch missing")
    expect(frame).toContain("Managed worktree missing")
    expect(frame).toContain("Inactive for 30 days")
    expect(frame).toContain(PHASE127_CLIENT_COPY.unknownHeading)
    expect(frame).toContain(PHASE127_CLIENT_COPY.cautionHeading)
    expect(frame).toContain("2026-07-10 09:30:00 UTC")
    expect(frame).toContain(PHASE127_CLIENT_COPY.incompleteSection)
  })

  test("zero-one-many: one row keeps full detail and many rows remain in one bounded unpaginated collection", async () => {
    const one = await renderStaleView({
      state: { phase: "loaded", response: PHASE127_CLIENT_RESPONSES.one },
      width: 90,
      height: 26,
    })
    await one.renderOnce()
    expect(one.captureCharFrame()).toContain("zulu-service-first")
    expect(one.captureCharFrame()).toContain(PHASE127_CLIENT_COPY.confirmedHeading)

    const many = await renderStaleView({
      state: { phase: "loaded", response: PHASE127_CLIENT_RESPONSES.many },
      width: 90,
      height: 20,
    })
    await many.renderOnce()
    expect(many.captureCharFrame()).toContain("3 cleanup candidates")
    expect(many.captureCharFrame().toLocaleLowerCase("en-US")).not.toContain("page 1")
    many.mockInput.pressKey("end")
    await many.renderOnce()
    expect(many.callbacks.selections.at(-1)).toEqual({ section: "incomplete", index: 0 })
  })
})

describe("Phase 127 OpenTUI width tiers, overflow, navigation, and owned keys", () => {
  test("overflow: 80+ is two-pane, 56-79 stacked, below 56 single-column, and 40x12 remains usable", async () => {
    staleView()
    expect(viewSourceLoadError, "Phase 127 TUI stale view source must exist for tier inspection").toBeUndefined()
    expect(viewSource).toMatch(/width\s*>=\s*80|width\s*<\s*80/)
    expect(viewSource).toMatch(/width\s*>=\s*56|width\s*<\s*56/)
    expect(viewSource).toMatch(/width\s*<\s*40/)
    expect(viewSource).toMatch(/height\s*<\s*12/)

    for (const [width, expected] of [[90, "two-pane"], [79, "stacked"], [56, "stacked"], [55, "single-column"], [40, "single-column"]] as const) {
      const rendered = await renderStaleView({ width, height: 32 })
      await rendered.renderOnce()
      const frame = rendered.captureCharFrame()
      expect(frame, `${expected} tier must keep the stale title`).toContain(PHASE127_CLIENT_COPY.title)
      expect(frame, `${expected} tier must keep Open`).toContain("Open")
      expect(frame, `${expected} tier must keep Refresh`).toContain("Refresh")
      expect(frame, `${expected} tier must keep Back`).toContain("Back")
      expect(frame).toContain("zulu")
    }
  })

  test("under 40x12 renders the Escape-only fallback and leaks no Open, Refresh, or action input", async () => {
    const rendered = await renderStaleView({ width: 39, height: 11 })
    await rendered.renderOnce()
    const frame = rendered.captureCharFrame()
    expect(frame).toContain("Terminal is too small for")
    expect(frame).toContain("Stale Workspaces. Resize to at")
    expect(frame).toContain("[Esc] Back")
    expect(frame).not.toContain("[o/Enter] Open")
    expect(frame).not.toContain("[r] Refresh")
    expect(frame).not.toContain("[a] Actions")
    rendered.mockInput.pressKey("o")
    rendered.mockInput.pressEnter()
    rendered.mockInput.pressKey("r")
    rendered.mockInput.pressKey("a")
    rendered.mockInput.pressArrow("down")
    await rendered.renderOnce()
    expect(rendered.callbacks.opens).toEqual([])
    expect(rendered.callbacks.refreshes).toBe(0)
    expect(rendered.callbacks.actions).toEqual([])
    expect(rendered.callbacks.selections).toEqual([])
    rendered.mockInput.pressEscape()
    await rendered.renderOnce()
    expect(rendered.callbacks.backs).toBe(1)
  })

  test("arrows, j/k, Home/End clamp across candidate and incomplete rows without wrapping or reordering", async () => {
    const rendered = await renderStaleView({
      state: { phase: "loaded", response: PHASE127_CLIENT_RESPONSES.many },
      width: 90,
      height: 30,
    })
    await rendered.renderOnce()
    rendered.mockInput.pressArrow("up")
    rendered.mockInput.pressArrow("down")
    rendered.mockInput.pressKey("j")
    rendered.mockInput.pressArrow("down")
    rendered.mockInput.pressArrow("down")
    rendered.mockInput.pressKey("k")
    rendered.mockInput.pressKey("home")
    rendered.mockInput.pressKey("end")
    await rendered.renderOnce()
    expect(rendered.callbacks.selections).toEqual([
      { section: "candidate", index: 1 },
      { section: "candidate", index: 2 },
      { section: "incomplete", index: 0 },
      { section: "candidate", index: 2 },
      { section: "candidate", index: 0 },
      { section: "incomplete", index: 0 },
    ])
  })

  test("PageUp/PageDown scroll only selected evidence detail and leave row selection stable", async () => {
    const rendered = await renderStaleView({ width: 79, height: 14 })
    await rendered.renderOnce()
    rendered.mockInput.pressKey("pagedown")
    rendered.mockInput.pressKey("pagedown")
    rendered.mockInput.pressKey("pageup")
    await rendered.renderOnce()
    expect(rendered.callbacks.pages).toEqual(["page-down", "page-down", "page-up"])
    expect(rendered.callbacks.selections).toEqual([])
  })

  test("r is one generation-safe force refresh and repeated keys are ignored while pending", async () => {
    const pending = createDeferred<void>()
    const rendered = await renderStaleView({ onRefresh: () => pending.promise })
    await rendered.renderOnce()
    rendered.mockInput.pressKey("r")
    rendered.mockInput.pressKey("r")
    rendered.mockInput.pressKey("r")
    await rendered.renderOnce()
    expect(rendered.callbacks.refreshes).toBe(1)
    pending.resolve()
    await Bun.sleep(1)
    rendered.mockInput.pressKey("r")
    await rendered.renderOnce()
    expect(rendered.callbacks.refreshes).toBe(2)
  })

  test("o and Enter submit canonical Open once, while candidate-only a denies incomplete lifecycle access", async () => {
    const openPending = createDeferred<void>()
    const candidate = await renderStaleView({ onOpen: () => openPending.promise })
    await candidate.renderOnce()
    candidate.mockInput.pressKey("o")
    candidate.mockInput.pressEnter()
    candidate.mockInput.pressKey("o")
    candidate.mockInput.pressKey("a")
    candidate.mockInput.pressKey("a")
    await candidate.renderOnce()
    expect(candidate.callbacks.opens).toEqual([PHASE127_IDS.workspaces.merged])
    expect(candidate.callbacks.actions).toEqual([PHASE127_IDS.workspaces.merged])
    openPending.resolve()
    await Bun.sleep(1)

    const incomplete = await renderStaleView({
      selection: { section: "incomplete", index: 0 },
    })
    await incomplete.renderOnce()
    incomplete.mockInput.pressKey("o")
    incomplete.mockInput.pressKey("a")
    await incomplete.renderOnce()
    expect(incomplete.callbacks.opens).toEqual([PHASE127_IDS.workspaces.incomplete])
    expect(incomplete.callbacks.actions).toEqual([])
    expect(incomplete.callbacks.announcements).toContain(PHASE127_CLIENT_COPY.incompleteActions)
  })

  test("Escape restores the exact originating view/row and stale keys are owned before dashboard handlers", () => {
    staleView()
    expect(appSource).toContain('view: "stale-workspaces"')
    expect(appSource).toMatch(/stale-workspaces[\s\S]{0,1200}escape[\s\S]{0,600}origin/i)
    const staleBranch = appSource.indexOf('view().view === "stale-workspaces"')
    const dashboardNavigation = appSource.indexOf('key.name === "down"', staleBranch + 1)
    expect(staleBranch).toBeGreaterThanOrEqual(0)
    expect(dashboardNavigation).toBeGreaterThan(staleBranch)
    expect(appSource).toMatch(/key\.name\s*===\s*["']s["'][\s\S]{0,500}stale-workspaces/)
  })
})

describe("Phase 127 OpenTUI generation, text structure, and disclosure", () => {
  test("late and wrong-revision responses are rejected after a newer request or view exit", () => {
    const createGate = staleRequestGate()
    const gate = createGate()
    const old = gate.begin("7")
    const current = gate.begin("7")
    expect(gate.accepts(old, PHASE127_CLIENT_RESPONSES.populated)).toBe(false)
    expect(gate.accepts(current, PHASE127_CLIENT_RESPONSES.refreshed)).toBe(false)
    expect(gate.accepts(current, PHASE127_CLIENT_RESPONSES.populated)).toBe(true)
    gate.invalidate()
    expect(gate.accepts(current, PHASE127_CLIENT_RESPONSES.populated)).toBe(false)
  })

  test("renderer source contains no nested OpenTUI text nodes", () => {
    staleView()
    expect(viewSourceLoadError, "Phase 127 TUI stale view source must exist for nested-text inspection").toBeUndefined()
    expect(() => assertNoNestedText(viewSource ?? "")).not.toThrow()
  })

  test("renderer mounts every stale-detail spacer branch without orphan text", async () => {
    const rendered = await renderStaleView({
      state: { phase: "loaded", response: PHASE127_CLIENT_RESPONSES.populated },
      width: 100,
      height: 40,
    })
    await rendered.renderOnce()
    const frame = rendered.captureCharFrame()
    expect(frame).toContain(PHASE127_CLIENT_COPY.confirmedHeading)
    expect(frame).toContain(PHASE127_CLIENT_COPY.unknownHeading)
    expect(frame).toContain(PHASE127_CLIENT_COPY.cautionHeading)
    expect(frame).toContain("[o/Enter] Open workspace")
  })

  test("long names, reasons, timestamps, unknown recovery, and disabled explanations remain readable without disclosure", async () => {
    const rendered = await renderStaleView({
      state: { phase: "loaded", response: PHASE127_CLIENT_RESPONSES.many },
      selection: { section: "candidate", index: 2 },
      width: 55,
      height: 40,
    })
    await rendered.renderOnce()
    const frame = rendered.captureCharFrame()
    const compact = normalizedFrame(frame)
    expect(compact).toContain(PHASE127_CLIENT_ROWS.longWorkspaceName)
    expect(compact).toContain(PHASE127_CLIENT_ROWS.longRepositoryName)
    expect(frame).toContain("Confirmed missing")
    expect(frame).toContain("2026-07-17 12:00:00 UTC")
    expect(() => assertPhase127RendererTextSafe(frame)).not.toThrow()
    for (const canary of PHASE127_FORBIDDEN_RENDER_TEXT) {
      expect(frame.toLocaleLowerCase("en-US")).not.toContain(canary.toLocaleLowerCase("en-US"))
    }
  })

  test("deterministic renderer evidence is not labelled hosted, authenticated, physical, visual, interactive, human-approved, or release-authorized", async () => {
    const rendered = await renderStaleView()
    await rendered.renderOnce()
    const frame = rendered.captureCharFrame().toLocaleLowerCase("en-US")
    for (const claim of [
      "hosted evidence",
      "authenticated evidence",
      "physical browser",
      "screenshot approved",
      "interactive validation complete",
      "human approved",
      "release authorized",
    ]) expect(frame).not.toContain(claim)
  })
})
