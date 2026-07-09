import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { IntegrationContext, ArtifactBag, WindowArtifact, WindowDetector, DetectorSnapshot } from "@/lib/integrations/types"

// === TDD RED: WindowDetector interface and runner integration ===
// These tests are written BEFORE the implementation and should fail initially.

// ─── Shared mocks ────────────────────────────────────────────────────────────

const mockBegin = mock(async (): Promise<DetectorSnapshot> => ({ available: true, _brand: "niri", data: new Set([1, 2]) }))
const mockResolve = mock(async () => [42, 43])

const windowDetectorMock: WindowDetector = {
  id: "test-detector",
  begin: mockBegin,
  resolve: mockResolve,
}

// A window-producing fake integration with a windowDetector
const windowOpenMock = mock(async (_ctx: unknown, _path: string | null, _bag: ArtifactBag): Promise<WindowArtifact | null> => ({
  kind: "window",
  pid: 1234,
  app_id: "test-app",
  title: "",
}))

const windowIntegration = {
  id: "window-producer",
  label: "Window Producer",
  hint: "produces windows",
  enabledByDefault: true,
  order: 10,
  isEnabled: () => true,
  open: windowOpenMock,
  windowDetector: windowDetectorMock,
}

// A non-window-producing fake integration (no windowDetector)
const nonWindowOpenMock = mock(async () => null)

const nonWindowIntegration = {
  id: "non-window",
  label: "Non Window",
  hint: "does not produce windows",
  enabledByDefault: true,
  order: 20,
  isEnabled: () => true,
  open: nonWindowOpenMock,
}

// Consumer integration (tier 3, like niri) — no detector
const consumerOpenMock = mock(async () => null)
const consumerIntegration = {
  id: "consumer",
  label: "Consumer",
  hint: "tier-3 consumer",
  enabledByDefault: true,
  order: 30,
  isEnabled: () => true,
  open: consumerOpenMock,
}

const fakeIntegrations = [windowIntegration, nonWindowIntegration, consumerIntegration]

// Register the mock BEFORE importing runner
mock.module("@/lib/integrations/index", () => ({
  integrations: fakeIntegrations,
}))

const { runIntegrations } = await import("@/lib/integrations/runner")

