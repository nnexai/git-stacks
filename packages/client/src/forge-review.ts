import {
  WebForgeErrorDetailsSchema,
  WebForgeFailureSchema,
  WebReviewedWorkspaceDraftSchema,
  type WebForgeCandidates,
  type WebForgeFailure,
  type WebForgeResolveRequest,
  type WebForgeResolveResponse,
  type WebForgeTerminology,
  type WebOperationSummary,
  type WebReviewedWorkspaceCreateRequest,
  type WebReviewedWorkspaceDraft,
  type ForgeSourceIdentity,
} from "@git-stacks/protocol"

type ResolvedForgeResponse = Extract<WebForgeResolveResponse, { resolved: true }>

export type ForgeReviewValidation = {
  valid: boolean
  fields: Record<string, string>
}

export type ForgeReviewAnchor = Readonly<{
  token: string
  expectedRevision: string
  expiresAt: string
  source: Readonly<ForgeSourceIdentity>
  terminology: Readonly<WebForgeTerminology>
  candidates: Readonly<WebForgeCandidates>
}>

type ReviewStateFields = {
  url: string
  anchor: ForgeReviewAnchor
  draft: WebReviewedWorkspaceDraft
  validation: ForgeReviewValidation
}

export type ForgeReviewState =
  | { phase: "resolve"; url: string; resolving: boolean; failure?: WebForgeFailure }
  | ({ phase: "review"; failure?: WebForgeFailure } & ReviewStateFields)
  | ({ phase: "creating" } & ReviewStateFields)
  | ({ phase: "accepted"; operationId: string; reconciled: boolean } & ReviewStateFields)
  | ({ phase: "terminal-error"; operationId: string; outcome: "failed" | "cancelled"; message: string } & ReviewStateFields)

export type ForgeReviewEdit =
  | { kind: "workspace_name"; value: string }
  | { kind: "template"; name: string }
  | { kind: "matched_source_repository"; repositoryId: string }
  | { kind: "repository_included"; repositoryId: string; included: boolean }
  | { kind: "repository_branch"; repositoryId: string; workspaceBranch: string; baseBranch?: string }

export type ForgeReviewCoordinatorCallbacks = {
  resolve(request: WebForgeResolveRequest): Promise<WebForgeResolveResponse>
  create(request: WebReviewedWorkspaceCreateRequest): Promise<{ operationId: string }>
}

export type ForgeReviewCoordinator = {
  state(): ForgeReviewState
  setUrl(url: string): void
  enter(): Promise<unknown>
  resolve(): Promise<unknown>
  edit(action: ForgeReviewEdit): void
  create(): Promise<unknown>
  observeOperation(operation: WebOperationSummary): void
  backToReview(): { status: "review" } | { status: "ignored" }
  reconcile(): void
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function anchorFrom(response: ResolvedForgeResponse): ForgeReviewAnchor {
  return deepFreeze({
    token: response.token,
    expectedRevision: response.revision,
    expiresAt: response.expires_at,
    source: structuredClone(response.source),
    terminology: structuredClone(response.terminology),
    candidates: structuredClone(response.candidates),
  }) as ForgeReviewAnchor
}

function cloneDraft(draft: WebReviewedWorkspaceDraft): WebReviewedWorkspaceDraft {
  return structuredClone(draft)
}

export function validateForgeReviewDraft(
  draft: WebReviewedWorkspaceDraft,
  anchor?: ForgeReviewAnchor,
): ForgeReviewValidation {
  const parsed = WebReviewedWorkspaceDraftSchema.safeParse(draft)
  const fields: Record<string, string> = {}
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "draft"
      fields[path] ??= issue.message
    }
  }
  if (anchor) {
    const template = anchor.candidates.templates.find(({ name }) => name === draft.template_name)
    if (!template) {
      fields.template_name = "Select a resolved template."
    } else {
      const expected = new Set(template.repositories.map(({ repository_id }) => repository_id))
      const reviewed = new Set(draft.repositories.map(({ repository_id }) => repository_id))
      if (expected.size !== reviewed.size || [...expected].some((repositoryId) => !reviewed.has(repositoryId))) {
        fields.repositories = "Reviewed repositories must match the selected template."
      }
      if (!expected.has(draft.matched_source_repository_id)) {
        fields.matched_source_repository_id = "Select a source repository from the chosen template."
      }
    }
    if (!anchor.candidates.source_repositories.some(({ repository_id }) => repository_id === draft.matched_source_repository_id)) {
      fields.matched_source_repository_id = "Select a resolved source repository."
    }
    const matched = draft.repositories.find(({ repository_id }) => repository_id === draft.matched_source_repository_id)
    if (matched && matched.branch.base_branch !== anchor.source.target_branch) {
      fields[`repositories.${draft.repositories.indexOf(matched)}.branch.base_branch`] = "Use the resolved target branch."
    }
  }
  return { valid: Object.keys(fields).length === 0, fields }
}

