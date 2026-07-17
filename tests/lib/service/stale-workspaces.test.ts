import { beforeAll, describe, expect, test } from "@test/api"

import {
  PHASE127_IDS,
  PHASE127_TIMES,
  createConcurrencyCounter,
  createDeferred,
  createIsoClock,
  createMutationSentinels,
  makeCandidateRow,
  makeCaution,
  makeConfirmedReason,
  makeForgeOutcome,
  makeRemoteBranchOutcome,
  makeRepositoryFixture,
  makeUnknownEvidence,
  makeWorkspaceFixture,
  makeWorkspaceSource,
  normalizeWorkspaceName,
  type Phase127CandidateRow,
  type Phase127ForgeOutcome,
  type Phase127RemoteBranchOutcome,
  type Phase127StaleResponse,
  type Phase127WorkspaceFixture,
} from "../../helpers/phase127-stale-fixtures"

type PolicyRemoteObservation = {
  repository_id: string
  repository_name: string
  outcome: Phase127RemoteBranchOutcome
}

type PolicyWorkspaceInput = {
  workspace: Phase127WorkspaceFixture
  forge_status?: Phase127ForgeOutcome
  remote_branches?: readonly PolicyRemoteObservation[]
}

type ClassifyStaleWorkspaces = (input: {
  revision: string
  checked_at: string
  workspaces: readonly PolicyWorkspaceInput[]
}) => Phase127StaleResponse

type RankStaleWorkspaceCandidates = (
  candidates: readonly Phase127CandidateRow[],
) => Phase127CandidateRow[]

type ForgeProbeInput = {
  source: unknown
  signal?: AbortSignal
  timeout_ms?: number
  max_output_bytes?: number
}

type RemoteProbeInput = {
  main_path: string
  branch: string
  signal?: AbortSignal
  timeout_ms?: number
  max_output_bytes?: number
}

type StaleReadModel = {
  revision: string
  workspaces: readonly Phase127WorkspaceFixture[]
}

type StaleEvaluationRequest = {
  expected_revision: string
  read_model: StaleReadModel
  force_refresh: boolean
  signal?: AbortSignal
}

type StaleWorkspaceEvaluator = {
  evaluate(request: StaleEvaluationRequest): Promise<Phase127StaleResponse>
}

type CreateStaleWorkspaceEvaluator = (options: {
  now: () => number
  lookupForgeChangeStatus: (input: ForgeProbeInput) => Promise<Phase127ForgeOutcome>
  observeRemoteBranchStatus: (input: RemoteProbeInput) => Promise<Phase127RemoteBranchOutcome>
  timeout_ms?: number
  max_output_bytes?: number
  [key: string]: unknown
}) => StaleWorkspaceEvaluator

type RuntimeModule = Record<string, unknown>

const POLICY_MODULE_URL = new URL(
  "../../../packages/service/src/policy/stale-workspaces.ts",
  import.meta.url,
).href

const EVALUATOR_MODULE_URL = new URL(
  "../../../packages/service/src/policy/stale-workspace-evaluator.ts",
  import.meta.url,
).href

const REVISION = "7"
const CHECKED_AT = PHASE127_TIMES.checkedAt

let policyModule: RuntimeModule | undefined
let policyModuleLoadError: unknown
let evaluatorModule: RuntimeModule | undefined
let evaluatorModuleLoadError: unknown

beforeAll(async () => {
  try {
    policyModule = await import(/* @vite-ignore */ POLICY_MODULE_URL) as RuntimeModule
  } catch (error) {
    policyModuleLoadError = error
  }
  try {
    evaluatorModule = await import(/* @vite-ignore */ EVALUATOR_MODULE_URL) as RuntimeModule
  } catch (error) {
    evaluatorModuleLoadError = error
  }
})

function classifyStaleWorkspaces(): ClassifyStaleWorkspaces {
  expect(
    policyModuleLoadError,
    "Phase 127 service must provide packages/service/src/policy/stale-workspaces.ts",
  ).toBeUndefined()
  const value = policyModule?.classifyStaleWorkspaces
  expect(
    value,
    "Phase 127 stale policy must export classifyStaleWorkspaces",
  ).toBeTypeOf("function")
  return value as ClassifyStaleWorkspaces
}

function rankStaleWorkspaceCandidates(): RankStaleWorkspaceCandidates {
  expect(
    policyModuleLoadError,
    "Phase 127 service must provide packages/service/src/policy/stale-workspaces.ts",
  ).toBeUndefined()
  const value = policyModule?.rankStaleWorkspaceCandidates
  expect(
    value,
    "Phase 127 stale policy must export rankStaleWorkspaceCandidates",
  ).toBeTypeOf("function")
  return value as RankStaleWorkspaceCandidates
}

function createStaleWorkspaceEvaluator(): CreateStaleWorkspaceEvaluator {
  expect(
    evaluatorModuleLoadError,
    "Phase 127 service must provide packages/service/src/policy/stale-workspace-evaluator.ts",
  ).toBeUndefined()
  const value = evaluatorModule?.createStaleWorkspaceEvaluator
  expect(
    value,
    "Phase 127 stale evaluator must export createStaleWorkspaceEvaluator",
  ).toBeTypeOf("function")
  return value as CreateStaleWorkspaceEvaluator
}

function quietWorkspace(
  overrides: Partial<Omit<Phase127WorkspaceFixture, "repositories">> & {
    repositories?: Phase127WorkspaceFixture["repositories"]
  } = {},
): Phase127WorkspaceFixture {
  return makeWorkspaceFixture({
    source: undefined,
    repositories: [],
    last_opened: "2026-07-01T10:00:00.000Z",
    notes_count: 0,
    ...overrides,
  })
}

function classify(
  workspaces: readonly PolicyWorkspaceInput[],
  overrides: Partial<Pick<Parameters<ClassifyStaleWorkspaces>[0], "revision" | "checked_at">> = {},
): Phase127StaleResponse {
  return classifyStaleWorkspaces()({
    revision: overrides.revision ?? REVISION,
    checked_at: overrides.checked_at ?? CHECKED_AT,
    workspaces,
  })
}

