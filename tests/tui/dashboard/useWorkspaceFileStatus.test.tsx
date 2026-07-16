import { describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"

const fetchWorkspaceFileStatusProjection = mock((request: { workspace_id: string; expected_revision: string }) => ({
  workspace_id: request.workspace_id,
  revision: request.expected_revision,
  generated_at: "2026-07-16T12:00:00.000Z",
  groups: [{
    scope: "workspace" as const,
    name: "Workspace files",
    entries: [
      {
        id: "file_1234567890123456",
        type: "sync" as const,
        target: "target",
        state: "pullable" as const,
        severity: "warning" as const,
        needs_attention: true,
        reason: "source_missing" as const,
        message: "Configured source is missing.",
        counts: { equal: 0, source_only: 1, target_only: 0, differing: 0, errors: 0 },
      },
    ],
    summary: { total: 1, ok: 0, warnings: 1, errors: 0, attention: 1 },
  }],
  summary: { total: 1, ok: 0, warnings: 1, errors: 0, attention: 1 },
}))

mock.module("@git-stacks/service/client", () => ({
  fetchWorkspaceFileStatusProjection,
}))

mock.module("../../../packages/tui/src/official-service", () => ({
  officialService: { fetchWorkspaceFileStatusProjection },
}))

const { useWorkspaceFileStatus } = await import("../../../packages/tui/src/hooks/useWorkspaceFileStatus")

function workspace(name: string) {
  return { workspaceId: `00000000-0000-4000-8000-${name.padEnd(12, "0").slice(0, 12)}`, workspaceName: name }
}

describe("useWorkspaceFileStatus", () => {
  test("loads grouped file status for the selected workspace only", async () => {
    fetchWorkspaceFileStatusProjection.mockClear()
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
    expect(fetchWorkspaceFileStatusProjection).toHaveBeenCalledTimes(1)
    expect(fetchWorkspaceFileStatusProjection).toHaveBeenLastCalledWith({ workspace_id: wsA.workspaceId, expected_revision: "0" })
    expect(api.state()).toMatchObject({ state: "loaded", workspaceName: "alpha" })

    await api.load(wsB)
    expect(fetchWorkspaceFileStatusProjection).toHaveBeenCalledTimes(2)
    expect(fetchWorkspaceFileStatusProjection).toHaveBeenLastCalledWith({ workspace_id: wsB.workspaceId, expected_revision: "0" })
  })

  test("resets to idle when selection clears and supports explicit load", async () => {
    fetchWorkspaceFileStatusProjection.mockClear()
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
    fetchWorkspaceFileStatusProjection.mockClear()
    let api!: ReturnType<typeof useWorkspaceFileStatus>
    let selected = workspace("alpha")
    let revision = "1"

    createRoot(() => {
      api = useWorkspaceFileStatus(() => selected, () => revision)
    })
    expect(fetchWorkspaceFileStatusProjection).toHaveBeenCalledTimes(0)

    selected = workspace("bravo")
    await api.load(selected, { force: false, revision })
    selected = workspace("alpha")
    await api.load(selected, { force: false, revision })
    expect(fetchWorkspaceFileStatusProjection).toHaveBeenCalledTimes(2)

    revision = "2"
    await api.load(selected, { force: false, revision })
    expect(fetchWorkspaceFileStatusProjection).toHaveBeenCalledTimes(3)
  })

  test("forwards warning details and reports helper failures as dashboard state", async () => {
    fetchWorkspaceFileStatusProjection.mockClear()
    let api!: ReturnType<typeof useWorkspaceFileStatus>
    const ws = workspace("warn")

    createRoot(() => {
      api = useWorkspaceFileStatus()
    })

    await api.load(ws)
    if (api.state().state !== "loaded") throw new Error("expected loaded state")
    expect(api.state().view.groups[0]?.entries[0]?.message).toBe("Configured source is missing.")
    expect(JSON.stringify(api.state().view)).not.toContain("/tmp/")

    fetchWorkspaceFileStatusProjection.mockImplementationOnce(() => {
      throw new Error("root disappeared")
    })
    await api.load(ws)
    expect(api.state()).toEqual({ state: "error", workspaceName: "warn", message: "root disappeared" })
  })

  test("production hook uses the official service client and no machine-side helper", async () => {
    const source = await Bun.file("packages/tui/src/hooks/useWorkspaceFileStatus.ts").text()
    const bridge = await Bun.file("packages/tui/src/official-service.ts").text()
    expect(source).toContain('from "../official-service"')
    expect(bridge).toContain('from "@git-stacks/service/client"')
    expect(bridge).toContain("fetchWorkspaceFileStatusProjection")
    expect(source).toContain("fetchWorkspaceFileStatusProjection")
    expect(source).not.toContain("../../../lib/workspace-file-status")
    expect(source).not.toContain("runCli")
    expect(source).not.toContain("Bun.spawn")
    expect(source).not.toContain("spawnSync")
  })
})
