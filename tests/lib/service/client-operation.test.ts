import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"

mock.module("../../../packages/service/src/main", () => ({
  ensureManagedServiceProcess: async () => ({ endpoint: "http://127.0.0.1:32123", credential_lookup: "test-client" }),
}))

mock.module("../../../packages/service/src/policy/credentials", () => ({
  readOfficialClientCredential: () => ({ token: "test-token" }),
}))

const { runCoreMutation } = await import("../../../packages/service/src/policy/client")
const originalFetch = globalThis.fetch
const timestamp = "2026-07-14T12:00:00.000Z"
const operationId = "op_1234567890123456"
let eventMode: "close" | "stall" = "close"
let operationReads = 0

function data(value: unknown, status = 200): Response {
  return Response.json({ ok: status < 400, data: value }, { status })
}

beforeEach(() => {
  eventMode = "close"
  operationReads = 0
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    if (url.pathname === "/v1/events/cursor") return data({ cursor: "0" })
    if (url.pathname === "/v1/events") {
      if (eventMode === "stall") {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError")), { once: true })
        })
      }
      return new Response(new ReadableStream({ start(controller) { controller.close() } }), {
        headers: { "content-type": "text/event-stream" },
      })
    }
    if (url.pathname === "/v1/operations/workspace.open" && init?.method === "POST") {
      return data({ operation_id: operationId, state: "accepted", accepted_at: timestamp }, 202)
    }
    if (url.pathname === `/v1/operations/${operationId}`) {
      operationReads += 1
      return data({
        operation_id: operationId,
        state: "succeeded",
        accepted_at: timestamp,
        started_at: timestamp,
        finished_at: timestamp,
        completed_steps: ["workspace.open"],
        result: { workspace: "demo" },
      })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }) as unknown as typeof fetch
})

afterAll(() => { globalThis.fetch = originalFetch })

describe("official service client operation transport", () => {
  test("falls back to the durable operation resource when SSE disconnects", async () => {
    const observed: string[] = []
    const result = await runCoreMutation("workspace.open", { workspace: "demo" }, {
      pollMs: 1,
      onOperation: (operation) => observed.push(operation.state),
    })

    expect(result.state).toBe("succeeded")
    expect(operationReads).toBe(1)
    expect(observed).toEqual(["accepted", "succeeded"])
  })

  test("does not hang when cancellation closes SSE before it is ready", async () => {
    eventMode = "stall"
    const controller = new AbortController()
    const pending = runCoreMutation("workspace.open", { workspace: "demo" }, { signal: controller.signal, pollMs: 1 })
    await Bun.sleep(5)
    controller.abort(new DOMException("Cancelled", "AbortError"))

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(operationReads).toBe(0)
  })
})
