import { createHash, randomBytes as nodeRandomBytes } from "node:crypto"

import type { GlobalConfig, RepoRegistryEntry, Template } from "@git-stacks/core/config"
import { createWorkspace, type CreateWorkspaceInputs } from "@git-stacks/core/workspace-lifecycle"
import {
  planWorkspaceCreation,
  type WorkspaceCreationRequest,
} from "@git-stacks/core/workspace-creation"
import { getTasksDir } from "@git-stacks/core/paths"
import {
  prepareReviewedWorkspaceSource,
  type PreparedReviewedWorkspaceSource,
  type WorkspaceSourceFailure,
} from "@git-stacks/core/workspace-source"
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
import type { OperationExecution } from "./operations.js"

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

function currentBinding(record: TrustedForgeReview): ReviewBinding | undefined {
  return record.binding
}

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
  prepareSource?: (input: Parameters<typeof prepareReviewedWorkspaceSource>[0]) => Promise<
    PreparedReviewedWorkspaceSource | (WorkspaceSourceFailure & { cleanup?: () => Promise<void> })
  >
  planWorkspace?: typeof planWorkspaceCreation
  createWorkspace?: typeof createWorkspace
}

export type ReviewedCreateAdmission = {
  execution: OperationExecution
  cleanup: () => Promise<void>
}

export type ReviewedCreateAdmissionResult =
  | ({ ok: true } & ReviewedCreateAdmission)
  | { ok: false; failure: WebForgeFailure }

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

function correctableBeforeCommit(failure: WebForgeFailure): boolean {
  return failure.code === "branch_conflict" || failure.code === "repo_not_matched"
}

function reviewedOperationFailure(failure: WebForgeFailure): Error {
  return Object.assign(new Error(failure.message), {
    code: "operation_failed",
    details: {
      kind: "forge_failure",
      reason: failure.code,
      recovery: failure.recovery,
      ...(failure.details ? { context: failure.details } : {}),
    },
    reviewedSafe: true,
  })
}

