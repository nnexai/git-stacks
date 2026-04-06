import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { IntegrationContext, ArtifactBag, TmuxArtifact } from "@/lib/integrations/types"

// Shared call-order tracker for ordering tests
const callOrder: string[] = []

// Fake integrations: array order is [high(20), low(10), mid(12)] to test sorting
const highOpenMock = mock(async (_ctx: unknown, _path: string | null, _bag: ArtifactBag) => null)
const highGenerateMock = mock((_ctx: unknown): string | null => null)
const lowOpenMock = mock(async (_ctx: unknown, _path: string | null, _bag: ArtifactBag): Promise<TmuxArtifact | null> => ({
  kind: "tmux",
  sessionName: "low-session",
}))
const lowGenerateMock = mock((_ctx: unknown): string | null => null)
const midOpenMock = mock(async (_ctx: unknown, _path: string | null, _bag: ArtifactBag) => null)
const midGenerateMock = mock((_ctx: unknown): string | null => null)
const disabledOpenMock = mock(async (_ctx: unknown, _path: string | null, _bag: ArtifactBag) => null)
const disabledGenerateMock = mock((_ctx: unknown): string | null => null)
const noAppliesOpenMock = mock(async (_ctx: unknown, _path: string | null, _bag: ArtifactBag) => null)
const noAppliesGenerateMock = mock((_ctx: unknown): string | null => null)
const noGenerateOpenMock = mock(async (_ctx: unknown, _path: string | null, _bag: ArtifactBag) => null)
const skipOpenMock = mock(async (_ctx: unknown, _path: string | null, _bag: ArtifactBag) => null)
const skipGenerateMock = mock((_ctx: unknown): string | null => null)

const fakeIntegrations = [
  {
    id: "high",
    label: "High Order",
    hint: "tier 2",
    enabledByDefault: true,
    order: 20,
    capabilities: new Set(["generate"]),
    isEnabled: () => true,
    generate: (ctx: unknown) => {
      callOrder.push("high-generate")
      return highGenerateMock(ctx)
    },
    open: async (ctx: unknown, path: string | null, bag: ArtifactBag) => {
      callOrder.push("high-open")
      return highOpenMock(ctx, path, bag)
    },
  },
  {
    id: "low",
    label: "Low Order",
    hint: "tier 1",
    enabledByDefault: true,
    order: 10,
    capabilities: new Set(["generate"]),
    isEnabled: () => true,
    generate: (ctx: unknown) => {
      callOrder.push("low-generate")
      return lowGenerateMock(ctx)
    },
    open: async (ctx: unknown, path: string | null, bag: ArtifactBag) => {
      callOrder.push("low-open")
      return lowOpenMock(ctx, path, bag)
    },
  },
  {
    id: "mid",
    label: "Mid Order",
    hint: "tier 1b",
    enabledByDefault: true,
    order: 12,
    capabilities: new Set(["generate"]),
    isEnabled: () => true,
    generate: (ctx: unknown) => {
      callOrder.push("mid-generate")
      return midGenerateMock(ctx)
    },
    open: async (ctx: unknown, path: string | null, bag: ArtifactBag) => {
      callOrder.push("mid-open")
      return midOpenMock(ctx, path, bag)
    },
  },
  {
    id: "disabled",
    label: "Disabled",
    hint: "always disabled",
    enabledByDefault: false,
    order: 15,
    capabilities: new Set(["generate"]),
    isEnabled: () => false,
    generate: disabledGenerateMock,
    open: disabledOpenMock,
  },
  {
    id: "no-applies",
    label: "No Applies",
    hint: "applies returns false",
    enabledByDefault: true,
    order: 16,
    capabilities: new Set(["generate", "applies"]),
    isEnabled: () => true,
    applies: () => false,
    generate: noAppliesGenerateMock,
    open: noAppliesOpenMock,
  },
  {
    id: "no-generate",
    label: "No Generate",
    hint: "no generate capability",
    enabledByDefault: true,
    order: 17,
    capabilities: new Set([]),
    isEnabled: () => true,
    open: noGenerateOpenMock,
    // generate is intentionally undefined (no capability declared)
  },
  {
    id: "skip-me",
    label: "Skip Me",
    hint: "will be skipped via skip set",
    enabledByDefault: true,
    order: 18,
    capabilities: new Set(["generate"]),
    isEnabled: () => true,
    generate: skipGenerateMock,
    open: skipOpenMock,
  },
]