function policyInput(
  workspace: Phase127WorkspaceFixture,
  evidence: Omit<PolicyWorkspaceInput, "workspace"> = {},
): PolicyWorkspaceInput {
  return { workspace, ...evidence }
}

function remoteObservation(
  workspace: Phase127WorkspaceFixture,
  outcome: Phase127RemoteBranchOutcome,
  repositoryIndex = 0,
): PolicyRemoteObservation {
  const repository = workspace.repositories[repositoryIndex]
  if (!repository) throw new Error("Remote observation fixture requires a repository")
  return {
    repository_id: repository.id,
    repository_name: repository.name,
    outcome,
  }
}

function scopedReason(code: "merged" | "closed", occurred_at: string) {
  return {
    code,
    occurred_at,
    repository_id: PHASE127_IDS.repositories.app,
    repository_name: "app",
    provider: "github",
  }
}

function localReason(
  code: "remote_branch_deleted" | "managed_worktree_missing",
  repository = makeRepositoryFixture(),
) {
  return {
    code,
    occurred_at: CHECKED_AT,
    repository_id: repository.id,
    repository_name: repository.name,
  }
}

function inactivityReason(occurred_at: string) {
  return { code: "inactive", occurred_at }
}

function uuid(index: number): string {
  return `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`
}

function readModel(
  workspaces: readonly Phase127WorkspaceFixture[],
  revision = REVISION,
): StaleReadModel {
  return Object.freeze({
    revision,
    workspaces: Object.freeze([...workspaces]),
  })
}

function request(
  workspaces: readonly Phase127WorkspaceFixture[],
  overrides: Partial<StaleEvaluationRequest> = {},
): StaleEvaluationRequest {
  return {
    expected_revision: REVISION,
    read_model: readModel(workspaces),
    force_refresh: false,
    ...overrides,
  }
}

async function flushMicrotasks(turns = 6): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

function candidateCodes(response: Phase127StaleResponse, index = 0): string[] {
  return response.candidates[index]?.confirmed_reasons.map((reason) => reason.code) ?? []
}

function unknownCodes(response: Phase127StaleResponse, section: "candidate" | "incomplete", index = 0): string[] {
  const row = section === "candidate" ? response.candidates[index] : response.incomplete[index]
  return row?.unknown_evidence.map((reason) => reason.code) ?? []
}

