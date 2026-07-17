import { afterEach, describe, expect, mock, test } from "@test/api"

import { PHASE127_CLIENT_RESPONSES } from "../helpers/phase127-client-fixtures"

afterEach(() => mock.restore())

describe("official stale workspace service client", () => {
  test("forwards one strict request and never retries the same revision internally", async () => {
    const controller = new AbortController()
    const conflict = Object.assign(new Error("workspace revision changed"), { code: "conflict" })
    const requests: Array<{
      method: string
      body: unknown
      options: { signal?: AbortSignal; scope?: string }
    }> = []
    const rpc = {
      closed: new Promise<void>(() => {}),
      observeEvents: () => () => {},
      close: async () => {},
      request: async (method: string, body: unknown, options: { signal?: AbortSignal; scope?: string }) => {
        requests.push({ method, body, options })
        throw conflict
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

    const { fetchStaleWorkspaceEvaluation } = await import("../../packages/service/src/policy/client")
    await expect(fetchStaleWorkspaceEvaluation({
      expected_revision: PHASE127_CLIENT_RESPONSES.populated.revision,
      force_refresh: true,
    }, controller.signal)).rejects.toBe(conflict)

    expect(requests).toEqual([{
      method: "workspace.stale.evaluate",
      body: { expected_revision: "7", force_refresh: true },
      options: { signal: controller.signal, scope: "snapshot.read" },
    }])
  })
})
