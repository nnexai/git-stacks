import { beforeAll, describe, expect, test } from "@test/api"

import {
  createOperationTracker,
  createWorkspaceActionRegistry,
  workspaceActionLabel,
} from "../../packages/client/src/index"
import type {
  WebOperationSummary,
  WebWorkspaceAction,
  WebWorkspaceActionId,
} from "../../packages/protocol/src/web"
import {
  PHASE127_ACTION_INVENTORIES,
  PHASE127_CLIENT_COPY,
  PHASE127_CLIENT_RESPONSES,
  PHASE127_FORBIDDEN_RENDER_TEXT,
  PHASE127_LIFECYCLE_OUTCOMES,
  assertPhase127RendererTextSafe,
  phase127WorkspaceOrder,
  type Phase127LifecycleDescriptor,
} from "../helpers/phase127-client-fixtures"
import {
  PHASE127_IDS,
  createDeferred,
  type Phase127StaleResponse,
} from "../helpers/phase127-stale-fixtures"

type PresentedTime = {
  iso: string
  exactUtc: string
  relative: string
}

type PresentedEvidence = {
  code: string
  label: string
  time?: PresentedTime
  repositoryName?: string
}

type PresentedStaleRow = {
  workspaceId: string
  workspaceName: string
  activity?: PresentedTime
  confirmedReasons: readonly PresentedEvidence[]
  unknownEvidence: readonly PresentedEvidence[]
  cautions: readonly PresentedEvidence[]
}

type StaleWorkspacePresentation = {
  revision: string
  checkedAt: PresentedTime
  candidateCount: number
  candidateCountLabel: string
  incompleteCount: number
  incompleteCountLabel: string
  candidates: readonly PresentedStaleRow[]
  incomplete: readonly PresentedStaleRow[]
}

type PresentStaleWorkspaceResponse = (
  response: Phase127StaleResponse,
  options?: { now?: number },
) => StaleWorkspacePresentation

type RendererAction = {
  actionId: Phase127LifecycleDescriptor["action_id"]
  label: string
  disabledReason?: string
}

type RendererRow = PresentedStaleRow & {
  section: "candidate" | "incomplete"
  actions: readonly RendererAction[]
  lifecycleDeniedReason?: string
}

type RendererModel = {
  revision: string
  checkedAt: PresentedTime
  candidateCountLabel: string
  incompleteCountLabel: string
  rows: readonly RendererRow[]
}

type AdaptStaleWorkspacePresentation = (
  presentation: StaleWorkspacePresentation,
  options: {
    inventories: Readonly<Record<string, readonly Phase127LifecycleDescriptor[]>>
  },
) => RendererModel

type StaleResponseToken = Readonly<{ generation: number; expectedRevision: string }>

type StaleWorkspaceResponseGate = {
  begin(expectedRevision: string): StaleResponseToken
  accepts(token: StaleResponseToken, response: Pick<Phase127StaleResponse, "revision">): boolean
  invalidate(): void
}

type CreateStaleWorkspaceResponseGate = () => StaleWorkspaceResponseGate

type StaleLoadResult =
  | { status: "accepted"; response: Phase127StaleResponse }
  | { status: "ignored"; reason: "superseded" | "revision-mismatch" }
  | { status: "failed"; error: unknown }

type StaleWorkspaceLoadCoordinator = {
  load(request: {
    expectedRevision: string
    forceRefresh: boolean
    signal?: AbortSignal
  }): Promise<StaleLoadResult>
  invalidate(): void
}

type CreateStaleWorkspaceLoadCoordinator = (options: {
  fetch(request: { expected_revision: string; force_refresh: boolean; signal?: AbortSignal }): Promise<Phase127StaleResponse>
  reloadAuthoritative(): Promise<string>
}) => StaleWorkspaceLoadCoordinator

type RuntimeModule = Record<string, unknown>

const SHARED_MODULE_URL = new URL(
  "../../packages/client/src/stale-workspaces.ts",
  import.meta.url,
).href
const WEB_MODULE_URL = new URL(
  "../../packages/web/src/stale-workspaces.ts",
  import.meta.url,
).href
const TUI_MODULE_URL = new URL(
  "../../packages/tui/src/StaleWorkspacesView.tsx",
  import.meta.url,
).href

