export const PHASE127_IDS = Object.freeze({
  workspaces: Object.freeze({
    merged: "10000000-0000-4000-8000-000000000001",
    closed: "10000000-0000-4000-8000-000000000002",
    inactive: "10000000-0000-4000-8000-000000000003",
    incomplete: "10000000-0000-4000-8000-000000000004",
    cautionOnly: "10000000-0000-4000-8000-000000000005",
    tieAlpha: "10000000-0000-4000-8000-000000000006",
    tieAlphaLater: "10000000-0000-4000-8000-000000000007",
  }),
  repositories: Object.freeze({
    app: "20000000-0000-4000-8000-000000000001",
    api: "20000000-0000-4000-8000-000000000002",
    docs: "20000000-0000-4000-8000-000000000003",
  }),
})

export const PHASE127_TIMES = Object.freeze({
  checkedAt: "2026-07-17T12:00:00.000Z",
  cutoff: "2026-06-17T12:00:00.000Z",
  beforeCutoff: "2026-06-17T11:59:59.999Z",
  afterCutoff: "2026-06-17T12:00:00.001Z",
  mergedAt: "2026-07-10T09:30:00.000Z",
  closedAt: "2026-07-09T08:15:00.000Z",
  observedAt: "2026-07-17T12:00:00.000Z",
})

export const PHASE127_DISCLOSURE_CANARIES = Object.freeze({
  path: "/home/alice/private/workspace",
  windowsPath: "C:\\Users\\alice\\private\\workspace",
  urlWithCredential: "https://token@example.invalid/acme/app",
  credential: "phase127-secret-token-value",
  bearer: "Bearer phase127-secret-bearer",
  argv: Object.freeze(["git", "-C", "/home/alice/private/workspace", "status"]),
  command: "rm -rf /home/alice/private/workspace",
  stdout: "provider stdout with private repository metadata",
  stderr: "provider stderr with /home/alice/private/workspace",
  rawError: "spawn gh ENOENT at /home/alice/private/workspace",
  environment: Object.freeze({
    PATH: "/home/alice/.local/bin:/usr/bin",
    SSH_AUTH_SOCK: "/run/user/1000/keyring/ssh",
    GITHUB_TOKEN: "phase127-secret-token-value",
  }),
})

export type Phase127Provider = "github" | "gitlab" | "gitea"
export type Phase127ChangeType = "pr" | "mr"
export type Phase127RepositoryMode = "worktree" | "trunk" | "dir"

export type Phase127WorkspaceSource = {
  kind: "forge"
  forge: Phase127Provider
  base_url: string
  url: string
  change_type: Phase127ChangeType
  change_number: number
  repo: string
  repo_path: string
  source_branch: string
  source_ref: string
  target_branch: string
  web_url: string
  fetched_ref: string
  title?: string
}

export type Phase127RepositoryFixture = {
  id: string
  name: string
  mode: Phase127RepositoryMode
  main_path: string
  task_path: string
  branch: string
  exists: boolean
  degraded: boolean
  dirty: boolean
  ahead: number
  behind: number
  drifted: boolean
}

export type Phase127WorkspaceFixture = {
  id: string
  name: string
  schema_version: "1"
  branch: string
  created: string
  last_opened?: string
  source?: Phase127WorkspaceSource
  notes_count: number
  repositories: Phase127RepositoryFixture[]
}

export type Phase127ConfirmedReasonCode =
  | "merged"
  | "closed"
  | "remote_branch_deleted"
  | "managed_worktree_missing"
  | "inactive"

export type Phase127UnknownEvidenceCode =
  | "invalid_provenance"
  | "unsupported_provider"
  | "unsupported_host"
  | "tool_unavailable"
  | "authentication_required"
  | "rate_limited"
  | "request_timeout"
  | "request_aborted"
  | "provider_unavailable"
  | "malformed_response"
  | "output_limit_exceeded"
  | "remote_check_failed"
  | "worktree_inaccessible"
  | "activity_unavailable"
  | "probe_superseded"

export type Phase127CautionCode =
  | "dirty_worktree"
  | "ahead_of_remote"
  | "workspace_drift"
  | "notes_present"

export type Phase127ConfirmedReason = {
  code: Phase127ConfirmedReasonCode
  occurred_at: string
  repository_id?: string
  repository_name?: string
  provider?: Exclude<Phase127Provider, "gitea">
}

export type Phase127UnknownEvidence = {
  code: Phase127UnknownEvidenceCode
  observed_at: string
  repository_id?: string
  repository_name?: string
  provider?: Exclude<Phase127Provider, "gitea">
}

