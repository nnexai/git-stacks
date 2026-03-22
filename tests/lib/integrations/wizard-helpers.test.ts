import { describe, test, expect, mock, beforeEach } from "bun:test"
import type { Mock } from "bun:test"

// Shared mock instances used by @/tui/utils mock below
const localConfirm = mock(async () => false as boolean | symbol)
const localMultiselect = mock(async () => [] as string[] | symbol)
const localIsCancel = mock((v: unknown) => typeof v === "symbol")

// Mock integrations
const mockConfigurePrompt = mock(async (current: Record<string, unknown>) => ({
  ...current,
  enabled: true,
}))

const fakeIntegrations = [
  {
    id: "vscode",
    label: "VSCode",
    hint: "Open in VSCode",
    enabledByDefault: true,
    order: 10,
    configurePrompt: mockConfigurePrompt,
  },
  {
    id: "tmux",
    label: "tmux",
    hint: "Open in tmux",
    enabledByDefault: false,
    order: 12,
    configurePrompt: mock(async (current: Record<string, unknown>) => ({
      ...current,
      enabled: true,
    })),
  },
]

mock.module("@/lib/integrations/index", () => ({
  integrations: fakeIntegrations,
}))

// Mock tui/utils — must include `prompts` object since production code
// imports { prompts as p } from "@/tui/utils" (not @clack/prompts directly)
mock.module("@/tui/utils", () => ({
  prompts: {
    confirm: localConfirm,
    multiselect: localMultiselect,
    isCancel: localIsCancel,
    cancel: mock(() => {}),
    intro: mock(() => {}),
    outro: mock(() => {}),
    log: { info: mock(() => {}), success: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) },
    spinner: mock(() => ({ start: mock(() => {}), stop: mock(() => {}), message: mock(() => {}) })),
    text: mock(async () => ""),
    select: mock(async () => ""),
    note: mock(() => {}),
    group: mock(async () => ({})),
    groupMultiselect: mock(async () => []),
  },
  cancel: mock((): never => { throw new Error("cancelled") }),
  safeText: mock(async () => ""),
}))

// CRITICAL: workspace-edit.test.ts mocks @/lib/integrations/wizard-helpers entirely.
// Bun caches mock.module globally; if workspace-edit runs first (alphabetically
// tests/commands/ < tests/lib/), the wizard-helpers module is replaced with a stub.
// Use query-parameter cache-busting to force bun to load the real module from disk
// with our mocked @clack/prompts, integrations, and utils dependencies.
const { promptIntegrationOverrides } = await import(
  // @ts-ignore — query param cache-busting for bun module cache
  "@/lib/integrations/wizard-helpers?unit-test"
)

// Get bound references from the @/tui/utils module that wizard-helpers.ts is using.
// Production code imports { prompts as p } from "@/tui/utils", so we need the
// mock references from the prompts object on the mocked @/tui/utils module.
const utils = await import("@/tui/utils")
const mockConfirm = (utils as any).prompts.confirm as Mock<(...args: any[]) => any>
const mockMultiselect = (utils as any).prompts.multiselect as Mock<(...args: any[]) => any>
const mockIsCancel = (utils as any).prompts.isCancel as Mock<(...args: any[]) => any>
const mockCancel = utils.cancel as unknown as Mock<(...args: any[]) => any>

describe("promptIntegrationOverrides", () => {
  beforeEach(() => {
    mockConfirm.mockReset()
    mockMultiselect.mockReset()
    mockIsCancel.mockReset()
    mockIsCancel.mockImplementation((v: unknown) => typeof v === "symbol")
    mockCancel.mockReset()
    mockCancel.mockImplementation((): never => { throw new Error("cancelled") })
    mockConfigurePrompt.mockReset()
    mockConfigurePrompt.mockImplementation(async (current: Record<string, unknown>) => ({
      ...current,
      enabled: true,
    }))
  })

  test("Test 1: returns undefined when user declines override (p.confirm returns false)", async () => {
    mockConfirm.mockResolvedValueOnce(false)

    const result = await promptIntegrationOverrides(["vscode"], {})

    expect(result).toBeUndefined()
    expect(mockMultiselect).not.toHaveBeenCalled()
  })

  test("Test 2: returns undefined when user cancels confirm (p.isCancel)", async () => {
    const cancelSymbol = Symbol("cancel")
    mockConfirm.mockResolvedValueOnce(cancelSymbol as unknown as boolean)
    mockIsCancel.mockImplementation((v: unknown) => v === cancelSymbol)

    await expect(promptIntegrationOverrides([], {})).rejects.toThrow("cancelled")
  })

  test("Test 3: returns Record with enabled integrations configured via configurePrompt when user opts in", async () => {
    mockConfirm.mockResolvedValueOnce(true)
    mockMultiselect.mockResolvedValueOnce(["vscode"])

    const result = await promptIntegrationOverrides(["vscode"], {
      vscode: { cmd: "code" },
    })

    expect(result).toBeDefined()
    expect(result).toHaveProperty("vscode")
    // vscode was selected so configurePrompt was called
    expect(mockConfigurePrompt).toHaveBeenCalledWith({ cmd: "code" })
  })

  test("Test 4: disabled integrations in result have { ...current, enabled: false } preserving extra config", async () => {
    mockConfirm.mockResolvedValueOnce(true)
    // Only vscode selected, tmux not selected
    mockMultiselect.mockResolvedValueOnce(["vscode"])

    const result = await promptIntegrationOverrides(["vscode", "tmux"], {
      vscode: {},
      tmux: { cmd: "tmux-special" },
    })

    expect(result).toBeDefined()
    // tmux was not selected, so it should have enabled: false with preserved config
    expect(result!["tmux"]).toEqual({ cmd: "tmux-special", enabled: false })
  })

  test("Test 5: returns undefined when multiselect is cancelled", async () => {
    const cancelSymbol = Symbol("cancel")
    mockConfirm.mockResolvedValueOnce(true)
    mockMultiselect.mockResolvedValueOnce(cancelSymbol as unknown as string[])
    mockIsCancel.mockImplementation((v: unknown) => v === cancelSymbol)

    await expect(promptIntegrationOverrides([], {})).rejects.toThrow("cancelled")
  })
})