let sharedModule: RuntimeModule | undefined
let sharedModuleLoadError: unknown
let webModule: RuntimeModule | undefined
let webModuleLoadError: unknown
let tuiModule: RuntimeModule | undefined
let tuiModuleLoadError: unknown

beforeAll(async () => {
  try {
    sharedModule = await import(/* @vite-ignore */ SHARED_MODULE_URL) as RuntimeModule
  } catch (error) {
    sharedModuleLoadError = error
  }
  try {
    webModule = await import(/* @vite-ignore */ WEB_MODULE_URL) as RuntimeModule
  } catch (error) {
    webModuleLoadError = error
  }
  try {
    tuiModule = await import(/* @vite-ignore */ TUI_MODULE_URL) as RuntimeModule
  } catch (error) {
    tuiModuleLoadError = error
  }
})

function sharedExports(): {
  present: PresentStaleWorkspaceResponse
  createGate: CreateStaleWorkspaceResponseGate
  createLoadCoordinator: CreateStaleWorkspaceLoadCoordinator
} {
  expect(
    sharedModuleLoadError,
    "Phase 127 client must provide packages/client/src/stale-workspaces.ts",
  ).toBeUndefined()
  const present = sharedModule?.presentStaleWorkspaceResponse
  const createGate = sharedModule?.createStaleWorkspaceResponseGate
  const createLoadCoordinator = sharedModule?.createStaleWorkspaceLoadCoordinator
  expect(
    present,
    "Phase 127 shared client module must export presentStaleWorkspaceResponse",
  ).toBeTypeOf("function")
  expect(
    createGate,
    "Phase 127 shared client module must export createStaleWorkspaceResponseGate",
  ).toBeTypeOf("function")
  expect(
    createLoadCoordinator,
    "Phase 127 shared client module must export createStaleWorkspaceLoadCoordinator",
  ).toBeTypeOf("function")
  return {
    present: present as PresentStaleWorkspaceResponse,
    createGate: createGate as CreateStaleWorkspaceResponseGate,
    createLoadCoordinator: createLoadCoordinator as CreateStaleWorkspaceLoadCoordinator,
  }
}

function rendererExports(): {
  web: AdaptStaleWorkspacePresentation
  tui: AdaptStaleWorkspacePresentation
} {
  expect(
    webModuleLoadError,
    "Phase 127 web must provide packages/web/src/stale-workspaces.ts",
  ).toBeUndefined()
  expect(
    tuiModuleLoadError,
    "Phase 127 TUI must provide packages/tui/src/StaleWorkspacesView.tsx",
  ).toBeUndefined()
  const web = webModule?.adaptWebStaleWorkspacePresentation
  const tui = tuiModule?.adaptTuiStaleWorkspacePresentation
  expect(
    web,
    "Phase 127 web stale module must export adaptWebStaleWorkspacePresentation",
  ).toBeTypeOf("function")
  expect(
    tui,
    "Phase 127 TUI stale module must export adaptTuiStaleWorkspacePresentation",
  ).toBeTypeOf("function")
  return {
    web: web as AdaptStaleWorkspacePresentation,
    tui: tui as AdaptStaleWorkspacePresentation,
  }
}

function conformanceModels(response = PHASE127_CLIENT_RESPONSES.populated) {
  const { present } = sharedExports()
  const adapters = rendererExports()
  const presentation = present(response, { now: Date.parse("2026-07-17T12:05:00.000Z") })
  const inventories = {
    [PHASE127_IDS.workspaces.merged]: PHASE127_ACTION_INVENTORIES.candidate,
  }
  return {
    presentation,
    web: adapters.web(presentation, { inventories }),
    tui: adapters.tui(presentation, { inventories }),
  }
}

function candidate(model: RendererModel, workspaceId = PHASE127_IDS.workspaces.merged): RendererRow {
  const row = model.rows.find((entry) => entry.workspaceId === workspaceId)
  expect(row, `Renderer must include workspace ${workspaceId}`).toBeDefined()
  return row!
}

function conflict(message = "workspace revision changed") {
  return Object.assign(new Error(message), { code: "conflict" })
}

