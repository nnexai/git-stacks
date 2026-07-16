import { describe, expect, test } from "@test/api"

import {
  ForgeChangeKindSchema,
  ForgeProviderSchema,
  ForgeReviewTokenSchema,
  OperationCancelRequestSchema,
  OperationCancelResultSchema,
  OperationCancellationViewSchema,
  ServiceOperationMutationKindSchema,
} from "../../packages/protocol/src/service"
import {
  WEB_WORKSPACE_ACTION_IDS,
  WebFileStatusResponseSchema,
  WebForgeFailureSchema,
  WebForgeResolveIntentSchema,
  WebForgeResolveRequestSchema,
  WebForgeResolveResponseSchema,
  WebNotesAddRequestSchema,
  WebNotesClearRequestSchema,
  WebNotesListRequestSchema,
  WebNotesResponseSchema,
  WebOperationMutationSchema,
  WebOperationSummarySchema,
  WebReviewedWorkspaceCreateRequestSchema,
  WebWorkspaceActionIdSchema,
  WebWorkspaceActionInventorySchema,
} from "../../packages/protocol/src/web"

const workspaceId = "00000000-0000-4000-8000-000000000001"
const repositoryId = "00000000-0000-4000-8000-000000000002"
const alternateRepositoryId = "00000000-0000-4000-8000-000000000003"
const operationId = "op_0123456789abcdef"
const token = `review_${"a".repeat(43)}`