describe("Phase 127 pure stale qualification and timestamp policy", () => {
  test("loads guarded pure-policy exports without a discovery failure", () => {
    expect(classifyStaleWorkspaces()).toBeTypeOf("function")
    expect(rankStaleWorkspaceCandidates()).toBeTypeOf("function")
  })

  test("uses one fixed 30-day threshold and excludes exact-cutoff equality", () => {
    const exact = quietWorkspace({
      id: uuid(1),
      name: "exact-cutoff",
      last_opened: PHASE127_TIMES.cutoff,
    })
    const before = quietWorkspace({
      id: uuid(2),
      name: "before-cutoff",
      last_opened: PHASE127_TIMES.beforeCutoff,
    })
    const after = quietWorkspace({
      id: uuid(3),
      name: "after-cutoff",
      last_opened: PHASE127_TIMES.afterCutoff,
    })

    const response = classify([
      policyInput(exact),
      policyInput(before),
      policyInput(after),
    ])

    expect(response).toMatchObject({
      revision: REVISION,
      checked_at: CHECKED_AT,
      threshold_days: 30,
      incomplete: [],
    })
    expect(response.candidates).toHaveLength(1)
    expect(response.candidates[0]).toMatchObject({
      workspace_id: before.id,
      activity_at: PHASE127_TIMES.beforeCutoff,
      confirmed_reasons: [inactivityReason(PHASE127_TIMES.beforeCutoff)],
    })
  })

  test.each([
    ["merged", makeForgeOutcome("merged"), "merged", PHASE127_TIMES.mergedAt],
    ["closed", makeForgeOutcome("closed"), "closed", PHASE127_TIMES.closedAt],
  ] as const)("qualifies confirmed provider %s with the provider event time", (_label, forge_status, code, occurredAt) => {
    const workspace = makeWorkspaceFixture()

    const response = classify([policyInput(workspace, { forge_status })])

    expect(response.candidates).toHaveLength(1)
    expect(response.incomplete).toEqual([])
    expect(response.candidates[0].confirmed_reasons).toEqual([
      scopedReason(code, occurredAt),
    ])
  })

  test("treats an open provider change as non-evidence", () => {
    const workspace = makeWorkspaceFixture()

    const response = classify([
      policyInput(workspace, { forge_status: makeForgeOutcome("open") }),
    ])

    expect(response.candidates).toEqual([])
    expect(response.incomplete).toEqual([])
  })

  test("qualifies a repository-scoped missing remote branch at checked_at", () => {
    const workspace = makeWorkspaceFixture({ source: undefined })

    const response = classify([
      policyInput(workspace, {
        remote_branches: [remoteObservation(workspace, makeRemoteBranchOutcome("missing"))],
      }),
    ])

    expect(response.candidates).toHaveLength(1)
    expect(response.candidates[0].confirmed_reasons).toEqual([
      localReason("remote_branch_deleted"),
    ])
  })

  test("qualifies only a confirmed missing managed worktree at checked_at", () => {
    const missing = makeRepositoryFixture({ exists: false, degraded: false })
    const workspace = makeWorkspaceFixture({
      source: undefined,
      repositories: [missing],
    })

    const response = classify([policyInput(workspace)])

    expect(response.candidates).toHaveLength(1)
    expect(response.candidates[0].confirmed_reasons).toEqual([
      localReason("managed_worktree_missing", missing),
    ])
  })

  test("qualifies strict inactivity with activity_at as the evidence time", () => {
    const workspace = quietWorkspace({
      last_opened: PHASE127_TIMES.beforeCutoff,
    })

    const response = classify([policyInput(workspace)])

    expect(response.candidates).toHaveLength(1)
    expect(response.candidates[0]).toMatchObject({
      activity_at: PHASE127_TIMES.beforeCutoff,
      confirmed_reasons: [inactivityReason(PHASE127_TIMES.beforeCutoff)],
    })
  })

  test("last_opened has authority over an older created date", () => {
    const workspace = quietWorkspace({
      created: "2025-01-01",
      last_opened: "2026-07-10T00:00:00.000Z",
    })

    const response = classify([policyInput(workspace)])

    expect(response.candidates).toEqual([])
    expect(response.incomplete).toEqual([])
  })

  test("an old last_opened value remains authoritative over a newer created value", () => {
    const workspace = quietWorkspace({
      created: "2026-07-16",
      last_opened: PHASE127_TIMES.beforeCutoff,
    })

    const response = classify([policyInput(workspace)])

    expect(response.candidates[0]).toMatchObject({
      activity_at: PHASE127_TIMES.beforeCutoff,
      confirmed_reasons: [inactivityReason(PHASE127_TIMES.beforeCutoff)],
    })
  })

  test("uses the canonical midnight-UTC fallback for a date-only created value", () => {
    const workspace = quietWorkspace({
      created: "2026-05-01",
      last_opened: undefined,
    })

    const response = classify([policyInput(workspace)])

    expect(response.candidates[0]).toMatchObject({
      activity_at: "2026-05-01T00:00:00.000Z",
      confirmed_reasons: [inactivityReason("2026-05-01T00:00:00.000Z")],
    })
  })

  test("does not fall back past malformed authoritative activity", () => {
    const workspace = quietWorkspace({
      created: "2025-01-01",
      last_opened: "not-an-iso-timestamp",
    })

    const response = classify([policyInput(workspace)])

    expect(response.candidates).toEqual([])
    expect(response.incomplete).toHaveLength(1)
    expect(response.incomplete[0]).toMatchObject({
      activity_at: null,
      unknown_evidence: [{
        code: "activity_unavailable",
        observed_at: CHECKED_AT,
      }],
    })
  })

  test("keeps inaccessible or degraded worktrees unknown instead of confirmed missing", () => {
    const inaccessible = makeRepositoryFixture({ exists: false, degraded: true })
    const workspace = makeWorkspaceFixture({
      source: undefined,
      repositories: [inaccessible],
    })

    const response = classify([policyInput(workspace)])

    expect(response.candidates).toEqual([])
    expect(response.incomplete).toHaveLength(1)
    expect(response.incomplete[0].unknown_evidence).toEqual([{
      code: "worktree_inaccessible",
      observed_at: CHECKED_AT,
      repository_id: inaccessible.id,
      repository_name: inaccessible.name,
    }])
  })

  test.each([
    ["present", makeRemoteBranchOutcome("present"), false, false],
    ["missing", makeRemoteBranchOutcome("missing"), true, false],
    ["error", makeRemoteBranchOutcome("unknown"), false, true],
  ] as const)("keeps remote branch %s distinct", (_label, outcome, candidate, incomplete) => {
    const workspace = makeWorkspaceFixture({ source: undefined })

    const response = classify([
      policyInput(workspace, {
        remote_branches: [remoteObservation(workspace, outcome)],
      }),
    ])

    expect(response.candidates.length > 0).toBe(candidate)
    expect(response.incomplete.length > 0).toBe(incomplete)
    if (candidate) {
      expect(response.candidates[0].confirmed_reasons).toEqual([
        localReason("remote_branch_deleted"),
      ])
    }
    if (incomplete) {
      expect(response.incomplete[0].unknown_evidence).toEqual([{
        code: "remote_check_failed",
        observed_at: CHECKED_AT,
        repository_id: PHASE127_IDS.repositories.app,
        repository_name: "app",
      }])
    }
  })

  test("one missing repository never changes a present sibling into evidence", () => {
    const app = makeRepositoryFixture()
    const api = makeRepositoryFixture({
      id: PHASE127_IDS.repositories.api,
      name: "api",
      main_path: "/fixtures/source/api",
      task_path: "/fixtures/workspaces/stale/api",
    })
    const workspace = makeWorkspaceFixture({
      source: undefined,
      repositories: [app, api],
    })

    const response = classify([policyInput(workspace, {
      remote_branches: [
        remoteObservation(workspace, makeRemoteBranchOutcome("missing"), 0),
        remoteObservation(workspace, makeRemoteBranchOutcome("present"), 1),
      ],
    })])

    expect(response.candidates[0].confirmed_reasons).toEqual([
      localReason("remote_branch_deleted", app),
    ])
    expect(JSON.stringify(response)).not.toContain(PHASE127_IDS.repositories.api)
  })
})