function operation(overrides: Partial<WebOperationSummary> = {}): WebOperationSummary {
  return {
    operation_id: PHASE127_LIFECYCLE_OUTCOMES.acceptedOperation.operation_id,
    action_id: "workspace.remove",
    workspace_id: PHASE127_IDS.workspaces.merged,
    workspace_name: "zulu-service-first",
    accepted_at: "2026-07-17T12:05:00.000Z",
    state: "accepted",
    cancellation: { state: "unavailable", reason: "not_supported" },
    ...overrides,
  } as WebOperationSummary
}

function actionDescriptor(
  actionId: WebWorkspaceActionId,
  availability: WebWorkspaceAction["availability"] = { available: true },
): WebWorkspaceAction {
  return {
    action_id: actionId,
    subject: { kind: "workspace", workspace_id: PHASE127_IDS.workspaces.merged },
    availability,
    confirmation: actionId === "workspace.force-remove" ? "exact-name" : actionId === "workspace.remove" ? "confirm" : "none",
  }
}

describe("Phase 127 shared stale presentation availability", () => {
  test("loads shared, web, and TUI adapters through guarded lifecycle imports", () => {
    const shared = sharedExports()
    const renderers = rendererExports()
    expect(shared.present).toBeTypeOf("function")
    expect(shared.createGate).toBeTypeOf("function")
    expect(shared.createLoadCoordinator).toBeTypeOf("function")
    expect(renderers.web).toBeTypeOf("function")
    expect(renderers.tui).toBeTypeOf("function")
  })
})