function safeReviewedExecutionError(caught: unknown): Error {
  if (caught && typeof caught === "object" && (caught as { reviewedSafe?: unknown }).reviewedSafe === true) {
    return caught as Error
  }
  return Object.assign(new Error("Reviewed workspace creation failed"), {
    code: "operation_failed",
    reviewedSafe: true,
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
  private readonly admissions = new Map<string, Promise<ReviewedCreateAdmissionResult>>()
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
    const draft = WebReviewedWorkspaceDraftSchema.safeParse(input.draft)
    if (!draft.success || !this.draftBelongsToRecord(record, input.draft)) {
      return { ok: false, failure: safeFailure("repo_not_matched") }
    }
    const bodyHash = requestHash({ expectedRevision: input.expectedRevision, draft: input.draft })
    const competingBinding = currentBinding(record)
    if (competingBinding && (competingBinding.idempotencyKey !== input.idempotencyKey || competingBinding.bodyHash !== bodyHash)) {
      return { ok: false, failure: safeFailure("review_expired") }
    }
    if (record.binding) return { ok: true, reservation: { token: input.token, record, draft: draft.data } }
    const current = await this.options.catalog()
    if (this.inspect(input) !== record) return { ok: false, failure: safeFailure("review_expired") }
    if (record.revision !== input.expectedRevision || current.revision !== record.revision) {
      return { ok: false, failure: safeFailure("stale_revision") }
    }
    const bindingAfterCatalog = currentBinding(record)
    if (bindingAfterCatalog && (bindingAfterCatalog.idempotencyKey !== input.idempotencyKey || bindingAfterCatalog.bodyHash !== bodyHash)) {
      return { ok: false, failure: safeFailure("review_expired") }
    }
    record.binding ??= { idempotencyKey: input.idempotencyKey, bodyHash }
    return { ok: true, reservation: { token: input.token, record, draft: draft.data } }
  }

  async admit(input: {
    principalId: string
    token: string
    expectedRevision: string
    draft: WebReviewedWorkspaceDraft
    idempotencyKey: string
  }): Promise<ReviewedCreateAdmissionResult> {
    const record = this.inspect({ principalId: input.principalId, token: input.token })
    if (!record) return { ok: false, failure: safeFailure("review_expired") }
    const reserved = await this.reserve({
      ...input,
      canonicalUrl: record.canonicalUrl,
    })
    if (!reserved.ok) return reserved
    const binding = reserved.reservation.record.binding
    if (!binding) return { ok: false, failure: safeFailure("review_expired") }
    const existing = this.admissions.get(input.token)
    if (existing) return existing
    const admission = this.admitReserved(reserved.reservation, input.idempotencyKey)
    this.admissions.set(input.token, admission)
    try {
      const result = await admission
      if (!result.ok) {
        this.admissions.delete(input.token)
        if (correctableBeforeCommit(result.failure)) this.releaseBinding(reserved.reservation.record, binding)
      }
      return result
    } catch (error) {
      this.admissions.delete(input.token)
      this.releaseBinding(reserved.reservation.record, binding)
      throw error
    }
  }

  private async admitReserved(reservation: ForgeReviewReservation, idempotencyKey: string): Promise<ReviewedCreateAdmissionResult> {
    const { record, draft } = reservation
    const binding = record.binding
    if (!binding) return { ok: false, failure: safeFailure("review_expired") }
    const current = await this.options.catalog()
    if (current.revision !== record.revision) return { ok: false, failure: safeFailure("stale_revision") }

    const currentTemplate = current.templates.find(({ name }) => name === draft.template_name)
    if (!currentTemplate) return { ok: false, failure: safeFailure("template_repo_missing") }
    const currentMatch = matchForgeSourceRepository(record.trustedSource, {
      registry: current.registry,
      templates: current.templates,
      config: current.config,
      remote_urls: current.remote_urls,
      template_name: draft.template_name,
      repository_name: record.match.match.registry_name,
      existing_workspace_names: current.existing_workspace_names,
    })
    if (!currentMatch.ok) return { ok: false, failure: matchFailure(currentMatch) }
    if (!this.draftBelongsToCatalog(current, currentMatch, draft)) {
      return { ok: false, failure: safeFailure("repo_not_matched") }
    }
    const matchedRepositoryId = current.repository_ids?.[currentMatch.match.registry_name]
      ?? stableRepositoryId(currentMatch.match.registry_name)
    const matchedDraftRepository = draft.repositories.find(({ repository_id }) => repository_id === matchedRepositoryId && draft.repositories.length > 0)
    if (!matchedDraftRepository?.included) return { ok: false, failure: safeFailure("repo_not_matched") }
    const included = draft.repositories.filter(({ included }) => included)
    if (included.length === 0 || included.some(({ branch }) => branch.workspace_branch !== matchedDraftRepository.branch.workspace_branch)) {
      return { ok: false, failure: safeFailure("branch_conflict") }
    }

    const request: WorkspaceCreationRequest = {
      name: draft.workspace_name,
      branch: matchedDraftRepository.branch.workspace_branch,
      source: { kind: "template", template: draft.template_name },
    }
    const planned = this.options.planWorkspace
      ? await this.options.planWorkspace(request)
      : await planWorkspaceCreation(request, {
          readRegistry: () => [...current.registry],
          composeTemplates: ([name]) => {
            const template = current.templates.find((candidate) => candidate.name === name)
            if (!template) throw new Error("Reviewed template is no longer available")
            return structuredClone(template)
          },
          workspaceExists: (name) => current.existing_workspace_names?.includes(name) ?? false,
          getTasksDir: () => current.config?.workspace_root ? getTasksDir(current.config.workspace_root) : ".",
        })
    if (!planned.ok) return { ok: false, failure: safeFailure(planned.code === "invalid_branch" || planned.code === "already_exists" ? "branch_conflict" : "repo_not_matched") }
    const draftById = new Map(draft.repositories.map((repository) => [repository.repository_id, repository]))
    const repositoryId = (name: string) => current.repository_ids?.[name] ?? stableRepositoryId(name)
    const plannedInputs: CreateWorkspaceInputs = {
      ...planned.plan.inputs,
      repos: planned.plan.inputs.repos.flatMap((repository) => {
        const reviewed = draftById.get(repositoryId(repository.repo))
        if (!reviewed?.included) return []
        return [{ ...repository, base_branch: reviewed.branch.base_branch }]
      }),
    }
    const matchedRepo = plannedInputs.repos.find(({ repo }) => repo === currentMatch.match.registry_name)
    if (!matchedRepo || matchedRepo.mode !== "worktree") return { ok: false, failure: safeFailure("not_worktree_mode") }

    const configuredHosts = current.registry.reduce<{ github: string[]; gitlab: string[] }>((hosts, repository) => {
      const provider = repository.forge_metadata?.forge
      const baseUrl = repository.forge_metadata?.base_url
      if (baseUrl && (provider === "github" || provider === "gitlab")) hosts[provider].push(baseUrl)
      return hosts
    }, { github: [], gitlab: [] })
    const rechecked = await (this.options.resolve ?? resolveForgeChangeSource)({
      url: record.canonicalUrl,
      configured_hosts: configuredHosts,
    })
    if (!rechecked.ok) return { ok: false, failure: providerFailure(rechecked) }
    if (!sameTrustedIdentity(record.trustedSource, rechecked.change)) {
      this.records.delete(reservation.token)
      return { ok: false, failure: safeFailure("source_changed", record.trustedSource.provider) }
    }

    const operationIdentity = `review_${requestHash({ token: reservation.token, idempotencyKey }).slice(0, 32)}`
    let started = false
    let cleanupPending: (() => Promise<void>) | undefined
    let releaseAfterCleanup = false
    const cleanupPrepared = async () => {
      if (cleanupPending) {
        await cleanupPending()
        cleanupPending = undefined
      }
      if (releaseAfterCleanup && record.binding === binding) {
        this.releaseBinding(record, binding)
        this.admissions.delete(reservation.token)
        releaseAfterCleanup = false
      }
    }
    const abortAdmission = async () => {
      if (!started) {
        this.releaseBinding(record, binding)
        this.admissions.delete(reservation.token)
        return
      }
      await cleanupPrepared()
    }
    const result: Record<string, unknown> = { workspace_name: request.name, snapshot_changed: true }
    const execution: OperationExecution = {
      cancellation: "none",
      steps: [{
        name: "workspace.create.reviewed",
        stage: "executing",
        message: "Creating reviewed workspace",
        run: async (report) => {
          started = true
          let executionError: Error | undefined
          try {
            const prepared = await (this.options.prepareSource ?? prepareReviewedWorkspaceSource)({
              trusted_source: rechecked.change,
              matched_repo: matchedRepo,
              workspace_name: draft.workspace_name,
              operation_id: operationIdentity,
              branch: matchedDraftRepository.branch.workspace_branch,
            })
            if (!prepared.ok) {
              const failure = prepared as WorkspaceSourceFailure
              cleanupPending = failure.cleanup
              const code = failure.error === "source_changed" || failure.error === "fork_unreachable"
                || failure.error === "branch_conflict" || failure.error === "not_worktree_mode"
                ? failure.error
                : "fork_unreachable"
              if (code === "source_changed") {
                this.records.delete(reservation.token)
                this.admissions.delete(reservation.token)
              }
              if (code === "branch_conflict") releaseAfterCleanup = true
              throw reviewedOperationFailure(safeFailure(code, record.trustedSource.provider))
            }
            cleanupPending = prepared.cleanup
            const createInputs: CreateWorkspaceInputs = {
              ...plannedInputs,
              branch: prepared.branch,
              source: prepared.sourceMetadata,
              sourceStartRefs: { [prepared.matchedRepoName]: prepared.fetchedRef },
            }
            let progressQueue = Promise.resolve()
            const created = await (this.options.createWorkspace ?? createWorkspace)(createInputs, () => {
              progressQueue = progressQueue
                .then(() => report({ stage: "executing", message: "Creating reviewed workspace" }))
                .then(() => undefined)
            })
            await progressQueue
            if (!created.ok) throw new Error("create rejected")
          } catch (caught) {
            executionError = safeReviewedExecutionError(caught)
          }
          try {
            await cleanupPrepared()
          } catch {
            executionError ??= Object.assign(new Error("Reviewed source cleanup could not be completed"), {
              code: "operation_failed",
              reviewedSafe: true,
            })
          }
          if (executionError) throw executionError
        },
      }],
      result,
      finalize: cleanupPrepared,
    }
    return { ok: true, execution, cleanup: abortAdmission }
  }

  private releaseBinding(record: TrustedForgeReview, binding: ReviewBinding): void {
    if (record.binding === binding) delete record.binding
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

  private draftBelongsToCatalog(
    catalog: ForgeSourceReviewCatalog,
    match: Extract<ForgeSourceMatchResult, { ok: true }>,
    draft: WebReviewedWorkspaceDraft,
  ): boolean {
    const template = catalog.templates.find(({ name }) => name === draft.template_name)
    if (!template || !match.candidates.some(({ template_name }) => template_name === template.name)) return false
    const expected = new Set(template.repos
      .filter(({ mode }) => (mode ?? "worktree") === "worktree")
      .map(({ repo }) => catalog.repository_ids?.[repo] ?? stableRepositoryId(repo)))
    const actual = new Set(draft.repositories.map(({ repository_id }) => repository_id))
    return expected.size === actual.size && [...expected].every((id) => actual.has(id))
  }

  private issueToken(): string {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const bytes = this.randomBytes(32)
      if (bytes.byteLength !== 32) throw new Error("Forge review tokens require exactly 256 bits")
      const token = `review_${Buffer.from(bytes).toString("base64url")}`
      if (!this.records.has(token)) return token
    }
    throw new Error("Could not issue a unique forge review token")
  }

  private sweep(): void {
    const now = this.now()
    for (const [token, record] of this.records) {
      if (record.expiresAt > now) continue
      this.records.delete(token)
      this.admissions.delete(token)
    }
  }
}

function sameTrustedIdentity(left: TrustedForgeChange, right: TrustedForgeChange): boolean {
  return left.provider === right.provider
    && left.change_kind === right.change_kind
    && left.change_number === right.change_number
    && left.canonical_url === right.canonical_url
    && left.host === right.host
    && left.target.repository.host === right.target.repository.host
    && left.target.repository.path === right.target.repository.path
    && left.target.branch === right.target.branch
    && left.source.repository.host === right.source.repository.host
    && left.source.repository.path === right.source.repository.path
    && left.source.branch === right.source.branch
    && left.source.ref === right.source.ref
    && left.source.sha === right.source.sha
    && left.cross_repository === right.cross_repository
}