export type Phase127Caution = {
  code: Phase127CautionCode
  repository_id?: string
  repository_name?: string
  count?: number
}

export type Phase127CandidateRow = {
  workspace_id: string
  workspace_name: string
  activity_at: string | null
  confirmed_reasons: Phase127ConfirmedReason[]
  unknown_evidence: Phase127UnknownEvidence[]
  cautions: Phase127Caution[]
}

export type Phase127IncompleteRow = {
  workspace_id: string
  workspace_name: string
  activity_at: string | null
  unknown_evidence: Phase127UnknownEvidence[]
  cautions: Phase127Caution[]
}

export type Phase127StaleResponse = {
  revision: string
  checked_at: string
  threshold_days: 30
  candidates: Phase127CandidateRow[]
  incomplete: Phase127IncompleteRow[]
}

export type Phase127ForgeOutcome =
  | { status: "merged"; occurred_at: string }
  | { status: "closed"; occurred_at: string }
  | { status: "open" }
  | { status: "unknown"; reason: string }

export type Phase127RemoteBranchOutcome =
  | { status: "present" }
  | { status: "missing" }
  | { status: "unknown"; reason: string }

export function makeWorkspaceSource(
  overrides: Partial<Phase127WorkspaceSource> = {},
): Phase127WorkspaceSource {
  return {
    kind: "forge",
    forge: "github",
    base_url: "https://github.com",
    url: "https://github.com/acme/app.git",
    change_type: "pr",
    change_number: 42,
    repo: "acme/app",
    repo_path: "acme/app",
    source_branch: "feature/stale-contract",
    source_ref: "refs/pull/42/head",
    target_branch: "main",
    web_url: "https://github.com/acme/app/pull/42",
    fetched_ref: "refs/git-stacks/source/42",
    title: "Phase 127 stale contract",
    ...overrides,
  }
}

export function makeRepositoryFixture(
  overrides: Partial<Phase127RepositoryFixture> = {},
): Phase127RepositoryFixture {
  const name = overrides.name ?? "app"
  return {
    id: PHASE127_IDS.repositories.app,
    name,
    mode: "worktree",
    main_path: `/fixtures/source/${name}`,
    task_path: `/fixtures/workspaces/stale/${name}`,
    branch: "feature/stale-contract",
    exists: true,
    degraded: false,
    dirty: false,
    ahead: 0,
    behind: 0,
    drifted: false,
    ...overrides,
  }
}

export function makeWorkspaceFixture(
  overrides: Partial<Omit<Phase127WorkspaceFixture, "repositories">> & {
    repositories?: Phase127RepositoryFixture[]
  } = {},
): Phase127WorkspaceFixture {
  return {
    id: PHASE127_IDS.workspaces.merged,
    name: "stale-merged",
    schema_version: "1",
    branch: "feature/stale-contract",
    created: "2026-05-01",
    last_opened: "2026-07-01T10:00:00.000Z",
    source: makeWorkspaceSource(),
    notes_count: 0,
    repositories: [makeRepositoryFixture()],
    ...overrides,
  }
}

export function makeConfirmedReason(
  overrides: Partial<Phase127ConfirmedReason> = {},
): Phase127ConfirmedReason {
  return {
    code: "merged",
    occurred_at: PHASE127_TIMES.mergedAt,
    repository_id: PHASE127_IDS.repositories.app,
    repository_name: "app",
    provider: "github",
    ...overrides,
  }
}

export function makeUnknownEvidence(
  overrides: Partial<Phase127UnknownEvidence> = {},
): Phase127UnknownEvidence {
  return {
    code: "provider_unavailable",
    observed_at: PHASE127_TIMES.observedAt,
    repository_id: PHASE127_IDS.repositories.app,
    repository_name: "app",
    provider: "github",
    ...overrides,
  }
}

export function makeCaution(
  overrides: Partial<Phase127Caution> = {},
): Phase127Caution {
  return {
    code: "dirty_worktree",
    repository_id: PHASE127_IDS.repositories.app,
    repository_name: "app",
    ...overrides,
  }
}

export function makeCandidateRow(
  overrides: Partial<Omit<Phase127CandidateRow, "confirmed_reasons" | "unknown_evidence" | "cautions">> & {
    confirmed_reasons?: Phase127ConfirmedReason[]
    unknown_evidence?: Phase127UnknownEvidence[]
    cautions?: Phase127Caution[]
  } = {},
): Phase127CandidateRow {
  return {
    workspace_id: PHASE127_IDS.workspaces.merged,
    workspace_name: "stale-merged",
    activity_at: "2026-07-01T10:00:00.000Z",
    confirmed_reasons: [makeConfirmedReason()],
    unknown_evidence: [],
    cautions: [],
    ...overrides,
  }
}