describe("Phase 127 same-response cross-client presentation conformance", () => {
  test("shared presentation preserves service order, fixed labels, exact timestamps, and neutral evidence groups", () => {
    const { present } = sharedExports()
    const presentation = present(PHASE127_CLIENT_RESPONSES.populated, {
      now: Date.parse("2026-07-17T12:05:00.000Z"),
    })
    const expectedOrder = phase127WorkspaceOrder(PHASE127_CLIENT_RESPONSES.populated)
    expect(presentation.candidates.map(({ workspaceId }) => workspaceId)).toEqual(expectedOrder.slice(0, 2))
    expect(presentation.incomplete.map(({ workspaceId }) => workspaceId)).toEqual(expectedOrder.slice(2))
    expect(presentation.checkedAt).toEqual({
      iso: "2026-07-17T12:00:00.000Z",
      exactUtc: "2026-07-17 12:00:00 UTC",
      relative: "5m ago",
    })
    expect(presentation.candidates[0]?.confirmedReasons.map(({ label }) => label)).toEqual([
      PHASE127_CLIENT_COPY.reasonLabels.merged,
      "Remote branch missing in api",
      PHASE127_CLIENT_COPY.reasonLabels.inactive,
    ])
    expect(presentation.candidates[0]?.unknownEvidence[0]?.label).toBe(
      "Managed worktree status unknown for docs — service unavailable.",
    )
    expect(presentation.candidates[0]?.cautions.map(({ label }) => label)).toEqual([
      PHASE127_CLIENT_COPY.cautionLabels.dirty_worktree,
      PHASE127_CLIENT_COPY.cautionLabels.notes_present,
    ])
    expect(presentation).toMatchObject({
      candidateCount: 2,
      candidateCountLabel: "2 cleanup candidates",
      incompleteCount: 1,
      incompleteCountLabel: "1 incomplete evaluation",
    })
    expect(() => assertPhase127RendererTextSafe(JSON.stringify(presentation))).not.toThrow()
  })

  test("preserves service candidate and incomplete order without renderer sorting, filtering, or scores", () => {
    const { presentation, web, tui } = conformanceModels()
    const expectedOrder = phase127WorkspaceOrder(PHASE127_CLIENT_RESPONSES.populated)
    expect(presentation.candidates.map(({ workspaceId }) => workspaceId)).toEqual(expectedOrder.slice(0, 2))
    expect(presentation.incomplete.map(({ workspaceId }) => workspaceId)).toEqual(expectedOrder.slice(2))
    expect(web.rows.map(({ workspaceId }) => workspaceId)).toEqual(expectedOrder)
    expect(tui.rows.map(({ workspaceId }) => workspaceId)).toEqual(expectedOrder)
    expect(web.rows.map(({ workspaceName }) => workspaceName)).toEqual([
      "zulu-service-first",
      "alpha-service-second",
      "unknown-only-evaluation",
    ])
    expect(JSON.stringify({ web, tui }).toLocaleLowerCase("en-US")).not.toMatch(/(?:rank|score|confidence|safe_to_delete)/)
  })

  test("uses one fixed label table and identical exact UTC plus relative timestamps", () => {
    const { presentation, web, tui } = conformanceModels()
    expect(presentation.checkedAt).toEqual({
      iso: "2026-07-17T12:00:00.000Z",
      exactUtc: "2026-07-17 12:00:00 UTC",
      relative: "5m ago",
    })
    const webCandidate = candidate(web)
    const tuiCandidate = candidate(tui)
    expect(webCandidate.confirmedReasons).toEqual(tuiCandidate.confirmedReasons)
    expect(webCandidate.confirmedReasons.map(({ label }) => label)).toEqual([
      PHASE127_CLIENT_COPY.reasonLabels.merged,
      "Remote branch missing in api",
      PHASE127_CLIENT_COPY.reasonLabels.inactive,
    ])
    expect(webCandidate.confirmedReasons[0]?.time).toEqual({
      iso: "2026-07-10T09:30:00.000Z",
      exactUtc: "2026-07-10 09:30:00 UTC",
      relative: "7d ago",
    })
    expect(webCandidate.confirmedReasons.at(-1)?.time?.exactUtc).toBe("2026-05-28 07:10:00 UTC")
  })

  test("keeps confirmed reasons, unknown evidence, and cautions in separate neutral groups", () => {
    const { web, tui } = conformanceModels()
    for (const model of [web, tui]) {
      const row = candidate(model)
      expect(row.confirmedReasons.map(({ code }) => code)).toEqual(["merged", "remote_branch_deleted", "inactive"])
      expect(row.unknownEvidence.map(({ code }) => code)).toEqual(["worktree_inaccessible"])
      expect(row.cautions.map(({ code }) => code)).toEqual(["dirty_worktree", "notes_present"])
      expect(row.unknownEvidence[0]?.label).toBe("Managed worktree status unknown for docs — service unavailable.")
      expect(row.cautions.map(({ label }) => label)).toEqual([
        PHASE127_CLIENT_COPY.cautionLabels.dirty_worktree,
        PHASE127_CLIENT_COPY.cautionLabels.notes_present,
      ])
      expect(row.confirmedReasons.map(({ label }) => label).join(" ")).not.toContain("Caution")
      expect(row.cautions.map(({ label }) => label).join(" ")).not.toContain("stale reason")
    }
  })

  test("uses identical singular/plural counts and incomplete lifecycle denial copy", () => {
    const { presentation, web, tui } = conformanceModels()
    expect(presentation).toMatchObject({
      candidateCount: 2,
      candidateCountLabel: "2 cleanup candidates",
      incompleteCount: 1,
      incompleteCountLabel: "1 incomplete evaluation",
    })
    expect(web.candidateCountLabel).toBe(tui.candidateCountLabel)
    expect(web.incompleteCountLabel).toBe(tui.incompleteCountLabel)
    for (const model of [web, tui]) {
      const incomplete = model.rows.find(({ section }) => section === "incomplete")!
      expect(incomplete.actions.map(({ actionId }) => actionId)).toEqual(["workspace.open"])
      expect(incomplete.lifecycleDeniedReason).toBe(PHASE127_CLIENT_COPY.incompleteActions)
    }
  })

  test("renders canonical Open, Archive, Remove, then dirty-reauthorized Force ordering with disabled explanations unchanged", () => {
    const { present } = sharedExports()
    const adapters = rendererExports()
    const presentation = present(PHASE127_CLIENT_RESPONSES.populated, { now: Date.parse("2026-07-17T12:05:00.000Z") })
    const initialInventories = {
      [PHASE127_IDS.workspaces.merged]: PHASE127_ACTION_INVENTORIES.candidate,
    }
    const reauthorizedInventories = {
      [PHASE127_IDS.workspaces.merged]: [
        ...PHASE127_ACTION_INVENTORIES.candidate,
        ...PHASE127_ACTION_INVENTORIES.forceReauthorized,
      ],
    }
    for (const adapt of [adapters.web, adapters.tui]) {
      const initial = candidate(adapt(presentation, { inventories: initialInventories }))
      expect(initial.actions).toEqual([
        { actionId: "workspace.open", label: "Open workspace" },
        { actionId: "workspace.archive", label: "Archive workspace" },
        {
          actionId: "workspace.remove",
          label: "Remove workspace",
          disabledReason: "Uncommitted work must be reviewed before removal.",
        },
      ])
      const reauthorized = candidate(adapt(presentation, { inventories: reauthorizedInventories }))
      expect(reauthorized.actions.map(({ actionId }) => actionId)).toEqual([
        "workspace.open",
        "workspace.archive",
        "workspace.remove",
        "workspace.force-remove",
      ])
      expect(reauthorized.actions.at(-1)?.label).toBe("Force Remove")
    }
  })

  test("sanitizes every shared and renderer-visible field against paths, credentials, argv, output, environment, and safety claims", () => {
    const { presentation, web, tui } = conformanceModels(PHASE127_CLIENT_RESPONSES.many)
    const serialized = JSON.stringify({ presentation, web, tui })
    expect(() => assertPhase127RendererTextSafe(serialized)).not.toThrow()
    for (const canary of PHASE127_FORBIDDEN_RENDER_TEXT) {
      expect(serialized.toLocaleLowerCase("en-US")).not.toContain(canary.toLocaleLowerCase("en-US"))
    }
  })
})