describe("Phase 127 evidence classification, deduplication, and cautions", () => {
  test("confirmed plus unknown evidence remains a candidate and preserves both", () => {
    const workspace = makeWorkspaceFixture()

    const response = classify([policyInput(workspace, {
      forge_status: makeForgeOutcome("unknown", { reason: "provider_unavailable" }),
      remote_branches: [remoteObservation(workspace, makeRemoteBranchOutcome("missing"))],
    })])

    expect(response.candidates).toHaveLength(1)
    expect(response.incomplete).toEqual([])
    expect(candidateCodes(response)).toEqual(["remote_branch_deleted"])
    expect(unknownCodes(response, "candidate")).toEqual(["provider_unavailable"])
  })

  test("unknown-only evidence belongs in incomplete and never qualifies", () => {
    const workspace = makeWorkspaceFixture()

    const response = classify([policyInput(workspace, {
      forge_status: makeForgeOutcome("unknown", { reason: "authentication_required" }),
      remote_branches: [remoteObservation(workspace, makeRemoteBranchOutcome("present"))],
    })])

    expect(response.candidates).toEqual([])
    expect(response.incomplete).toHaveLength(1)
    expect(unknownCodes(response, "incomplete")).toEqual(["authentication_required"])
  })

  test("no confirmed or unknown evidence omits the workspace", () => {
    const workspace = makeWorkspaceFixture()

    const response = classify([policyInput(workspace, {
      forge_status: makeForgeOutcome("open"),
      remote_branches: [remoteObservation(workspace, makeRemoteBranchOutcome("present"))],
    })])

    expect(response.candidates).toEqual([])
    expect(response.incomplete).toEqual([])
  })

  test("dirty, ahead, drift, and notes cautions do not qualify by themselves", () => {
    const repository = makeRepositoryFixture({
      dirty: true,
      ahead: 3,
      drifted: true,
    })
    const workspace = makeWorkspaceFixture({
      source: undefined,
      repositories: [repository],
      notes_count: 2,
    })

    const response = classify([policyInput(workspace)])

    expect(response.candidates).toEqual([])
    expect(response.incomplete).toEqual([])
  })

  test("cautions neither suppress a confirmed reason nor change its timestamp", () => {
    const repository = makeRepositoryFixture({
      dirty: true,
      ahead: 3,
      drifted: true,
    })
    const workspace = makeWorkspaceFixture({
      source: undefined,
      repositories: [repository],
      notes_count: 2,
      last_opened: PHASE127_TIMES.beforeCutoff,
    })

    const response = classify([policyInput(workspace)])

    expect(response.candidates).toHaveLength(1)
    expect(response.candidates[0].confirmed_reasons).toEqual([
      inactivityReason(PHASE127_TIMES.beforeCutoff),
    ])
    expect(response.candidates[0].cautions).toEqual([
      makeCaution({ repository_id: repository.id, repository_name: repository.name }),
      makeCaution({
        code: "ahead_of_remote",
        repository_id: repository.id,
        repository_name: repository.name,
        count: 3,
      }),
      makeCaution({
        code: "workspace_drift",
        repository_id: repository.id,
        repository_name: repository.name,
      }),
      makeCaution({
        code: "notes_present",
        repository_id: undefined,
        repository_name: undefined,
        count: 2,
      }),
    ])
  })

  test("deduplicates same-code same-repository evidence but preserves distinct reasons", () => {
    const missing = makeRepositoryFixture({ exists: false, degraded: false })
    const workspace = makeWorkspaceFixture({
      source: undefined,
      repositories: [missing],
    })
    const missingRemote = remoteObservation(workspace, makeRemoteBranchOutcome("missing"))

    const response = classify([policyInput(workspace, {
      remote_branches: [missingRemote, missingRemote, missingRemote],
    })])

    expect(response.candidates[0].confirmed_reasons).toEqual([
      localReason("remote_branch_deleted", missing),
      localReason("managed_worktree_missing", missing),
    ])
  })

  test("deduplicates scoped unknown evidence without erasing distinct unknown codes", () => {
    const workspace = makeWorkspaceFixture()
    const unknownRemote = remoteObservation(workspace, makeRemoteBranchOutcome("unknown"))

    const response = classify([policyInput(workspace, {
      forge_status: makeForgeOutcome("unknown", { reason: "provider_unavailable" }),
      remote_branches: [unknownRemote, unknownRemote],
    })])

    expect(response.incomplete[0].unknown_evidence).toEqual([
      makeUnknownEvidence({ code: "provider_unavailable" }),
      makeUnknownEvidence({
        code: "remote_check_failed",
        provider: undefined,
      }),
    ])
  })

  test("renders terminal evidence before inactivity while retaining every reason", () => {
    const missing = makeRepositoryFixture({ exists: false, degraded: false })
    const workspace = makeWorkspaceFixture({
      source: undefined,
      repositories: [missing],
      last_opened: PHASE127_TIMES.beforeCutoff,
    })

    const response = classify([policyInput(workspace, {
      remote_branches: [remoteObservation(workspace, makeRemoteBranchOutcome("missing"))],
    })])

    expect(candidateCodes(response)).toEqual([
      "remote_branch_deleted",
      "managed_worktree_missing",
      "inactive",
    ])
  })

  test("supports zero, one, and many workspaces under one atomic response shape", () => {
    const empty = classify([])
    const oneWorkspace = quietWorkspace({
      id: uuid(10),
      name: "one",
      last_opened: PHASE127_TIMES.beforeCutoff,
    })
    const twoWorkspace = quietWorkspace({
      id: uuid(11),
      name: "two",
      last_opened: "2026-05-01T00:00:00.000Z",
    })
    const one = classify([policyInput(oneWorkspace)])
    const many = classify([
      policyInput(oneWorkspace),
      policyInput(twoWorkspace),
      policyInput(quietWorkspace({ id: uuid(12), name: "omitted" })),
    ])

    expect(empty).toEqual({
      revision: REVISION,
      checked_at: CHECKED_AT,
      threshold_days: 30,
      candidates: [],
      incomplete: [],
    })
    expect(one.candidates).toHaveLength(1)
    expect(many.candidates.map((row) => row.workspace_id)).toEqual([
      twoWorkspace.id,
      oneWorkspace.id,
    ])
  })
})

