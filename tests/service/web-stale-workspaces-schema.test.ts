import { describe, expect, test } from "@test/api"

import * as webProtocol from "../../packages/protocol/src/web"
import {
  PHASE127_DISCLOSURE_CANARIES,
  PHASE127_EDGE_FIXTURES,
  PHASE127_IDS,
  PHASE127_TIMES,
  createConcurrencyCounter,
  createDeferred,
  createIsoClock,
  createMutationSentinels,
  makeCandidateRow,
  makeCaution,
  makeConfirmedReason,
  makeIncompleteRow,
  makeStaleResponse,
  makeUnknownEvidence,
  normalizeWorkspaceName,
} from "../helpers/phase127-stale-fixtures"

type RuntimeSchema = {
  parse(value: unknown): unknown
  safeParse(value: unknown): { success: boolean }
}

const EXPECTED_SCHEMA_EXPORTS = [
  "WebStaleWorkspaceRequestSchema",
  "WebStaleWorkspaceResponseSchema",
  "WebStaleWorkspaceCandidateSchema",
  "WebStaleWorkspaceIncompleteSchema",
  "WebStaleWorkspaceConfirmedReasonSchema",
  "WebStaleWorkspaceUnknownEvidenceSchema",
  "WebStaleWorkspaceCautionSchema",
] as const

const CONFIRMED_REASON_CODES = [
  "merged",
  "closed",
  "remote_branch_deleted",
  "managed_worktree_missing",
  "inactive",
] as const

const UNKNOWN_EVIDENCE_CODES = [
  "invalid_provenance",
  "unsupported_provider",
  "unsupported_host",
  "tool_unavailable",
  "authentication_required",
  "rate_limited",
  "request_timeout",
  "request_aborted",
  "provider_unavailable",
  "malformed_response",
  "output_limit_exceeded",
  "remote_check_failed",
  "worktree_inaccessible",
  "activity_unavailable",
  "probe_superseded",
] as const

const CAUTION_CODES = [
  "dirty_worktree",
  "ahead_of_remote",
  "workspace_drift",
  "notes_present",
] as const

const LIMITS = Object.freeze({
  workspaces: 16,
  workspaceNameBytes: 96,
  repositoryNameBytes: 96,
  confirmedReasons: 18,
  unknownEvidence: 18,
  cautions: 25,
})

function runtimeExport(name: typeof EXPECTED_SCHEMA_EXPORTS[number]): RuntimeSchema {
  const value = (webProtocol as Record<string, unknown>)[name]
  expect(value, `Phase 127 protocol must export ${name}`).toBeDefined()
  expect(typeof (value as RuntimeSchema | undefined)?.parse, `${name} must be a runtime Zod schema`).toBe("function")
  expect(typeof (value as RuntimeSchema | undefined)?.safeParse, `${name} must support safeParse`).toBe("function")
  return value as RuntimeSchema
}

function phaseUuid(index: number, family = "3"): string {
  return `${family}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`
}

function candidate(index: number) {
  return makeCandidateRow({
    workspace_id: phaseUuid(index, "3"),
    workspace_name: `candidate-${index}`,
  })
}

function incomplete(index: number) {
  return makeIncompleteRow({
    workspace_id: phaseUuid(index, "4"),
    workspace_name: `incomplete-${index}`,
  })
}

function repositoryIdentity(index: number) {
  return {
    repository_id: phaseUuid(index, "5"),
    repository_name: `repo-${index}`,
  }
}

function maximumConfirmedReasons() {
  return [
    ...Array.from({ length: 8 }, (_, index) => makeConfirmedReason({
      code: "remote_branch_deleted",
      occurred_at: PHASE127_TIMES.observedAt,
      provider: undefined,
      ...repositoryIdentity(index + 1),
    })),
    ...Array.from({ length: 8 }, (_, index) => makeConfirmedReason({
      code: "managed_worktree_missing",
      occurred_at: PHASE127_TIMES.observedAt,
      provider: undefined,
      ...repositoryIdentity(index + 1),
    })),
    makeConfirmedReason(),
    makeConfirmedReason({
      code: "inactive",
      occurred_at: PHASE127_TIMES.beforeCutoff,
      repository_id: undefined,
      repository_name: undefined,
      provider: undefined,
    }),
  ]
}