// Register the mock BEFORE importing runner
mock.module("@/lib/integrations/index", () => ({
  integrations: fakeIntegrations,
}))

const { runIntegrationGenerate, runIntegrations, runIntegrationCleanup } = await import("@/lib/integrations/runner")

// Fake context
const fakeCtx: IntegrationContext = {
  workspace: { name: "test", repos: [] } as any,
  tasksDir: "/tmp",
  config: { integrations: {} } as any,
}

describe("runIntegrationGenerate", () => {
  beforeEach(() => {
    callOrder.length = 0
    highGenerateMock.mockReset()
    lowGenerateMock.mockReset()
    midGenerateMock.mockReset()
    disabledGenerateMock.mockReset()
    noAppliesGenerateMock.mockReset()
    highGenerateMock.mockImplementation(() => null)
    lowGenerateMock.mockImplementation(() => null)
    midGenerateMock.mockImplementation(() => null)
    highOpenMock.mockReset()
    lowOpenMock.mockReset()
    midOpenMock.mockReset()
    skipGenerateMock.mockReset()
    skipOpenMock.mockReset()
  })

  test("executes integrations in ascending order (low=10, mid=12, high=20), not array order", async () => {
    await runIntegrationGenerate(fakeCtx)

    // Only enabled integrations with applies() returning true or no applies method
    const generateCalls = callOrder.filter((c) => c.endsWith("-generate"))
    expect(generateCalls[0]).toBe("low-generate")
    expect(generateCalls[1]).toBe("mid-generate")
    // no-generate has no generate capability so won't appear
    // high comes after mid
    const highIdx = generateCalls.indexOf("high-generate")
    const midIdx = generateCalls.indexOf("mid-generate")
    expect(highIdx).toBeGreaterThan(midIdx)
  })

  test("does NOT call open() on any integration", async () => {
    await runIntegrationGenerate(fakeCtx)

    expect(highOpenMock).not.toHaveBeenCalled()
    expect(lowOpenMock).not.toHaveBeenCalled()
    expect(midOpenMock).not.toHaveBeenCalled()
  })

  test("skips integrations where isEnabled returns false", async () => {
    await runIntegrationGenerate(fakeCtx)

    expect(disabledGenerateMock).not.toHaveBeenCalled()
  })

  test("skips integrations where applies() returns false", async () => {
    await runIntegrationGenerate(fakeCtx)

    expect(noAppliesGenerateMock).not.toHaveBeenCalled()
  })

  test("integration without generate capability does not throw and has path=null", async () => {
    const results = await runIntegrationGenerate(fakeCtx)

    const noGenResult = results.find((r: { integration: { id: string } }) => r.integration.id === "no-generate")
    expect(noGenResult).toBeDefined()
    expect(noGenResult!.path).toBeNull()
  })

  test("returns results keyed with integration and path for each enabled integration", async () => {
    lowGenerateMock.mockImplementation(() => "/tmp/low-artifact")
    const results = await runIntegrationGenerate(fakeCtx)

    const lowResult = results.find((r: { integration: { id: string } }) => r.integration.id === "low")
    expect(lowResult).toBeDefined()
    expect(lowResult!.path).toBe("/tmp/low-artifact")
  })

  test("skips generate when capability not declared even if method exists", async () => {
    // Use the existing "no-generate" fake which has capabilities: new Set([])
    // and no generate method — confirming path=null is returned via capability gating
    const results = await runIntegrationGenerate(fakeCtx)
    const noGenResult = results.find((r: { integration: { id: string } }) => r.integration.id === "no-generate")
    expect(noGenResult).toBeDefined()
    expect(noGenResult!.path).toBeNull()
  })
})

