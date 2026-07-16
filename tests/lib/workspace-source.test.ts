import { beforeEach, describe, expect, mock, test } from "@test/api"

import {
  _source,
  formatWorkspaceSourceError,
  prepareReviewedWorkspaceSource,
} from "@/lib/workspace-source"
import type { TrustedForgeChange } from "@/lib/integrations/forge-source-resolver"

const SHA = "a".repeat(40)

const trusted: TrustedForgeChange = {
  provider: "github",
  change_kind: "pull_request",
  change_number: 9,
  canonical_url: "https://github.com/acme/api/pull/9",
  host: "github.com",
  source: {
    repository: { host: "github.com", path: "contrib/api", web_url: "https://github.com/contrib/api" },
    fetch: { https: "https://github.com/contrib/api.git", ssh: "git@github.com:contrib/api.git" },
    branch: "feature/review",
    ref: "refs/heads/feature/review",
    sha: SHA,
  },
  target: {
    repository: { host: "github.com", path: "acme/api", web_url: "https://github.com/acme/api" },
    branch: "main",
    sha: "b".repeat(40),
  },
  cross_repository: true,
}

const repo: any = {
  name: "api",
  repo: "api",
  type: "typescript",
  mode: "worktree",
  main_path: "/private/main/api",
  task_path: "/private/tasks/review/api",
}

describe("trusted reviewed workspace source preparation", () => {
  beforeEach(() => {
    _source.fetchSourceRef = mock(async () => ({ ok: true as const }))
    _source.deleteRef = mock(async () => {})
    _source.resolveRef = mock(async () => ({ ok: true as const, sha: SHA }))
    _source.checkBranchExists = mock(async () => false)
  })

  test("fetches the real fork branch into an operation-private ref and verifies full SHA", async () => {
    const result = await prepareReviewedWorkspaceSource({
      trusted_source: trusted,
      matched_repo: repo,
      workspace_name: "review-9",
      branch: "feature/review",
      operation_id: "operation-secret-123",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(_source.fetchSourceRef).toHaveBeenCalledTimes(1)
    const fetchArgs = (_source.fetchSourceRef as any).mock.calls[0]
    expect(fetchArgs.slice(0, 3)).toEqual([
      "/private/main/api",
      "https://github.com/contrib/api.git",
      "refs/heads/feature/review",
    ])
    expect(fetchArgs[3]).toMatch(/^refs\/git-stacks\/review\/api\/[0-9a-f]{24}$/)
    expect(fetchArgs[3]).not.toContain("operation-secret-123")
    expect(fetchArgs.join(" ")).not.toContain("origin")
    expect(result.fetchedRef).toBe(fetchArgs[3])
    expect(result.sourceMetadata.source_branch).toBe("feature/review")
    expect(result.sourceMetadata.source_ref).toBe("refs/heads/feature/review")
  })

  test("dry run previews trusted metadata without Git side effects", async () => {
    const result = await prepareReviewedWorkspaceSource({
      trusted_source: trusted,
      matched_repo: repo,
      workspace_name: "review-9",
      operation_id: "dry-run",
      dry_run: true,
    })
    expect(result.ok).toBe(true)
    expect(_source.fetchSourceRef).not.toHaveBeenCalled()
    expect(_source.resolveRef).not.toHaveBeenCalled()
    expect(_source.deleteRef).not.toHaveBeenCalled()
    if (result.ok) expect(result.preview.sourceRef).toBe("refs/heads/feature/review")
  })

  test("rejects a moved or mismatched fetched head and deletes the private ref", async () => {
    _source.resolveRef = mock(async () => ({ ok: true as const, sha: "c".repeat(40) }))
    const result = await prepareReviewedWorkspaceSource({
      trusted_source: trusted,
      matched_repo: repo,
      workspace_name: "review-9",
      operation_id: "moved-head",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("source_changed")
      expect(formatWorkspaceSourceError(result)).not.toContain("/private")
    }
    expect(_source.deleteRef).toHaveBeenCalledTimes(1)
  })

  test("cleans a private ref when fork fetch fails without exposing Git output", async () => {
    _source.fetchSourceRef = mock(async () => ({ ok: false as const, error: "secret credential /private/path" }))
    const result = await prepareReviewedWorkspaceSource({
      trusted_source: trusted,
      matched_repo: repo,
      workspace_name: "review-9",
      operation_id: "fetch-failure",
    })
    expect(result).toMatchObject({ ok: false, error: "fork_unreachable" })
    expect(JSON.stringify(result)).not.toContain("secret")
    expect(JSON.stringify(result)).not.toContain("/private")
    expect(_source.deleteRef).toHaveBeenCalledTimes(1)
  })

  test("reuses an existing branch only when its full SHA matches", async () => {
    _source.checkBranchExists = mock(async () => true)
    _source.resolveRef = mock(async (_path: string, ref: string) => ({
      ok: true as const,
      sha: ref === "feature/review" ? SHA : SHA,
    }))
    const result = await prepareReviewedWorkspaceSource({
      trusted_source: trusted,
      matched_repo: repo,
      workspace_name: "review-9",
      operation_id: "same-branch",
    })
    expect(result.ok).toBe(true)
  })

  test("rejects an existing branch at a different SHA and cleans the private ref", async () => {
    _source.checkBranchExists = mock(async () => true)
    _source.resolveRef = mock(async (_path: string, ref: string) => ({
      ok: true as const,
      sha: ref === "feature/review" ? "d".repeat(40) : SHA,
    }))
    const result = await prepareReviewedWorkspaceSource({
      trusted_source: trusted,
      matched_repo: repo,
      workspace_name: "review-9",
      operation_id: "conflicting-branch",
    })
    expect(result).toMatchObject({ ok: false, error: "branch_conflict" })
    expect(_source.deleteRef).toHaveBeenCalledTimes(1)
  })

  test("exposes an idempotent rollback cleanup hook after successful preparation", async () => {
    const result = await prepareReviewedWorkspaceSource({
      trusted_source: trusted,
      matched_repo: repo,
      workspace_name: "review-9",
      operation_id: "rollback",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    await result.cleanup()
    await result.cleanup()
    expect(_source.deleteRef).toHaveBeenCalledTimes(1)
  })

  test.each(["trunk", "dir"])("rejects %s repositories before fetch", async (mode) => {
    const result = await prepareReviewedWorkspaceSource({
      trusted_source: trusted,
      matched_repo: { ...repo, mode },
      workspace_name: "review-9",
      operation_id: "wrong-mode",
    })
    expect(result).toMatchObject({ ok: false, error: "not_worktree_mode" })
    expect(_source.fetchSourceRef).not.toHaveBeenCalled()
  })
})