/** Convert only schema-validated transport details into reducer recovery. */
export function classifyForgeReviewFailure(error: unknown): WebForgeFailure | undefined {
  const direct = WebForgeFailureSchema.safeParse(error)
  if (direct.success) return direct.data
  if (!error || typeof error !== "object") return undefined
  const candidate = error as { message?: unknown; details?: unknown }
  const details = WebForgeErrorDetailsSchema.safeParse(candidate.details)
  if (!details.success) return undefined
  const projected = WebForgeFailureSchema.safeParse({
    code: details.data.reason,
    recovery: details.data.recovery,
    message: typeof candidate.message === "string" ? candidate.message : "Forge request failed.",
    ...(details.data.context ? { details: details.data.context } : {}),
  })
  return projected.success
    ? projected.data
    : {
        code: details.data.reason,
        recovery: details.data.recovery,
        message: "Forge request failed.",
        ...(details.data.context ? { details: details.data.context } : {}),
      }
}

function editDraft(
  draft: WebReviewedWorkspaceDraft,
  anchor: ForgeReviewAnchor,
  action: ForgeReviewEdit,
): WebReviewedWorkspaceDraft {
  if (action.kind === "workspace_name") return { ...draft, workspace_name: action.value }
  if (action.kind === "matched_source_repository") {
    return { ...draft, matched_source_repository_id: action.repositoryId }
  }
  if (action.kind === "repository_included") {
    return {
      ...draft,
      repositories: draft.repositories.map((repository) => repository.repository_id === action.repositoryId
        ? { ...repository, included: action.included }
        : repository),
    }
  }
  if (action.kind === "repository_branch") {
    return {
      ...draft,
      repositories: draft.repositories.map((repository) => repository.repository_id === action.repositoryId
        ? {
            ...repository,
            branch: {
              base_branch: action.baseBranch ?? repository.branch.base_branch,
              workspace_branch: action.workspaceBranch,
            },
          }
        : repository),
    }
  }

  const template = anchor.candidates.templates.find(({ name }) => name === action.name)
  if (!template) return { ...draft, template_name: action.name }
  const existing = new Map(draft.repositories.map((repository) => [repository.repository_id, repository]))
  return {
    ...draft,
    template_name: action.name,
    repositories: template.repositories.map((repository) => {
      const prior = existing.get(repository.repository_id)
      return prior
        ? { ...prior, branch: { ...prior.branch } }
        : {
            repository_id: repository.repository_id,
            included: true,
            branch: {
              base_branch: repository.matched_source ? anchor.source.target_branch : "",
              workspace_branch: repository.matched_source ? anchor.source.source_branch : "",
            },
          }
    }),
  }
}

const requiresResolveAgain = (failure: WebForgeFailure): boolean =>
  failure.recovery === "resolve_again"
  || failure.code === "review_expired"
  || failure.code === "stale_revision"
  || failure.code === "source_changed"

