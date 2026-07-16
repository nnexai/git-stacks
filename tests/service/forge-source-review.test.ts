import { describe, expect, test } from "@test/api"

import type { TrustedForgeChange } from "../../packages/core/src/integrations/forge-source-resolver"
import { WebForgeResolveResponseSchema } from "../../packages/protocol/src/web"
import { ForgeSourceReviewAuthority } from "../../packages/service/src/policy/forge-source-review"

const repositoryId = "00000000-0000-4000-8000-000000000001"
const SHA = "a".repeat(40)
const sourceUrl = "https://github.com/acme/api/pull/42"
const trusted: TrustedForgeChange = {
  provider: "github",
  change_kind: "pull_request",
  change_number: 42,
  canonical_url: sourceUrl,
  host: "github.com",
  source: {
    repository: { host: "github.com", path: "contributor/api", web_url: "https://github.com/contributor/api" },
    fetch: { https: "https://secret-token@github.com/contributor/api.git", ssh: "git@github.com:contributor/api.git" },
    branch: "feature/topic",
    ref: "refs/heads/feature/topic",
    sha: SHA,
  },
  target: {
    repository: { host: "github.com", path: "acme/api", web_url: "https://github.com/acme/api" },
    branch: "main",
    sha: "b".repeat(40),
  },
  cross_repository: true,
}

const catalog = {
  revision: "7",
  registry: [{
    name: "api", schema_version: "1", local_path: "/private/repos/api", default_branch: "main",
    type: "typescript", forge: "github", is_dir: false,
    forge_metadata: { forge: "github" as const, base_url: "https://github.com", repo_path: "acme/api" },
  }],
  templates: [{ name: "review", schema_version: "1", repos: [{ repo: "api", mode: "worktree" as const, base_branch: "main" }] }],
  config: { integrations: { github: { enabled: true, base_url: "https://github.com" } } },
  repository_ids: { api: repositoryId },
  existing_workspace_names: ["api-pr-42-feature-topic"],
  remote_urls: { api: ["https://github.com/acme/api.git"] },
}

function createAuthority(input: {
  now?: () => number
  random?: (size: number) => Uint8Array
  revision?: () => string
} = {}) {
  const calls: unknown[] = []
  let defaultSequence = 1
  const authority = new ForgeSourceReviewAuthority({
    now: input.now ?? (() => Date.parse("2026-07-16T12:00:00.000Z")),
    randomBytes: input.random ?? ((size) => new Uint8Array(size).fill(defaultSequence++)),
    catalog: async () => ({ ...catalog, revision: input.revision?.() ?? catalog.revision }),
    resolve: async (request) => {
      calls.push(request)
      return { ok: true as const, change: trusted }
    },
  })
  return { authority, calls }
}

