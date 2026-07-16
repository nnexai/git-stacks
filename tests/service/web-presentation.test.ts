import { describe, expect, test } from "@test/api"
import * as ClientPresentation from "../../packages/client/src/presentation"
import { deduplicateProviderSessions, isActiveSession, isBackgroundActivity, lifecycleLabel, matchesSignalScope, providerLetter, providerName, relativeTime, signalGroup, type PresentedSignal } from "../../packages/client/src/presentation"
import * as ServiceProtocol from "../../packages/protocol/src/service"
import * as WebProtocol from "../../packages/protocol/src/web"
import { readFileSync } from "node:fs"

const webAppSource = readFileSync(new URL("../../packages/web/src/app.ts", import.meta.url), "utf8")

const base: PresentedSignal = {
  kind: "activity",
  source: "codex",
  workspace_id: "workspace-1",
  repository_id: "repository-1",
  surface_id: "surface-1",
  state: "working",
  occurred_at: "2026-07-13T10:00:00.000Z",
}

describe("web signal presentation", () => {
  test("browser lifecycle presentation keeps destructive intent explicit and replaceable", () => {
    for (const seam of [
      "showArchivedWorkspaces",
      "showRemoveConfirmation",
      "showDirtyRemovalFailure",
      "showForceRemoveConfirmation",
      "reconcileAuthoritativeState",
      "workspaceSuccessorOrder",
      "confirmation.value === workspace.name",
      "terminalViews.delete(id)",
      "workspace.archive",
      "workspace.unarchive",
      "workspace.remove",
      "workspace.force-remove",
    ]) expect(webAppSource, seam).toContain(seam)

    expect(webAppSource).toMatch(/cancel\.focus\(\)/)
    expect(webAppSource).toMatch(/const target = lifecycleTarget\(workspace\)[\s\S]*runWorkspaceLifecycle\("workspace\.remove", target\)/)
    expect(webAppSource).toMatch(/expected_revision: workspace\.expectedRevision/)
    expect(webAppSource).toMatch(/snapshot\.revision !== target\.expectedRevision/)
    expect(webAppSource).toMatch(/if \(error instanceof ApiRequestError && error\.code === "conflict"\)[\s\S]*await reconcileAuthoritativeState\(\)[\s\S]*return/)
    expect(webAppSource).not.toMatch(/workspace\.(?:remove|force-remove)[\s\S]{0,500}(?:retry|replay)/i)
    expect(webAppSource).not.toMatch(/(?:split|match|includes)\([^\n]*Dirty worktrees/i)
  })

  test("shared successor order proves every tie tier independently", () => {
    const order = (ClientPresentation as Record<string, unknown>).workspaceSuccessorOrder as (left: Record<string, unknown>, right: Record<string, unknown>) => number
    const base = { pinned: false, priority: 10, activity_at: "2026-07-10T00:00:00.000Z", name: "same", id: "018f47f4-5ab1-7c2d-8e90-123456789abc" }
    expect(order({ ...base, pinned: true }, base)).toBeLessThan(0)
    expect(order({ ...base, priority: 11 }, base)).toBeLessThan(0)
    expect(order({ ...base, activity_at: "2026-07-11T00:00:00.000Z" }, base)).toBeLessThan(0)
    expect(order({ ...base, name: "alpha" }, base)).toBeLessThan(0)
    expect(order({ ...base, id: "018f47f4-5ab1-7c2d-8e90-123456789abb" }, base)).toBeLessThan(0)
  })

  test("lifecycle contracts are strict, bounded, and force-specific", () => {
    const service = ServiceProtocol as Record<string, { safeParse(value: unknown): { success: boolean }; parse(value: unknown): unknown }>
    const mutation = service.WorkspaceLifecycleMutationSchema
    const details = service.WorkspaceLifecycleFailureDetailsSchema
    const result = service.WorkspaceLifecycleResultSchema
    const id = "018f47f4-5ab1-7c2d-8e90-123456789abc"

    expect(mutation.parse({ kind: "workspace.archive", workspace_id: id, expected_revision: "4" })).toEqual({ kind: "workspace.archive", workspace_id: id, expected_revision: "4" })
    expect(mutation.parse({ kind: "workspace.force-remove", workspace_id: id, expected_revision: "4", confirmation_name: "alpha" })).toEqual({ kind: "workspace.force-remove", workspace_id: id, expected_revision: "4", confirmation_name: "alpha" })
    expect(mutation.safeParse({ kind: "workspace.remove", workspace_id: id, expected_revision: "4", confirmation_name: "alpha" }).success).toBe(false)
    expect(mutation.safeParse({ kind: "workspace.force-remove", workspace_id: id, expected_revision: "4", confirmation_name: "alpha", path: "/tmp/alpha" }).success).toBe(false)
    expect(details.safeParse({ kind: "workspace_dirty", blocking_repositories: Array.from({ length: 9 }, (_, index) => `repo-${index}`), terminals_stopped: true, force_allowed: true }).success).toBe(false)
    expect(details.safeParse({ kind: "workspace_dirty", blocking_repositories: ["repo"], terminals_stopped: true, force_allowed: true, path: "/tmp/repo" }).success).toBe(false)
    expect(result.safeParse({ revision: "5", terminals_stopped: true, path: "/tmp/alpha" }).success).toBe(false)
  })

  test("trusted and browser active/archive schemas retain only bounded activity fields", () => {
    const service = ServiceProtocol as Record<string, { safeParse(value: unknown): { success: boolean }; parse(value: unknown): unknown }>
    const web = WebProtocol as Record<string, { safeParse(value: unknown): { success: boolean }; parse(value: unknown): unknown }>
    const archived = { id: "018f47f4-5ab1-7c2d-8e90-123456789abc", name: "alpha", activity_at: "2026-07-11T00:00:00.000Z" }
    expect(service.ArchivedWorkspaceSummarySchema.parse(archived)).toEqual(archived)
    expect(service.ArchivedWorkspaceSummarySchema.safeParse({ ...archived, path: "/tmp/alpha" }).success).toBe(false)
    expect(web.WebSnapshotSchema.safeParse({
      protocol: "web-v1", revision: "1", generated_at: archived.activity_at,
      pinned_workspace_ids: [], workspaces: [], archived_workspaces: [{ ...archived, repositories: [] }],
    }).success).toBe(false)
  })

  test("separates attention from recent activity without treating activity as unread", () => {
    expect(signalGroup(base)).toBe("recent-activity")
    expect(signalGroup({ ...base, state: "completed" })).toBe("recent-activity")
    expect(signalGroup({ ...base, state: "waiting" })).toBe("needs-attention")
    expect(signalGroup({ ...base, state: "failed" })).toBe("needs-attention")
    expect(signalGroup({ ...base, kind: "notification", state: undefined })).toBe("needs-attention")
  })

  test("projects active provider and background-work semantics independently", () => {
    expect(isActiveSession(base)).toBe(true)
    expect(isBackgroundActivity(base)).toBe(true)
    expect(isActiveSession({ ...base, state: "waiting" })).toBe(true)
    expect(isBackgroundActivity({ ...base, state: "waiting" })).toBe(false)
    expect(isActiveSession({ ...base, state: "completed" })).toBe(true)
  })

  test("deduplicates sidebar providers while retaining their most important state", () => {
    const sessions = deduplicateProviderSessions([
      { ...base, surface_id: "codex-old", state: "completed", occurred_at: "2026-07-13T10:03:00.000Z" },
      { ...base, surface_id: "codex-new", state: "working", occurred_at: "2026-07-13T10:02:00.000Z" },
      { ...base, source: "copilot", surface_id: "copilot-1", state: "waiting" },
      { ...base, source: "copilot", surface_id: "copilot-2", state: "working", occurred_at: "2026-07-13T10:04:00.000Z" },
      { ...base, kind: "notification", source: "claude" },
    ])

    expect(sessions.map(({ source, state }) => ({ source, state }))).toEqual([
      { source: "copilot", state: "waiting" },
      { source: "codex", state: "working" },
    ])
  })

  test("matches hierarchical scope and provides stable labels", () => {
    expect(matchesSignalScope(base, "workspace-1")).toBe(true)
    expect(matchesSignalScope(base, "workspace-1", "repository-1", "surface-1")).toBe(true)
    expect(matchesSignalScope(base, "workspace-1", "repository-2")).toBe(false)
    expect(providerName("copilot")).toBe("GitHub Copilot")
    expect(providerLetter("codex")).toBe("X")
    expect(lifecycleLabel({ ...base, state: "waiting" })).toBe("Needs input")
  })

  test("formats bounded relative timestamps", () => {
    const now = Date.parse("2026-07-13T12:00:00.000Z")
    expect(relativeTime("2026-07-13T11:59:40.000Z", now)).toBe("now")
    expect(relativeTime("2026-07-13T11:40:00.000Z", now)).toBe("20m ago")
    expect(relativeTime("2026-07-13T10:00:00.000Z", now)).toBe("2h ago")
    expect(relativeTime("invalid", now)).toBe("")
  })
})
