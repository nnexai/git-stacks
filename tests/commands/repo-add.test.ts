import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { makeConfigMock } from "../helpers"

let tmpDir: string
let repoDir: string
let lastWritten: unknown[] | undefined

const readGlobalConfigMock = mock(() => ({
  workspace_root: "/tmp/test-ws",
  integrations: {},
  ports: { range_start: 10000, range_end: 65000 },
}))
const readRegistryMock = mock(() => [])
const writeRegistryMock = mock((entries: unknown[]) => {
  lastWritten = entries
})
const detectForgeForRepoMock = mock(async (): Promise<string[]> => [])
const detectForgeForRepoEnabledMock = mock(async (): Promise<string[]> => [])
const selectMock = mock(async (_opts?: unknown): Promise<string> => "none")
const detectRepoTypeMock = mock(() => "other")
const getCurrentBranchMock = mock(async () => "main")

mock.module("@/lib/config", () => makeConfigMock({
  readGlobalConfig: readGlobalConfigMock,
  readRegistry: readRegistryMock,
  writeRegistry: writeRegistryMock,
}))

mock.module("@/lib/integrations/forge-utils", () => ({
  detectForgeForRepo: detectForgeForRepoMock,
  detectForgeForRepoEnabled: detectForgeForRepoEnabledMock,
}))

mock.module("@/tui/utils", () => ({
  prompts: {
    select: selectMock,
    isCancel: () => false,
  },
}))

mock.module("@/lib/detect", () => ({
  detectRepoType: detectRepoTypeMock,
}))

mock.module("@/lib/git", () => ({
  getCurrentBranch: getCurrentBranchMock,
}))

mock.module("@/lib/paths", () => ({
  expandHome: (p: string) => p,
}))

mock.module("@/tui/repo-wizard", () => ({
  runRepoScan: mock(async () => {}),
}))

mock.module("@/lib/workspace-yaml", () => ({
  editRegistryYaml: mock(() => ({ path: "/tmp/registry.yml", validate: () => {} })),
  openYamlInEditor: mock(async () => {}),
}))

const { repoCommand } = await import("@/commands/repo")
repoCommand.exitOverride()

function latestEntry(): { forge?: "github" | "gitlab" | "gitea" } {
  expect(lastWritten).toBeDefined()
  return lastWritten?.[0] as { forge?: "github" | "gitlab" | "gitea" }
}

describe("repo add forge enablement", () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join("/tmp", "repo-add-test-"))
    repoDir = join(tmpDir, "repo")
    mkdirSync(join(repoDir, ".git"), { recursive: true })
    lastWritten = undefined

    readGlobalConfigMock.mockReset()
    readRegistryMock.mockReset()
    writeRegistryMock.mockReset()
    detectForgeForRepoMock.mockReset()
    detectForgeForRepoEnabledMock.mockReset()
    selectMock.mockReset()
    detectRepoTypeMock.mockReset()
    getCurrentBranchMock.mockReset()

    readGlobalConfigMock.mockImplementation(() => ({
      workspace_root: "/tmp/test-ws",
      integrations: {},
      ports: { range_start: 10000, range_end: 65000 },
    }))
    readRegistryMock.mockImplementation(() => [])
    writeRegistryMock.mockImplementation((entries: unknown[]) => {
      lastWritten = entries
    })
    detectForgeForRepoMock.mockImplementation(async () => [])
    detectForgeForRepoEnabledMock.mockImplementation(async () => [])
    selectMock.mockImplementation(async () => "none")
    detectRepoTypeMock.mockImplementation(() => "other")
    getCurrentBranchMock.mockImplementation(async () => "main")
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("zero enabled matches registers without prompting and leaves forge unset", async () => {
    detectForgeForRepoEnabledMock.mockImplementation(async () => [])

    await repoCommand.parseAsync(["add", repoDir, "--name", "d03-repo", "--branch", "main"], { from: "user" })

    expect(selectMock).not.toHaveBeenCalled()
    expect(latestEntry().forge).toBeUndefined()
  })

  test("multiple enabled matches prompt only enabled forges plus None", async () => {
    detectForgeForRepoEnabledMock.mockImplementation(async () => ["github", "gitlab"])
    selectMock.mockImplementation(async () => "github")

    await repoCommand.parseAsync(["add", repoDir, "--name", "d04-repo", "--branch", "main"], { from: "user" })

    expect(selectMock).toHaveBeenCalledTimes(1)
    const promptArgs = selectMock.mock.calls[0]?.[0] as unknown as { options: Array<{ value: string }> }
    expect(promptArgs.options.map((option) => option.value)).toEqual(["none", "github", "gitlab"])
    expect(latestEntry().forge).toBe("github")
  })

  test("one enabled match auto-selects without prompting", async () => {
    detectForgeForRepoEnabledMock.mockImplementation(async () => ["github"])

    await repoCommand.parseAsync(["add", repoDir, "--name", "single-repo", "--branch", "main"], { from: "user" })

    expect(selectMock).not.toHaveBeenCalled()
    expect(latestEntry().forge).toBe("github")
  })
})