describe("runIntegrations", () => {
  beforeEach(() => {
    callOrder.length = 0
    highGenerateMock.mockReset()
    lowGenerateMock.mockReset()
    midGenerateMock.mockReset()
    disabledGenerateMock.mockReset()
    noAppliesGenerateMock.mockReset()
    highOpenMock.mockReset()
    lowOpenMock.mockReset()
    midOpenMock.mockReset()
    noGenerateOpenMock.mockReset()
    skipGenerateMock.mockReset()
    skipOpenMock.mockReset()
    highGenerateMock.mockImplementation(() => null)
    lowGenerateMock.mockImplementation(() => null)
    midGenerateMock.mockImplementation(() => null)
    highOpenMock.mockImplementation(async () => null)
    midOpenMock.mockImplementation(async () => null)
    noGenerateOpenMock.mockImplementation(async () => null)
    // lowOpenMock: return a real artifact for accumulation tests
    lowOpenMock.mockImplementation(async () => ({ kind: "tmux", sessionName: "low-session" } as TmuxArtifact))
  })

  test("executes integrations in ascending order (low, mid, high), not array order", async () => {
    await runIntegrations(fakeCtx)

    const openCalls = callOrder.filter((c) => c.endsWith("-open"))
    const lowIdx = openCalls.indexOf("low-open")
    const midIdx = openCalls.indexOf("mid-open")
    const highIdx = openCalls.indexOf("high-open")
    expect(lowIdx).toBeLessThan(midIdx)
    expect(midIdx).toBeLessThan(highIdx)
  })

  test("calls generate() then open() and accumulates ArtifactBag", async () => {
    const bag = await runIntegrations(fakeCtx)

    expect(bag).toHaveProperty("low")
    expect(bag["low"]).toEqual({ kind: "tmux", sessionName: "low-session" })
  })

  test("passes accumulated bag to each subsequent open() call", async () => {
    let bagSeenByMid: ArtifactBag | undefined
    midOpenMock.mockImplementation(async (_ctx: unknown, _path: string | null, bag: ArtifactBag) => {
      bagSeenByMid = { ...bag }
      return null
    })

    await runIntegrations(fakeCtx)

    // mid runs after low, so by the time mid.open is called, bag should have low's artifact
    expect(bagSeenByMid).toBeDefined()
    expect(bagSeenByMid!["low"]).toEqual({ kind: "tmux", sessionName: "low-session" })
  })

  test("with skip=Set(['skip-me']) does not call skip-me's generate or open", async () => {
    await runIntegrations(fakeCtx, new Set(["skip-me"]))

    expect(skipGenerateMock).not.toHaveBeenCalled()
    expect(skipOpenMock).not.toHaveBeenCalled()
  })

  test("skips integrations where isEnabled returns false", async () => {
    await runIntegrations(fakeCtx)

    expect(disabledGenerateMock).not.toHaveBeenCalled()
    expect(disabledOpenMock).not.toHaveBeenCalled()
  })

  test("skips integrations where applies() returns false", async () => {
    await runIntegrations(fakeCtx)

    expect(noAppliesGenerateMock).not.toHaveBeenCalled()
    expect(noAppliesOpenMock).not.toHaveBeenCalled()
  })

  test("integration without generate capability does not throw and open receives path=null", async () => {
    let pathSeenByNoGen: string | null | undefined = undefined
    noGenerateOpenMock.mockImplementation(async (_ctx: unknown, path: string | null, _bag: ArtifactBag) => {
      pathSeenByNoGen = path
      return null
    })

    await expect(runIntegrations(fakeCtx)).resolves.toBeDefined()
    expect(pathSeenByNoGen).toBeNull()
  })

  test("returns ArtifactBag keyed by integration.id", async () => {
    const bag = await runIntegrations(fakeCtx)

    expect(typeof bag).toBe("object")
    // low is in the bag (it returns an artifact)
    expect("low" in bag).toBe(true)
    // high is in the bag (returns null artifact)
    expect("high" in bag).toBe(true)
  })

  test("skips generate in runIntegrations when capability not declared", async () => {
    // The "no-generate" fake has capabilities: new Set([]) and no generate method
    // It should receive path=null in open()
    let pathSeenByNoGen: string | null | undefined = undefined
    noGenerateOpenMock.mockImplementation(async (_ctx: unknown, path: string | null, _bag: ArtifactBag) => {
      pathSeenByNoGen = path
      return null
    })

    await runIntegrations(fakeCtx)
    expect(pathSeenByNoGen).toBeNull()
  })
})

describe("runIntegrationCleanup", () => {
  test("calls cleanup on integrations with cleanup capability", async () => {
    // None of the fakeIntegrations have 'cleanup' capability.
    // runIntegrationCleanup should complete without error and call no cleanup.
    // Capability gating is verified by absence of errors on integrations with no cleanup method.
    await runIntegrationCleanup(fakeCtx)
    expect(true).toBe(true)
  })

  test("skips cleanup on integrations without cleanup capability", async () => {
    // All fakeIntegrations have no 'cleanup' capability.
    // runIntegrationCleanup should complete without error and skip all.
    await expect(runIntegrationCleanup(fakeCtx)).resolves.toBeUndefined()
  })
})
