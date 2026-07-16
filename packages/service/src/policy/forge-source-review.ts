import { createHash, randomBytes as nodeRandomBytes } from "node:crypto"

import type { GlobalConfig, RepoRegistryEntry, Template } from "@git-stacks/core/config"
import {
  matchForgeSourceRepository,
  resolveForgeChangeSource,
  type ForgeProviderResolution,
  type ForgeResolverFailureCode,
  type ForgeSourceMatchResult,
  type TrustedForgeChange,
} from "@git-stacks/core/integrations/forge-source-resolver"
import {
  WebForgeFailureSchema,
  WebForgeResolveResponseSchema,
  WebReviewedWorkspaceDraftSchema,
  type WebForgeFailure,
  type WebForgeResolveResponse,
  type WebReviewedWorkspaceDraft,
} from "@git-stacks/protocol"

export const DEFAULT_FORGE_REVIEW_TTL_MS = 10 * 60 * 1_000
const MAX_REVIEW_TOKENS = 256

export type ForgeSourceReviewCatalog = {
  revision: string
  registry: readonly RepoRegistryEntry[]
  templates: readonly Template[]
  config?: GlobalConfig
  repository_ids?: Readonly<Record<string, string>>
  existing_workspace_names?: readonly string[]
  remote_urls?: Readonly<Record<string, readonly string[]>>
}

type ReviewBinding = { idempotencyKey: string; bodyHash: string }

export type TrustedForgeReview = {
  principalId: string
  canonicalUrl: string
  revision: string
  trustedSource: TrustedForgeChange
  match: Extract<ForgeSourceMatchResult, { ok: true }>
  catalog: ForgeSourceReviewCatalog
  draft: WebReviewedWorkspaceDraft
  expiresAt: number
  binding?: ReviewBinding
}

export type ForgeReviewReservation = {
  token: string
  record: TrustedForgeReview
  draft: WebReviewedWorkspaceDraft
}

export type ForgeReviewReservationResult =
  | { ok: true; reservation: ForgeReviewReservation }
  | { ok: false; failure: WebForgeFailure }

export interface ForgeSourceReviewAuthorityOptions {
  catalog: () => ForgeSourceReviewCatalog | Promise<ForgeSourceReviewCatalog>
  resolve?: typeof resolveForgeChangeSource
  now?: () => number
  randomBytes?: (size: number) => Uint8Array
  ttlMs?: number
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonical(nested)]))
  }
  return value
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")
}

