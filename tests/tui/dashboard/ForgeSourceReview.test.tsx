/** @jsxImportSource @opentui/solid */

import { describe, expect, mock, test } from "bun:test"
import { readFileSync } from "node:fs"
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
    target_repository: "acme/repo", source_repository: "fork/very-long-reviewed-source-repository-name", source_branch: "feature/very-long-reviewed-source", target_branch: "main",
    head_sha: "a".repeat(40), cross_repository: true, confidence: "provider",
  },
  terminology: { provider: "github", change: "Pull request", source_branch: "Head branch", target_branch: "Base branch" },
  candidates: {
    templates: [{ name: "default", repositories: [
      { repository_id: "11111111-1111-4111-8111-111111111111", name: "repo", mode: "worktree", matched_source: true },
      { repository_id: "22222222-2222-4222-8222-222222222222", name: "worker-with-a-very-long-repository-name", mode: "worktree", matched_source: false },
    ] }],
    source_repositories: [{ repository_id: "11111111-1111-4111-8111-111111111111", name: "repo", mode: "worktree", matched_source: true }],
  },
  draft: {
    workspace_name: "review-42", template_name: "default", matched_source_repository_id: "11111111-1111-4111-8111-111111111111",
    repositories: [
      { repository_id: "11111111-1111-4111-8111-111111111111", included: true, branch: { base_branch: "main", workspace_branch: "feature/very-long-reviewed-source" } },
      { repository_id: "22222222-2222-4222-8222-222222222222", included: true, branch: { base_branch: "develop", workspace_branch: "feature/worker-with-a-very-long-branch-name" } },
    ],
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

  test("reviewed creation reconnects by known operation ID and refreshes before recovery", () => {
    const appSource = readFileSync(new URL("../../../packages/tui/src/App.tsx", import.meta.url), "utf8")
    expect(appSource).toContain("officialService.fetchWebOperation(operationId)")
    expect(appSource).toContain("Reconnecting to ${operationId}")
    expect(appSource).toContain("forgeReview.observeOperation(operation)")
    const observeIndex = appSource.indexOf("forgeReview.observeOperation(operation)")
    const coreRefreshIndex = appSource.indexOf("await core.refresh()", observeIndex)
    const signalRefreshIndex = appSource.indexOf("await refreshSignals()", coreRefreshIndex)
    const recoveryIndex = appSource.indexOf('setView({ view: "forge-source-review" })', observeIndex)
    expect(coreRefreshIndex).toBeGreaterThan(observeIndex)
    expect(signalRefreshIndex).toBeGreaterThan(coreRefreshIndex)
    expect(recoveryIndex).toBeGreaterThan(signalRefreshIndex)
  })

  test("failed and cancelled reviewed operations restore editable Review when recoverable", async () => {
    for (const state of ["failed", "cancelled"] as const) {
      const coordinator = createForgeReviewCoordinator({
        resolve: mock(async () => resolution),
        create: mock(async () => ({ operationId: `op_${state}1234567890` })),
      })
      coordinator.setUrl(url)
      await coordinator.resolve()
      const accepted = await coordinator.create()
      expect(accepted.status).toBe("accepted")
      const operationId = accepted.status === "accepted" ? accepted.operationId : ""
      coordinator.observeOperation({
        operation_id: operationId,
        state,
        accepted_at: "2026-07-16T12:00:00.000Z",
        finished_at: "2026-07-16T12:00:01.000Z",
        completed_steps: [],
        error: {
          code: "reviewed_create_failed",
          message: "Correct the workspace name and retry.",
          forge: { kind: "forge_failure", reason: "branch_conflict", recovery: "change_branch" },
        },
      })
      expect(coordinator.state()).toMatchObject({ phase: "review", draft: { workspace_name: "review-42" } })
    }
  })

  test("edits every repository row and restores the originating row after typed rejection", async () => {
    const create = mock(async () => { throw { code: "branch_conflict", recovery: "change_branch", message: "Change the worker branch." } })
    const coordinator = createForgeReviewCoordinator({ resolve: mock(async () => resolution), create })
    coordinator.setUrl(url)
    await coordinator.resolve()
    const review = await testRender(
      () => <ForgeSourceReviewDialog coordinator={coordinator} onAccepted={() => {}} onBack={() => {}} />,
      { width: 90, height: 30, kittyKeyboard: true },
    )
    await review.renderOnce()
    expect(review.captureCharFrame()).toContain("Include worker-with-a-very-long-repository-name")
    expect(review.captureCharFrame()).toContain("Branch mapping · worker-with-a-very-long-repository-name")
    for (let index = 0; index < 6; index += 1) review.mockInput.pressArrow("down")
    await review.renderOnce()
    review.mockInput.pressEnter()
    await review.renderOnce()
    await review.mockInput.typeText("-recovered")
    review.mockInput.pressEnter()
    await review.renderOnce()
    review.mockInput.pressKey("c")
    await Bun.sleep(1)
    await review.renderOnce()
    expect(create).toHaveBeenCalledTimes(1)
    expect(coordinator.state()).toMatchObject({
      phase: "review",
      draft: { repositories: [{}, { branch: { workspace_branch: "feature/worker-with-a-very-long-branch-name-recovered" } }] },
      failure: { code: "branch_conflict" },
    })
    expect(review.captureCharFrame()).toContain("> Branch mapping · worker-with-a-very-long-repository-name")
    expect(review.captureCharFrame()).toContain("Change the worker branch.")
  })

  test("review uses real stacked layouts at widths 79, 55, and 40 and too-small terminals allow Back only", async () => {
    const coordinator = createForgeReviewCoordinator({ resolve: mock(async () => resolution), create: mock(async () => ({ operationId: "op_1234567890abcdef" })) })
    coordinator.setUrl(url)
    await coordinator.resolve()
    for (const width of [79, 55, 40]) {
      const narrow = await testRender(
        () => <ForgeSourceReviewDialog coordinator={coordinator} onAccepted={() => {}} onBack={() => {}} />,
        { width, height: 40, kittyKeyboard: true },
      )
      await narrow.renderOnce()
      const frame = narrow.captureCharFrame()
      expect(frame).toContain("Review workspace")
      expect(frame).toContain("Workspace name")
      expect(frame).toContain("review-42")
      expect(frame).toContain("Include worker")
      expect(frame).toContain("[c] Create")
      expect(frame).toContain("workspace")
      if (width === 55) expect(frame).toContain("…")
    }

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