function maximumUnknownEvidence() {
  return [
    ...Array.from({ length: 8 }, (_, index) => makeUnknownEvidence({
      code: "remote_check_failed",
      provider: undefined,
      ...repositoryIdentity(index + 1),
    })),
    ...Array.from({ length: 8 }, (_, index) => makeUnknownEvidence({
      code: "worktree_inaccessible",
      provider: undefined,
      ...repositoryIdentity(index + 1),
    })),
    makeUnknownEvidence(),
    makeUnknownEvidence({
      code: "activity_unavailable",
      repository_id: undefined,
      repository_name: undefined,
      provider: undefined,
    }),
  ]
}

function maximumCautions() {
  return [
    ...Array.from({ length: 8 }, (_, index) => makeCaution({
      code: "dirty_worktree",
      ...repositoryIdentity(index + 1),
    })),
    ...Array.from({ length: 8 }, (_, index) => makeCaution({
      code: "ahead_of_remote",
      count: index + 1,
      ...repositoryIdentity(index + 1),
    })),
    ...Array.from({ length: 8 }, (_, index) => makeCaution({
      code: "workspace_drift",
      ...repositoryIdentity(index + 1),
    })),
    makeCaution({
      code: "notes_present",
      count: 1,
      repository_id: undefined,
      repository_name: undefined,
    }),
  ]
}

function expectRejected(schema: RuntimeSchema, values: readonly unknown[]) {
  for (const value of values) expect(schema.safeParse(value).success).toBe(false)
}

describe("Phase 127 deterministic stale fixtures", () => {
  test("encodes strict cutoff, duplicate, unknown-only, caution-only, malformed-activity, and normalized-name edges", () => {
    expect(PHASE127_EDGE_FIXTURES.strictCutoff.exactly_at_cutoff.last_opened).toBe(PHASE127_TIMES.cutoff)
    expect(PHASE127_EDGE_FIXTURES.strictCutoff.one_millisecond_before.last_opened).toBe(PHASE127_TIMES.beforeCutoff)
    expect(PHASE127_EDGE_FIXTURES.strictCutoff.one_millisecond_after.last_opened).toBe(PHASE127_TIMES.afterCutoff)
    expect(PHASE127_EDGE_FIXTURES.duplicateReason).toHaveLength(3)
    expect(PHASE127_EDGE_FIXTURES.duplicateReason[0]).toEqual(PHASE127_EDGE_FIXTURES.duplicateReason[1])
    expect(PHASE127_EDGE_FIXTURES.unknownOnly.unknown_evidence).toHaveLength(1)
    expect(PHASE127_EDGE_FIXTURES.cautionOnly.cautions.map(({ code }) => code)).toEqual(CAUTION_CODES)
    expect(PHASE127_EDGE_FIXTURES.malformedActivity.last_opened).toBe("not-an-iso-timestamp")
    expect(PHASE127_EDGE_FIXTURES.normalizedNames.map(({ name }) => normalizeWorkspaceName(name))).toEqual([
      "alpha",
      "alpha",
      "zulu",
    ])
  })

  test("controls time, deferred probe order, and bounded concurrency without external processes", async () => {
    const clock = createIsoClock()
    expect(clock.iso()).toBe(PHASE127_TIMES.checkedAt)
    expect(clock.advance(299_999)).toBe("2026-07-17T12:04:59.999Z")
    expect(clock.advance(1)).toBe("2026-07-17T12:05:00.000Z")

    const first = createDeferred<string>()
    const second = createDeferred<string>()
    const counter = createConcurrencyCounter()
    const results = Promise.all([
      counter.run(() => first.promise),
      counter.run(() => second.promise),
    ])
    await Promise.resolve()
    expect(counter.active).toBe(2)
    expect(counter.maximum).toBe(2)
    second.resolve("newer")
    first.resolve("older")
    await expect(results).resolves.toEqual(["older", "newer"])
    expect(counter.active).toBe(0)
    expect(counter.calls).toBe(2)
  })

  test("exports disclosure canaries and mutation sentinels that fail on forbidden authority", () => {
    expect(PHASE127_DISCLOSURE_CANARIES).toMatchObject({
      path: expect.stringContaining("/home/"),
      argv: expect.any(Array),
      stdout: expect.any(String),
      stderr: expect.any(String),
      environment: expect.any(Object),
    })
    const untouched = createMutationSentinels()
    expect(untouched.assertUntouched()).toBeUndefined()
    expect(Object.values(untouched.calls).every((count) => count === 0)).toBe(true)

    const hostile = createMutationSentinels()
    expect(() => hostile.archiveWorkspace(PHASE127_IDS.workspaces.merged)).toThrow(/forbidden archive capability/i)
    expect(hostile.calls.archive).toBe(1)
    expect(() => hostile.assertUntouched()).toThrow(/archive/i)
  })
})