describe("Phase 127 stable lexicographic ranking", () => {
  function rank(rows: readonly Phase127CandidateRow[]): Phase127CandidateRow[] {
    return rankStaleWorkspaceCandidates()(rows)
  }

  function inactive(codeTime = PHASE127_TIMES.beforeCutoff) {
    return makeConfirmedReason({
      code: "inactive",
      occurred_at: codeTime,
      repository_id: undefined,
      repository_name: undefined,
      provider: undefined,
    })
  }

  test("orders higher confirmed-reason count before stronger single evidence", () => {
    const twoReasons = makeCandidateRow({
      workspace_id: uuid(20),
      workspace_name: "two-reasons",
      confirmed_reasons: [
        makeConfirmedReason({ code: "closed" }),
        inactive(),
      ],
    })
    const oneMerged = makeCandidateRow({
      workspace_id: uuid(21),
      workspace_name: "one-merged",
      confirmed_reasons: [makeConfirmedReason({ code: "merged" })],
    })

    expect(rank([oneMerged, twoReasons]).map((row) => row.workspace_id)).toEqual([
      twoReasons.workspace_id,
      oneMerged.workspace_id,
    ])
  })

  test("orders equal counts by merged, closed, remote, worktree, then inactive strength", () => {
    const rows = [
      ["inactive", inactive()],
      ["worktree", makeConfirmedReason({ code: "managed_worktree_missing", provider: undefined })],
      ["remote", makeConfirmedReason({ code: "remote_branch_deleted", provider: undefined })],
      ["closed", makeConfirmedReason({ code: "closed" })],
      ["merged", makeConfirmedReason({ code: "merged" })],
    ].map(([name, reason], index) => makeCandidateRow({
      workspace_id: uuid(30 + index),
      workspace_name: String(name),
      confirmed_reasons: [reason as ReturnType<typeof makeConfirmedReason>],
    }))

    expect(rank(rows).map((row) => row.workspace_name)).toEqual([
      "merged",
      "closed",
      "remote",
      "worktree",
      "inactive",
    ])
  })

  test("puts inactivity-only candidates after terminal evidence without a numeric score", () => {
    const inactivityOnly = makeCandidateRow({
      workspace_id: uuid(40),
      workspace_name: "inactive-only",
      confirmed_reasons: [inactive()],
    })
    const terminal = makeCandidateRow({
      workspace_id: uuid(41),
      workspace_name: "terminal",
      confirmed_reasons: [makeConfirmedReason({ code: "managed_worktree_missing", provider: undefined })],
    })

    const ranked = rank([inactivityOnly, terminal])

    expect(ranked.map((row) => row.workspace_id)).toEqual([
      terminal.workspace_id,
      inactivityOnly.workspace_id,
    ])
    expect(JSON.stringify(ranked)).not.toContain("score")
    expect(JSON.stringify(ranked)).not.toContain("confidence")
  })

  test("orders equal evidence by oldest valid activity", () => {
    const newer = makeCandidateRow({
      workspace_id: uuid(50),
      workspace_name: "newer",
      activity_at: "2026-06-01T00:00:00.000Z",
    })
    const older = makeCandidateRow({
      workspace_id: uuid(51),
      workspace_name: "older",
      activity_at: "2026-05-01T00:00:00.000Z",
    })

    expect(rank([newer, older]).map((row) => row.workspace_id)).toEqual([
      older.workspace_id,
      newer.workspace_id,
    ])
  })

  test("puts unknown activity after every valid activity", () => {
    const unknown = makeCandidateRow({
      workspace_id: uuid(60),
      workspace_name: "unknown",
      activity_at: null,
    })
    const valid = makeCandidateRow({
      workspace_id: uuid(61),
      workspace_name: "valid",
      activity_at: "2026-07-01T00:00:00.000Z",
    })

    expect(rank([unknown, valid]).map((row) => row.workspace_id)).toEqual([
      valid.workspace_id,
      unknown.workspace_id,
    ])
  })

  test("normalizes names before the stable name tie-break", () => {
    const zulu = makeCandidateRow({
      workspace_id: uuid(70),
      workspace_name: "Zulu",
    })
    const alpha = makeCandidateRow({
      workspace_id: uuid(71),
      workspace_name: "  ALPHA  ",
    })

    const ranked = rank([zulu, alpha])

    expect(normalizeWorkspaceName(ranked[0].workspace_name)).toBe("alpha")
    expect(ranked.map((row) => row.workspace_id)).toEqual([
      alpha.workspace_id,
      zulu.workspace_id,
    ])
  })

  test("uses stable workspace ID as the final deterministic tie-break", () => {
    const later = makeCandidateRow({
      workspace_id: uuid(82),
      workspace_name: "same",
    })
    const earlier = makeCandidateRow({
      workspace_id: uuid(81),
      workspace_name: "same",
    })
    const input = [later, earlier]
    const snapshot = structuredClone(input)

    const first = rank(input)
    const second = rank(input)

    expect(first.map((row) => row.workspace_id)).toEqual([
      earlier.workspace_id,
      later.workspace_id,
    ])
    expect(second).toEqual(first)
    expect(input).toEqual(snapshot)
  })
})