export function makeIncompleteRow(
  overrides: Partial<Omit<Phase127IncompleteRow, "unknown_evidence" | "cautions">> & {
    unknown_evidence?: Phase127UnknownEvidence[]
    cautions?: Phase127Caution[]
  } = {},
): Phase127IncompleteRow {
  return {
    workspace_id: PHASE127_IDS.workspaces.incomplete,
    workspace_name: "stale-incomplete",
    activity_at: null,
    unknown_evidence: [makeUnknownEvidence({
      code: "activity_unavailable",
      repository_id: undefined,
      repository_name: undefined,
      provider: undefined,
    })],
    cautions: [],
    ...overrides,
  }
}

export function makeStaleResponse(
  overrides: Partial<Omit<Phase127StaleResponse, "candidates" | "incomplete">> & {
    candidates?: Phase127CandidateRow[]
    incomplete?: Phase127IncompleteRow[]
  } = {},
): Phase127StaleResponse {
  return {
    revision: "7",
    checked_at: PHASE127_TIMES.checkedAt,
    threshold_days: 30,
    candidates: [makeCandidateRow()],
    incomplete: [makeIncompleteRow()],
    ...overrides,
  }
}

export function makeForgeOutcome(
  status: Phase127ForgeOutcome["status"],
  overrides: Record<string, unknown> = {},
): Phase127ForgeOutcome {
  if (status === "merged") return { status, occurred_at: PHASE127_TIMES.mergedAt, ...overrides } as Phase127ForgeOutcome
  if (status === "closed") return { status, occurred_at: PHASE127_TIMES.closedAt, ...overrides } as Phase127ForgeOutcome
  if (status === "open") return { status }
  return { status, reason: "provider_unavailable", ...overrides } as Phase127ForgeOutcome
}

export function makeRemoteBranchOutcome(
  status: Phase127RemoteBranchOutcome["status"],
  overrides: Record<string, unknown> = {},
): Phase127RemoteBranchOutcome {
  if (status === "present" || status === "missing") return { status }
  return { status, reason: "remote_check_failed", ...overrides } as Phase127RemoteBranchOutcome
}

export function createIsoClock(initial = PHASE127_TIMES.checkedAt) {
  let epoch = Date.parse(initial)
  if (!Number.isFinite(epoch)) throw new TypeError(`Invalid initial clock value: ${initial}`)
  return Object.freeze({
    now: () => epoch,
    date: () => new Date(epoch),
    iso: () => new Date(epoch).toISOString(),
    set(next: string) {
      const parsed = Date.parse(next)
      if (!Number.isFinite(parsed)) throw new TypeError(`Invalid clock value: ${next}`)
      epoch = parsed
      return new Date(epoch).toISOString()
    },
    advance(milliseconds: number) {
      if (!Number.isFinite(milliseconds)) throw new TypeError("Clock advance must be finite")
      epoch += milliseconds
      return new Date(epoch).toISOString()
    },
  })
}

export function createDeferred<T>() {
  let settled = false
  let resolvePromise!: (value: T | PromiseLike<T>) => void
  let rejectPromise!: (reason?: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    get settled() { return settled },
    resolve(value: T | PromiseLike<T>) {
      if (settled) throw new Error("Deferred probe already settled")
      settled = true
      resolvePromise(value)
    },
    reject(reason?: unknown) {
      if (settled) throw new Error("Deferred probe already settled")
      settled = true
      rejectPromise(reason)
    },
  }
}

export function createConcurrencyCounter() {
  let active = 0
  let maximum = 0
  let calls = 0
  return Object.freeze({
    get active() { return active },
    get maximum() { return maximum },
    get calls() { return calls },
    async run<T>(operation: () => Promise<T> | T): Promise<T> {
      calls += 1
      active += 1
      maximum = Math.max(maximum, active)
      try {
        return await operation()
      } finally {
        active -= 1
      }
    },
  })
}

export type Phase127CommandRequest = {
  argv: readonly string[]
  cwd?: string
  env?: Readonly<Record<string, string>>
  signal?: AbortSignal
  timeout_ms: number
  max_output_bytes: number
}

export type Phase127CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