function stableRepositoryId(name: string): string {
  const raw = createHash("sha256").update(`git-stacks:repository:${name}`).digest("hex")
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-8${raw.slice(17, 20)}-${raw.slice(20, 32)}`
}

function recoveryFor(code: WebForgeFailure["code"]): WebForgeFailure["recovery"] {
  if (code === "malformed_url") return "paste_url"
  if (code === "unsupported_host" || code === "unsupported_provider") return "configure_host"
  if (code === "cli_unavailable") return "install_cli"
  if (code === "auth_required") return "authenticate"
  if (code === "change_not_found" || code === "change_closed") return "change_source"
  if (code === "repo_not_matched" || code === "ambiguous_repo") return "select_repository"
  if (code === "template_repo_missing" || code === "not_worktree_mode") return "update_configuration"
  if (code === "review_expired" || code === "stale_revision" || code === "source_changed") return "resolve_again"
  if (code === "branch_conflict") return "change_branch"
  return "retry"
}

function messageFor(code: WebForgeFailure["code"]): string {
  return {
    malformed_url: "Paste a full supported pull request or merge request URL.",
    unsupported_provider: "Only GitHub pull requests and GitLab merge requests are supported.",
    unsupported_host: "This forge host is not configured for reviewed workspace creation.",
    cli_unavailable: "Install the official provider CLI before resolving this change.",
    auth_required: "Authenticate the provider CLI for this host and try again.",
    change_not_found: "The change could not be found with the current account.",
    change_closed: "Choose an open pull request or merge request.",
    rate_limited: "The provider is rate limiting requests. Try again later.",
    provider_unavailable: "The provider is temporarily unavailable. Try again later.",
    provider_response_invalid: "The provider returned an invalid response. Update the provider CLI and retry.",
    repo_not_matched: "Select a configured worktree repository for this change.",
    ambiguous_repo: "More than one configured repository matches this change.",
    template_repo_missing: "No available template contains the matched repository.",
    not_worktree_mode: "The matched repository must use worktree mode.",
    review_expired: "This review token is no longer available. Resolve the change again.",
    stale_revision: "Workspace configuration changed. Resolve the change again.",
    source_changed: "The provider source changed after review. Resolve the change again.",
    fork_unreachable: "The source repository could not be fetched with the current provider access.",
    branch_conflict: "Choose a branch that does not conflict with a different commit.",
    cancelled: "Source resolution was cancelled.",
    request_timeout: "Source resolution timed out. Try again.",
  }[code]
}

function safeFailure(code: WebForgeFailure["code"], provider?: "github" | "gitlab"): WebForgeFailure {
  return WebForgeFailureSchema.parse({
    code,
    recovery: recoveryFor(code),
    message: messageFor(code),
    ...(provider ? { details: { kind: "provider", provider } } : {}),
  })
}

function providerFailure(result: Extract<ForgeProviderResolution, { ok: false }>): WebForgeFailure {
  const code = result.error as ForgeResolverFailureCode
  return safeFailure(code, result.provider)
}

function matchFailure(result: Extract<ForgeSourceMatchResult, { ok: false }>): WebForgeFailure {
  return safeFailure(result.error)
}

function terminology(provider: TrustedForgeChange["provider"]) {
  return provider === "github"
    ? { provider, change: "Pull request" as const, source_branch: "Head branch" as const, target_branch: "Base branch" as const }
    : { provider, change: "Merge request" as const, source_branch: "Source branch" as const, target_branch: "Target branch" as const }
}

function sourceConfidence(confidence: Extract<ForgeSourceMatchResult, { ok: true }>["match"]["confidence"]) {
  return confidence === "remote-inference" ? "unique-remote" as const : "explicit-config" as const
}

export class ForgeSourceReviewAuthority {
  private readonly records = new Map<string, TrustedForgeReview>()
  private readonly now: () => number
  private readonly randomBytes: (size: number) => Uint8Array
  private readonly ttlMs: number

  constructor(private readonly options: ForgeSourceReviewAuthorityOptions) {
    this.now = options.now ?? Date.now
    this.randomBytes = options.randomBytes ?? ((size) => nodeRandomBytes(size))
    this.ttlMs = options.ttlMs ?? DEFAULT_FORGE_REVIEW_TTL_MS
  }

  async resolve(input: { principalId: string; url: string; signal?: AbortSignal }): Promise<WebForgeResolveResponse> {
    this.sweep()
    const catalog = await this.options.catalog()
    const configuredHosts = catalog.registry.reduce<{ github: string[]; gitlab: string[] }>((hosts, repository) => {
      const provider = repository.forge_metadata?.forge
      const baseUrl = repository.forge_metadata?.base_url
      if (baseUrl && (provider === "github" || provider === "gitlab")) hosts[provider].push(baseUrl)
      return hosts
    }, { github: [], gitlab: [] })
    const resolved = await (this.options.resolve ?? resolveForgeChangeSource)({
      url: input.url,
      configured_hosts: configuredHosts,
      signal: input.signal,
    })
    if (!resolved.ok) return WebForgeResolveResponseSchema.parse({ resolved: false, failure: providerFailure(resolved) })

    const match = matchForgeSourceRepository(resolved.change, {
      registry: catalog.registry,
      templates: catalog.templates,
      config: catalog.config,
      remote_urls: catalog.remote_urls,
      existing_workspace_names: catalog.existing_workspace_names,
    })
    if (!match.ok) return WebForgeResolveResponseSchema.parse({ resolved: false, failure: matchFailure(match) })
    if (this.records.size >= MAX_REVIEW_TOKENS) {
      return WebForgeResolveResponseSchema.parse({ resolved: false, failure: safeFailure("rate_limited", resolved.change.provider) })
    }

    const repositoryId = (name: string) => catalog.repository_ids?.[name] ?? stableRepositoryId(name)
    const matchedId = repositoryId(match.match.registry_name)
    const templateNames = [...new Set(match.candidates.map(({ template_name }) => template_name))]
    const templates = templateNames.flatMap((name) => {
      const template = catalog.templates.find((candidate) => candidate.name === name)
      if (!template) return []
      const repositories = template.repos.flatMap((repository) => {
        const registry = catalog.registry.find(({ name: registryName }) => registryName === repository.repo)
        if (!registry || registry.is_dir || (repository.mode ?? "worktree") !== "worktree") return []
        return [{
          repository_id: repositoryId(registry.name),
          name: registry.name,
          mode: "worktree" as const,
          matched_source: registry.name === match.match.registry_name,
        }]
      })
      return repositories.some(({ matched_source }) => matched_source) ? [{ name, repositories }] : []
    })
    const selectedTemplate = templates.find(({ name }) => name === match.match.template_name) ?? templates[0]
    if (!selectedTemplate) return WebForgeResolveResponseSchema.parse({ resolved: false, failure: safeFailure("template_repo_missing") })

    const draft: WebReviewedWorkspaceDraft = WebReviewedWorkspaceDraftSchema.parse({
      workspace_name: match.suggested_name,
      template_name: selectedTemplate.name,
      matched_source_repository_id: matchedId,
      repositories: selectedTemplate.repositories.map((candidate) => {
        const templateRepository = catalog.templates.find(({ name }) => name === selectedTemplate.name)?.repos
          .find(({ repo }) => repositoryId(repo) === candidate.repository_id)
        const registry = catalog.registry.find(({ name }) => repositoryId(name) === candidate.repository_id)
        return {
          repository_id: candidate.repository_id,
          included: true,
          branch: {
            base_branch: candidate.matched_source
              ? resolved.change.target.branch
              : templateRepository?.base_branch ?? registry?.default_branch ?? "main",
            workspace_branch: candidate.matched_source ? resolved.change.source.branch : match.suggested_name,
          },
        }
      }),
    })
    const expiresAt = this.now() + this.ttlMs
    const token = this.issueToken()
    this.records.set(token, {
      principalId: input.principalId,
      canonicalUrl: resolved.change.canonical_url,
      revision: catalog.revision,
      trustedSource: structuredClone(resolved.change),
      match,
      catalog,
      draft,
      expiresAt,
    })
    return WebForgeResolveResponseSchema.parse({
      resolved: true,
      token,
      expires_at: new Date(expiresAt).toISOString(),
      revision: catalog.revision,
      source: {
        provider: resolved.change.provider,
        change_kind: resolved.change.change_kind,
        change_number: resolved.change.change_number,
        web_url: resolved.change.canonical_url,
        host: resolved.change.host,
        target_repository: resolved.change.target.repository.path,
        source_repository: resolved.change.source.repository.path,
        source_branch: resolved.change.source.branch,
        target_branch: resolved.change.target.branch,
        head_sha: resolved.change.source.sha,
        cross_repository: resolved.change.cross_repository,
        confidence: sourceConfidence(match.match.confidence),
      },
      terminology: terminology(resolved.change.provider),
      candidates: {
        templates,
        source_repositories: [{
          repository_id: matchedId,
          name: match.match.registry_name,
          mode: "worktree",
          matched_source: true,
        }],
      },
      draft,
    })
  }

  inspect(input: { principalId: string; token: string; canonicalUrl?: string }): TrustedForgeReview | null {
    this.sweep()
    const record = this.records.get(input.token)
    if (!record || record.principalId !== input.principalId) return null
    if (input.canonicalUrl !== undefined && input.canonicalUrl !== record.canonicalUrl) return null
    return record
  }

  async reserve(input: {
    principalId: string
    token: string
    canonicalUrl: string
    expectedRevision: string
    draft: WebReviewedWorkspaceDraft
    idempotencyKey: string
  }): Promise<ForgeReviewReservationResult> {
    const record = this.inspect(input)
    if (!record) return { ok: false, failure: safeFailure("review_expired") }
    const current = await this.options.catalog()
    if (record.revision !== input.expectedRevision || current.revision !== record.revision) {
      return { ok: false, failure: safeFailure("stale_revision") }
    }
    const draft = WebReviewedWorkspaceDraftSchema.safeParse(input.draft)
    if (!draft.success || !this.draftBelongsToRecord(record, input.draft)) {
      return { ok: false, failure: safeFailure("repo_not_matched") }
    }
    const bodyHash = requestHash({ expectedRevision: input.expectedRevision, draft: input.draft })
    if (record.binding && (record.binding.idempotencyKey !== input.idempotencyKey || record.binding.bodyHash !== bodyHash)) {
      return { ok: false, failure: safeFailure("review_expired") }
    }
    record.binding ??= { idempotencyKey: input.idempotencyKey, bodyHash }
    return { ok: true, reservation: { token: input.token, record, draft: draft.data } }
  }

  private draftBelongsToRecord(record: TrustedForgeReview, draft: WebReviewedWorkspaceDraft): boolean {
    const template = record.catalog.templates.find(({ name }) => name === draft.template_name)
    if (!template || !record.match.candidates.some(({ template_name }) => template_name === template.name)) return false
    const expectedIds = new Set(template.repos
      .filter(({ mode }) => (mode ?? "worktree") === "worktree")
      .map(({ repo }) => record.catalog.repository_ids?.[repo] ?? stableRepositoryId(repo)))
    const actualIds = new Set(draft.repositories.map(({ repository_id }) => repository_id))
    return expectedIds.size === actualIds.size
      && [...expectedIds].every((id) => actualIds.has(id))
      && draft.matched_source_repository_id === (record.catalog.repository_ids?.[record.match.match.registry_name]
        ?? stableRepositoryId(record.match.match.registry_name))
  }

  private issueToken(): string {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const bytes = this.randomBytes(32)
      if (bytes.byteLength < 32) throw new Error("Forge review tokens require at least 256 bits")
      const token = `review_${Buffer.from(bytes).toString("base64url")}`
      if (!this.records.has(token)) return token
    }
    throw new Error("Could not issue a unique forge review token")
  }

  private sweep(): void {
    const now = this.now()
    for (const [token, record] of this.records) if (record.expiresAt <= now) this.records.delete(token)
  }
}