describe("web workflow protocol contract", () => {
  test("freezes one complete, unique workspace action vocabulary", () => {
    expect(WEB_WORKSPACE_ACTION_IDS).toEqual([
      "workspace.archive",
      "workspace.unarchive",
      "workspace.remove",
      "workspace.force-remove",
      "workspace.rename",
      "workspace.open",
      "workspace.close",
      "workspace.pin",
      "workspace.unpin",
      "workspace.sync",
      "workspace.pull",
      "workspace.push",
      "workspace.merge",
      "workspace.notes.list",
      "workspace.notes.add",
      "workspace.notes.clear",
      "workspace.files.inspect",
      "operation.cancel",
    ])
    expect(new Set(WEB_WORKSPACE_ACTION_IDS).size).toBe(WEB_WORKSPACE_ACTION_IDS.length)
    for (const id of WEB_WORKSPACE_ACTION_IDS) expect(WebWorkspaceActionIdSchema.parse(id)).toBe(id)
    expect(WebWorkspaceActionIdSchema.safeParse("workspace.clean").success).toBe(false)
  })

  test("requires a strict complete action inventory with typed availability and confirmations", () => {
    const rows = WEB_WORKSPACE_ACTION_IDS.filter((action_id) => action_id !== "operation.cancel").map((action_id) => ({
      action_id,
      subject: { kind: "workspace" as const, workspace_id: workspaceId },
      availability: action_id === "workspace.push"
        ? { available: false as const, reason: "remote_unavailable" as const, message: "No writable remote is available." }
        : { available: true as const },
      confirmation: action_id === "workspace.force-remove"
        ? "exact-name" as const
        : action_id === "workspace.remove" || action_id === "workspace.merge" || action_id === "workspace.notes.clear"
          ? "confirm" as const
          : "none" as const,
    }))
    expect(WebWorkspaceActionInventorySchema.parse(rows)).toEqual(rows)
    expect(WebWorkspaceActionInventorySchema.safeParse(rows.slice(1)).success).toBe(false)
    expect(WebWorkspaceActionInventorySchema.safeParse([...rows.slice(0, -1), rows[0]]).success).toBe(false)
    expect(WebWorkspaceActionInventorySchema.safeParse(rows.map((row, index) => index === 0 ? { ...row, hidden: true } : row)).success).toBe(false)
    expect(WebWorkspaceActionInventorySchema.safeParse(rows.map((row, index) => index === 3 ? { ...row, confirmation: "none" } : row)).success).toBe(false)

    const pendingRows = rows.map((row, index) => index === 0 ? {
      ...row,
      availability: { available: false as const, reason: "operation_in_progress" as const, message: "An operation is already running." },
      pending_operation_id: operationId,
    } : row)
    const cancel = {
      action_id: "operation.cancel" as const,
      subject: { kind: "operation" as const, operation_id: operationId, workspace_id: workspaceId },
      availability: { available: true as const },
      confirmation: "none" as const,
    }
    expect(WebWorkspaceActionInventorySchema.parse([...pendingRows, cancel])).toEqual([...pendingRows, cancel])
    expect(WebWorkspaceActionInventorySchema.safeParse([...rows, cancel]).success).toBe(false)
    expect(WebWorkspaceActionInventorySchema.safeParse([...pendingRows, {
      ...cancel,
      subject: { ...cancel.subject, operation_id: "op_fedcba9876543210" },
    }]).success).toBe(false)
    expect(WebWorkspaceActionInventorySchema.safeParse(rows.map((row, index) => index === 0 ? {
      ...row,
      pending_operation_id: operationId,
    } : row)).success).toBe(false)
    expect(WebWorkspaceActionInventorySchema.safeParse(pendingRows.map((row, index) => index === 0 ? {
      ...row,
      availability: { available: true as const },
    } : row)).success).toBe(false)
  })

  test("models honest cancellability and state-consistent cancel outcomes", () => {
    expect(OperationCancellationViewSchema.parse({ state: "available" })).toEqual({ state: "available" })
    expect(OperationCancellationViewSchema.parse({ state: "requested" })).toEqual({ state: "requested" })
    expect(OperationCancellationViewSchema.parse({ state: "unavailable", reason: "committed" })).toEqual({ state: "unavailable", reason: "committed" })
    expect(OperationCancelRequestSchema.parse({ operation_id: operationId })).toEqual({ operation_id: operationId })
    for (const result of [
      { operation_id: operationId, outcome: "requested", operation_state: "running" },
      { operation_id: operationId, outcome: "already-finished", operation_state: "succeeded" },
      { operation_id: operationId, outcome: "too-late", operation_state: "running" },
      { operation_id: operationId, outcome: "not-cancellable", operation_state: "accepted" },
    ] as const) expect(OperationCancelResultSchema.parse(result)).toEqual(result)
    for (const invalid of [
      { operation_id: operationId, outcome: "requested", operation_state: "succeeded" },
      { operation_id: operationId, outcome: "already-finished", operation_state: "running" },
      { operation_id: operationId, outcome: "too-late", operation_state: "failed" },
      { operation_id: operationId, outcome: "rolled-back", operation_state: "cancelled" },
      { operation_id: operationId, outcome: "requested", operation_state: "running", rollback: true },
    ]) expect(OperationCancelResultSchema.safeParse(invalid).success).toBe(false)
  })

  test("projects a strict state-discriminated operation lifecycle", () => {
    const identity = {
      operation_id: operationId,
      action_id: "workspace.pull" as const,
      workspace_id: workspaceId,
      workspace_name: "demo",
      accepted_at: "2026-07-16T12:00:00.000Z",
    }
    const accepted = { ...identity, state: "accepted" as const, cancellation: { state: "available" as const } }
    const running = {
      ...identity,
      state: "running" as const,
      started_at: "2026-07-16T12:00:01.000Z",
      progress: { stage: "executing", message: "Pulling workspace", completed: 1, total: 2 },
      cancellation: { state: "available" },
    }
    const succeeded = {
      ...identity,
      state: "succeeded" as const,
      started_at: "2026-07-16T12:00:01.000Z",
      finished_at: "2026-07-16T12:00:02.000Z",
      cancellation: { state: "unavailable" as const, reason: "finished" as const },
      result: { workspace_name: "demo", revision: "8", snapshot_changed: true },
    }
    const failed = {
      ...identity,
      state: "failed" as const,
      started_at: "2026-07-16T12:00:01.000Z",
      finished_at: "2026-07-16T12:00:02.000Z",
      cancellation: { state: "unavailable" as const, reason: "finished" as const },
      error: { code: "pull_failed", message: "Pull failed.", retryable: true },
    }
    expect(WebOperationSummarySchema.parse(accepted)).toEqual(accepted)
    expect(WebOperationSummarySchema.parse(running)).toEqual(running)
    expect(WebOperationSummarySchema.parse(succeeded)).toEqual(succeeded)
    expect(WebOperationSummarySchema.parse(failed)).toEqual(failed)
    expect(WebOperationSummarySchema.safeParse({ ...running, progress: { ...running.progress, data: { cwd: "/secret" } } }).success).toBe(false)
    expect(WebOperationSummarySchema.safeParse({ ...running, result: { raw: "provider output" } }).success).toBe(false)
    expect(WebOperationSummarySchema.safeParse({ ...running, action_id: "workspace.notes.list", cancellation: { state: "available" } }).success).toBe(false)
    for (const invalid of [
      { ...accepted, finished_at: succeeded.finished_at },
      { ...accepted, progress: running.progress },
      { ...accepted, result: succeeded.result },
      { ...accepted, error: failed.error },
      { ...running, cancellation: undefined },
      { ...running, cancellation: { state: "unavailable", reason: "finished" } },
      { ...running, finished_at: succeeded.finished_at },
      { ...running, error: failed.error },
      { ...succeeded, error: failed.error },
      { ...succeeded, progress: { ...running.progress, stage: "completed" } },
      { ...succeeded, cancellation: undefined },
      { ...failed, result: succeeded.result },
      { ...failed, cancellation: { state: "available" } },
      { ...failed, error: undefined },
      { ...failed, state: "cancelled", result: succeeded.result },
    ]) expect(WebOperationSummarySchema.safeParse(invalid).success).toBe(false)
  })

  test("extends carrier and browser mutation kinds without changing lifecycle shapes", () => {
    for (const kind of ["workspace.pull", "workspace.notes.add", "workspace.notes.clear", "workspace.create.reviewed"] as const) {
      expect(ServiceOperationMutationKindSchema.parse(kind)).toBe(kind)
    }
    expect(WebOperationMutationSchema.parse({ kind: "workspace.pull", request: { workspace_id: workspaceId, expected_revision: "7" } })).toEqual({
      kind: "workspace.pull", request: { workspace_id: workspaceId, expected_revision: "7" },
    })
    expect(WebOperationMutationSchema.parse({ kind: "workspace.notes.add", request: {
      workspace_id: workspaceId, expected_revision: "7", expected_notes_revision: "3", text: "Remember this",
    } }).kind).toBe("workspace.notes.add")
    expect(WebOperationMutationSchema.parse({ kind: "workspace.notes.clear", request: {
      workspace_id: workspaceId, expected_revision: "7", expected_notes_revision: "3",
    } }).kind).toBe("workspace.notes.clear")
  })
})

