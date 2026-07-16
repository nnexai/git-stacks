import { describe, expect, test } from "@test/api"

import {
  matchForgeSourceRepository,
  resolveForgeChangeSource,
  suggestForgeWorkspaceName,
  type ForgeCommandRequest,
  type ForgeCommandRunner,
} from "@/lib/integrations/forge-source-resolver"
import type { RepoRegistryEntry, Template } from "@/lib/config"

const SHA = "a".repeat(40)
const BASE_SHA = "b".repeat(40)

function runner(
  implementation: (request: ForgeCommandRequest) => { exit_code: number; stdout?: string; stderr?: string } | Promise<{ exit_code: number; stdout?: string; stderr?: string }>,
): { run: ForgeCommandRunner; calls: ForgeCommandRequest[] } {
  const calls: ForgeCommandRequest[] = []
  return {
    calls,
    run: async (request) => {
      calls.push(request)
      const result = await implementation(request)
      return { exit_code: result.exit_code, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
    },
  }
}

function githubJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          number: 7,
          url: "https://github.com/acme/api/pull/7",
          state: "OPEN",
          isDraft: false,
          baseRefName: "main",
          baseRefOid: BASE_SHA,
          headRefName: "feature/review",
          headRefOid: SHA,
          isCrossRepository: true,
          baseRepository: { nameWithOwner: "acme/api", url: "https://github.com/acme/api", sshUrl: "git@github.com:acme/api.git" },
          headRepository: { nameWithOwner: "contrib/api", url: "https://github.com/contrib/api", sshUrl: "git@github.com:contrib/api.git" },
          ...overrides,
        },
      },
    },
  })
}

function gitlabMrJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    iid: 42,
    state: "opened",
    web_url: "https://gitlab.example.com/group/sub/api/-/merge_requests/42",
    sha: SHA,
    source_branch: "feature/review",
    source_project_id: 91,
    target_branch: "main",
    target_project_id: 90,
    diff_refs: { head_sha: SHA, base_sha: BASE_SHA },
    ...overrides,
  })
}

const gitlabProjectJson = JSON.stringify({
  id: 91,
  path_with_namespace: "forks/sub/api",
  ssh_url_to_repo: "git@gitlab.example.com:forks/sub/api.git",
  http_url_to_repo: "https://gitlab.example.com/forks/sub/api.git",
  web_url: "https://gitlab.example.com/forks/sub/api",
})

