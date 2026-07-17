import { describe, expect, mock, test } from "bun:test"

import { PHASE127_CLIENT_RESPONSES } from "../../helpers/phase127-client-fixtures"

const fetchStaleWorkspaceEvaluation = mock(async (
  request: { expected_revision: string; force_refresh: boolean },
  signal?: AbortSignal,
) => {
  expect(signal).toBeDefined()
  return { ...PHASE127_CLIENT_RESPONSES.populated, revision: request.expected_revision }
})
const unused = mock(async () => undefined)

mock.module("@git-stacks/service/client", () => ({
  cancelWebOperation: unused,
  fetchStaleWorkspaceEvaluation,
  fetchWebOperation: unused,
  fetchWorkspaceActionInventory: unused,
  fetchWorkspaceFileStatusProjection: unused,
  fetchWorkspaceNotesProjection: unused,
  resolveForgeSourceReview: unused,
  runWorkspaceLifecycleMutation: unused,
  setWorkspacePins: unused,
  submitWebOperation: unused,
}))

const { officialService } = await import("../../../packages/tui/src/official-service")
const { createStaleWorkspaceRequestCoordinator } = await import("../../../packages/tui/src/workspace-action-inventory")

describe("official TUI stale service bridge", () => {
  test("forwards the strict stale request and exact AbortSignal through the trusted service client", async () => {
    fetchStaleWorkspaceEvaluation.mockClear()
    const controller = new AbortController()
    const request = { expected_revision: "7", force_refresh: true }
    const candidate = (officialService as unknown as Record<string, unknown>).fetchStaleWorkspaceEvaluation
    expect(candidate).toBeTypeOf("function")

    const response = await (candidate as typeof fetchStaleWorkspaceEvaluation)(request, controller.signal)
    expect(response).toEqual(PHASE127_CLIENT_RESPONSES.populated)
    expect(fetchStaleWorkspaceEvaluation).toHaveBeenCalledTimes(1)
    expect(fetchStaleWorkspaceEvaluation).toHaveBeenLastCalledWith(request, controller.signal)
  })

  test("composes the shared one-conflict coordinator without a TUI retry loop", async () => {
    const requests: Array<{ expected_revision: string; force_refresh: boolean }> = []
    let reloads = 0
    const coordinator = createStaleWorkspaceRequestCoordinator({
      fetch: async (request) => {
        requests.push(request)
        if (requests.length === 1) throw Object.assign(new Error("workspace revision changed"), { code: "conflict" })
        return PHASE127_CLIENT_RESPONSES.refreshed
      },
      reloadAuthoritative: async () => { reloads += 1; return "8" },
    })

    const result = await coordinator.load({ expectedRevision: "7", forceRefresh: true })
    expect(result).toEqual({ status: "accepted", response: PHASE127_CLIENT_RESPONSES.refreshed })
    expect(requests).toEqual([
      { expected_revision: "7", force_refresh: true },
      { expected_revision: "8", force_refresh: true },
    ])
    expect(reloads).toBe(1)
  })

  test("keeps the service import isolated to the official adapter", async () => {
    const source = await Bun.file("packages/tui/src/official-service.ts").text()
    const inventorySource = await Bun.file("packages/tui/src/workspace-action-inventory.ts").text()
    expect(source).toContain('from "@git-stacks/service/client"')
    expect(source).toContain("fetchStaleWorkspaceEvaluation")
    expect(source).not.toContain("@git-stacks/service/src")
    expect(source).not.toContain("@git-stacks/core")
    expect(source).not.toContain("node:fs")
    expect(source).not.toContain("node:child_process")
    expect(inventorySource).toContain('from "@git-stacks/client"')
    expect(inventorySource).toContain("createStaleWorkspaceResponseGate")
    expect(inventorySource).toContain("createStaleWorkspaceLoadCoordinator")
    expect(inventorySource).not.toContain("@git-stacks/service")
    expect(inventorySource).not.toContain("@git-stacks/core")
  })
})
