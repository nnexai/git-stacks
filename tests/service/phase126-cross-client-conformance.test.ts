import { readFileSync } from "node:fs"
import { describe, expect, test } from "@test/api"
import {
  createForgeReviewCoordinator,
  createOperationTracker,
  createWorkspaceActionRegistry,
  workspaceActionLabel,
  type WorkspaceActionCallback,
} from "../../packages/client/src/index"
import {
  WEB_WORKSPACE_ACTION_IDS,
  WebFileEntrySchema,
  WebForgeTerminologySchema,
  WebNotesResponseSchema,
  WebWorkspaceActionInventorySchema,
  WebWorkspaceActionSchema,
  type WebForgeResolveResponse,
  type WebOperationSummary,
  type WebWorkspaceAction,
  type WebWorkspaceActionId,
} from "../../packages/protocol/src/web"
import {
  WEB_WORKSPACE_ACTION_GROUPS,
  workspaceActionMenuRows,
} from "../../packages/web/src/navigation"
import {
  TUI_WORKSPACE_ACTION_PRESENTATION,
  createWorkspaceActionInventoryGate,
  tuiWorkspaceActionRows,
} from "../../packages/tui/src/workspace-action-inventory"

const workspaceId = "018f47f4-5ab1-7c2d-8e90-123456789abc"
const operationId = "op_1234567890abcdef"
const acceptedAt = "2026-07-17T09:00:00.000Z"
const startedAt = "2026-07-17T09:00:01.000Z"
const finishedAt = "2026-07-17T09:00:02.000Z"

function confirmationFor(actionId: WebWorkspaceActionId): WebWorkspaceAction["confirmation"] {
  if (actionId === "workspace.force-remove") return "exact-name"
  if (actionId === "workspace.remove" || actionId === "workspace.merge" || actionId === "workspace.notes.clear") return "confirm"
  return "none"
}

function descriptor(
  actionId: WebWorkspaceActionId,
  availability: WebWorkspaceAction["availability"] = { available: true },
): WebWorkspaceAction {
  return {
    action_id: actionId,
    subject: actionId === "operation.cancel"
      ? { kind: "operation", workspace_id: workspaceId, operation_id: operationId }
      : { kind: "workspace", workspace_id: workspaceId },
    availability,
    confirmation: confirmationFor(actionId),
    ...(!availability.available && availability.reason === "operation_in_progress"
      ? { pending_operation_id: operationId }
      : {}),
  }
}

