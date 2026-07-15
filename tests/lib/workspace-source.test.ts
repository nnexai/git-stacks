import { beforeEach, describe, expect, mock, test } from "@test/api"
import { _source, formatWorkspaceSourceError, prepareWorkspaceSource } from "@/lib/workspace-source"

describe("workspace-source", () => {
  const repos: any[] = [
    { name: "api", repo: "api", mode: "worktree", main_path: "/tmp/main/api" },
    { name: "web", repo: "web", mode: "worktree", main_path: "/tmp/main/web" },
  ]
  const registry: any[] = [
    { name: "api", forge_metadata: { repo_path: "org/api" } },
    { name: "web", forge_metadata: { repo_path: "org/web" } },
  ]

  beforeEach(() => {
    _source.fetchSourceRef = mock(async () => ({ ok: true as const }))
    _source.deleteRef = mock(async () => {})
    _source.resolveRef = mock(async (_repo: string, ref: string) => ({ ok: true as const, sha: ref.includes("sources") ? "abc" : "abc" }))
    _source.checkBranchExists = mock(async () => false)
  })

  test("formats ambiguous repo with --repo guidance", async () => {
    const duplicateRepos = [repos[0], { ...repos[0], name: "api-copy" }]
    const result = await prepareWorkspaceSource({
      sourceUrl: "https://gitlab.example.com/org/api/-/merge_requests/42",
      repos: duplicateRepos,
      registry,
      workspaceName: "review-42",
      dryRun: true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(formatWorkspaceSourceError(result)).toContain("--repo <name>")
    }
  })

  test("dry-run returns preview without fetch side effects", async () => {
    const result = await prepareWorkspaceSource({
      sourceUrl: "https://github.com/org/api/pull/9",
      repos,
      registry,
      workspaceName: "review-9",
      dryRun: true,
    })
    expect(result.ok).toBe(true)
    expect((_source.fetchSourceRef as any).mock.calls.length).toBe(0)
    if (result.ok) {
      expect(result.preview.sourceRef).toContain("refs/heads/")
      expect(result.preview.matchedRepo).toBe("api")
    }
  })

  test("branch conflict when existing branch sha differs", async () => {
    _source.checkBranchExists = mock(async () => true)
    const resolve = mock()
      .mockResolvedValueOnce({ ok: true as const, sha: "local-sha" })
      .mockResolvedValueOnce({ ok: true as const, sha: "fetched-sha" })
    _source.resolveRef = resolve as any
    const result = await prepareWorkspaceSource({
      sourceUrl: "https://git.example.test/org/api/pulls/7",
      repos,
      registry,
      workspaceName: "review-7",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("branch_conflict")
    }
  })

  test("fetch failure includes provider auth guidance", async () => {
    _source.fetchSourceRef = mock(async () => ({ ok: false as const, error: "no auth" }))
    const result = await prepareWorkspaceSource({
      sourceUrl: "https://gitlab.example.com/org/api/-/merge_requests/7",
      repos,
      registry,
      workspaceName: "review-7",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message.toLowerCase()).toContain("auth")
      expect(result.message).toContain("gitlab")
    }
  })
})
