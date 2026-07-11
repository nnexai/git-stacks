import { afterEach, describe, expect, test } from "bun:test"
import { readFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  authenticateAdmission,
  provisionOfficialClient,
  revokeCredential,
  UNAUTHENTICATED_RESPONSE,
} from "../../src/lib/service/credentials"
import { ErrorEnvelopeSchema } from "../../src/lib/service/contract"
import { startServiceServer } from "../../src/service/server"

const roots: string[] = []
function root(): string {
  const path = join(tmpdir(), `git-stacks-security-${crypto.randomUUID()}`)
  roots.push(path)
  return path
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe("service authentication admission", () => {
  test("publishes exact HTTP resource bounds", async () => {
    const server = await import("../../src/service/server")
    expect(server.MAX_BODY_BYTES).toBe(256 * 1024)
    expect(server.RATE_LIMIT_PER_MINUTE).toBe(60)
    expect(server.RATE_LIMIT_BURST).toBe(20)
    expect(server.REQUEST_TIMEOUT_SECONDS).toBe(30)
  })

  test("returns one generic rejection for every unauthenticated bearer shape", () => {
    const serviceRoot = root()
    const issued = provisionOfficialClient("linux", { serviceRoot, randomBytes: () => Buffer.alloc(32, 4) })
    const rejected = [
      undefined,
      "",
      "Basic abc",
      "Bearer",
      "Bearer ",
      "Bearer unknown",
      `bearer ${issued.token}`,
      `Bearer ${issued.token} extra`,
    ].map((authorization) => authenticateAdmission(authorization, { serviceRoot }))
    revokeCredential("linux", { serviceRoot })
    rejected.push(authenticateAdmission(`Bearer ${issued.token}`, { serviceRoot }))

    for (const result of rejected) expect(result).toEqual(UNAUTHENTICATED_RESPONSE)
  })

  test("authenticates before route, body, capability, and rate evaluation", () => {
    const serviceRoot = root()
    const calls: string[] = []
    const route = (authorization: string | undefined, path: string, body: string) => {
      const admission = authenticateAdmission(authorization, { serviceRoot })
      if (!admission.ok) return admission
      calls.push(`route:${path}`, `body:${body}`, `rate:${admission.client.clientId}`)
      return { ok: true as const }
    }

    expect(route(undefined, "/v1/real", "{")).toEqual(UNAUTHENTICATED_RESPONSE)
    expect(route("Bearer wrong", "/v1/unknown", "invalid")).toEqual(UNAUTHENTICATED_RESPONSE)
    expect(calls).toEqual([])
  })

  test("returns a stable secret-free authenticated context", () => {
    const serviceRoot = root()
    const issued = provisionOfficialClient("linux", { serviceRoot, randomBytes: () => Buffer.alloc(32, 5) })
    expect(authenticateAdmission(`Bearer ${issued.token}`, { serviceRoot })).toEqual({
      ok: true,
      client: { clientId: "linux", capabilities: ["service:v1"] },
    })
    expect(JSON.stringify(authenticateAdmission(`Bearer ${issued.token}`, { serviceRoot }))).not.toContain(issued.token)
  })

  test("times out stalled ordinary handlers, contains late work, and recovers", async () => {
    const serviceRoot = root()
    const credential = provisionOfficialClient("deadline-client", { serviceRoot })
    let calls = 0
    let release!: () => void
    const stalled = new Promise<void>((resolve) => { release = resolve })
    const service = startServiceServer({
      serviceRoot,
      handlerTimeoutMs: 20,
      snapshot: {
        buildAll: async () => {
          calls += 1
          if (calls === 1) await stalled
          return []
        },
        buildWorkspace: async () => { throw new Error("unused adapter secret") },
      },
    })
    try {
      const headers = { authorization: `Bearer ${credential.token}` }
      const response = await fetch(new URL("/v1/snapshot", service.url), { headers, signal: AbortSignal.timeout(1_000) })
      expect(response.status).toBe(504)
      const received = await response.json()
      expect(ErrorEnvelopeSchema.parse(received)).toEqual(received)
      const golden = JSON.parse(readFileSync(join(import.meta.dir, "../fixtures/service-v1/request-timeout-error.json"), "utf8"))
      expect(received).toEqual({ ...golden, request_id: received.request_id })
      expect(JSON.stringify(received)).not.toContain("adapter secret")

      release()
      await Bun.sleep(5)
      const discovery = await fetch(new URL("/v1", service.url), { headers })
      expect(discovery.status).toBe(200)
      const recovered = await fetch(new URL("/v1/snapshot", service.url), { headers })
      expect(recovered.status).toBe(200)
      expect(await recovered.json()).toMatchObject({ ok: true, data: [] })
    } finally {
      release()
      await service.stop()
    }
  })

  test("keeps SSE exempt from the ordinary handler deadline", async () => {
    const serviceRoot = root()
    const credential = provisionOfficialClient("sse-deadline-client", { serviceRoot })
    let closed = false
    const subscription = {
      diagnostics: { queuedEvents: 0, queuedBytes: 0, reservedEvents: 0, reservedBytes: 0, combinedEvents: 0, combinedBytes: 0, closed: false },
      peek: () => undefined,
      reserve: () => undefined,
      ack: () => {},
      waitForAvailable: () => new Promise<void>(() => {}),
      onClosed: () => () => {},
      close: () => { closed = true },
    }
    const service = startServiceServer({
      serviceRoot,
      handlerTimeoutMs: 20,
      heartbeatMs: 10,
      snapshot: { buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") } },
      broker: { subscribe: async () => subscription, close: () => {} } as never,
    })
    try {
      const response = await fetch(new URL("/v1/events?cursor=0", service.url), { headers: { authorization: `Bearer ${credential.token}` } })
      expect(response.status).toBe(200)
      const reader = response.body!.getReader()
      await Bun.sleep(50)
      expect((await reader.read()).done).toBe(false)
      expect(closed).toBe(false)
      await reader.cancel()
    } finally {
      await service.stop()
    }
  })
})