describe("Phase 127 generation, conflict, and action reconciliation conformance", () => {
  test("load coordination ignores superseded and mismatched results while reporting abort and ordinary errors", async () => {
    const { createLoadCoordinator } = sharedExports()
    const older = createDeferred<Phase127StaleResponse>()
    const newer = createDeferred<Phase127StaleResponse>()
    let calls = 0
    const concurrent = createLoadCoordinator({
      fetch: async () => (++calls === 1 ? older.promise : newer.promise),
      reloadAuthoritative: async () => "7",
    })
    const oldLoad = concurrent.load({ expectedRevision: "7", forceRefresh: false })
    const newLoad = concurrent.load({ expectedRevision: "7", forceRefresh: true })
    newer.resolve(PHASE127_CLIENT_RESPONSES.populated)
    await expect(newLoad).resolves.toEqual({ status: "accepted", response: PHASE127_CLIENT_RESPONSES.populated })
    older.resolve(PHASE127_CLIENT_RESPONSES.populated)
    await expect(oldLoad).resolves.toEqual({ status: "ignored", reason: "superseded" })

    const mismatched = createLoadCoordinator({
      fetch: async () => PHASE127_CLIENT_RESPONSES.refreshed,
      reloadAuthoritative: async () => "8",
    })
    await expect(mismatched.load({ expectedRevision: "7", forceRefresh: false })).resolves.toEqual({
      status: "ignored",
      reason: "revision-mismatch",
    })

    const ordinaryError = new Error("ordinary failure")
    const failed = createLoadCoordinator({
      fetch: async () => { throw ordinaryError },
      reloadAuthoritative: async () => "8",
    })
    await expect(failed.load({ expectedRevision: "7", forceRefresh: false })).resolves.toEqual({
      status: "failed",
      error: ordinaryError,
    })

    const controller = new AbortController()
    const abortError = new Error("aborted")
    controller.abort(abortError)
    const aborted = createLoadCoordinator({
      fetch: async (request) => {
        expect(request.signal).toBe(controller.signal)
        throw request.signal?.reason
      },
      reloadAuthoritative: async () => "8",
    })
    await expect(aborted.load({
      expectedRevision: "7",
      forceRefresh: true,
      signal: controller.signal,
    })).resolves.toEqual({ status: "failed", error: abortError })
  })

  test("shared generation gate rejects late, mismatched, and post-exit responses", () => {
    const { createGate } = sharedExports()
    const gate = createGate()
    const older = gate.begin("7")
    const current = gate.begin("7")
    expect(gate.accepts(older, PHASE127_CLIENT_RESPONSES.populated)).toBe(false)
    expect(gate.accepts(current, PHASE127_CLIENT_RESPONSES.refreshed)).toBe(false)
    expect(gate.accepts(current, PHASE127_CLIENT_RESPONSES.populated)).toBe(true)
    gate.invalidate()
    expect(gate.accepts(current, PHASE127_CLIENT_RESPONSES.populated)).toBe(false)
  })

  test("one conflict reloads authoritative state and retries once; a second conflict fails without a loop", async () => {
    const { createLoadCoordinator } = sharedExports()
    const requests: Array<{ expected_revision: string; force_refresh: boolean }> = []
    let reloads = 0
    const recovered = createLoadCoordinator({
      fetch: async (request) => {
        requests.push(request)
        if (requests.length === 1) throw conflict()
        return PHASE127_CLIENT_RESPONSES.refreshed
      },
      reloadAuthoritative: async () => { reloads += 1; return "8" },
    })
    await expect(recovered.load({ expectedRevision: "7", forceRefresh: true })).resolves.toEqual({
      status: "accepted",
      response: PHASE127_CLIENT_RESPONSES.refreshed,
    })
    expect(requests).toEqual([
      { expected_revision: "7", force_refresh: true },
      { expected_revision: "8", force_refresh: true },
    ])
    expect(reloads).toBe(1)

    let failedCalls = 0
    let failedReloads = 0
    const failed = createLoadCoordinator({
      fetch: async () => { failedCalls += 1; throw conflict("again") },
      reloadAuthoritative: async () => { failedReloads += 1; return "8" },
    })
    const result = await failed.load({ expectedRevision: "7", forceRefresh: false })
    expect(result.status).toBe("failed")
    expect(failedCalls).toBe(2)
    expect(failedReloads).toBe(1)
  })

  test("rapid Open and lifecycle inputs share the canonical synchronous latch", async () => {
    sharedExports()
    const release = createDeferred<{ kind: "operation"; operationId: string }>()
    let confirmations = 0
    let transports = 0
    const descriptors = [
      actionDescriptor("workspace.open"),
      actionDescriptor("workspace.archive"),
      actionDescriptor("workspace.remove"),
    ]
    const callbacks = {
      "workspace.open": async () => { transports += 1; return release.promise },
      "workspace.archive": async () => { transports += 1; return release.promise },
      "workspace.remove": async () => { transports += 1; return release.promise },
    } as never
    const registry = createWorkspaceActionRegistry(descriptors, callbacks, {
      confirm: async () => { confirmations += 1; return true },
    })

    const first = registry.entry("workspace.open")!.pointer.callback()
    await expect(registry.entry("workspace.open")!.keyboard.callback()).resolves.toEqual({ status: "pending" })
    await expect(registry.entry("workspace.open")!.menu.callback()).resolves.toEqual({ status: "pending" })
    expect(transports).toBe(1)
    expect(confirmations).toBe(0)
    release.resolve({ kind: "operation", operationId: PHASE127_LIFECYCLE_OUTCOMES.acceptedOperation.operation_id })
    await expect(first).resolves.toEqual({
      status: "submitted",
      operationId: PHASE127_LIFECYCLE_OUTCOMES.acceptedOperation.operation_id,
    })
    expect(workspaceActionLabel("workspace.open")).toBe("Open workspace")
  })

  test("reconnect observes only the returned durable operation ID and terminal reconciliation never replays mutation intent", async () => {
    sharedExports()
    const submissions: unknown[] = []
    const observed: string[] = []
    let refreshes = 0
    const tracker = createOperationTracker({
      submit: async (intent: unknown) => {
        submissions.push(intent)
        return operation()
      },
      get: async (operationId) => {
        observed.push(operationId)
        return operation({ state: "running", started_at: "2026-07-17T12:05:01.000Z", progress: { stage: "removing" } })
      },
      cancel: async (operationId) => ({ operation_id: operationId, outcome: "not-cancellable", operation_state: "running" }),
      refresh: async () => { refreshes += 1 },
    })
    await tracker.submit({ kind: "workspace.remove", confirmation_name: "must-not-be-retained-after-submit" })
    await tracker.reconnect()
    await tracker.observe(operation({
      state: "succeeded",
      started_at: "2026-07-17T12:05:01.000Z",
      finished_at: "2026-07-17T12:05:02.000Z",
      completed_steps: ["workspace_removed"],
    }))
    expect(submissions).toHaveLength(1)
    expect(observed).toEqual([PHASE127_LIFECYCLE_OUTCOMES.acceptedOperation.operation_id])
    expect(refreshes).toBe(1)
    expect(JSON.stringify(tracker.state())).not.toContain("confirmation_name")
    expect(JSON.stringify(tracker.state())).not.toContain("must-not-be-retained")
  })
})