describe("browser-safe notes and file status", () => {
  test("uses revisioned strict note requests and newest-first bounded records", () => {
    expect(WebNotesListRequestSchema.parse({ workspace_id: workspaceId, expected_revision: "7" })).toEqual({ workspace_id: workspaceId, expected_revision: "7" })
    expect(WebNotesAddRequestSchema.parse({ workspace_id: workspaceId, expected_revision: "7", expected_notes_revision: "3", text: "plain text" }).text).toBe("plain text")
    expect(WebNotesClearRequestSchema.parse({ workspace_id: workspaceId, expected_revision: "7", expected_notes_revision: "3" }).expected_notes_revision).toBe("3")
    const records = [
      { text: "new", created_at: "2026-07-16T12:01:00.000Z" },
      { text: "old", created_at: "2026-07-16T12:00:00.000Z" },
    ]
    for (const selected of [[], records.slice(0, 1), records]) {
      const candidate = { workspace_id: workspaceId, revision: "7", notes_revision: "4", count: selected.length, records: selected }
      expect(WebNotesResponseSchema.parse(candidate)).toEqual(candidate)
    }
    const response = { workspace_id: workspaceId, revision: "7", notes_revision: "4", count: 2, records }
    expect(WebNotesResponseSchema.safeParse({ ...response, records: [...response.records].reverse() }).success).toBe(false)
    expect(WebNotesResponseSchema.safeParse({ ...response, count: 0 }).success).toBe(false)
    expect(WebNotesResponseSchema.safeParse({ ...response, records: [{ text: "x".repeat(4097), created_at: response.records[0].created_at }] }).success).toBe(false)
    expect(WebNotesResponseSchema.safeParse({ ...response, records: [{ text: "valid", created_at: "not-a-time" }] }).success).toBe(false)
    expect(WebNotesResponseSchema.safeParse({ ...response, path: "/home/user/notes.jsonl" }).success).toBe(false)
  })

  test("round-trips zero, one, and many path-free file groups", () => {
    const entry = {
      id: "file_0123456789abcdef",
      target: ".env",
      type: "sync",
      state: "pullable",
      severity: "warning",
      needs_attention: true,
      reason: "content_differs",
      message: "The configured source has changes to pull.",
      counts: { equal: 2, source_only: 1, target_only: 0, differing: 1, errors: 0 },
    }
    const group = {
      scope: "repository",
      repository_id: repositoryId,
      name: "app",
      summary: { total: 1, ok: 0, warnings: 1, errors: 0, attention: 1 },
      entries: [entry],
    }
    for (const groups of [[], [group], [
      { scope: "workspace", name: "demo", summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0 }, entries: [] },
      group,
    ]]) {
      const response = {
        workspace_id: workspaceId,
        revision: "7",
        generated_at: "2026-07-16T12:00:00.000Z",
        summary: groups.reduce((sum, row) => ({
          total: sum.total + row.summary.total,
          ok: sum.ok + row.summary.ok,
          warnings: sum.warnings + row.summary.warnings,
          errors: sum.errors + row.summary.errors,
          attention: sum.attention + row.summary.attention,
        }), { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0 }),
        groups,
      }
      expect(WebFileStatusResponseSchema.parse(response)).toEqual(response)
    }
  })

  test("rejects every path-bearing message, raw errors, roots, and verbose diff arrays", () => {
    const base = {
      workspace_id: workspaceId,
      revision: "7",
      generated_at: "2026-07-16T12:00:00.000Z",
      summary: { total: 1, ok: 0, warnings: 0, errors: 1, attention: 1 },
      groups: [{
        scope: "workspace",
        name: "demo",
        summary: { total: 1, ok: 0, warnings: 0, errors: 1, attention: 1 },
        entries: [{
          id: "file_0123456789abcdef", target: ".env", type: "copy", state: "error", severity: "error",
          needs_attention: true, reason: "comparison_failed", message: "The configured target could not be compared.",
        }],
      }],
    }
    const entry = base.groups[0].entries[0]
    for (const canary of [
      { ...base, root: "/home/user/workspace" },
      { ...base, groups: [{ ...base.groups[0], mainPath: "C:\\Users\\me\\repo" }] },
      { ...base, groups: [{ ...base.groups[0], entries: [{ ...entry, target: "/etc/passwd" }] }] },
      { ...base, groups: [{ ...base.groups[0], entries: [{ ...entry, target: "C:\\secret\\file" }] }] },
      { ...base, groups: [{ ...base.groups[0], entries: [{ ...entry, raw_error: "EACCES /secret" }] }] },
      { ...base, groups: [{ ...base.groups[0], entries: [{ ...entry, sourceOnly: ["/secret/a"] }] }] },
      { ...base, groups: [{ ...base.groups[0], entries: [{ ...entry, hint: "Read /secret/a" }] }] },
      { ...base, groups: [{ ...base.groups[0], entries: [{ ...entry, message: "Read /srv/git-stacks/state.json for details." }] }] },
      { ...base, groups: [{ ...base.groups[0], entries: [{ ...entry, message: "Read D:\\projects\\repo\\state.json for details." }] }] },
      { ...base, groups: [{ ...base.groups[0], entries: [{ ...entry, message: "Read \\\\server\\share\\state.json for details." }] }] },
      { ...base, groups: [{ ...base.groups[0], entries: [{ ...entry, message: "Read ~/repo/state.json for details." }] }] },
      { ...base, groups: [{ ...base.groups[0], entries: [{ ...entry, message: "Read file:///srv/git-stacks/state.json for details." }] }] },
    ]) expect(WebFileStatusResponseSchema.safeParse(canary).success).toBe(false)
  })

  test("derives file attention and summaries from exact entry states", () => {
    const entry = {
      id: "file_0123456789abcdef", target: ".env", type: "copy", state: "pullable", severity: "warning",
      needs_attention: true, reason: "content_differs", message: "The configured source has changes to pull.",
    }
    const group = {
      scope: "workspace" as const,
      name: "demo",
      summary: { total: 1, ok: 0, warnings: 1, errors: 0, attention: 1 },
      entries: [entry],
    }
    const response = {
      workspace_id: workspaceId,
      revision: "7",
      generated_at: "2026-07-16T12:00:00.000Z",
      summary: group.summary,
      groups: [group],
    }
    expect(WebFileStatusResponseSchema.parse(response)).toEqual(response)
    for (const invalidEntry of [
      { ...entry, needs_attention: false },
      { ...entry, reason: "none" },
      { ...entry, reason: "target_missing" },
      { ...entry, state: "materialized", severity: "ok", needs_attention: false, reason: "content_differs" },
      { ...entry, state: "missing", reason: "content_differs" },
      { ...entry, state: "pushable", reason: "source_missing" },
      { ...entry, state: "diverged", severity: "error", reason: "comparison_failed" },
      { ...entry, state: "error", severity: "error", reason: "diverged" },
    ]) expect(WebFileStatusResponseSchema.safeParse({ ...response, groups: [{ ...group, entries: [invalidEntry] }] }).success).toBe(false)
    expect(WebFileStatusResponseSchema.safeParse({
      ...response,
      groups: [{ ...group, summary: { total: 1, ok: 1, warnings: 0, errors: 0, attention: 0 } }],
      summary: { total: 1, ok: 1, warnings: 0, errors: 0, attention: 0 },
    }).success).toBe(false)
    expect(WebFileStatusResponseSchema.safeParse({
      ...response,
      groups: [{ ...group, entries: [] }],
    }).success).toBe(false)
  })
})

