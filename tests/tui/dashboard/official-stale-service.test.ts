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

  test("keeps the service import isolated to the official adapter", async () => {
    const source = await Bun.file("packages/tui/src/official-service.ts").text()
    expect(source).toContain('from "@git-stacks/service/client"')
    expect(source).toContain("fetchStaleWorkspaceEvaluation")
    expect(source).not.toContain("@git-stacks/service/src")
    expect(source).not.toContain("@git-stacks/core")
    expect(source).not.toContain("node:fs")
    expect(source).not.toContain("node:child_process")
  })
})
