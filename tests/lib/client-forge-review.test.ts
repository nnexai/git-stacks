import { describe, expect, test, vi } from "vitest"

import { createForgeReviewCoordinator, validateForgeReviewDraft } from "@git-stacks/client"
import type { WebForgeErrorDetails, WebForgeFailure, WebForgeResolveResponse } from "@git-stacks/protocol"

const url = "https://github.com/acme/repo/pull/42"
const resolution: Extract<WebForgeResolveResponse, { resolved: true }> = {
  resolved: true,
  token: `review_${"a".repeat(43)}`,
  expires_at: "2026-07-16T13:00:00.000Z",
  revision: "12",
  source: {
    provider: "github", change_kind: "pull_request", change_number: 42, web_url: url, host: "github.com",
    target_repository: "acme/repo", source_repository: "fork/repo", source_branch: "feature", target_branch: "main",
    head_sha: "a".repeat(40), cross_repository: true, confidence: "provider",
  },
  terminology: { provider: "github", change: "Pull request", source_branch: "Head branch", target_branch: "Base branch" },
  candidates: {
    templates: [{ name: "default", repositories: [{ repository_id: "11111111-1111-4111-8111-111111111111", name: "repo", mode: "worktree", matched_source: true }] }],
    source_repositories: [{ repository_id: "11111111-1111-4111-8111-111111111111", name: "repo", mode: "worktree", matched_source: true }],
  },
  draft: {
    workspace_name: "review-42", template_name: "default", matched_source_repository_id: "11111111-1111-4111-8111-111111111111",
    repositories: [{ repository_id: "11111111-1111-4111-8111-111111111111", included: true, branch: { base_branch: "main", workspace_branch: "feature" } }],
  },
}

describe("forge resolve-review-create coordinator", () => {
  test("Enter at Resolve emits resolve only and cannot leak into Create", async () => {
    const resolve = vi.fn(async () => resolution)
    const create = vi.fn(async () => ({ operationId: "op_1234567890abcdef" }))
    const coordinator = createForgeReviewCoordinator({ resolve, create })
    coordinator.setUrl(url)

    await coordinator.enter()
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(create).not.toHaveBeenCalled()
    expect(coordinator.state()).toMatchObject({ phase: "review", url })
    await coordinator.enter()
    expect(create).not.toHaveBeenCalled()
  })

  test("keeps immutable source identity, token, and revision outside editable actions", async () => {
    const coordinator = createForgeReviewCoordinator({ resolve: vi.fn(async () => resolution), create: vi.fn() })
    coordinator.setUrl(url)
    await coordinator.resolve()
    const before = coordinator.state()
    coordinator.edit({ kind: "workspace_name", value: "renamed" })
    coordinator.edit({ kind: "repository_branch", repositoryId: "11111111-1111-4111-8111-111111111111", workspaceBranch: "other" })
    const after = coordinator.state()

    expect(after).toMatchObject({ phase: "review", draft: { workspace_name: "renamed" } })
    expect(after.phase === "review" && before.phase === "review" ? after.anchor : undefined).toEqual(before.phase === "review" ? before.anchor : undefined)
    expect(validateForgeReviewDraft(after.phase === "review" ? after.draft : resolution.draft)).toEqual({ valid: true, fields: {} })
  })

  test("submits the complete reviewed draft once under rapid activation", async () => {
    let accept!: (value: { operationId: string }) => void
    const create = vi.fn(() => new Promise<{ operationId: string }>((resolve) => { accept = resolve }))
    const coordinator = createForgeReviewCoordinator({ resolve: vi.fn(async () => resolution), create })
    coordinator.setUrl(url)
    await coordinator.resolve()

    const first = coordinator.create()
    const second = coordinator.create()
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[0]).toEqual({ token: resolution.token, expected_revision: resolution.revision, draft: resolution.draft })
    accept({ operationId: "op_1234567890abcdef" })
    expect(await Promise.all([first, second])).toEqual([
      { status: "accepted", operationId: "op_1234567890abcdef" },
      { status: "pending" },
    ])
  })

  test.each(["review_expired", "stale_revision", "source_changed"] as const)("returns %s safely to Resolve with URL preserved", async (code) => {
    const details: WebForgeErrorDetails = { kind: "forge_failure", reason: code, recovery: "resolve_again" }
    const failure: WebForgeFailure = { code, recovery: "resolve_again", message: "Resolve again." }
    const coordinator = createForgeReviewCoordinator({
      resolve: vi.fn(async () => resolution),
      create: vi.fn(async () => { throw { message: failure.message, details } }),
    })
    coordinator.setUrl(url)
    await coordinator.resolve()
    await expect(coordinator.create()).rejects.toEqual(failure)
    expect(coordinator.state()).toMatchObject({ phase: "resolve", url, failure })
  })

  test("preserves safe edits for correctable failures and invalidates the token on URL change", async () => {
    const failure: WebForgeFailure = { code: "branch_conflict", recovery: "change_branch", message: "Change branch." }
    const details: WebForgeErrorDetails = { kind: "forge_failure", reason: failure.code, recovery: failure.recovery }
    const coordinator = createForgeReviewCoordinator({
      resolve: vi.fn(async () => resolution),
      create: vi.fn(async () => { throw { message: failure.message, details } }),
    })
    coordinator.setUrl(url)
    await coordinator.resolve()
    coordinator.edit({ kind: "workspace_name", value: "kept" })
    await expect(coordinator.create()).rejects.toEqual(failure)
    expect(coordinator.state()).toMatchObject({ phase: "review", draft: { workspace_name: "kept" }, failure })

    coordinator.setUrl("https://github.com/acme/repo/pull/43")
    expect(coordinator.state()).toMatchObject({ phase: "resolve", url: "https://github.com/acme/repo/pull/43" })
    expect("anchor" in coordinator.state()).toBe(false)
  })

  test("creation success remains accepted until authoritative reconciliation", async () => {
    const coordinator = createForgeReviewCoordinator({
      resolve: vi.fn(async () => resolution),
      create: vi.fn(async () => ({ operationId: "op_1234567890abcdef" })),
    })
    coordinator.setUrl(url)
    await coordinator.resolve()
    await coordinator.create()
    expect(coordinator.state()).toMatchObject({ phase: "accepted", reconciled: false, operationId: "op_1234567890abcdef" })
    coordinator.reconcile()
    expect(coordinator.state()).toMatchObject({ phase: "accepted", reconciled: true })
  })
})
