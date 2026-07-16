/** @jsxImportSource @opentui/solid */

import { describe, expect, mock, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createForgeReviewCoordinator } from "@git-stacks/client"
import type { WebForgeResolveResponse } from "@git-stacks/protocol"

import { ForgeSourceReviewDialog } from "../../../packages/tui/src/ForgeSourceReviewDialog"

const url = "https://github.com/acme/repo/pull/42"
const resolution: Extract<WebForgeResolveResponse, { resolved: true }> = {
  resolved: true,
  token: `review_${"a".repeat(43)}`,
  expires_at: "2026-07-16T13:00:00.000Z",
  revision: "12",
  source: {
    provider: "github", change_kind: "pull_request", change_number: 42, web_url: url, host: "github.com",
    target_repository: "acme/repo", source_repository: "fork/repo", source_branch: "feature/very-long-reviewed-source", target_branch: "main",
    head_sha: "a".repeat(40), cross_repository: true, confidence: "provider",
  },
  terminology: { provider: "github", change: "Pull request", source_branch: "Head branch", target_branch: "Base branch" },
  candidates: {
    templates: [{ name: "default", repositories: [{ repository_id: "11111111-1111-4111-8111-111111111111", name: "repo", mode: "worktree", matched_source: true }] }],
    source_repositories: [{ repository_id: "11111111-1111-4111-8111-111111111111", name: "repo", mode: "worktree", matched_source: true }],
  },
  draft: {
    workspace_name: "review-42", template_name: "default", matched_source_repository_id: "11111111-1111-4111-8111-111111111111",
    repositories: [{ repository_id: "11111111-1111-4111-8111-111111111111", included: true, branch: { base_branch: "main", workspace_branch: "feature/very-long-reviewed-source" } }],
  },
}

describe("ForgeSourceReviewDialog", () => {
  test("Enter resolves only and renders the immutable provider source before editable review", async () => {
    const resolve = mock(async () => resolution)
    const create = mock(async () => ({ operationId: "op_1234567890abcdef" }))
    const coordinator = createForgeReviewCoordinator({ resolve, create })
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      () => <ForgeSourceReviewDialog coordinator={coordinator} initialUrl={url} onAccepted={() => {}} onBack={() => {}} />,
      { width: 90, height: 26, kittyKeyboard: true },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("1 Resolve URL")
    mockInput.pressEnter()
    await Bun.sleep(1)
    await renderOnce()
    await renderOnce()
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(0)
    expect(coordinator.state().phase).toBe("review")
    const frame = captureCharFrame()
    expect(frame).toContain("2 Review workspace")
    expect(frame).toContain("Pull request source")
    expect(frame).toContain("acme/repo")
    expect(frame).toContain("Head branch")
    expect(frame).toContain("review-42")
  })

  test("c is the sole one-shot Create path and rapid c cannot duplicate submission", async () => {
    let accept!: (value: { operationId: string }) => void
    const create = mock(() => new Promise<{ operationId: string }>((resolve) => { accept = resolve }))
    const coordinator = createForgeReviewCoordinator({ resolve: mock(async () => resolution), create })
    coordinator.setUrl(url)
    await coordinator.resolve()
    const accepted: string[] = []
    const { renderOnce, mockInput } = await testRender(
      () => <ForgeSourceReviewDialog coordinator={coordinator} onAccepted={(operationId) => { accepted.push(operationId) }} onBack={() => {}} />,
      { width: 90, height: 26, kittyKeyboard: true },
    )
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    expect(create).toHaveBeenCalledTimes(0)
    mockInput.pressEscape()
    mockInput.pressKey("c")
    mockInput.pressKey("c")
    await renderOnce()
    expect(create).toHaveBeenCalledTimes(1)
    accept({ operationId: "op_1234567890abcdef" })
    await Bun.sleep(1)
    expect(accepted).toEqual(["op_1234567890abcdef"])
  })

  test("narrow review stacks safely and too-small terminals allow Back only", async () => {
    const coordinator = createForgeReviewCoordinator({ resolve: mock(async () => resolution), create: mock(async () => ({ operationId: "op_1234567890abcdef" })) })
    coordinator.setUrl(url)
    await coordinator.resolve()
    const narrow = await testRender(
      () => <ForgeSourceReviewDialog coordinator={coordinator} onAccepted={() => {}} onBack={() => {}} />,
      { width: 52, height: 18, kittyKeyboard: true },
    )
    await narrow.renderOnce()
    expect(narrow.captureCharFrame()).toContain("Review workspace")
    expect(narrow.captureCharFrame()).toContain("[c] Create workspace")

    let backed = 0
    const small = await testRender(
      () => <ForgeSourceReviewDialog coordinator={coordinator} onAccepted={() => {}} onBack={() => { backed += 1 }} />,
      { width: 39, height: 11, kittyKeyboard: true },
    )
    await small.renderOnce()
    expect(small.captureCharFrame()).toContain("Terminal is too small for")
    expect(small.captureCharFrame()).toContain("workspace review. Resize to at")
    expect(small.captureCharFrame()).not.toContain("[c] Create workspace")
    small.mockInput.pressKey("c")
    await small.renderOnce()
    expect(backed).toBe(0)
    small.mockInput.pressEscape()
    await small.renderOnce()
    expect(backed).toBe(1)
  })
})