describe("Phase 127 captured-read-model evaluator and network-only cache", () => {
  test("loads the guarded evaluator export without a discovery failure", () => {
    expect(createStaleWorkspaceEvaluator()).toBeTypeOf("function")
  })

  test("captures checked_at once and uses it for every observation-time reason", async () => {
    const create = createStaleWorkspaceEvaluator()
    let nowCalls = 0
    const workspace = makeWorkspaceFixture({
      source: undefined,
      repositories: [makeRepositoryFixture({ exists: false, degraded: false })],
    })
    const evaluator = create({
      now: () => {
        nowCalls += 1
        return Date.parse(CHECKED_AT)
      },
      lookupForgeChangeStatus: async () => makeForgeOutcome("open"),
      observeRemoteBranchStatus: async () => makeRemoteBranchOutcome("missing"),
    })

    const response = await evaluator.evaluate(request([workspace]))

    expect(nowCalls).toBe(1)
    expect(response.checked_at).toBe(CHECKED_AT)
    expect(response.candidates[0].confirmed_reasons).toEqual([
      localReason("remote_branch_deleted"),
      localReason("managed_worktree_missing"),
    ])
  })

  test("caches only network evidence through 299,999 ms and expires it at exactly 300,000 ms", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    let forgeCalls = 0
    let remoteCalls = 0
    const base = makeWorkspaceFixture()
    const evaluator = create({
      now: clock.now,
      lookupForgeChangeStatus: async () => {
        forgeCalls += 1
        return makeForgeOutcome("merged")
      },
      observeRemoteBranchStatus: async () => {
        remoteCalls += 1
        return makeRemoteBranchOutcome("present")
      },
    })

    const first = await evaluator.evaluate(request([base]))
    const locallyChanged = makeWorkspaceFixture({
      last_opened: PHASE127_TIMES.beforeCutoff,
      notes_count: 2,
      repositories: [makeRepositoryFixture({ dirty: true, ahead: 3, drifted: true })],
    })
    clock.advance(299_999)
    const fresh = await evaluator.evaluate(request([locallyChanged]))

    expect(forgeCalls).toBe(1)
    expect(remoteCalls).toBe(1)
    expect(candidateCodes(first)).toEqual(["merged"])
    expect(candidateCodes(fresh)).toEqual(["merged", "inactive"])
    expect(fresh.candidates[0].cautions.map((caution) => caution.code)).toEqual([
      "dirty_worktree",
      "ahead_of_remote",
      "workspace_drift",
      "notes_present",
    ])

    clock.advance(1)
    await evaluator.evaluate(request([locallyChanged]))
    expect(forgeCalls).toBe(2)
    expect(remoteCalls).toBe(2)
  })

  test("caches sanitized unknown network outcomes for the same five-minute TTL", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    let forgeCalls = 0
    let remoteCalls = 0
    const workspace = makeWorkspaceFixture()
    const evaluator = create({
      now: clock.now,
      lookupForgeChangeStatus: async () => {
        forgeCalls += 1
        return makeForgeOutcome("unknown", { reason: "provider_unavailable" })
      },
      observeRemoteBranchStatus: async () => {
        remoteCalls += 1
        return makeRemoteBranchOutcome("unknown")
      },
    })

    const first = await evaluator.evaluate(request([workspace]))
    clock.advance(120_000)
    const second = await evaluator.evaluate(request([workspace]))

    expect(forgeCalls).toBe(1)
    expect(remoteCalls).toBe(1)
    expect(first.candidates).toEqual([])
    expect(unknownCodes(first, "incomplete")).toEqual([
      "provider_unavailable",
      "remote_check_failed",
    ])
    expect(second).toEqual({
      ...first,
      checked_at: clock.iso(),
    })
  })

  test("singleflights concurrent ordinary misses per forge and remote key", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    const forgeDeferred = createDeferred<Phase127ForgeOutcome>()
    const remoteDeferred = createDeferred<Phase127RemoteBranchOutcome>()
    let forgeCalls = 0
    let remoteCalls = 0
    const workspace = makeWorkspaceFixture()
    const evaluator = create({
      now: clock.now,
      lookupForgeChangeStatus: async () => {
        forgeCalls += 1
        return forgeDeferred.promise
      },
      observeRemoteBranchStatus: async () => {
        remoteCalls += 1
        return remoteDeferred.promise
      },
    })

    const first = evaluator.evaluate(request([workspace]))
    const second = evaluator.evaluate(request([workspace]))
    await flushMicrotasks()

    expect(forgeCalls).toBe(1)
    expect(remoteCalls).toBe(1)
    forgeDeferred.resolve(makeForgeOutcome("merged"))
    remoteDeferred.resolve(makeRemoteBranchOutcome("present"))

    expect(await first).toEqual(await second)
  })

  test("forced refresh bypasses fresh reads and becomes the next ordinary cache value", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    const forgeOutcomes = [makeForgeOutcome("merged"), makeForgeOutcome("closed")]
    const remoteOutcomes = [makeRemoteBranchOutcome("present"), makeRemoteBranchOutcome("missing")]
    let forgeCalls = 0
    let remoteCalls = 0
    const workspace = makeWorkspaceFixture()
    const evaluator = create({
      now: clock.now,
      lookupForgeChangeStatus: async () => {
        forgeCalls += 1
        const outcome = forgeOutcomes.shift()
        if (!outcome) throw new Error("Unexpected forge refresh")
        return outcome
      },
      observeRemoteBranchStatus: async () => {
        remoteCalls += 1
        const outcome = remoteOutcomes.shift()
        if (!outcome) throw new Error("Unexpected remote refresh")
        return outcome
      },
    })

    const initial = await evaluator.evaluate(request([workspace]))
    const forced = await evaluator.evaluate(request([workspace], { force_refresh: true }))
    const ordinary = await evaluator.evaluate(request([workspace]))

    expect(candidateCodes(initial)).toEqual(["merged"])
    expect(candidateCodes(forced)).toEqual(["closed", "remote_branch_deleted"])
    expect(ordinary).toEqual(forced)
    expect(forgeCalls).toBe(2)
    expect(remoteCalls).toBe(2)
  })

  test("newest forced generation alone commits and the older result becomes scoped unknown", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    const older = createDeferred<Phase127ForgeOutcome>()
    const newer = createDeferred<Phase127ForgeOutcome>()
    let forgeCalls = 0
    const workspace = makeWorkspaceFixture()
    const evaluator = create({
      now: clock.now,
      lookupForgeChangeStatus: async () => {
        forgeCalls += 1
        return forgeCalls === 1 ? older.promise : newer.promise
      },
      observeRemoteBranchStatus: async () => makeRemoteBranchOutcome("present"),
    })

    const olderRequest = evaluator.evaluate(request([workspace], { force_refresh: true }))
    await flushMicrotasks()
    expect(forgeCalls).toBe(1)
    const newerRequest = evaluator.evaluate(request([workspace], { force_refresh: true }))
    await flushMicrotasks()
    expect(forgeCalls).toBe(2)

    newer.resolve(makeForgeOutcome("closed"))
    const newerResponse = await newerRequest
    older.resolve(makeForgeOutcome("merged"))
    const olderResponse = await olderRequest
    const cached = await evaluator.evaluate(request([workspace]))

    expect(candidateCodes(newerResponse)).toEqual(["closed"])
    expect(olderResponse.candidates).toEqual([])
    expect(unknownCodes(olderResponse, "incomplete")).toEqual(["probe_superseded"])
    expect(candidateCodes(cached)).toEqual(["closed"])
    expect(forgeCalls).toBe(2)
  })

  test("a new evaluator instance starts with an empty volatile cache", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    let forgeCalls = 0
    let remoteCalls = 0
    const options = {
      now: clock.now,
      lookupForgeChangeStatus: async () => {
        forgeCalls += 1
        return makeForgeOutcome("merged")
      },
      observeRemoteBranchStatus: async () => {
        remoteCalls += 1
        return makeRemoteBranchOutcome("present")
      },
    }
    const workspace = makeWorkspaceFixture()

    await create(options).evaluate(request([workspace]))
    await create(options).evaluate(request([workspace]))

    expect(forgeCalls).toBe(2)
    expect(remoteCalls).toBe(2)
  })

  test("an aborted generation returns unknown and cannot commit a late provider result", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    const firstProbe = createDeferred<Phase127ForgeOutcome>()
    let forgeCalls = 0
    const workspace = makeWorkspaceFixture()
    const evaluator = create({
      now: clock.now,
      lookupForgeChangeStatus: async (input) => {
        forgeCalls += 1
        if (forgeCalls === 1) {
          expect(input.signal).toBeDefined()
          return firstProbe.promise
        }
        return makeForgeOutcome("closed")
      },
      observeRemoteBranchStatus: async () => makeRemoteBranchOutcome("present"),
    })
    const controller = new AbortController()

    const abortedRequest = evaluator.evaluate(request([workspace], {
      signal: controller.signal,
    }))
    await flushMicrotasks()
    controller.abort("Phase 127 abort")
    firstProbe.resolve(makeForgeOutcome("merged"))
    const aborted = await abortedRequest
    const retried = await evaluator.evaluate(request([workspace]))

    expect(aborted.candidates).toEqual([])
    expect(unknownCodes(aborted, "incomplete")).toEqual(["request_aborted"])
    expect(candidateCodes(retried)).toEqual(["closed"])
    expect(forgeCalls).toBe(2)
  })

  test("isolates probe failures into scoped unknown evidence without rejecting the atomic response", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    const workspace = makeWorkspaceFixture()
    const evaluator = create({
      now: clock.now,
      lookupForgeChangeStatus: async () => {
        throw new Error("provider raw failure must not escape")
      },
      observeRemoteBranchStatus: async () => makeRemoteBranchOutcome("missing"),
    })

    const response = await evaluator.evaluate(request([workspace]))

    expect(response.candidates).toHaveLength(1)
    expect(candidateCodes(response)).toEqual(["remote_branch_deleted"])
    expect(unknownCodes(response, "candidate")).toEqual(["provider_unavailable"])
    expect(JSON.stringify(response)).not.toContain("provider raw failure")
  })

  test("bounds combined provider and remote fan-out to four", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    const counter = createConcurrencyCounter()
    const workspaces = Array.from({ length: 8 }, (_, index) => {
      const changeNumber = index + 1
      const name = `app-${changeNumber}`
      return makeWorkspaceFixture({
        id: uuid(100 + index),
        name: `workspace-${changeNumber}`,
        source: makeWorkspaceSource({
          change_number: changeNumber,
          repo: name,
          repo_path: `acme/${name}`,
          url: `https://github.com/acme/${name}/pull/${changeNumber}`,
          web_url: `https://github.com/acme/${name}/pull/${changeNumber}`,
        }),
        repositories: [makeRepositoryFixture({
          id: uuid(200 + index),
          name,
          main_path: `/fixtures/source/${name}`,
          task_path: `/fixtures/workspaces/${name}`,
          branch: `feature/${name}`,
        })],
      })
    })
    const evaluator = create({
      now: clock.now,
      lookupForgeChangeStatus: async () => counter.run(async () => {
        await Promise.resolve()
        return makeForgeOutcome("open")
      }),
      observeRemoteBranchStatus: async () => counter.run(async () => {
        await Promise.resolve()
        return makeRemoteBranchOutcome("present")
      }),
    })

    const response = await evaluator.evaluate(request(workspaces))

    expect(response.candidates).toEqual([])
    expect(response.incomplete).toEqual([])
    expect(counter.calls).toBe(16)
    expect(counter.maximum).toBeLessThanOrEqual(4)
  })

  test("assembles one response only after every bounded probe settles", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    const forgeDeferreds = Array.from({ length: 2 }, () => createDeferred<Phase127ForgeOutcome>())
    const remoteDeferreds = Array.from({ length: 2 }, () => createDeferred<Phase127RemoteBranchOutcome>())
    let nextForge = 0
    let nextRemote = 0
    const workspaces = [
      makeWorkspaceFixture({ id: uuid(300), name: "atomic-one" }),
      makeWorkspaceFixture({
        id: uuid(301),
        name: "atomic-two",
        source: makeWorkspaceSource({
          change_number: 43,
          repo: "api",
          repo_path: "acme/api",
          url: "https://github.com/acme/api/pull/43",
          web_url: "https://github.com/acme/api/pull/43",
        }),
        repositories: [makeRepositoryFixture({ id: PHASE127_IDS.repositories.api, name: "api" })],
      }),
    ]
    const evaluator = create({
      now: clock.now,
      lookupForgeChangeStatus: async () => {
        const deferred = forgeDeferreds[nextForge]
        nextForge += 1
        if (!deferred) throw new Error("Unexpected forge probe")
        return deferred.promise
      },
      observeRemoteBranchStatus: async () => {
        const deferred = remoteDeferreds[nextRemote]
        nextRemote += 1
        if (!deferred) throw new Error("Unexpected remote probe")
        return deferred.promise
      },
    })
    let settled = false

    const evaluation = evaluator.evaluate(request(workspaces)).finally(() => {
      settled = true
    })
    await flushMicrotasks()
    expect(nextForge).toBe(2)
    expect(nextRemote).toBe(2)
    expect(settled).toBe(false)

    forgeDeferreds[0].resolve(makeForgeOutcome("merged"))
    forgeDeferreds[1].resolve(makeForgeOutcome("open"))
    remoteDeferreds[0].resolve(makeRemoteBranchOutcome("present"))
    await flushMicrotasks()
    expect(settled).toBe(false)

    remoteDeferreds[1].resolve(makeRemoteBranchOutcome("missing"))
    const response = await evaluation
    expect(settled).toBe(true)
    expect(response.candidates).toHaveLength(2)
  })
})

