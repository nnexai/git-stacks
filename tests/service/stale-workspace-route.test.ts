import { describe, expect, test } from "@test/api"

import { WebStaleWorkspaceResponseSchema } from "../../packages/protocol/src/web"
import { createStaleWorkspaceRuntimeComposition } from "../../packages/service/src/main"
import type { StaleWorkspaceReadModel } from "../../packages/service/src/policy/stale-workspace-evaluator"
import { SecureServiceRouter } from "../../packages/service/src/secure/router"
import type { SnapshotAdapter } from "../../packages/service/src/snapshot-adapter"

const workspaceId = "00000000-0000-4000-8000-000000000001"
const repositoryId = "00000000-0000-4000-8000-000000000002"
const targetId = "00000000-0000-4000-8000-000000000003"
const generatedAt = "2026-07-17T10:00:00.000Z"
const staleAt = "2026-05-01T10:00:00.000Z"

function snapshot(): SnapshotAdapter {
  return {
    buildAll: async () => [],
    buildWorkspace: async () => { throw new Error("unused") },
    buildCatalog: async () => ({ revision: "7", generated_at: generatedAt, workspaces: [], archived_workspaces: [] }),
  }
}

function context(scopes: string[] = ["snapshot.read"]) {
  return {
    sessionId: "session-a",
    principalId: "principal-a",
    targetId,
    origin: "local",
    mode: "browser",
    scopes,
  } as never
}

function request(body: unknown) {
  return { request_id: "request-a", method: "workspace.stale.evaluate", body } as never
}

function coreState(revision = "7") {
  return {
    revision,
    generated_at: generatedAt,
    config: {},
    workspaces: [{
      definition: {
        id: workspaceId,
        name: "stale-demo",
        schema_version: "1",
        created: staleAt,
        last_opened: staleAt,
        branch: "feature/stale-demo",
        source: {
          kind: "forge",
          forge: "github",
          base_url: "https://github.com",
          url: "https://github.com/acme/app/pull/42",
          change_type: "pr",
          change_number: 42,
          repo: "app",
          repo_path: "acme/app",
          source_branch: "feature/stale-demo",
          source_ref: "refs/pull/42/head",
          target_branch: "main",
          web_url: "https://github.com/acme/app/pull/42",
          fetched_ref: "refs/git-stacks/source/42",
        },
        repos: [{
          id: repositoryId,
          name: "app",
          repo: "app",
          type: "git",
          mode: "worktree",
          main_path: "/private/source/app",
          task_path: "/private/tasks/stale-demo/app",
          files: [],
        }],
        files: [],
        ports: [],
      },
      projection: {
        id: workspaceId,
        name: "stale-demo",
        activity_at: staleAt,
        branch: "feature/stale-demo",
        repositories: [{ id: repositoryId, name: "app", mode: "worktree", path: "/private/tasks/stale-demo/app" }],
        launch: { commands: [], environment: {}, redacted: [], references: {}, named: [] },
        status: [{
          repository_id: repositoryId,
          name: "app",
          exists: true,
          dirty: false,
          branch: "feature/stale-demo",
          default_branch: "main",
          mode: "worktree",
          ahead: 2,
          behind: 0,
          additions: 0,
          removals: 0,
          remote: "available",
          degraded: false,
        }],
      },
    }],
    archived_workspaces: [],
    templates: [],
    repositories: [],
  } as never
}