describe("forge source review token authority", () => {
  test("resolves without mutation and returns only an opaque safe review projection", async () => {
    const { authority, calls } = createAuthority()
    const response = await authority.resolve({ principalId: "principal-a", url: sourceUrl })
    expect(WebForgeResolveResponseSchema.parse(response)).toEqual(response)
    expect(response).toMatchObject({
      resolved: true,
      revision: "7",
      source: {
        provider: "github", change_number: 42, target_repository: "acme/api", source_repository: "contributor/api",
        source_branch: "feature/topic", target_branch: "main", head_sha: SHA, cross_repository: true,
      },
      draft: { template_name: "review", matched_source_repository_id: repositoryId },
    })
    if (!response.resolved) return
    expect(response.token).toMatch(/^review_[A-Za-z0-9_-]{43}$/)
    expect(response.draft.workspace_name).toBe("api-pr-42-feature-topic-2")
    expect(calls).toHaveLength(1)
    const serialized = JSON.stringify(response)
    for (const canary of ["secret-token", "/private/repos/api", "refs/heads/", "git@github.com", "fetch", "remote_urls"]) {
      expect(serialized).not.toContain(canary)
    }
  })

  test("uses 256-bit unique opaque tokens and a bounded expiry boundary", async () => {
    let now = 1_000
    let sequence = 1
    const { authority } = createAuthority({
      now: () => now,
      random: (size) => new Uint8Array(size).fill(sequence++),
    })
    const first = await authority.resolve({ principalId: "principal-a", url: sourceUrl })
    const second = await authority.resolve({ principalId: "principal-a", url: sourceUrl })
    expect(first.resolved && second.resolved && first.token).not.toBe(second.resolved && second.token)
    if (!first.resolved) return
    expect(first.expires_at).toBe(new Date(1_000 + 10 * 60_000).toISOString())
    now = 1_000 + 10 * 60_000 - 1
    expect(authority.inspect({ principalId: "principal-a", token: first.token })?.trustedSource).toEqual(trusted)
    now += 1
    expect(authority.inspect({ principalId: "principal-a", token: first.token })).toBeNull()
  })

  test("fails closed across restart, wrong principal, canonical source, revision, body, and reuse", async () => {
    let revision = "7"
    const { authority } = createAuthority({ revision: () => revision })
    const resolved = await authority.resolve({ principalId: "principal-a", url: sourceUrl })
    expect(resolved.resolved).toBe(true)
    if (!resolved.resolved) return
    expect(authority.inspect({ principalId: "principal-b", token: resolved.token })).toBeNull()
    expect(authority.inspect({ principalId: "principal-a", token: resolved.token, canonicalUrl: "https://github.com/acme/api/pull/43" })).toBeNull()
    expect(createAuthority().authority.inspect({ principalId: "principal-a", token: resolved.token })).toBeNull()

    const first = await authority.reserve({
      principalId: "principal-a", token: resolved.token, canonicalUrl: sourceUrl, expectedRevision: "7",
      draft: resolved.draft, idempotencyKey: "create-key",
    })
    expect(first.ok).toBe(true)
    expect((await authority.reserve({
      principalId: "principal-a", token: resolved.token, canonicalUrl: sourceUrl, expectedRevision: "7",
      draft: resolved.draft, idempotencyKey: "create-key",
    })).ok).toBe(true)
    expect((await authority.reserve({
      principalId: "principal-a", token: resolved.token, canonicalUrl: sourceUrl, expectedRevision: "7",
      draft: { ...resolved.draft, workspace_name: "different" }, idempotencyKey: "create-key",
    }))).toMatchObject({ ok: false, failure: { code: "review_expired" } })
    expect((await authority.reserve({
      principalId: "principal-a", token: resolved.token, canonicalUrl: sourceUrl, expectedRevision: "7",
      draft: resolved.draft, idempotencyKey: "different-key",
    }))).toMatchObject({ ok: false, failure: { code: "review_expired" } })

    const fresh = await authority.resolve({ principalId: "principal-a", url: sourceUrl })
    if (!fresh.resolved) return
    revision = "8"
    expect((await authority.reserve({
      principalId: "principal-a", token: fresh.token, canonicalUrl: sourceUrl, expectedRevision: "7",
      draft: fresh.draft, idempotencyKey: "stale-key",
    }))).toMatchObject({ ok: false, failure: { code: "stale_revision" } })
  })

  test("maps provider and matching failures to fixed safe recovery guidance", async () => {
    const failures = [
      ["auth_required", "authenticate"],
      ["provider_response_invalid", "retry"],
      ["change_closed", "change_source"],
    ] as const
    for (const [code, recovery] of failures) {
      const authority = new ForgeSourceReviewAuthority({
        catalog: async () => catalog,
        resolve: async () => ({ ok: false as const, error: code, provider: "github" as const, retryable: false }),
      })
      const response = await authority.resolve({ principalId: "principal-a", url: sourceUrl })
      expect(response).toMatchObject({ resolved: false, failure: { code, recovery } })
      expect(JSON.stringify(response)).not.toContain("/private")
    }
  })
})

