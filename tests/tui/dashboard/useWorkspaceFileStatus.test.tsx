import { describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"
import type { Workspace } from "../../../src/lib/config"

const fetchWorkspaceFileStatus = mock((workspaceName: string) => ({
  workspace: {
    scope: "workspace" as const,
    name: workspaceName,
    root: `/tmp/dashboard-workspaces/tasks/${workspaceName}`,
    entries: [
      {
        scope: "workspace" as const,
        repo: null,
        type: "sync" as const,
        target: "target",
        state: "pullable" as const,
        severity: "warning" as const,
        needsAttention: true,
        hint: "files pull",
        details: {
          warnings: ["Sync source not found: /tmp/source"],
          errors: [],
          sync: {
            counts: { equal: 0, sourceOnly: 1, targetOnly: 0, differing: 0, errors: 0 },
            sourceOnly: { paths: ["add.txt"], omitted: 0 },
          },
        },
      },
    ],
    summary: { total: 1, ok: 0, warnings: 1, errors: 0, attention: 1, sections: 1, byState: { pullable: 1 }, byType: { sync: 1 } },
    warnings: ["Sync source not found: /tmp/source"],
    errors: [],
  },
  repos: [],
  summary: { total: 1, ok: 0, warnings: 1, errors: 0, attention: 1, sections: 1, byState: { pullable: 1 }, byType: { sync: 1 } },
  warnings: ["Sync source not found: /tmp/source"],
  errors: [],
}))

mock.module("../../../src/lib/service/client", () => ({
  fetchWorkspaceFileStatus,
}))

const { useWorkspaceFileStatus } = await import("../../../src/tui/dashboard/hooks/useWorkspaceFileStatus")

function workspace(name: string): Workspace {
  return {
    name,
    branch: `feat/${name}`,
    created: "2026-05-17",
    repos: [],
  } as Workspace
}

describe("useWorkspaceFileStatus", () => {
  test("loads grouped file status for the selected workspace only", async () => {
    fetchWorkspaceFileStatus.mockClear()
    let api!: ReturnType<typeof useWorkspaceFileStatus>
    const wsA = workspace("alpha")
    const wsB = workspace("bravo")

    createRoot(() => {
      api = useWorkspaceFileStatus()
    })

    expect(api.state()).toEqual({ state: "idle" })
    const alphaLoad = api.load(wsA)
    expect(api.state()).toMatchObject({ state: "loading", workspaceName: "alpha" })
    await alphaLoad
    expect(fetchWorkspaceFileStatus).toHaveBeenCalledTimes(1)
    expect(fetchWorkspaceFileStatus).toHaveBeenLastCalledWith("alpha")
    expect(api.state()).toMatchObject({ state: "loaded", workspaceName: "alpha" })

    await api.load(wsB)
    expect(fetchWorkspaceFileStatus).toHaveBeenCalledTimes(2)
    expect(fetchWorkspaceFileStatus).toHaveBeenLastCalledWith("bravo")
  })

  test("resets to idle when selection clears and supports explicit load", async () => {
    fetchWorkspaceFileStatus.mockClear()
    let api!: ReturnType<typeof useWorkspaceFileStatus>
    const ws = workspace("selected")

    createRoot(() => {
      api = useWorkspaceFileStatus()
    })

    await api.load(ws)
    expect(api.state()).toMatchObject({ state: "loaded", workspaceName: "selected" })
    api.reset()
    expect(api.state()).toEqual({ state: "idle" })

    await api.load(ws)
    expect(api.state()).toMatchObject({ state: "loaded", workspaceName: "selected" })
  })

  test("reuses selection cache within one core revision", async () => {
    fetchWorkspaceFileStatus.mockClear()
    let api!: ReturnType<typeof useWorkspaceFileStatus>
    let selected = workspace("alpha")
    let revision = "1"

    createRoot(() => {
      api = useWorkspaceFileStatus(() => selected, () => revision)
    })
    await Bun.sleep(5)
    expect(fetchWorkspaceFileStatus).toHaveBeenCalledTimes(1)

    selected = workspace("bravo")
    await api.load(selected, { force: false, revision })
    selected = workspace("alpha")
    await api.load(selected, { force: false, revision })
    expect(fetchWorkspaceFileStatus).toHaveBeenCalledTimes(2)

    revision = "2"
    await api.load(selected, { force: false, revision })
    expect(fetchWorkspaceFileStatus).toHaveBeenCalledTimes(3)
  })

  test("forwards warning details and reports helper failures as dashboard state", async () => {
    fetchWorkspaceFileStatus.mockClear()
    let api!: ReturnType<typeof useWorkspaceFileStatus>
    const ws = workspace("warn")

    createRoot(() => {
      api = useWorkspaceFileStatus()
    })

    await api.load(ws)
    if (api.state().state !== "loaded") throw new Error("expected loaded state")
    expect(api.state().view.warnings).toContain("Sync source not found: /tmp/source")
    expect(api.state().view.workspace.entries[0].details.sync?.sourceOnly?.paths).toContain("add.txt")

    fetchWorkspaceFileStatus.mockImplementationOnce(() => {
      throw new Error("root disappeared")
    })
    await api.load(ws)
    expect(api.state()).toEqual({ state: "error", workspaceName: "warn", message: "root disappeared" })
  })

  test("production hook uses the official service client and no machine-side helper", async () => {
    const source = await Bun.file("src/tui/dashboard/hooks/useWorkspaceFileStatus.ts").text()
    expect(source).toContain("../../../lib/service/client")
    expect(source).toContain("fetchWorkspaceFileStatus")
    expect(source).not.toContain("../../../lib/workspace-file-status")
    expect(source).not.toContain("runCli")
    expect(source).not.toContain("Bun.spawn")
    expect(source).not.toContain("spawnSync")
  })
})
