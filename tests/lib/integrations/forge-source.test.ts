import { describe, test, expect } from "bun:test"
import { parseForgeSourceUrl, type ForgeSourceResolution } from "@/lib/integrations/forge-source"

describe("parseForgeSourceUrl", () => {
  test("parses GitLab self-hosted merge request URL", () => {
    const parsed = parseForgeSourceUrl("https://gitlab.example.com/group/subgroup/api/-/merge_requests/42")
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.forge).toBe("gitlab")
      expect(parsed.changeType).toBe("mr")
      expect(parsed.baseUrl).toBe("https://gitlab.example.com")
      expect(parsed.repoPath).toBe("group/subgroup/api")
      expect(parsed.changeNumber).toBe(42)
    }
  })

  test("parses GitHub pull request URL", () => {
    const parsed = parseForgeSourceUrl("https://github.com/org/api/pull/9")
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.forge).toBe("github")
      expect(parsed.changeType).toBe("pr")
      expect(parsed.repoPath).toBe("org/api")
      expect(parsed.changeNumber).toBe(9)
    }
  })

  test("parses Gitea pull request URL and preserves base URL", () => {
    const parsed = parseForgeSourceUrl("https://git.example.test/org/api/pulls/9")
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.forge).toBe("gitea")
      expect(parsed.changeType).toBe("pr")
      expect(parsed.baseUrl).toBe("https://git.example.test")
      expect(parsed.repoPath).toBe("org/api")
      expect(parsed.changeNumber).toBe(9)
    }
  })

  test("returns typed failure for malformed number", () => {
    const parsed = parseForgeSourceUrl("https://github.com/org/api/pull/not-a-number")
    expect(parsed).toEqual({ ok: false, error: "url_parse_failed" })
  })

  test("returns typed failure for unsupported forge", () => {
    const parsed = parseForgeSourceUrl("https://bitbucket.org/org/api/pull-requests/1")
    expect(parsed).toEqual({ ok: false, error: "unsupported_forge" })
  })
})

describe("ForgeSourceResolution contract", () => {
  test("includes required source, target, matching, and metadata fields", () => {
    const resolution: ForgeSourceResolution = {
      forge: "gitlab",
      changeType: "mr",
      changeNumber: 42,
      baseUrl: "https://gitlab.example.com",
      repoPath: "group/subgroup/api",
      webUrl: "https://gitlab.example.com/group/subgroup/api/-/merge_requests/42",
      source: { branch: "feature/source", ref: "refs/heads/feature/source" },
      target: { branch: "main" },
      matchedRepo: {
        registryName: "api",
        templateRepoName: "api",
        workspaceRepoMode: "worktree",
      },
      metadataForWorkspace: {
        forge: "gitlab",
        baseUrl: "https://gitlab.example.com",
        repoPath: "group/subgroup/api",
        changeType: "mr",
        changeNumber: 42,
      },
      confidence: "url",
    }

    expect(resolution.source.branch).toBe("feature/source")
    expect(resolution.target.branch).toBe("main")
    expect(resolution.matchedRepo.registryName).toBe("api")
    expect(resolution.metadataForWorkspace.repoPath).toBe("group/subgroup/api")
    expect("labels" in resolution).toBe(false)
  })
})