describe("stale workspace secure route", () => {
  test("rejects invalid and stale requests before evaluator, note, or probe access", async () => {
    let builds = 0
    let noteReads = 0
    let evaluations = 0
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      core: {
        build: async () => { builds += 1; return coreState("7") },
        noteCount: async () => { noteReads += 1; return 2 },
      } as never,
      staleWorkspaceEvaluator: {
        evaluate: async () => { evaluations += 1; throw new Error("must not run") },
      },
    })

    await expect(router.request(context(), request({ expected_revision: "7" })))
      .rejects.toMatchObject({ code: "invalid_request" })
    expect({ builds, noteReads, evaluations }).toEqual({ builds: 0, noteReads: 0, evaluations: 0 })

    await expect(router.request(context(), request({ expected_revision: "6", force_refresh: true })))
      .rejects.toMatchObject({ code: "conflict" })
    expect({ builds, noteReads, evaluations }).toEqual({ builds: 1, noteReads: 0, evaluations: 0 })
  })

  test("passes one frozen captured model and signal through one evaluator and one strict projection", async () => {
    let builds = 0
    let noteReads = 0
    let evaluations = 0
    let captured: Parameters<NonNullable<ConstructorParameters<typeof SecureServiceRouter>[0]["staleWorkspaceEvaluator"]>["evaluate"]>[0] | undefined
    const controller = new AbortController()
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      core: {
        build: async () => { builds += 1; return coreState() },
        noteCount: async () => { noteReads += 1; return 2 },
      } as never,
      staleWorkspaceEvaluator: {
        evaluate: async (input) => {
          evaluations += 1
          captured = input
          return {
            revision: "7",
            checked_at: generatedAt,
            threshold_days: 30,
            candidates: [{
              workspace_id: workspaceId,
              workspace_name: "stale-demo",
              activity_at: staleAt,
              confirmed_reasons: [{ code: "inactive", occurred_at: staleAt, raw_error: "secret" }],
              unknown_evidence: [],
              cautions: [{ code: "notes_present", count: 2, machine_path: "/private/notes" }],
              bearer: "credential-canary",
            }],
            incomplete: [],
            environment: { TOKEN: "credential-canary" },
          } as never
        },
      },
    })

    const result = WebStaleWorkspaceResponseSchema.parse(await router.request(
      context(),
      request({ expected_revision: "7", force_refresh: true }),
      controller.signal,
    ))

    expect({ builds, noteReads, evaluations }).toEqual({ builds: 1, noteReads: 1, evaluations: 1 })
    expect(captured).toMatchObject({ expected_revision: "7", force_refresh: true, signal: controller.signal })
    expect(captured?.read_model).toMatchObject({
      revision: "7",
      workspaces: [{
        id: workspaceId,
        name: "stale-demo",
        notes_count: 2,
        repositories: [{
          id: repositoryId,
          name: "app",
          exists: true,
          dirty: false,
          ahead: 2,
          drifted: false,
          main_path: "/private/source/app",
          branch: "feature/stale-demo",
        }],
      }],
    })
    expect(Object.isFrozen(captured?.read_model)).toBe(true)
    expect(Object.isFrozen(captured?.read_model.workspaces)).toBe(true)
    expect(Object.isFrozen(captured?.read_model.workspaces[0]?.repositories)).toBe(true)
    expect(JSON.stringify(result)).not.toContain("/private/")
    expect(JSON.stringify(result)).not.toContain("credential-canary")
    expect(JSON.stringify(result)).not.toContain("raw_error")
    expect(result.candidates[0]?.cautions).toEqual([{ code: "notes_present", count: 2 }])
  })

  test("requires snapshot.read without creating a durable operation", async () => {
    let builds = 0
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      core: { build: async () => { builds += 1; return coreState() } } as never,
      staleWorkspaceEvaluator: { evaluate: async () => { throw new Error("must not run") } },
    })
    await expect(router.request(context([]), request({ expected_revision: "7", force_refresh: false })))
      .rejects.toMatchObject({ code: "unauthorized" })
    expect(builds).toBe(0)
  })
})

describe("stale workspace service lifetime composition", () => {
  test("is lazy for base snapshots, shares cache within one service composition, and starts cold in the next", async () => {
    let now = Date.parse(generatedAt)
    let forgeCalls = 0
    const evaluatorOptions = {
      now: () => now,
      lookupForgeChangeStatus: async () => {
        forgeCalls += 1
        return { status: "merged" as const, occurred_at: staleAt }
      },
      observeRemoteBranchStatus: async () => ({ status: "present" as const }),
    }
    const readModel: StaleWorkspaceReadModel = {
      revision: "7",
      workspaces: [{
        id: workspaceId,
        name: "stale-demo",
        created: staleAt,
        last_opened: staleAt,
        source: coreState().workspaces[0].definition.source,
        notes_count: 0,
        repositories: [],
      }],
    }

    const first = createStaleWorkspaceRuntimeComposition(evaluatorOptions)
    await snapshot().buildAll()
    expect(forgeCalls).toBe(0)
    await first.staleWorkspaceEvaluator.evaluate({ expected_revision: "7", read_model: readModel, force_refresh: false })
    now += 60_000
    await first.staleWorkspaceEvaluator.evaluate({ expected_revision: "7", read_model: readModel, force_refresh: false })
    expect(forgeCalls).toBe(1)

    const restarted = createStaleWorkspaceRuntimeComposition(evaluatorOptions)
    await restarted.staleWorkspaceEvaluator.evaluate({ expected_revision: "7", read_model: readModel, force_refresh: false })
    expect(forgeCalls).toBe(2)
  })
})