describe("Phase 127 revision-first and no-mutation authority boundary", () => {
  test("revision mismatch rejects before cache time, read-model rows, or probes are accessed", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    let nowCalls = 0
    let forgeCalls = 0
    let remoteCalls = 0
    let readModelCalls = 0
    let denyAccess = false
    const workspace = makeWorkspaceFixture()
    const evaluator = create({
      now: () => {
        nowCalls += 1
        if (denyAccess) throw new Error("revision mismatch consulted cache time")
        return clock.now()
      },
      lookupForgeChangeStatus: async () => {
        forgeCalls += 1
        return makeForgeOutcome("merged")
      },
      observeRemoteBranchStatus: async () => {
        remoteCalls += 1
        return makeRemoteBranchOutcome("present")
      },
    })

    await evaluator.evaluate(request([workspace]))
    const forgeBaseline = forgeCalls
    const remoteBaseline = remoteCalls
    nowCalls = 0
    denyAccess = true
    const mismatchedReadModel = {
      revision: REVISION,
      get workspaces(): readonly Phase127WorkspaceFixture[] {
        readModelCalls += 1
        throw new Error("revision mismatch read workspace rows")
      },
    }

    let mismatch: unknown
    try {
      await evaluator.evaluate({
        expected_revision: "8",
        read_model: mismatchedReadModel,
        force_refresh: false,
      })
    } catch (error) {
      mismatch = error
    }

    expect(mismatch).toMatchObject({ code: "revision_mismatch" })
    expect(nowCalls).toBe(0)
    expect(readModelCalls).toBe(0)
    expect(forgeCalls).toBe(forgeBaseline)
    expect(remoteCalls).toBe(remoteBaseline)
  })

  test("uses only the supplied captured read model and never performs a second local scan", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    const forbiddenReads = {
      getWorkspaceStatus: 0,
      readWorkspaceYaml: 0,
      scanGit: 0,
      statWorktree: 0,
    }
    const failRead = (name: keyof typeof forbiddenReads) => () => {
      forbiddenReads[name] += 1
      throw new Error(`Forbidden second local read: ${name}`)
    }
    const missing = makeRepositoryFixture({
      exists: false,
      degraded: false,
    })
    const cautionRepository = makeRepositoryFixture({
      id: PHASE127_IDS.repositories.api,
      name: "api",
      main_path: "/fixtures/source/api",
      task_path: "/fixtures/workspaces/stale/api",
      branch: "feature/api-stale-contract",
      dirty: true,
      ahead: 2,
      drifted: true,
    })
    const workspace = makeWorkspaceFixture({
      source: undefined,
      notes_count: 4,
      repositories: [missing, cautionRepository],
    })
    const evaluator = create({
      now: clock.now,
      lookupForgeChangeStatus: async () => makeForgeOutcome("open"),
      observeRemoteBranchStatus: async (input) => input.main_path === missing.main_path
        ? makeRemoteBranchOutcome("missing")
        : makeRemoteBranchOutcome("present"),
      getWorkspaceStatus: failRead("getWorkspaceStatus"),
      readWorkspaceYaml: failRead("readWorkspaceYaml"),
      scanGit: failRead("scanGit"),
      statWorktree: failRead("statWorktree"),
    })

    const response = await evaluator.evaluate(request([Object.freeze(workspace)]))

    expect(candidateCodes(response)).toEqual([
      "remote_branch_deleted",
      "managed_worktree_missing",
    ])
    expect(response.candidates[0].cautions.map((caution) => caution.code)).toEqual([
      "dirty_worktree",
      "ahead_of_remote",
      "workspace_drift",
      "notes_present",
    ])
    expect(forbiddenReads).toEqual({
      getWorkspaceStatus: 0,
      readWorkspaceYaml: 0,
      scanGit: 0,
      statWorktree: 0,
    })
  })

  test("evaluate and forced refresh cannot reach lifecycle, terminal, worktree, YAML, or provider mutation", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    const mutations = createMutationSentinels()
    const workspace = makeWorkspaceFixture()
    const evaluator = create({
      now: clock.now,
      lookupForgeChangeStatus: async () => makeForgeOutcome("open"),
      observeRemoteBranchStatus: async () => makeRemoteBranchOutcome("present"),
      archiveWorkspace: mutations.archiveWorkspace,
      removeWorkspace: mutations.removeWorkspace,
      stopTerminal: mutations.stopTerminal,
      discardWorktree: mutations.discardWorktree,
      writeWorkspaceYaml: mutations.writeWorkspaceYaml,
      mutateProvider: mutations.mutateProvider,
    })

    await evaluator.evaluate(request([workspace]))
    await evaluator.evaluate(request([workspace], { force_refresh: true }))

    expect(mutations.calls).toEqual({
      archive: 0,
      remove: 0,
      stop_terminal: 0,
      discard_worktree: 0,
      write_workspace_yaml: 0,
      mutate_provider: 0,
    })
    expect(() => mutations.assertUntouched()).not.toThrow()
  })

  test("never returns lifecycle authority, machine paths, raw probe errors, or safety scores", async () => {
    const create = createStaleWorkspaceEvaluator()
    const clock = createIsoClock()
    const workspace = makeWorkspaceFixture({
      repositories: [makeRepositoryFixture({
        main_path: "/home/alice/private/source/app",
        task_path: "/home/alice/private/workspaces/app",
      })],
    })
    const evaluator = create({
      now: clock.now,
      lookupForgeChangeStatus: async () => {
        throw new Error("raw provider failure at /home/alice/private/source/app")
      },
      observeRemoteBranchStatus: async () => {
        throw new Error("raw git failure at /home/alice/private/workspaces/app")
      },
    })

    const response = await evaluator.evaluate(request([workspace]))
    const encoded = JSON.stringify(response)

    for (const forbidden of [
      "/home/alice/private/source/app",
      "/home/alice/private/workspaces/app",
      "raw provider failure",
      "raw git failure",
      "archiveWorkspace",
      "removeWorkspace",
      "stopTerminal",
      "discardWorktree",
      "writeWorkspaceYaml",
      "score",
      "confidence",
      "safe_to_delete",
    ]) expect(encoded).not.toContain(forbidden)
    expect(response.candidates).toEqual([])
    expect(unknownCodes(response, "incomplete").sort()).toEqual([
      "provider_unavailable",
      "remote_check_failed",
    ])
  })
})