describe("reviewed forge source protocol", () => {
  const draft = {
    workspace_name: "review-pr-42",
    template_name: "full",
    matched_source_repository_id: repositoryId,
    repositories: [{
      repository_id: repositoryId,
      included: true,
      branch: { base_branch: "main", workspace_branch: "review/pr-42" },
    }],
  }
  const source = {
    provider: "github",
    change_kind: "pull_request",
    change_number: 42,
    web_url: "https://github.com/acme/app/pull/42",
    host: "github.com",
    target_repository: "acme/app",
    source_repository: "contributor/app",
    source_branch: "feature/topic",
    target_branch: "main",
    head_sha: "a".repeat(40),
    cross_repository: true,
    confidence: "provider",
  }
  const repositoryCandidate = {
    repository_id: repositoryId,
    name: "app",
    mode: "worktree",
    matched_source: true,
  } as const

  test("accepts GitHub PR and GitLab MR terminology only", () => {
    expect(ForgeProviderSchema.parse("github")).toBe("github")
    expect(ForgeProviderSchema.parse("gitlab")).toBe("gitlab")
    expect(ForgeProviderSchema.safeParse("gitea").success).toBe(false)
    expect(ForgeChangeKindSchema.parse("pull_request")).toBe("pull_request")
    expect(ForgeChangeKindSchema.parse("merge_request")).toBe("merge_request")
    expect(ForgeReviewTokenSchema.parse(token)).toBe(token)
  })

  test("resolve accepts exactly one credential-free full HTTPS URL and cannot create", () => {
    expect(WebForgeResolveRequestSchema.parse({ url: source.web_url })).toEqual({ url: source.web_url })
    expect(WebForgeResolveIntentSchema.parse({ kind: "workspace.source.resolve", request: { url: source.web_url } })).toEqual({
      kind: "workspace.source.resolve", request: { url: source.web_url },
    })
    for (const invalid of [
      { url: "github.com/acme/app/pull/42" },
      { url: "https://user:token@github.com/acme/app/pull/42" },
      { url: `${source.web_url}?access_token=secret` },
      { url: `${source.web_url}#token=secret` },
      { url: "file:///home/user/repo" },
      { url: source.web_url, create: draft },
      { source_url: source.web_url },
    ]) expect(WebForgeResolveRequestSchema.safeParse(invalid).success).toBe(false)
  })

  test("returns an opaque review token and bounded safe editable draft", () => {
    const response = {
      resolved: true,
      token,
      expires_at: "2026-07-16T12:10:00.000Z",
      revision: "7",
      source,
      terminology: { provider: "github", change: "Pull request", source_branch: "Head branch", target_branch: "Base branch" },
      candidates: {
        templates: [{ name: "full", repositories: [repositoryCandidate] }],
        source_repositories: [repositoryCandidate],
      },
      draft,
    }
    expect(WebForgeResolveResponseSchema.parse(response)).toEqual(response)
    for (const extra of [
      { credentials: "secret" },
      { raw_output: { stdout: "{}", stderr: "failed" } },
      { clone_url: "ssh://git@example.invalid/acme/app.git" },
      { fetch: { remote: "origin", refspec: "refs/pull/42/head" } },
      { cwd: "/home/user/repo" },
      { command: ["gh", "pr", "checkout", "42"] },
    ]) expect(WebForgeResolveResponseSchema.safeParse({ ...response, ...extra }).success).toBe(false)
    for (const invalid of [
      { ...response, source: { ...source, web_url: `${source.web_url}?token=secret` } },
      { ...response, source: { ...source, web_url: `${source.web_url}#credentials` } },
      { ...response, source: { ...source, web_url: "https://github.com/acme/other/pull/42" } },
      { ...response, source: { ...source, cross_repository: false } },
      { ...response, source: { ...source, source_repository: source.target_repository, cross_repository: true } },
      { ...response, terminology: { provider: "gitlab", change: "Merge request", source_branch: "Source branch", target_branch: "Target branch" } },
      { ...response, draft: { ...draft, template_name: "missing" } },
      { ...response, candidates: {
        ...response.candidates,
        source_repositories: [{ ...repositoryCandidate, matched_source: false }],
      } },
      { ...response, candidates: {
        ...response.candidates,
        source_repositories: [repositoryCandidate, { ...repositoryCandidate, repository_id: alternateRepositoryId }],
      } },
      { ...response, draft: {
        ...draft,
        matched_source_repository_id: alternateRepositoryId,
        repositories: [{ ...draft.repositories[0], repository_id: alternateRepositoryId }],
      } },
      { ...response, candidates: {
        ...response.candidates,
        templates: [{ name: "full", repositories: [{ ...repositoryCandidate, repository_id: alternateRepositoryId, matched_source: false }] }],
      } },
    ]) expect(WebForgeResolveResponseSchema.safeParse(invalid).success).toBe(false)
  })

  test("reviewed create requires token, revision, and a complete draft", () => {
    const request = { token, expected_revision: "7", draft }
    expect(WebReviewedWorkspaceCreateRequestSchema.parse(request)).toEqual(request)
    expect(WebOperationMutationSchema.parse({ kind: "workspace.create.reviewed", request }).kind).toBe("workspace.create.reviewed")
    for (const invalid of [
      { expected_revision: "7", draft },
      { token, draft },
      { token, expected_revision: "7", draft: { ...draft, matched_source_repository_id: undefined } },
      { token, expected_revision: "7", draft: { ...draft, repositories: [] } },
      { token, expected_revision: "7", draft, provider: "github" },
      { token, expected_revision: "7", draft, clone_url: "https://example.invalid/repo.git" },
    ]) expect(WebReviewedWorkspaceCreateRequestSchema.safeParse(invalid).success).toBe(false)
  })

  test("freezes every typed SOURCE-04 failure and bounded recovery", () => {
    const codes = [
      "malformed_url", "unsupported_provider", "unsupported_host", "cli_unavailable", "auth_required",
      "change_not_found", "change_closed", "rate_limited", "provider_unavailable", "provider_response_invalid",
      "repo_not_matched", "ambiguous_repo", "template_repo_missing", "not_worktree_mode", "review_expired",
      "stale_revision", "source_changed", "fork_unreachable", "branch_conflict", "cancelled", "request_timeout",
    ] as const
    for (const code of codes) expect(WebForgeFailureSchema.parse({ code, recovery: "resolve_again", message: "Resolve the source again." }).code).toBe(code)
    expect(WebForgeFailureSchema.safeParse({ code: "metadata_unavailable", recovery: "retry", message: "raw", stderr: "secret" }).success).toBe(false)
    expect(WebForgeResolveResponseSchema.parse({
      resolved: false,
      failure: { code: "auth_required", recovery: "authenticate", message: "Authenticate the provider and resolve again." },
    }).resolved).toBe(false)
  })
})
