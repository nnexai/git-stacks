import { describe, expect, mock, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import type { Workspace } from "../../../src/lib/config"

const getWorkspaceFileStatusView = mock((workspace: Workspace, root: string) => ({
  workspace: {
    scope: "workspace" as const,
    name: workspace.name,
    root,
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

mock.module("../../../src/lib/workspace-file-status", () => ({
  getWorkspaceFileStatusView,
}))

mock.module("../../../src/lib/config", () => ({
  readGlobalConfig: mock(() => ({ workspace_root: "/tmp/dashboard-workspaces" })),
}))

mock.module("../../../src/lib/paths", () => ({
  getTasksDir: mock((workspaceRoot: string) => `${workspaceRoot}/tasks`),
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

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("useWorkspaceFileStatus", () => {
  test("loads grouped file status for the selected workspace only", async () => {
    getWorkspaceFileStatusView.mockClear()
    let state!: ReturnType<typeof useWorkspaceFileStatus>["state"]
    let setSelected!: (workspace: Workspace | undefined) => void
    const wsA = workspace("alpha")
    const wsB = workspace("bravo")

    createRoot((dispose) => {
      const [selected, setter] = createSignal<Workspace | undefined>(undefined)
      setSelected = setter
      state = useWorkspaceFileStatus(selected).state

      expect(state()).toEqual({ state: "idle" })
      setSelected(wsA)
      expect(state()).toMatchObject({ state: "loading", workspaceName: "alpha" })
      dispose
    })

    await flush()
    expect(getWorkspaceFileStatusView).toHaveBeenCalledTimes(1)
    expect(getWorkspaceFileStatusView).toHaveBeenLastCalledWith(wsA, "/tmp/dashboard-workspaces/tasks/alpha", { verbose: true })
    expect(state()).toMatchObject({ state: "loaded", workspaceName: "alpha" })

    setSelected(wsB)
    await flush()
    expect(getWorkspaceFileStatusView).toHaveBeenCalledTimes(2)
    expect(getWorkspaceFileStatusView).toHaveBeenLastCalledWith(wsB, "/tmp/dashboard-workspaces/tasks/bravo", { verbose: true })
  })

  test("resets to idle when selection clears and supports explicit load", async () => {
    getWorkspaceFileStatusView.mockClear()
    let api!: ReturnType<typeof useWorkspaceFileStatus>
    let setSelected!: (workspace: Workspace | undefined) => void
    const ws = workspace("selected")

    createRoot(() => {
      const [selected, setter] = createSignal<Workspace | undefined>(ws)
      setSelected = setter
      api = useWorkspaceFileStatus(selected)
    })

    await flush()
    expect(api.state()).toMatchObject({ state: "loaded", workspaceName: "selected" })
    setSelected(undefined)
    await flush()
    expect(api.state()).toEqual({ state: "idle" })

    await api.load(ws)
    expect(api.state()).toMatchObject({ state: "loaded", workspaceName: "selected" })
  })

  test("forwards warning details and reports helper failures as dashboard state", async () => {
    getWorkspaceFileStatusView.mockClear()
    let api!: ReturnType<typeof useWorkspaceFileStatus>
    const ws = workspace("warn")

    createRoot(() => {
      api = useWorkspaceFileStatus()
    })

    await api.load(ws)
    if (api.state().state !== "loaded") throw new Error("expected loaded state")
    expect(api.state().view.warnings).toContain("Sync source not found: /tmp/source")
    expect(api.state().view.workspace.entries[0].details.sync?.sourceOnly?.paths).toContain("add.txt")

    getWorkspaceFileStatusView.mockImplementationOnce(() => {
      throw new Error("root disappeared")
    })
    await api.load(ws)
    expect(api.state()).toEqual({ state: "error", workspaceName: "warn", message: "root disappeared" })
  })

  test("production hook source imports the shared helper directly and no subprocess API", async () => {
    const source = await Bun.file("src/tui/dashboard/hooks/useWorkspaceFileStatus.ts").text()
    expect(source).toContain("../../../lib/workspace-file-status")
    expect(source).toContain("getWorkspaceFileStatusView")
    expect(source).not.toContain("runCli")
    expect(source).not.toContain("Bun.spawn")
    expect(source).not.toContain("spawnSync")
  })
})