export function createForgeReviewCoordinator(
  callbacks: ForgeReviewCoordinatorCallbacks,
): ForgeReviewCoordinator {
  let current: ForgeReviewState = { phase: "resolve", url: "", resolving: false }
  let generation = 0

  const setUrl = (url: string) => {
    generation += 1
    current = { phase: "resolve", url, resolving: false }
  }

  const resolve = async () => {
    if (current.phase !== "resolve") return { status: "ignored", reason: "not-resolving" }
    if (current.resolving) return { status: "pending" }
    const url = current.url
    const operationGeneration = generation
    current = { phase: "resolve", url, resolving: true }
    try {
      const response = await callbacks.resolve({ url })
      if (operationGeneration !== generation) return { status: "ignored", reason: "superseded" }
      if (!response.resolved) {
        current = { phase: "resolve", url, resolving: false, failure: response.failure }
        return { status: "failed", failure: response.failure }
      }
      const anchor = anchorFrom(response)
      const draft = cloneDraft(response.draft)
      current = { phase: "review", url, anchor, draft, validation: validateForgeReviewDraft(draft, anchor) }
      return { status: "review" }
    } catch (error) {
      if (operationGeneration !== generation) return { status: "ignored", reason: "superseded" }
      const failure = classifyForgeReviewFailure(error)
      current = { phase: "resolve", url, resolving: false, ...(failure ? { failure } : {}) }
      if (failure) return { status: "failed", failure }
      throw error
    }
  }

  const create = async () => {
    if (current.phase === "creating") return { status: "pending" }
    if (current.phase !== "review") return { status: "ignored", reason: "review-required" }
    const validation = validateForgeReviewDraft(current.draft, current.anchor)
    if (!validation.valid) {
      current = { ...current, validation }
      return { status: "invalid", validation }
    }
    const review = current
    const operationGeneration = generation
    current = { phase: "creating", url: review.url, anchor: review.anchor, draft: review.draft, validation }
    try {
      const accepted = await callbacks.create({
        token: review.anchor.token,
        expected_revision: review.anchor.expectedRevision,
        draft: cloneDraft(review.draft),
      })
      if (operationGeneration !== generation) return { status: "ignored", reason: "superseded" }
      current = { ...review, phase: "accepted", operationId: accepted.operationId, reconciled: false }
      return { status: "accepted", operationId: accepted.operationId }
    } catch (error) {
      if (operationGeneration !== generation) return { status: "ignored", reason: "superseded" }
      const failure = classifyForgeReviewFailure(error)
      if (!failure) {
        current = review
        throw error
      }
      current = requiresResolveAgain(failure)
        ? { phase: "resolve", url: review.url, resolving: false, failure }
        : { ...review, phase: "review", failure }
      throw failure
    }
  }

  return {
    state: () => current,
    setUrl,
    enter: () => current.phase === "resolve"
      ? resolve()
      : Promise.resolve({ status: "ignored", reason: "explicit-create-required" }),
    resolve,
    edit(action) {
      if (current.phase !== "review") return
      const draft = editDraft(current.draft, current.anchor, action)
      current = { ...current, draft, validation: validateForgeReviewDraft(draft, current.anchor), failure: undefined }
    },
    create,
    observeOperation(operation) {
      if (current.phase !== "accepted" || operation.operation_id !== current.operationId) return
      if (operation.state !== "failed" && operation.state !== "cancelled") return
      const accepted = current
      const failure = operation.error.forge
        ? classifyForgeReviewFailure({ message: operation.error.message, details: operation.error.forge })
        : undefined
      if (!failure) {
        current = {
          phase: "terminal-error",
          url: accepted.url,
          anchor: accepted.anchor,
          draft: accepted.draft,
          validation: validateForgeReviewDraft(accepted.draft, accepted.anchor),
          operationId: operation.operation_id,
          outcome: operation.state,
          message: operation.error.message,
        }
        return
      }
      current = requiresResolveAgain(failure)
        ? { phase: "resolve", url: accepted.url, resolving: false, failure }
        : {
            phase: "review",
            url: accepted.url,
            anchor: accepted.anchor,
            draft: accepted.draft,
            validation: validateForgeReviewDraft(accepted.draft, accepted.anchor),
            failure,
          }
    },
    backToReview() {
      if (current.phase !== "terminal-error") return { status: "ignored" }
      current = {
        phase: "review",
        url: current.url,
        anchor: current.anchor,
        draft: current.draft,
        validation: validateForgeReviewDraft(current.draft, current.anchor),
      }
      return { status: "review" }
    },
    reconcile() {
      if (current.phase === "accepted") current = { ...current, reconciled: true }
    },
  }
}
