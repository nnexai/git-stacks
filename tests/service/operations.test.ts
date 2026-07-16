import { afterEach, describe, expect, mock, test } from "@test/api"
import type { Operation } from "../../packages/protocol/src/service"
import type { SnapshotAdapter } from "../../packages/service/src/snapshot-adapter"
import { SecureServiceRouter } from "../../packages/service/src/secure/router"

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111"
const acceptedOperation: Operation = {
  operation_id: "op_1234567890abcdef",
  state: "accepted",
  accepted_at: "2026-07-16T00:00:00.000Z",
}

function secureContext(scopes: string[] = ["operation.write"]) {
  return {
    sessionId: "session-a",
    principalId: "principal-a",
    targetId: "22222222-2222-4222-8222-222222222222",
    mode: "tui",
    scopes,
  } as never
}

function secureRequest(body: unknown, idempotencyKey = "lifecycle-key") {
  return {
    request_id: "request-a",
    method: "operation.submit",
    body,
    idempotency_key: idempotencyKey,
  } as never
}

function snapshot(): SnapshotAdapter {
  return {
    buildAll: async () => [],
    buildWorkspace: async () => { throw new Error("unused") },
    currentRevision: async () => "7",
  } as unknown as SnapshotAdapter
}

afterEach(() => mock.restore())

describe("secure service lifecycle", () => {
  test("idle lifecycle suppresses exit while clients or operations are active", async () => {
    const callbacks: Array<() => void> = []
    let exited = 0
    const { createIdleLifecycle } = await import("../../packages/service/src/main")
    const lifecycle = createIdleLifecycle({ idleMs: 5, setTimer: (fn: () => void) => { callbacks.push(fn); return callbacks.length as never }, clearTimer: () => {}, onIdle: () => { exited += 1 } })
    lifecycle.setConnectedClients(1)
    callbacks.at(-1)?.()
    expect(exited).toBe(0)
    lifecycle.setConnectedClients(0)
    lifecycle.setActiveOperations(1)
    callbacks.at(-1)?.()
    expect(exited).toBe(0)
    lifecycle.setActiveOperations(0)
    callbacks.at(-1)?.()
    expect(exited).toBe(1)
    lifecycle.dispose()
  })

  test("does not export the removed plaintext HTTP transport", async () => {
    const module = await import("../../packages/service/src/index")
    expect("startServiceServer" in module).toBe(false)
    expect("readOfficialClientCredential" in module).toBe(false)
  })

  test("PHASE123_RED lifecycle router client composition contract", async () => {
    const submissions: Array<{ clientId: string; idempotencyKey: string; mutation: unknown }> = []
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      operations: {} as never,
      workspaceLifecycle: {
        submit: async (input) => {
          submissions.push(input)
          if ((input.mutation as { kind?: string }).kind === "workspace.force-remove") {
            throw Object.assign(new Error("Force Remove is available only for dirty workspaces"), { code: "operation_failed" })
          }
          return acceptedOperation
        },
      },
    })
    const archive = { kind: "workspace.archive", workspace_id: WORKSPACE_ID, expected_revision: "7" }

    await expect(router.request(secureContext([]), secureRequest(archive))).rejects.toMatchObject({ code: "unauthorized" })
    await expect(router.request(secureContext(), secureRequest({ ...archive, confirmation_name: "demo" }))).rejects.toMatchObject({ code: "invalid_request" })
    await expect(router.request(secureContext(), secureRequest({ ...archive, kind: "workspace.force-remove", confirmation_name: "demo" }))).rejects.toMatchObject({
      code: "operation_failed",
    })
    expect(submissions).toHaveLength(1)

    const first = await router.request(secureContext(), secureRequest(archive, "same-key"))
    const duplicate = await router.request(secureContext(), secureRequest(archive, "same-key"))
    expect(first).toEqual(acceptedOperation)
    expect(duplicate).toEqual(acceptedOperation)
    expect(submissions.slice(1)).toEqual([
      { clientId: "principal-a", idempotencyKey: "same-key", mutation: archive },
      { clientId: "principal-a", idempotencyKey: "same-key", mutation: archive },
    ])

    const main = await import("../../packages/service/src/main")
    const composed = (main as unknown as {
      createWorkspaceLifecycleRuntimeComposition(input: {
        snapshot: SnapshotAdapter
        operations: unknown
        publishSignal?: undefined
      }): { admission: unknown; terminalAdmission: unknown; coordinatorAdmission: unknown; snapshot: unknown; coordinatorSnapshot: unknown }
    }).createWorkspaceLifecycleRuntimeComposition({ snapshot: snapshot(), operations: {}, publishSignal: undefined })
    expect(composed.terminalAdmission).toBe(composed.admission)
    expect(composed.coordinatorAdmission).toBe(composed.admission)
    expect(composed.coordinatorSnapshot).toBe(composed.snapshot)
  })

  test("trusted lifecycle submission never replays destructive intent after transport failure", async () => {
    const requests: string[] = []
    const rpc = {
      closed: new Promise<void>(() => {}),
      observeEvents: () => () => {},
      close: async () => {},
      request: async (method: string) => {
        requests.push(method)
        if (method === "events.cursor") return { cursor: "0" }
        if (method === "operation.submit") throw Object.assign(new Error("connection lost after submit"), { code: "conflict" })
        throw new Error(`Unexpected request ${method}`)
      },
    }
    mock.module("@git-stacks/client", () => ({
      authenticateSecureCarrier: async () => ({ rpc }),
      ensureSharedEventSubscription: async () => {},
    }))
    mock.module("../../packages/service/src/main", () => ({
      ensureManagedServiceProcess: async () => ({
        service_id: "22222222-2222-4222-8222-222222222222",
        listener_epoch: "33333333-3333-4333-8333-333333333333",
        tui_launch: { token: "launch-token" },
        local_tls: {},
      }),
    }))
    mock.module("../../packages/service/src/transport/local-tls", () => ({ connectLocalTls: async () => ({}) }))

    const { runWorkspaceLifecycleMutation } = await import("../../packages/service/src/policy/client")
    await expect(runWorkspaceLifecycleMutation({
      kind: "workspace.remove",
      workspace_id: WORKSPACE_ID,
      expected_revision: "7",
    })).rejects.toMatchObject({ code: "conflict" })
    expect(requests.filter((method) => method === "operation.submit")).toHaveLength(1)
  })
})