describe("Phase 127 stale workspace runtime protocol contract", () => {
  test("exports every request, response, row, and nested evidence schema at runtime", () => {
    for (const name of EXPECTED_SCHEMA_EXPORTS) runtimeExport(name)
  })

  test("accepts only a strict revision-bound request with an explicit force-refresh boolean", () => {
    const schema = runtimeExport("WebStaleWorkspaceRequestSchema")
    expect(schema.parse({ expected_revision: "7", force_refresh: false })).toEqual({
      expected_revision: "7",
      force_refresh: false,
    })
    expect(schema.parse({ expected_revision: "0", force_refresh: true })).toEqual({
      expected_revision: "0",
      force_refresh: true,
    })
    expectRejected(schema, [
      null,
      undefined,
      {},
      { expected_revision: "7" },
      { force_refresh: false },
      { expected_revision: 7, force_refresh: false },
      { expected_revision: "01", force_refresh: false },
      { expected_revision: "-1", force_refresh: false },
      { expected_revision: "7", force_refresh: "false" },
      { expected_revision: "7", force_refresh: false, workspace_id: PHASE127_IDS.workspaces.merged },
      { expected_revision: "7", force_refresh: false, path: PHASE127_DISCLOSURE_CANARIES.path },
    ])
  })

  test("round-trips one atomic response for zero, one, and maximum bounded rows", () => {
    const schema = runtimeExport("WebStaleWorkspaceResponseSchema")
    const empty = makeStaleResponse({ candidates: [], incomplete: [] })
    expect(schema.parse(empty)).toEqual(empty)

    const one = makeStaleResponse()
    expect(schema.parse(one)).toEqual(one)

    const maximum = makeStaleResponse({
      candidates: Array.from({ length: LIMITS.workspaces }, (_, index) => candidate(index + 1)),
      incomplete: Array.from({ length: LIMITS.workspaces }, (_, index) => incomplete(index + 1)),
    })
    expect(schema.parse(maximum)).toEqual(maximum)
  })

  test("rejects extra keys at the response, candidate, incomplete, reason, unknown, and caution levels", () => {
    const responseSchema = runtimeExport("WebStaleWorkspaceResponseSchema")
    const candidateSchema = runtimeExport("WebStaleWorkspaceCandidateSchema")
    const incompleteSchema = runtimeExport("WebStaleWorkspaceIncompleteSchema")
    const reasonSchema = runtimeExport("WebStaleWorkspaceConfirmedReasonSchema")
    const unknownSchema = runtimeExport("WebStaleWorkspaceUnknownEvidenceSchema")
    const cautionSchema = runtimeExport("WebStaleWorkspaceCautionSchema")
    const response = makeStaleResponse()
    const candidateRow = makeCandidateRow()
    const incompleteRow = makeIncompleteRow({
      unknown_evidence: [makeUnknownEvidence({
        code: "activity_unavailable",
        repository_id: undefined,
        repository_name: undefined,
        provider: undefined,
      })],
    })
    const reason = makeConfirmedReason()
    const unknown = makeUnknownEvidence()
    const caution = makeCaution()

    expect(responseSchema.safeParse({ ...response, generated_at: response.checked_at }).success).toBe(false)
    expect(candidateSchema.safeParse({ ...candidateRow, stale: true }).success).toBe(false)
    expect(incompleteSchema.safeParse({ ...incompleteRow, confirmed_reasons: [] }).success).toBe(false)
    expect(reasonSchema.safeParse({ ...reason, message: "safe to delete" }).success).toBe(false)
    expect(unknownSchema.safeParse({ ...unknown, error: "provider failed" }).success).toBe(false)
    expect(cautionSchema.safeParse({ ...caution, suppresses_candidate: true }).success).toBe(false)
  })

  test("requires confirmed evidence for candidates and unknown evidence for incomplete rows", () => {
    const candidateSchema = runtimeExport("WebStaleWorkspaceCandidateSchema")
    const incompleteSchema = runtimeExport("WebStaleWorkspaceIncompleteSchema")
    const candidateRow = makeCandidateRow()
    const incompleteRow = makeIncompleteRow({
      unknown_evidence: [makeUnknownEvidence({
        code: "activity_unavailable",
        repository_id: undefined,
        repository_name: undefined,
        provider: undefined,
      })],
    })

    expect(candidateSchema.parse(candidateRow)).toEqual(candidateRow)
    expect(incompleteSchema.parse(incompleteRow)).toEqual(incompleteRow)
    expect(candidateSchema.safeParse({ ...candidateRow, confirmed_reasons: [] }).success).toBe(false)
    expect(incompleteSchema.safeParse({ ...incompleteRow, unknown_evidence: [] }).success).toBe(false)
    expect(incompleteSchema.safeParse({ ...incompleteRow, confirmed_reasons: [makeConfirmedReason()] }).success).toBe(false)
    expect(incompleteSchema.safeParse({ ...incompleteRow, actions: ["workspace.archive"] }).success).toBe(false)
    expect(incompleteSchema.safeParse({ ...incompleteRow, force_allowed: true }).success).toBe(false)
  })

  test("freezes finite confirmed-reason codes with honest provider, observation, and activity timestamps", () => {
    const schema = runtimeExport("WebStaleWorkspaceConfirmedReasonSchema")
    const valid = [
      makeConfirmedReason(),
      makeConfirmedReason({ code: "closed", occurred_at: PHASE127_TIMES.closedAt }),
      makeConfirmedReason({ code: "remote_branch_deleted", occurred_at: PHASE127_TIMES.observedAt, provider: undefined }),
      makeConfirmedReason({ code: "managed_worktree_missing", occurred_at: PHASE127_TIMES.observedAt, provider: undefined }),
      makeConfirmedReason({
        code: "inactive",
        occurred_at: PHASE127_TIMES.beforeCutoff,
        repository_id: undefined,
        repository_name: undefined,
        provider: undefined,
      }),
    ]
    expect(valid.map((reason) => schema.parse(reason))).toEqual(valid)
    expect(new Set(valid.map(({ code }) => code))).toEqual(new Set(CONFIRMED_REASON_CODES))
    expectRejected(schema, [
      { ...valid[0], code: "safe_to_delete" },
      { ...valid[0], code: "open" },
      { ...valid[0], occurred_at: "2026-07-10" },
      { ...valid[0], occurred_at: "not-a-time" },
      { ...valid[0], provider: "gitea" },
      { ...valid[2], repository_name: undefined },
      { ...valid[2], repository_id: undefined },
      { ...valid[4], repository_id: PHASE127_IDS.repositories.app },
      { ...valid[4], provider: "github" },
      { ...valid[0], score: 0.99 },
      { ...valid[0], confidence: "high" },
    ])
  })

  test("freezes finite unknown evidence without converting failures into confirmed absence", () => {
    const schema = runtimeExport("WebStaleWorkspaceUnknownEvidenceSchema")
    const providerUnknown = makeUnknownEvidence()
    const remoteUnknown = makeUnknownEvidence({ code: "remote_check_failed", provider: undefined })
    const worktreeUnknown = makeUnknownEvidence({ code: "worktree_inaccessible", provider: undefined })
    const activityUnknown = makeUnknownEvidence({
      code: "activity_unavailable",
      repository_id: undefined,
      repository_name: undefined,
      provider: undefined,
    })
    for (const code of UNKNOWN_EVIDENCE_CODES) {
      const value = code === "remote_check_failed" || code === "worktree_inaccessible" || code === "probe_superseded"
        ? { ...remoteUnknown, code }
        : code === "activity_unavailable" || code === "invalid_provenance" || code === "unsupported_provider"
          ? { ...activityUnknown, code }
          : { ...providerUnknown, code }
      expect((schema.parse(value) as { code: string }).code).toBe(code)
    }
    expect(schema.parse(remoteUnknown)).toEqual(remoteUnknown)
    expect(schema.parse(worktreeUnknown)).toEqual(worktreeUnknown)
    expect(schema.parse(activityUnknown)).toEqual(activityUnknown)
    expectRejected(schema, [
      { ...providerUnknown, code: "branch_missing" },
      { ...providerUnknown, code: "closed" },
      { ...providerUnknown, observed_at: "not-a-time" },
      { ...providerUnknown, provider: "gitea" },
      { ...remoteUnknown, repository_name: undefined },
      { ...remoteUnknown, repository_id: undefined },
      { ...providerUnknown, confirmed: true },
      { ...providerUnknown, raw_error: PHASE127_DISCLOSURE_CANARIES.rawError },
    ])
  })

  test("freezes caution codes that neither qualify nor suppress a workspace", () => {
    const schema = runtimeExport("WebStaleWorkspaceCautionSchema")
    const valid = [
      makeCaution(),
      makeCaution({ code: "ahead_of_remote", count: 2 }),
      makeCaution({ code: "workspace_drift" }),
      makeCaution({
        code: "notes_present",
        count: 3,
        repository_id: undefined,
        repository_name: undefined,
      }),
    ]
    expect(valid.map((caution) => schema.parse(caution))).toEqual(valid)
    expect(new Set(valid.map(({ code }) => code))).toEqual(new Set(CAUTION_CODES))
    expectRejected(schema, [
      { ...valid[0], code: "safe_to_remove" },
      { ...valid[0], qualifies: true },
      { ...valid[0], suppresses: true },
      { ...valid[1], count: -1 },
      { ...valid[1], count: 1.5 },
      { ...valid[0], repository_name: undefined },
      { ...valid[3], repository_id: PHASE127_IDS.repositories.app },
    ])
  })

  test("enforces UTF-8 workspace and repository identity bounds", () => {
    const candidateSchema = runtimeExport("WebStaleWorkspaceCandidateSchema")
    const reasonSchema = runtimeExport("WebStaleWorkspaceConfirmedReasonSchema")
    const candidateRow = makeCandidateRow()
    const reason = makeConfirmedReason()
    const exactlyWorkspace = "w".repeat(LIMITS.workspaceNameBytes)
    const exactlyRepository = "r".repeat(LIMITS.repositoryNameBytes)

    expect(candidateSchema.safeParse({ ...candidateRow, workspace_name: exactlyWorkspace }).success).toBe(true)
    expect(reasonSchema.safeParse({ ...reason, repository_name: exactlyRepository }).success).toBe(true)
    expectRejected(candidateSchema, [
      { ...candidateRow, workspace_name: "w".repeat(LIMITS.workspaceNameBytes + 1) },
      { ...candidateRow, workspace_name: "é".repeat((LIMITS.workspaceNameBytes / 2) + 1) },
      { ...candidateRow, workspace_name: PHASE127_DISCLOSURE_CANARIES.path },
      { ...candidateRow, workspace_name: PHASE127_DISCLOSURE_CANARIES.windowsPath },
    ])
    expectRejected(reasonSchema, [
      { ...reason, repository_name: "r".repeat(LIMITS.repositoryNameBytes + 1) },
      { ...reason, repository_name: PHASE127_DISCLOSURE_CANARIES.path },
      { ...reason, repository_name: PHASE127_DISCLOSURE_CANARIES.windowsPath },
    ])
  })

  test("enforces every candidate, incomplete, reason, unknown, and caution collection bound", () => {
    const responseSchema = runtimeExport("WebStaleWorkspaceResponseSchema")
    const candidateSchema = runtimeExport("WebStaleWorkspaceCandidateSchema")
    const incompleteSchema = runtimeExport("WebStaleWorkspaceIncompleteSchema")
    const reasons = maximumConfirmedReasons()
    const unknowns = maximumUnknownEvidence()
    const cautions = maximumCautions()

    expect(reasons).toHaveLength(LIMITS.confirmedReasons)
    expect(unknowns).toHaveLength(LIMITS.unknownEvidence)
    expect(cautions).toHaveLength(LIMITS.cautions)
    expect(candidateSchema.safeParse(makeCandidateRow({
      confirmed_reasons: reasons,
      unknown_evidence: unknowns,
      cautions,
    })).success).toBe(true)
    expect(incompleteSchema.safeParse(makeIncompleteRow({
      unknown_evidence: unknowns,
      cautions,
    })).success).toBe(true)

    expect(responseSchema.safeParse(makeStaleResponse({
      candidates: Array.from({ length: LIMITS.workspaces + 1 }, (_, index) => candidate(index + 1)),
      incomplete: [],
    })).success).toBe(false)
    expect(responseSchema.safeParse(makeStaleResponse({
      candidates: [],
      incomplete: Array.from({ length: LIMITS.workspaces + 1 }, (_, index) => incomplete(index + 1)),
    })).success).toBe(false)
    expect(candidateSchema.safeParse(makeCandidateRow({
      confirmed_reasons: [...reasons, makeConfirmedReason({
        code: "remote_branch_deleted",
        provider: undefined,
        ...repositoryIdentity(9),
      })],
    })).success).toBe(false)
    expect(candidateSchema.safeParse(makeCandidateRow({
      unknown_evidence: [...unknowns, makeUnknownEvidence({
        code: "remote_check_failed",
        provider: undefined,
        ...repositoryIdentity(9),
      })],
    })).success).toBe(false)
    expect(candidateSchema.safeParse(makeCandidateRow({
      cautions: [...cautions, makeCaution({
        code: "dirty_worktree",
        ...repositoryIdentity(9),
      })],
    })).success).toBe(false)
  })

  test("requires literal threshold, valid revisions, and offset-aware timestamps throughout", () => {
    const responseSchema = runtimeExport("WebStaleWorkspaceResponseSchema")
    const candidateSchema = runtimeExport("WebStaleWorkspaceCandidateSchema")
    const response = makeStaleResponse()
    const candidateRow = makeCandidateRow()

    expectRejected(responseSchema, [
      { ...response, revision: "01" },
      { ...response, revision: -1 },
      { ...response, checked_at: "2026-07-17" },
      { ...response, checked_at: "2026-07-17T12:00:00" },
      { ...response, checked_at: "not-a-time" },
      { ...response, threshold_days: 29 },
      { ...response, threshold_days: 31 },
      { ...response, threshold_days: Number.POSITIVE_INFINITY },
    ])
    expect(candidateSchema.safeParse({ ...candidateRow, activity_at: null }).success).toBe(true)
    expectRejected(candidateSchema, [
      { ...candidateRow, activity_at: "2026-07-01" },
      { ...candidateRow, activity_at: "2026-07-01T10:00:00" },
      { ...candidateRow, activity_at: "invalid" },
    ])
  })

  test("rejects duplicate scoped evidence and duplicate or cross-section workspace identities", () => {
    const responseSchema = runtimeExport("WebStaleWorkspaceResponseSchema")
    const candidateSchema = runtimeExport("WebStaleWorkspaceCandidateSchema")
    const response = makeStaleResponse()
    const reason = makeConfirmedReason({ code: "remote_branch_deleted", provider: undefined })
    const unknown = makeUnknownEvidence({ code: "remote_check_failed", provider: undefined })
    const caution = makeCaution()

    expect(candidateSchema.safeParse(makeCandidateRow({ confirmed_reasons: [reason, { ...reason }] })).success).toBe(false)
    expect(candidateSchema.safeParse(makeCandidateRow({ unknown_evidence: [unknown, { ...unknown }] })).success).toBe(false)
    expect(candidateSchema.safeParse(makeCandidateRow({ cautions: [caution, { ...caution }] })).success).toBe(false)
    expect(responseSchema.safeParse({ ...response, candidates: [candidate(1), candidate(1)] }).success).toBe(false)
    expect(responseSchema.safeParse({ ...response, incomplete: [incomplete(1), incomplete(1)] }).success).toBe(false)
    expect(responseSchema.safeParse({
      ...response,
      candidates: [candidate(1)],
      incomplete: [{ ...incomplete(1), workspace_id: candidate(1).workspace_id }],
    }).success).toBe(false)
  })

  test("rejects path, raw-error, argv, output, credential, environment, command, score, and mutation fields", () => {
    const responseSchema = runtimeExport("WebStaleWorkspaceResponseSchema")
    const candidateSchema = runtimeExport("WebStaleWorkspaceCandidateSchema")
    const incompleteSchema = runtimeExport("WebStaleWorkspaceIncompleteSchema")
    const reasonSchema = runtimeExport("WebStaleWorkspaceConfirmedReasonSchema")
    const unknownSchema = runtimeExport("WebStaleWorkspaceUnknownEvidenceSchema")
    const cautionSchema = runtimeExport("WebStaleWorkspaceCautionSchema")
    const response = makeStaleResponse()
    const candidateRow = makeCandidateRow()
    const incompleteRow = makeIncompleteRow({
      unknown_evidence: [makeUnknownEvidence({
        code: "activity_unavailable",
        repository_id: undefined,
        repository_name: undefined,
        provider: undefined,
      })],
    })
    const reason = makeConfirmedReason()
    const unknown = makeUnknownEvidence()
    const caution = makeCaution()
    const forbidden = {
      path: PHASE127_DISCLOSURE_CANARIES.path,
      main_path: PHASE127_DISCLOSURE_CANARIES.path,
      task_path: PHASE127_DISCLOSURE_CANARIES.path,
      raw_error: PHASE127_DISCLOSURE_CANARIES.rawError,
      error: PHASE127_DISCLOSURE_CANARIES.rawError,
      argv: PHASE127_DISCLOSURE_CANARIES.argv,
      stdout: PHASE127_DISCLOSURE_CANARIES.stdout,
      stderr: PHASE127_DISCLOSURE_CANARIES.stderr,
      credential: PHASE127_DISCLOSURE_CANARIES.credential,
      bearer: PHASE127_DISCLOSURE_CANARIES.bearer,
      environment: PHASE127_DISCLOSURE_CANARIES.environment,
      command: PHASE127_DISCLOSURE_CANARIES.command,
      score: 0.99,
      confidence: "high",
      safe_to_delete: true,
      archive: true,
      remove: true,
      force_allowed: true,
    }

    for (const [key, value] of Object.entries(forbidden)) {
      expect(responseSchema.safeParse({ ...response, [key]: value }).success, `response must reject ${key}`).toBe(false)
      expect(candidateSchema.safeParse({ ...candidateRow, [key]: value }).success, `candidate must reject ${key}`).toBe(false)
      expect(incompleteSchema.safeParse({ ...incompleteRow, [key]: value }).success, `incomplete must reject ${key}`).toBe(false)
      expect(reasonSchema.safeParse({ ...reason, [key]: value }).success, `reason must reject ${key}`).toBe(false)
      expect(unknownSchema.safeParse({ ...unknown, [key]: value }).success, `unknown must reject ${key}`).toBe(false)
      expect(cautionSchema.safeParse({ ...caution, [key]: value }).success, `caution must reject ${key}`).toBe(false)
    }
  })
})