describe("reviewed forge source creation admission", () => {
  const resolveDraft = async (authority: ForgeSourceReviewAuthority) => {
    const response = await authority.resolve({ principalId: "principal-a", url: sourceUrl })
    expect(response.resolved).toBe(true)
    if (!response.resolved) throw new Error("resolve failed")
    return response
  }

  test("rejects provider movement before fetch without creating workspace resources", async () => {
    let providerCalls = 0
    let prepareCalls = 0
    let createCalls = 0
    const moved = { ...trusted, source: { ...trusted.source, sha: "c".repeat(40) } }
    const authority = new ForgeSourceReviewAuthority({
      catalog: async () => catalog as any,
      resolve: async () => ({ ok: true, change: providerCalls++ === 0 ? trusted : moved }),
      prepareSource: async () => { prepareCalls += 1; throw new Error("must not fetch") },
      createWorkspace: async () => { createCalls += 1; throw new Error("must not create") },
    })
    const resolved = await resolveDraft(authority)
    const admission = await authority.admit({
      principalId: "principal-a", token: resolved.token, expectedRevision: "7", draft: resolved.draft,
      idempotencyKey: "create-key",
    })
    expect(admission).toMatchObject({ ok: false, failure: { code: "source_changed", recovery: "resolve_again" } })
    expect({ providerCalls, prepareCalls, createCalls }).toEqual({ providerCalls: 2, prepareCalls: 0, createCalls: 0 })
  })

  test.each(["source_changed", "fork_unreachable"] as const)("returns typed %s when SHA-safe private-ref preparation rejects", async (failureCode) => {
    let cleanupCalls = 0
    let createCalls = 0
    const authority = new ForgeSourceReviewAuthority({
      catalog: async () => catalog as any,
      resolve: async () => ({ ok: true, change: trusted }),
      prepareSource: async () => ({
        ok: false as const,
        error: failureCode,
        message: "raw fetch failure /private/path TOKEN=secret",
        cleanup: async () => { cleanupCalls += 1 },
      } as any),
      createWorkspace: async () => { createCalls += 1; throw new Error("must not create") },
    })
    const resolved = await resolveDraft(authority)
    const admission = await authority.admit({
      principalId: "principal-a", token: resolved.token, expectedRevision: "7", draft: resolved.draft,
      idempotencyKey: `create-${failureCode}`,
    })
    expect(admission).toMatchObject({ ok: false, failure: { code: failureCode } })
    expect(JSON.stringify(admission)).not.toContain("/private/path")
    expect(JSON.stringify(admission)).not.toContain("TOKEN")
    expect(cleanupCalls).toBe(1)
    expect(createCalls).toBe(0)
  })

  test("passes only verified source metadata and private ref into normal creation exactly once", async () => {
    const calls: Array<{ kind: string; value?: unknown }> = []
    const cleanup = async () => { calls.push({ kind: "cleanup" }) }
    const prepared = {
      ok: true as const,
      branch: "feature/topic",
      matchedRepoName: "api",
      fetchedRef: "refs/git-stacks/review/api/private",
      cleanup,
      sourceMetadata: {
        kind: "forge" as const, forge: "github" as const, base_url: "https://github.com", url: sourceUrl,
        change_type: "pr" as const, change_number: 42, repo: "api", repo_path: "acme/api",
        source_branch: "feature/topic", source_ref: "refs/heads/feature/topic", target_branch: "main",
        web_url: sourceUrl, fetched_ref: "refs/git-stacks/review/api/private",
      },
      preview: {
        source: sourceUrl, forge: "github" as const, change: "pr#42", matchedRepo: "api",
        sourceBranch: "feature/topic", sourceRef: "refs/heads/feature/topic", targetBranch: "feature/topic", workspaceName: "review",
      },
    }
    const authority = new ForgeSourceReviewAuthority({
      catalog: async () => catalog as any,
      resolve: async () => ({ ok: true, change: trusted }),
      prepareSource: async (input) => { calls.push({ kind: "prepare", value: input }); return prepared },
      planWorkspace: async (request) => ({
        ok: true,
        plan: {
          request,
          inputs: {
            wsName: request.name,
            branch: request.branch,
            templateName: "review",
            repos: [{
              id: repositoryId, name: "api", repo: "api", type: "typescript", mode: "worktree",
              main_path: "/private/repos/api", task_path: "/private/tasks/review/api", base_branch: "main",
            }],
          },
        },
      } as any),
      createWorkspace: async (input) => { calls.push({ kind: "create", value: input }); return { ok: true, workspace: { name: input.wsName } } as any },
    })
    const resolved = await resolveDraft(authority)
    const admission = await authority.admit({
      principalId: "principal-a", token: resolved.token, expectedRevision: "7", draft: resolved.draft,
      idempotencyKey: "create-key",
    })
    expect(admission.ok).toBe(true)
    if (!admission.ok) return
    expect(admission.execution.cancellation).toBe("none")
    await admission.execution.steps[0]!.run(async () => {})
    expect(calls.map(({ kind }) => kind)).toEqual(["prepare", "create", "cleanup"])
    expect(calls.find(({ kind }) => kind === "prepare")?.value).toMatchObject({
      trusted_source: trusted, workspace_name: resolved.draft.workspace_name, operation_id: expect.stringMatching(/^review_/),
    })
    expect(calls.find(({ kind }) => kind === "create")?.value).toMatchObject({
      wsName: resolved.draft.workspace_name,
      branch: "feature/topic",
      source: prepared.sourceMetadata,
      sourceStartRefs: { api: prepared.fetchedRef },
    })
    await admission.cleanup()
    expect(calls.filter(({ kind }) => kind === "cleanup")).toHaveLength(1)
  })

  test("revalidates the current template membership before any provider or Git work", async () => {
    let catalogCalls = 0
    let providerCalls = 0
    let prepareCalls = 0
    const authority = new ForgeSourceReviewAuthority({
      catalog: async () => catalogCalls++ === 0 ? catalog as any : { ...catalog, templates: [] } as any,
      resolve: async () => { providerCalls += 1; return { ok: true, change: trusted } },
      prepareSource: async () => { prepareCalls += 1; throw new Error("must not fetch") },
    })
    const resolved = await resolveDraft(authority)
    const admission = await authority.admit({
      principalId: "principal-a", token: resolved.token, expectedRevision: "7", draft: resolved.draft,
      idempotencyKey: "create-key",
    })
    expect(admission).toMatchObject({ ok: false, failure: { code: "template_repo_missing" } })
    expect(providerCalls).toBe(1)
    expect(prepareCalls).toBe(0)
  })
})