const fakeCtx: IntegrationContext = {
  workspace: { name: "test-ws", repos: [], settings: {} } as any,
  tasksDir: "/tmp",
  config: { integrations: {} } as any,
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("WindowDetector — types and interface", () => {
  test("WindowDetector interface has begin() and resolve() and id", () => {
    // Type-level: these properties exist on the mock implementing WindowDetector
    expect(typeof windowDetectorMock.id).toBe("string")
    expect(typeof windowDetectorMock.begin).toBe("function")
    expect(typeof windowDetectorMock.resolve).toBe("function")
  })

  test("begin() returns a DetectorSnapshot with _brand and data", async () => {
    const snapshot = await windowDetectorMock.begin()
    expect(snapshot).toHaveProperty("_brand")
    expect(snapshot).toHaveProperty("data")
  })

  test("resolve() returns an array of numbers", async () => {
    const snapshot = await windowDetectorMock.begin()
    const ids = await windowDetectorMock.resolve(snapshot)
    expect(Array.isArray(ids)).toBe(true)
    ids.forEach((id) => expect(typeof id).toBe("number"))
  })
})

describe("WindowDetector — runner integration", () => {
  beforeEach(() => {
    mockBegin.mockReset()
    mockResolve.mockReset()
    windowOpenMock.mockReset()
    nonWindowOpenMock.mockReset()
    consumerOpenMock.mockReset()

    mockBegin.mockImplementation(async () => ({ available: true as const, _brand: "niri", data: new Set([1, 2]) }))
    mockResolve.mockImplementation(async () => [42, 43])
    windowOpenMock.mockImplementation(async () => ({
      kind: "window" as const,
      pid: 1234,
      app_id: "test-app",
      title: "",
    }))
    nonWindowOpenMock.mockImplementation(async () => null)
    consumerOpenMock.mockImplementation(async () => null)
  })

  test("runner calls begin() before open() for integrations with windowDetector", async () => {
    const beginCallsBefore = mockBegin.mock.calls.length

    await runIntegrations(fakeCtx)

    // begin() must have been called
    expect(mockBegin.mock.calls.length).toBeGreaterThan(beginCallsBefore)
  })

  test("runner calls resolve() after open() for window-producing integrations", async () => {
    await runIntegrations(fakeCtx)

    // resolve() must have been called after begin() once open() returned a WindowArtifact
    expect(mockResolve.mock.calls.length).toBeGreaterThan(0)
  })

  test("runner merges detector results into WindowArtifact.windowIds", async () => {
    const bag = await runIntegrations(fakeCtx)

    const artifact = bag["window-producer"] as WindowArtifact | null
    expect(artifact).not.toBeNull()
    expect(artifact!.kind).toBe("window")
    // windowIds should be populated by the runner from the detector
    expect(artifact!.windowIds).toBeDefined()
    expect(artifact!.windowIds!["test-detector"]).toEqual([42, 43])
  })

  test("runner does NOT populate windowIds if open() returns null", async () => {
    windowOpenMock.mockImplementation(async () => null)

    const bag = await runIntegrations(fakeCtx)

    expect(bag["window-producer"]).toBeNull()
    // resolve() should NOT have been called
    expect(mockResolve.mock.calls.length).toBe(0)
  })

  test("runner does NOT populate windowIds if open() returns non-window artifact", async () => {
    // Override the window integration to return a tmux artifact (unusual, but tests the kind check)
    windowOpenMock.mockImplementation(async () => ({
      kind: "tmux" as const,
      sessionName: "my-session",
    }) as any)

    await runIntegrations(fakeCtx)

    // resolve() should NOT be called for non-window artifacts
    expect(mockResolve.mock.calls.length).toBe(0)
  })

  test("runner never resolves an unavailable detector snapshot", async () => {
    mockBegin.mockResolvedValue({ available: false, _brand: "niri" })

    await runIntegrations(fakeCtx)

    expect(mockResolve).not.toHaveBeenCalled()
  })

  test("runner calls begin() for each integration opened (pre-spawn snapshot per open)", async () => {
    // There are 3 integrations: window-producer, non-window, consumer
    // The runner calls begin() on each detector before every integration's open()
    // This ensures correct pre-spawn snapshots regardless of whether each integration produces a window
    await runIntegrations(fakeCtx)

    // begin is called once per integration (3 integrations total)
    expect(mockBegin.mock.calls.length).toBe(3)
  })

  test("begin() is called before the integration open() — not after", async () => {
    const callOrder: string[] = []

    mockBegin.mockImplementation(async () => {
      callOrder.push("begin")
      return { available: true as const, _brand: "niri", data: new Set<number>() }
    })
    windowOpenMock.mockImplementation(async () => {
      callOrder.push("open")
      return { kind: "window" as const, pid: 1234, app_id: "test-app", title: "" }
    })
    mockResolve.mockImplementation(async () => {
      callOrder.push("resolve")
      return []
    })

    await runIntegrations(fakeCtx)

    const beginIdx = callOrder.indexOf("begin")
    const openIdx = callOrder.indexOf("open")
    const resolveIdx = callOrder.indexOf("resolve")
    expect(beginIdx).toBeLessThan(openIdx)
    expect(openIdx).toBeLessThan(resolveIdx)
  })
})

describe("WindowArtifact — windowIds field", () => {
  test("WindowArtifact can have windowIds as Record<string, number[]>", () => {
    // This is a compile-time test: if types.ts exports the right shape, this compiles
    const artifact: WindowArtifact = {
      kind: "window",
      pid: 1,
      app_id: "test",
      title: "",
      windowIds: { niri: [1, 2, 3], hyprland: [4] },
    }
    expect(artifact.windowIds!["niri"]).toEqual([1, 2, 3])
    expect(artifact.windowIds!["hyprland"]).toEqual([4])
  })

  test("WindowArtifact.windowIds is optional", () => {
    const artifact: WindowArtifact = {
      kind: "window",
      pid: 1,
      app_id: "test",
      title: "",
    }
    expect(artifact.windowIds).toBeUndefined()
  })
})
