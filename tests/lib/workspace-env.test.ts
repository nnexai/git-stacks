import { afterAll, describe, expect, mock, test } from "@test/api"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import type { GlobalConfig, Workspace, WorkspaceRepo } from "@/lib/config"
import { cleanup, makeTmpDir } from "../helpers"

const tempDirs: string[] = []

function trackedTmpDir(prefix: string): string {
  const dir = makeTmpDir(prefix)
  tempDirs.push(dir)
  return dir
}

const buildResolversMock = mock((_config: GlobalConfig) => [{ id: "env", resolve: async () => "unused" }])
const parseSecretRefMock = mock((value: string) => {
  const match = value.match(/^\$\{\{\s*(\w+):(.+?)\s*\}\}$/)
  return match ? { id: match[1], path: match[2].trim() } : null
})
const resolveSecretsMock = mock(async (rawEnv: Record<string, string>) => ({
  ...rawEnv,
  API_TOKEN: "resolved-token",
}))

mock.module("@/lib/secrets", () => ({
  buildResolvers: buildResolversMock,
  parseSecretRef: parseSecretRefMock,
  resolveSecrets: resolveSecretsMock,
}))

const {
  buildBaseEnv,
  buildRepoEnv,
  buildWorkspaceEnv,
  mergeEnv,
  writeEnvFiles,
} = await import("../../packages/core/src/workspace-env")

afterAll(() => {
  for (const dir of tempDirs) {
    cleanup(dir)
  }
})

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    name: "feature-ws",
    branch: "feature/test",
    created: "2026-04-05T00:00:00.000Z",
    repos: [],
    ...overrides,
  } as Workspace
}

function makeWorktreeRepo(taskPath: string, overrides: Partial<WorkspaceRepo> = {}): WorkspaceRepo {
  return {
    name: "api",
    repo: "api",
    type: "other",
    mode: "worktree",
    main_path: join(taskPath, "..", "..", "main", "api"),
    task_path: taskPath,
    ...overrides,
  } as WorkspaceRepo
}

describe("workspace-env", () => {
  test("mergeEnv flattens env and numeric ports into strings", () => {
    const workspace = makeWorkspace({
      env: { API_URL: "https://example.test", FEATURE_FLAG: "on" },
      ports: { WEB_PORT: 3000, API_PORT: 4100 },
    })

    expect(mergeEnv(workspace)).toEqual({
      API_URL: "https://example.test",
      FEATURE_FLAG: "on",
      WEB_PORT: "3000",
      API_PORT: "4100",
    })
  })

  test("buildBaseEnv includes workspace metadata while preserving merged env", () => {
    const workspace = makeWorkspace({
      env: { FEATURE_FLAG: "on" },
      ports: { WEB_PORT: 3000 },
    })

    expect(buildBaseEnv(workspace, "/virtual/tasks/feature-ws", "dashboard")).toEqual({
      GS_WORKSPACE_NAME: "feature-ws",
      GS_WORKSPACE_BRANCH: "feature/test",
      GS_WORKSPACE_PATH: "/virtual/tasks/feature-ws",
      GS_TRIGGERED_BY: "dashboard",
      FEATURE_FLAG: "on",
      WEB_PORT: "3000",
    })
  })

  test("buildRepoEnv adds repo-specific path metadata", () => {
    const repo = makeWorktreeRepo("/virtual/tasks/feature-ws/api", {
      main_path: "/virtual/main/api",
    })

    expect(
      buildRepoEnv(
        { GS_WORKSPACE_NAME: "feature-ws", GS_WORKSPACE_PATH: "/virtual/tasks/feature-ws" },
        repo
      )
    ).toEqual({
      GS_WORKSPACE_NAME: "feature-ws",
      GS_WORKSPACE_PATH: "/virtual/tasks/feature-ws",
      GS_REPO_NAME: "api",
      GS_REPO_PATH: "/virtual/tasks/feature-ws/api",
      GS_REPO_CLONE_PATH: "/virtual/main/api",
    })
  })

  test("buildWorkspaceEnv resolves secrets through the mocked secrets module only", async () => {
    buildResolversMock.mockClear()
    resolveSecretsMock.mockClear()

    const config = {
      workspace_root: "/virtual/ws-root",
      integrations: {},
      secrets: { resolvers: ["env"] },
    } as GlobalConfig
    const workspace = makeWorkspace({
      env: {
        API_TOKEN: "${{ env:API_TOKEN }}",
        FEATURE_FLAG: "on",
      },
      ports: { WEB_PORT: 3000 },
    })

    const merged = await buildWorkspaceEnv(workspace, {
      triggeredBy: "test-suite",
      config,
    })

    expect(buildResolversMock).toHaveBeenCalledWith(config)
    expect(resolveSecretsMock).toHaveBeenCalledWith(
      {
        API_TOKEN: "${{ env:API_TOKEN }}",
        FEATURE_FLAG: "on",
        WEB_PORT: "3000",
      },
      expect.any(Array)
    )
    expect(merged).toMatchObject({
      GS_WORKSPACE_NAME: "feature-ws",
      GS_WORKSPACE_BRANCH: "feature/test",
      GS_WORKSPACE_PATH: "/virtual/ws-root/tasks/feature-ws",
      GS_TRIGGERED_BY: "test-suite",
      API_TOKEN: "resolved-token",
      FEATURE_FLAG: "on",
      WEB_PORT: "3000",
    })
  })

  test("writeEnvFiles writes and merges env files inside a temp worktree path", () => {
    const root = trackedTmpDir("workspace-env")
    const taskPath = join(root, "tasks", "feature-ws", "api")
    mkdirSync(taskPath, { recursive: true })
    const envFile = join(taskPath, ".env.local")
    writeFileSync(envFile, "EXISTING=keep\nWEB_PORT=9999\n", "utf-8")

    const workspace = makeWorkspace({
      env_file: ".env.local",
      repos: [makeWorktreeRepo(taskPath)],
    })

    writeEnvFiles(workspace, {
      WEB_PORT: "3000",
      API_TOKEN: "resolved-token",
    })

    expect(existsSync(envFile)).toBe(true)
    expect(readFileSync(envFile, "utf-8")).toBe(
      "EXISTING=keep\nWEB_PORT=3000\nAPI_TOKEN=resolved-token\n"
    )
  })
})