function acceptedOperation(overrides: Partial<WebOperationSummary> = {}): WebOperationSummary {
  return {
    operation_id: operationId,
    action_id: "workspace.sync",
    workspace_id: workspaceId,
    workspace_name: "phase-126",
    accepted_at: acceptedAt,
    state: "accepted",
    cancellation: { state: "available" },
    ...overrides,
  } as WebOperationSummary
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const forgeUrl = "https://github.com/acme/repo/pull/42"
const forgeResolution: Extract<WebForgeResolveResponse, { resolved: true }> = {
  resolved: true,
  token: `review_${"a".repeat(43)}`,
  expires_at: "2026-07-17T10:00:00.000Z",
  revision: "12",
  source: {
    provider: "github",
    change_kind: "pull_request",
    change_number: 42,
    web_url: forgeUrl,
    host: "github.com",
    target_repository: "acme/repo",
    source_repository: "fork/repo",
    source_branch: "feature",
    target_branch: "main",
    head_sha: "a".repeat(40),
    cross_repository: true,
    confidence: "provider",
  },
  terminology: {
    provider: "github",
    change: "Pull request",
    source_branch: "Head branch",
    target_branch: "Base branch",
  },
  candidates: {
    templates: [{
      name: "default",
      repositories: [{ repository_id: "11111111-1111-4111-8111-111111111111", name: "repo", mode: "worktree", matched_source: true }],
    }],
    source_repositories: [{ repository_id: "11111111-1111-4111-8111-111111111111", name: "repo", mode: "worktree", matched_source: true }],
  },
  draft: {
    workspace_name: "review-42",
    template_name: "default",
    matched_source_repository_id: "11111111-1111-4111-8111-111111111111",
    repositories: [{
      repository_id: "11111111-1111-4111-8111-111111111111",
      included: true,
      branch: { base_branch: "main", workspace_branch: "feature" },
    }],
  },
}

describe("Phase 126 cross-client action conformance", () => {
  test("web and TUI derive labels, groups, disabled reasons, and callback identity from the same descriptors", async () => {
    const unavailable = { available: false, reason: "remote_unavailable", message: "No remote is available." } as const
    const descriptors = WEB_WORKSPACE_ACTION_IDS.map((actionId) => descriptor(
      actionId,
      actionId === "workspace.push" ? unavailable : { available: true },
    ))
    const calls: Array<{ actionId: WebWorkspaceActionId; source: string }> = []
    const callbacks = Object.fromEntries(WEB_WORKSPACE_ACTION_IDS.map((actionId) => [
      actionId,
      ((_, source) => {
        calls.push({ actionId, source })
        return { kind: "terminal" as const }
      }) satisfies WorkspaceActionCallback,
    ])) as Record<WebWorkspaceActionId, WorkspaceActionCallback>
    const registry = createWorkspaceActionRegistry(descriptors, callbacks)
    const webRows = workspaceActionMenuRows(registry)
    const tuiRows = tuiWorkspaceActionRows(descriptors)

    for (const actionId of WEB_WORKSPACE_ACTION_IDS) {
      const entry = registry.entry(actionId)!
      const tuiRow = tuiRows.find((row) => row.actionId === actionId)!
      expect(entry.label).toBe(workspaceActionLabel(actionId))
      expect(tuiRow.label).toBe(entry.label)
      expect(entry.pointer.callback).toBe(entry.menu.callback)
      expect(entry.keyboard.callback).toBe(entry.menu.callback)

      const webRow = webRows.find((row) => row.actionId === actionId)
      if (webRow) {
        expect(webRow.label).toBe(tuiRow.label)
        expect(webRow.group).toBe(tuiRow.group)
        expect(webRow.callback).toBe(entry.menu.callback)
      }
    }

    expect(WEB_WORKSPACE_ACTION_GROUPS.map(({ label }) => label)).toEqual(["Workspace", "Git", "Details", "Lifecycle"])
    expect(Object.values(TUI_WORKSPACE_ACTION_PRESENTATION).map(({ group }) => group)).toEqual(expect.arrayContaining(["Workspace", "Git", "Details", "Lifecycle"]))
    expect(webRows.find(({ actionId }) => actionId === "workspace.push")).toMatchObject({ disabledReason: unavailable.message, ariaDisabled: "true" })
    expect(tuiRows.find(({ actionId }) => actionId === "workspace.push")).toMatchObject({ disabledReason: unavailable.message })

    await registry.entry("workspace.open")!.menu.callback()
    expect(calls).toEqual([{ actionId: "workspace.open", source: "pointer" }])
  })

  test("service availability cannot be weakened and every confirmation rule is schema-owned", async () => {
    let transports = 0
    const unavailable = descriptor("workspace.remove", {
      available: false,
      reason: "dirty_worktree",
      message: "Dirty worktrees block removal.",
    })
    const registry = createWorkspaceActionRegistry([unavailable], {
      "workspace.remove": async () => { transports += 1; return { kind: "terminal" } },
    } as never, {
      localAvailability: () => ({ available: true }),
      confirm: () => true,
    })

    expect(await registry.entry("workspace.remove")!.menu.callback()).toEqual({ status: "unavailable", reason: "Dirty worktrees block removal." })
    expect(transports).toBe(0)

    for (const actionId of WEB_WORKSPACE_ACTION_IDS) {
      const row = descriptor(actionId)
      expect(WebWorkspaceActionSchema.safeParse(row).success).toBe(true)
      if (row.confirmation !== "none") {
        expect(WebWorkspaceActionSchema.safeParse({ ...row, confirmation: "none" }).success).toBe(false)
      }
    }
  })

  test("the synchronous action latch prevents duplicate confirmation and transport", async () => {
    const release = deferred<{ kind: "operation"; operationId: string }>()
    let confirms = 0
    let transports = 0
    const registry = createWorkspaceActionRegistry([descriptor("workspace.merge")], {
      "workspace.merge": async () => {
        transports += 1
        return release.promise
      },
    } as never, {
      confirm: async () => { confirms += 1; return true },
    })

    const first = registry.entry("workspace.merge")!.pointer.callback()
    const duplicate = await registry.entry("workspace.merge")!.keyboard.callback()
    expect(duplicate).toEqual({ status: "pending" })
    expect(confirms).toBe(1)
    expect(transports).toBe(1)

    release.resolve({ kind: "operation", operationId })
    await expect(first).resolves.toEqual({ status: "submitted", operationId })
  })

  test("missing, malformed, empty, and wrong-subject inventories fail closed on both adapters", () => {
    const complete = WEB_WORKSPACE_ACTION_IDS.filter((actionId) => actionId !== "operation.cancel").map((actionId) => descriptor(actionId))
    expect(WebWorkspaceActionInventorySchema.safeParse(complete).success).toBe(true)
    expect(WebWorkspaceActionInventorySchema.safeParse([]).success).toBe(false)
    expect(WebWorkspaceActionInventorySchema.safeParse(complete.slice(1)).success).toBe(false)
    expect(WebWorkspaceActionInventorySchema.safeParse([{ action_id: "workspace.open" }]).success).toBe(false)

    const gate = createWorkspaceActionInventoryGate()
    const token = gate.begin(workspaceId)
    expect(gate.accepts(token, workspaceId, [])).toBe(false)
    expect(gate.accepts(token, workspaceId, [descriptor("workspace.open")])).toBe(true)
    expect(gate.accepts(token, workspaceId, [{ ...descriptor("workspace.open"), subject: { kind: "workspace", workspace_id: "22222222-2222-4222-8222-222222222222" } }])).toBe(false)
    expect(tuiWorkspaceActionRows([])).toEqual([])
  })
})

describe("Phase 126 durable operation conformance", () => {
  test("submits intent once, retains only operation identity, and reconnects without replay", async () => {
    const releaseSubmit = deferred<WebOperationSummary>()
    const submitted: unknown[] = []
    const fetched: string[] = []
    const tracker = createOperationTracker({
      submit: async (intent: unknown) => { submitted.push(intent); return releaseSubmit.promise },
      get: async (id) => { fetched.push(id); return acceptedOperation({ state: "running", started_at: startedAt, progress: { stage: "executing" } }) },
      cancel: async (id) => ({ operation_id: id, outcome: "requested", operation_state: "running" }),
      refresh: async () => {},
    })

    const first = tracker.submit({ kind: "workspace.sync", secret: "discard-me" })
    await expect(tracker.submit({ kind: "workspace.sync", secret: "must-not-submit" })).resolves.toEqual({ status: "locked", reason: "submitting" })
    releaseSubmit.resolve(acceptedOperation())
    await expect(first).resolves.toEqual({ status: "observing", operationId })
    await tracker.reconnect()

    expect(submitted).toHaveLength(1)
    expect(fetched).toEqual([operationId])
    expect(JSON.stringify(tracker.state())).not.toContain("discard-me")
  })

  test("terminal refresh failure remains locked until authoritative retry succeeds", async () => {
    let refreshFails = true
    const reconciled: unknown[] = []
    const tracker = createOperationTracker({
      submit: async () => acceptedOperation(),
      get: async () => acceptedOperation(),
      cancel: async (id) => ({ operation_id: id, outcome: "requested", operation_state: "running" }),
      refresh: async () => { if (refreshFails) throw new Error("offline") },
      reconcile: (request) => reconciled.push(request),
    })
    await tracker.submit({ kind: "workspace.sync" })
    await tracker.observe(acceptedOperation({
      state: "failed",
      started_at: startedAt,
      finished_at: finishedAt,
      cancellation: { state: "unavailable", reason: "finished" },
      error: { code: "failed", message: "Sync failed.", retryable: true },
    }))

    expect(tracker.state()).toMatchObject({ phase: "refresh-failed", operationId, outcome: "failed" })
    expect(tracker.isLocked()).toBe(true)
    expect(reconciled).toEqual([{ workspaceId, operationId, outcome: "failed" }])

    refreshFails = false
    await tracker.retryRefresh()
    expect(tracker.state()).toEqual({ phase: "ready" })
    expect(tracker.isLocked()).toBe(false)
  })

  test("cancellation is available only from authoritative state and is latched while pending", async () => {
    const releaseCancel = deferred<{ operation_id: string; outcome: "requested"; operation_state: "running" }>()
    let cancellations = 0
    const tracker = createOperationTracker({
      submit: async () => acceptedOperation(),
      get: async () => acceptedOperation(),
      cancel: async () => { cancellations += 1; return releaseCancel.promise },
      refresh: async () => {},
    })
    await tracker.submit({ kind: "workspace.sync" })

    const first = tracker.cancel()
    await expect(tracker.cancel()).resolves.toEqual({ status: "ignored", reason: "cancel-pending" })
    expect(cancellations).toBe(1)
    releaseCancel.resolve({ operation_id: operationId, outcome: "requested", operation_state: "running" })
    await expect(first).resolves.toMatchObject({ outcome: "requested" })
    expect(tracker.cards()[0]?.cancellation).toEqual({ state: "requested" })
  })
})

describe("Phase 126 notes, files, and forge conformance", () => {
  test("notes remain authoritative, revision-bound, capped, and newest-first", () => {
    const response = {
      workspace_id: workspaceId,
      revision: "12",
      notes_revision: "7",
      count: 2,
      records: [
        { text: "newest", created_at: "2026-07-17T09:02:00.000Z" },
        { text: "older", created_at: "2026-07-17T09:01:00.000Z" },
      ],
    }
    expect(WebNotesResponseSchema.safeParse(response).success).toBe(true)
    expect(WebNotesResponseSchema.safeParse({ ...response, records: [...response.records].reverse() }).success).toBe(false)
    expect(WebNotesResponseSchema.safeParse({ ...response, count: 1 }).success).toBe(false)
    expect(WebNotesResponseSchema.safeParse({ ...response, local_only: true }).success).toBe(false)
  })

  test("file status covers every semantic state while rejecting paths and raw errors", () => {
    const states = [
      ["materialized", "ok", false, "none"],
      ["ok", "ok", false, "none"],
      ["missing", "warning", true, "target_missing"],
      ["pullable", "warning", true, "source_missing"],
      ["pushable", "warning", true, "target_missing"],
      ["diverged", "error", true, "diverged"],
      ["error", "error", true, "comparison_failed"],
    ] as const
    const entry = (state: typeof states[number]) => ({
      id: "file_1234567890abcdef",
      target: "config/settings.yml",
      type: "copy",
      state: state[0],
      severity: state[1],
      needs_attention: state[2],
      reason: state[3],
      message: state[0] === "error" ? "Comparison failed." : "Configured target status.",
    })

    for (const state of states) expect(WebFileEntrySchema.safeParse(entry(state)).success).toBe(true)
    expect(WebFileEntrySchema.safeParse({ ...entry(states[0]), target: "/home/operator/private.yml" }).success).toBe(false)
    expect(WebFileEntrySchema.safeParse({ ...entry(states[6]), message: "Failed at /home/operator/private.yml" }).success).toBe(false)
    expect(WebFileEntrySchema.safeParse({ ...entry(states[0]), raw_error: "secret" }).success).toBe(false)
  })

  test("forge terminology is exact and Enter resolves without creating until explicit Create", async () => {
    expect(WebForgeTerminologySchema.parse(forgeResolution.terminology)).toEqual({
      provider: "github",
      change: "Pull request",
      source_branch: "Head branch",
      target_branch: "Base branch",
    })
    expect(WebForgeTerminologySchema.safeParse({ ...forgeResolution.terminology, change: "PR" }).success).toBe(false)
    expect(WebForgeTerminologySchema.safeParse({ provider: "gitlab", change: "Merge request", source_branch: "Source branch", target_branch: "Target branch" }).success).toBe(true)

    let resolves = 0
    let creates = 0
    const coordinator = createForgeReviewCoordinator({
      resolve: async () => { resolves += 1; return forgeResolution },
      create: async () => { creates += 1; return { operationId } },
    })
    coordinator.setUrl(forgeUrl)
    await coordinator.enter()
    await coordinator.enter()
    expect(resolves).toBe(1)
    expect(creates).toBe(0)
    expect(coordinator.state().phase).toBe("review")

    await coordinator.create()
    expect(creates).toBe(1)
    expect(coordinator.state()).toMatchObject({ phase: "accepted", operationId })
    coordinator.observeOperation({ operation_id: operationId, state: "failed", error: { message: "Creation failed." } })
    expect(coordinator.state()).toMatchObject({ phase: "terminal-error", operationId, outcome: "failed" })
    expect(coordinator.backToReview()).toEqual({ status: "review" })
    expect(coordinator.state().phase).toBe("review")
  })

  test("browser and TUI harness evidence exists for every shared interaction contract", () => {
    const evidence = [
      ["actions", "tests/service/web-workspace-actions.test.ts", "groups the canonical descriptor vocabulary", "tests/tui/dashboard/WorkspaceParity.test.tsx", "routes canonical invocations through the shared action registry"],
      ["disabled", "tests/service/web-workspace-actions.test.ts", "keeps unavailable rows focusable", "tests/tui/dashboard/WorkspaceParity.test.tsx", "retaining unavailable reasons"],
      ["operations", "tests/service/web-workspace-actions.test.ts", "authoritative refresh", "tests/tui/dashboard/integ-sync-progress.test.tsx", "refresh-failed"],
      ["notes", "tests/service/web-workspace-actions.test.ts", "notes before transport", "tests/tui/dashboard/integ-action-menu.test.tsx", "never renders workspace A notes"],
      ["files", "tests/service/web-workspace-actions.test.ts", "lazy grouped file status", "tests/tui/dashboard/WorkspaceParity.test.tsx", "file status renders shared states"],
      ["forge", "tests/service/web-forge-review.test.ts", "explicit one-shot Create workspace", "tests/tui/dashboard/ForgeSourceReview.test.tsx", "sole one-shot Create path"],
      ["empty", "tests/service/web-keyboard-overlays.test.ts", "renders exact zero and no-match states", "tests/tui/dashboard/WorkspaceParity.test.tsx", "stable empty frame"],
      ["loading-error", "tests/service/web-keyboard-navigation.test.ts", "fails closed on reload errors", "tests/tui/dashboard/WorkspaceParity.test.tsx", "loading and retryable error frames"],
      ["populated-partial", "tests/service/web-workspace-actions.test.ts", "canonical descriptor vocabulary", "tests/tui/dashboard/WorkspaceParity.test.tsx", "shared states, groups, counts"],
      ["overflow", "tests/lib/client-operation-tracker.test.ts", "overflowCount()).toBe(2)", "tests/tui/dashboard/snapshots/ProgressView.snap.test.tsx", "renders omitted marker"],
      ["zero-one-many", "tests/service/web-workflow-contract.test.ts", "zero, one, and many path-free file groups", "tests/tui/dashboard/WorkspaceParity.test.tsx", "count: 2"],
      ["long-constrained", "tests/service/web-forge-review.test.ts", "desktop 375 and 320 rules", "tests/tui/dashboard/ForgeSourceReview.test.tsx", "const narrow"],
    ] as const

    for (const [contract, webFile, webMarker, tuiFile, tuiMarker] of evidence) {
      const web = readFileSync(new URL(`../../${webFile}`, import.meta.url), "utf8")
      const tui = readFileSync(new URL(`../../${tuiFile}`, import.meta.url), "utf8")
      expect(web, `${contract} browser evidence`).toContain(webMarker)
      expect(tui, `${contract} TUI evidence`).toContain(tuiMarker)
    }
  })
})