export function createScriptedCommandRunner(
  script: Array<Phase127CommandResult | Error | ((request: Phase127CommandRequest) => Phase127CommandResult | Promise<Phase127CommandResult>)>,
) {
  const calls: Phase127CommandRequest[] = []
  return {
    calls,
    async run(request: Phase127CommandRequest): Promise<Phase127CommandResult> {
      calls.push({ ...request, argv: [...request.argv], env: request.env ? { ...request.env } : undefined })
      const step = script.shift()
      if (step === undefined) throw new Error("Unexpected command runner call")
      if (step instanceof Error) throw step
      return typeof step === "function" ? await step(request) : step
    },
  }
}

const FORBIDDEN_CAPABILITIES = [
  "archive",
  "remove",
  "stop_terminal",
  "discard_worktree",
  "write_workspace_yaml",
  "mutate_provider",
] as const

type ForbiddenCapability = typeof FORBIDDEN_CAPABILITIES[number]

export function createMutationSentinels() {
  const calls: Record<ForbiddenCapability, number> = {
    archive: 0,
    remove: 0,
    stop_terminal: 0,
    discard_worktree: 0,
    write_workspace_yaml: 0,
    mutate_provider: 0,
  }
  const fail = (capability: ForbiddenCapability) => (..._args: unknown[]) => {
    calls[capability] += 1
    throw new Error(`Stale evaluation attempted forbidden ${capability} capability`)
  }
  return Object.freeze({
    calls,
    archiveWorkspace: fail("archive"),
    removeWorkspace: fail("remove"),
    stopTerminal: fail("stop_terminal"),
    discardWorktree: fail("discard_worktree"),
    writeWorkspaceYaml: fail("write_workspace_yaml"),
    mutateProvider: fail("mutate_provider"),
    assertUntouched() {
      const touched = FORBIDDEN_CAPABILITIES.filter((capability) => calls[capability] !== 0)
      if (touched.length > 0) throw new Error(`Forbidden stale capabilities were invoked: ${touched.join(", ")}`)
    },
  })
}

export function normalizeWorkspaceName(name: string): string {
  return name.normalize("NFKC").trim().toLocaleLowerCase("en-US")
}

export const PHASE127_EDGE_FIXTURES = Object.freeze({
  strictCutoff: Object.freeze({
    checked_at: PHASE127_TIMES.checkedAt,
    exactly_at_cutoff: makeWorkspaceFixture({
      id: PHASE127_IDS.workspaces.inactive,
      name: "exact-cutoff",
      last_opened: PHASE127_TIMES.cutoff,
      source: undefined,
    }),
    one_millisecond_before: makeWorkspaceFixture({
      id: PHASE127_IDS.workspaces.inactive,
      name: "before-cutoff",
      last_opened: PHASE127_TIMES.beforeCutoff,
      source: undefined,
    }),
    one_millisecond_after: makeWorkspaceFixture({
      id: PHASE127_IDS.workspaces.inactive,
      name: "after-cutoff",
      last_opened: PHASE127_TIMES.afterCutoff,
      source: undefined,
    }),
  }),
  duplicateReason: Object.freeze([
    makeConfirmedReason({ code: "remote_branch_deleted", provider: undefined }),
    makeConfirmedReason({ code: "remote_branch_deleted", provider: undefined }),
    makeConfirmedReason({
      code: "managed_worktree_missing",
      provider: undefined,
      occurred_at: PHASE127_TIMES.observedAt,
    }),
  ]),
  unknownOnly: makeIncompleteRow(),
  cautionOnly: Object.freeze({
    workspace: makeWorkspaceFixture({
      id: PHASE127_IDS.workspaces.cautionOnly,
      name: "caution-only",
      source: undefined,
      repositories: [makeRepositoryFixture({ dirty: true, ahead: 2, drifted: true })],
      notes_count: 3,
    }),
    cautions: Object.freeze([
      makeCaution(),
      makeCaution({ code: "ahead_of_remote", count: 2 }),
      makeCaution({ code: "workspace_drift" }),
      makeCaution({ code: "notes_present", repository_id: undefined, repository_name: undefined, count: 3 }),
    ]),
  }),
  malformedActivity: makeWorkspaceFixture({
    id: PHASE127_IDS.workspaces.incomplete,
    name: "malformed-activity",
    last_opened: "not-an-iso-timestamp",
    source: undefined,
  }),
  normalizedNames: Object.freeze([
    Object.freeze({ id: PHASE127_IDS.workspaces.tieAlphaLater, name: "  Alpha  ", normalized: "alpha" }),
    Object.freeze({ id: PHASE127_IDS.workspaces.tieAlpha, name: "ALPHA", normalized: "alpha" }),
    Object.freeze({ id: PHASE127_IDS.workspaces.closed, name: "Zulu", normalized: "zulu" }),
  ]),
})