describe("provider-backed forge resolver", () => {
  test("resolves a GitHub fork with fixed GraphQL argv and immutable metadata", async () => {
    const scripted = runner(() => ({ exit_code: 0, stdout: githubJson() }))
    const result = await resolveForgeChangeSource({
      url: "https://github.com/acme/api/pull/7?ignored=1#discussion",
      runner: scripted.run,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.change.provider).toBe("github")
    expect(result.change.canonical_url).toBe("https://github.com/acme/api/pull/7")
    expect(result.change.source.repository.path).toBe("contrib/api")
    expect(result.change.source.branch).toBe("feature/review")
    expect(result.change.source.ref).toBe("refs/heads/feature/review")
    expect(result.change.source.sha).toBe(SHA)
    expect(result.change.target.sha).toBe(BASE_SHA)
    expect(result.change.cross_repository).toBe(true)
    expect(result.change.source.fetch.https).toBe("https://github.com/contrib/api.git")
    expect(scripted.calls).toHaveLength(1)
    expect(scripted.calls[0].argv.slice(0, 5)).toEqual(["gh", "api", "graphql", "--hostname", "github.com"])
    expect(scripted.calls[0].argv.join(" ")).not.toContain("token")
    expect(scripted.calls[0].argv.join(" ")).not.toContain("checkout")
    expect(scripted.calls[0].timeout_ms).toBeGreaterThan(0)
    expect(scripted.calls[0].max_output_bytes).toBeGreaterThan(0)
  })

  test("resolves nested GitLab groups through target MR then source project lookup", async () => {
    const scripted = runner((request) => ({
      exit_code: 0,
      stdout: request.argv.at(-1)?.includes("merge_requests") ? gitlabMrJson() : gitlabProjectJson,
    }))
    const result = await resolveForgeChangeSource({
      url: "https://gitlab.example.com/group/sub/api/-/merge_requests/42",
      configured_hosts: { gitlab: ["gitlab.example.com"] },
      runner: scripted.run,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.change.provider).toBe("gitlab")
    expect(result.change.target.repository.path).toBe("group/sub/api")
    expect(result.change.source.repository.path).toBe("forks/sub/api")
    expect(result.change.source.fetch.https).toBe("https://gitlab.example.com/forks/sub/api.git")
    expect(scripted.calls.map((call) => call.argv)).toEqual([
      ["glab", "api", "--hostname", "gitlab.example.com", "projects/group%2Fsub%2Fapi/merge_requests/42"],
      ["glab", "api", "--hostname", "gitlab.example.com", "projects/91"],
    ])
    expect(scripted.calls.flatMap((call) => call.argv)).not.toContain("checkout")
    expect(scripted.calls.flatMap((call) => call.argv)).not.toContain("mr")
  })

  test.each([
    ["credentialed", "https://user:secret@github.com/acme/api/pull/7", "malformed_url"],
    ["wrong GitHub kind", "https://github.com/acme/api/issues/7", "malformed_url"],
    ["wrong GitLab kind", "https://gitlab.com/acme/api/-/issues/7", "malformed_url"],
    ["unsupported host", "https://forge.example.com/acme/api/pull/7", "unsupported_host"],
    ["Gitea remains outside reviewed flow", "https://gitea.example.com/acme/api/pulls/7", "unsupported_host"],
  ])("rejects %s without invoking provider tooling", async (_label, url, error) => {
    const scripted = runner(() => ({ exit_code: 0, stdout: "{}" }))
    const result = await resolveForgeChangeSource({ url, runner: scripted.run })
    expect(result).toMatchObject({ ok: false, error })
    expect(scripted.calls).toHaveLength(0)
  })

  test.each([
    ["cli_unavailable", Object.assign(new Error("spawn failed"), { code: "ENOENT" }), "cli_unavailable"],
    ["timeout", Object.assign(new Error("timed out"), { code: "FORGE_TIMEOUT" }), "request_timeout"],
    ["output cap", Object.assign(new Error("too large"), { code: "FORGE_OUTPUT_LIMIT" }), "provider_response_invalid"],
    ["abort", Object.assign(new Error("aborted"), { code: "ABORT_ERR" }), "cancelled"],
  ])("classifies %s without exposing runner details", async (_label, thrown, expected) => {
    const scripted = runner(async () => { throw thrown })
    const result = await resolveForgeChangeSource({ url: "https://github.com/acme/api/pull/7", runner: scripted.run })
    expect(result).toEqual({ ok: false, error: expected, provider: "github", retryable: expected !== "cli_unavailable" })
    expect(JSON.stringify(result)).not.toContain("spawn failed")
    expect(JSON.stringify(result)).not.toContain("timed out")
  })

  test.each([
    ["authentication", 1, "authentication required for host", "auth_required"],
    ["not found", 1, "HTTP 404", "change_not_found"],
    ["rate limit", 1, "HTTP 429 rate limit", "rate_limited"],
    ["provider", 1, "HTTP 503 unavailable", "provider_unavailable"],
  ])("classifies %s exit without returning raw output", async (_label, exit_code, stderr, expected) => {
    const scripted = runner(() => ({ exit_code, stdout: "sensitive stdout", stderr }))
    const result = await resolveForgeChangeSource({ url: "https://github.com/acme/api/pull/7", runner: scripted.run })
    expect(result).toMatchObject({ ok: false, error: expected, provider: "github" })
    expect(JSON.stringify(result)).not.toContain(stderr)
    expect(JSON.stringify(result)).not.toContain("sensitive")
  })

  test.each([
    ["closed", githubJson({ state: "CLOSED" }), "change_closed"],
    ["null head", githubJson({ headRepository: null }), "provider_response_invalid"],
    ["short SHA", githubJson({ headRefOid: "abc" }), "provider_response_invalid"],
    ["target identity mismatch", githubJson({ baseRepository: { nameWithOwner: "other/api", url: "https://github.com/other/api", sshUrl: "git@github.com:other/api.git" } }), "provider_response_invalid"],
    ["invalid JSON", "not-json", "provider_response_invalid"],
  ])("rejects %s provider data", async (_label, stdout, expected) => {
    const scripted = runner(() => ({ exit_code: 0, stdout }))
    const result = await resolveForgeChangeSource({ url: "https://github.com/acme/api/pull/7", runner: scripted.run })
    expect(result).toMatchObject({ ok: false, error: expected })
  })
})

describe("authoritative source repository matching", () => {
  const change = {
    provider: "gitlab" as const,
    change_kind: "merge_request" as const,
    change_number: 42,
    canonical_url: "https://gitlab.example.com/group/api/-/merge_requests/42",
    host: "gitlab.example.com",
    source: {
      repository: { host: "gitlab.example.com", path: "fork/api", web_url: "https://gitlab.example.com/fork/api" },
      fetch: { https: "https://gitlab.example.com/fork/api.git" },
      branch: "Feature/Useful Change",
      ref: "refs/heads/Feature/Useful Change",
      sha: SHA,
    },
    target: {
      repository: { host: "gitlab.example.com", path: "group/api", web_url: "https://gitlab.example.com/group/api" },
      branch: "main",
      sha: BASE_SHA,
    },
    cross_repository: true,
  }
  const explicit: RepoRegistryEntry = {
    name: "api",
    schema_version: "1",
    local_path: "/private/main/api",
    default_branch: "main",
    type: "typescript",
    is_dir: false,
    forge: "gitlab",
    forge_metadata: { forge: "gitlab", base_url: "https://gitlab.example.com", repo_path: "group/api" },
  }
  const template: Template = {
    name: "review",
    schema_version: "1",
    repos: [{ repo: "api", mode: "worktree" }],
  }

  test("explicit repo metadata wins over integration and remote inference", () => {
    const result = matchForgeSourceRepository(change, {
      registry: [
        explicit,
        { ...explicit, name: "remote-only", forge_metadata: undefined },
      ],
      templates: [template],
      config: { integrations: { gitlab: { enabled: true, base_url: "https://other.example.com" } } } as any,
      remote_urls: { "remote-only": ["https://gitlab.example.com/group/api.git"] },
      template_name: "review",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.match.registry_name).toBe("api")
    expect(result.match.template_name).toBe("review")
    expect(result.match.confidence).toBe("explicit-metadata")
    expect(result.match.mode).toBe("worktree")
    expect(result.candidates).toHaveLength(1)
  })

  test("integration base URL matches forge/path metadata without a repo base override", () => {
    const registry = [{ ...explicit, forge_metadata: { forge: "gitlab" as const, repo_path: "group/api" } }]
    const result = matchForgeSourceRepository(change, {
      registry,
      templates: [template],
      config: { integrations: { gitlab: { enabled: true, base_url: "https://gitlab.example.com" } } } as any,
      template_name: "review",
    })
    expect(result).toMatchObject({ ok: true, match: { confidence: "integration-base-url" } })
  })

  test("uses unique bounded remote inference only as final fallback", () => {
    const inferred = { ...explicit, forge_metadata: undefined }
    const result = matchForgeSourceRepository(change, {
      registry: [inferred],
      templates: [template],
      config: { integrations: { gitlab: { enabled: true, base_url: "https://gitlab.example.com" } } } as any,
      remote_urls: { api: ["git@gitlab.example.com:group/api.git", "https://mirror.example.com/group/api.git"] },
      template_name: "review",
    })
    expect(result).toMatchObject({ ok: true, match: { confidence: "remote-inference" } })
  })

  test("fails typed for ambiguous same-precedence matches", () => {
    const result = matchForgeSourceRepository(change, {
      registry: [explicit, { ...explicit, name: "api-copy", local_path: "/private/main/api-copy" }],
      templates: [{ ...template, repos: [{ repo: "api" }, { repo: "api-copy" }] }],
      template_name: "review",
    })
    expect(result).toEqual({ ok: false, error: "ambiguous_repo" })
  })

  test.each([
    ["missing selected template", [], "review", "template_repo_missing"],
    ["source repo absent from template", [{ ...template, repos: [{ repo: "other" }] }], "review", "template_repo_missing"],
    ["trunk", [{ ...template, repos: [{ repo: "api", mode: "trunk" as const }] }], "review", "not_worktree_mode"],
    ["dir", [{ ...template, repos: [{ repo: "api", mode: "dir" as const }] }], "review", "not_worktree_mode"],
  ])("rejects %s authoritatively", async (_label, templates, template_name, error) => {
    const result = matchForgeSourceRepository(change, { registry: [explicit], templates, template_name })
    expect(result).toEqual({ ok: false, error })
  })

  test("never matches the fork identity in place of the target repository", () => {
    const forkEntry = { ...explicit, forge_metadata: { ...explicit.forge_metadata!, repo_path: "fork/api" } }
    const result = matchForgeSourceRepository(change, {
      registry: [forkEntry], templates: [{ ...template, repos: [{ repo: "api" }] }], template_name: "review",
    })
    expect(result).toEqual({ ok: false, error: "repo_not_matched" })
  })

  test("suggests normalized conflict-safe names without becoming final authority", () => {
    const proposed = suggestForgeWorkspaceName(change, ["api-mr-42-feature-useful-change"])
    expect(proposed).toBe("api-mr-42-feature-useful-change-2")
    expect(proposed).toMatch(/^[A-Za-z0-9._-]+$/)
  })
})
