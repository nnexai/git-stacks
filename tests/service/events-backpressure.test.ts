import { afterEach, describe, expect, test } from "@test/api"
import { setTimeout as sleep } from "node:timers/promises"
import { connect } from "node:net"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { provisionOfficialClient } from "../../packages/service/src/policy/credentials"
import { EventBroker } from "../../packages/service/src/policy/event-broker"
import { EventJournal } from "../../packages/service/src/policy/event-journal"
import { startServiceServer } from "../../packages/service/src/server"

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

async function harness(limits: { maxEvents: number; maxBytes: number }) {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-pressure-"))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const journal = new EventJournal({ root })
  const broker = new EventBroker(journal, limits)
  const client = provisionOfficialClient("pressure-client", { serviceRoot: root })
  const service = await startServiceServer({
    serviceRoot: root, broker,
    snapshot: { buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") } },
    heartbeatMs: 60_000,
  })
  cleanup.push(() => service.stop())
  const socket = connect({ host: "127.0.0.1", port: Number(service.url.port) })
  socket.write(`GET /v1/events?cursor=0 HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${client.token}\r\nConnection: keep-alive\r\n\r\n`)
  await sleep(20)
  socket.pause()
  cleanup.push(() => { socket.destroy() })
  return { root, journal, broker, service, socket }
}

async function publishUntilConnections(input: Awaited<ReturnType<typeof harness>>, targetConnections: number, payloadBytes: number, max = 2000, firstSequence = 1) {
  const start = performance.now()
  for (let index = 0; index < max && input.service.connectedClients > targetConnections; index++) {
    const event = {
      protocol: "v1" as const,
      sequence: String(index + firstSequence),
      timestamp: new Date().toISOString(),
      type: "signal" as const,
      signal: { version: 1 as const, kind: "notification" as const, id: `sig_${String(index + firstSequence).padStart(16, "0")}`, source: "automation" as const, workspace_id: workspaceId, title: `${index}:${"x".repeat(payloadBytes)}`, occurred_at: new Date().toISOString() },
    }
    input.broker.publish(event)
    const bridge = input.service.sseDiagnostics[0]
    if (bridge) {
      expect(bridge.combinedPendingEvents).toBeLessThanOrEqual(bridge.maxEvents)
      expect(bridge.combinedPendingBytes).toBeLessThanOrEqual(bridge.maxBytes)
    }
  }
  expect(performance.now() - start).toBeLessThan(10_000)
}

describe("real loopback SSE backpressure", () => {
  test("stalled reader remains charged and overflows the shared event cap", async () => {
    const input = await harness({ maxEvents: 4, maxBytes: 16 * 1024 * 1024 })
    await publishUntilConnections(input, 0, 1024 * 1024)
    expect(input.broker.subscriberCount).toBe(0)
    expect(input.service.connectedClients).toBe(0)
    expect(input.service.sseDiagnostics).toHaveLength(0)
  }, 20_000)

  test("stalled reader overflows shared encoded bytes while a draining reader progresses", async () => {
    const input = await harness({ maxEvents: 256, maxBytes: 700 * 1024 })
    const client = provisionOfficialClient("healthy-client", { serviceRoot: input.root })
    const responsePending = fetch(new URL("/v1/events?cursor=0", input.service.url), { headers: { authorization: `Bearer ${client.token}` } })
    await sleep(20)
    input.broker.publish({ protocol: "v1", sequence: "1", timestamp: new Date().toISOString(), type: "signal", signal: { version: 1, kind: "notification", id: "sig_0000000000000001", source: "automation", workspace_id: workspaceId, title: "ready", occurred_at: new Date().toISOString() } })
    const response = await responsePending
    const reader = response.body!.getReader()
    const draining = (async () => {
      let streamed = ""
      while (!streamed.includes('"sequence":"1"')) {
        const chunk = await reader.read()
        if (chunk.done) break
        streamed += new TextDecoder().decode(chunk.value)
      }
      return streamed
    })()
    expect(await draining).toContain('"sequence":"1"')
    await reader.cancel()
    await sleep(20)
    await publishUntilConnections(input, 0, 300 * 1024, 2000, 2)
    expect(input.broker.subscriberCount).toBe(0)
    expect(input.service.connectedClients).toBe(0)
  }, 20_000)
})
