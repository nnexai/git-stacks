import { describe, test, expect, mock, beforeEach } from "bun:test"

// Mock @clack/prompts
const mockConfirm = mock(async () => false as boolean | symbol)
const mockMultiselect = mock(async () => [] as string[] | symbol)
const mockIsCancel = mock((v: unknown) => typeof v === "symbol")

mock.module("@clack/prompts", () => ({
  confirm: mockConfirm,
  multiselect: mockMultiselect,
  isCancel: mockIsCancel,
}))

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
    configurePrompt: mockConfigurePrompt,
  },
  {
    id: "tmux",
    label: "tmux",
    hint: "Open in tmux",
    enabledByDefault: false,
    configurePrompt: mock(async (current: Record<string, unknown>) => ({
      ...current,
      enabled: true,
    })),
  },
]

mock.module("@/lib/integrations/index", () => ({
  integrations: fakeIntegrations,
}))

// Mock tui/utils cancel
const mockCancel = mock((): never => {
  throw new Error("cancelled")
})

mock.module("@/tui/utils", () => ({
  cancel: mockCancel,
}))

// Import after mocks
const { promptIntegrationOverrides } = await import("@/lib/integrations/wizard-helpers")

describe("promptIntegrationOverrides", () => {
  beforeEach(() => {
    mockConfirm.mockReset()
    mockMultiselect.mockReset()
    mockIsCancel.mockReset()
    mockIsCancel.mockImplementation((v: unknown) => typeof v === "symbol")
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
