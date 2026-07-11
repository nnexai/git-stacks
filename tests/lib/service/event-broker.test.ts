import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { EventBroker } from "@/lib/service/event-broker"
import { EventJournal } from "@/lib/service/event-journal"

const roots: string[] = []
async function journal() {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-broker-")); roots.push(root)
  return new EventJournal({ root })
}
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

const attention = (message: string) => ({ workspace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", code: "message", message })

describe("EventBroker", () => {
  test("hands off replay to queued live records without gaps or duplicates", async () => {
    const store = await journal()
    const broker = new EventBroker(store)
    broker.publish(await store.appendAttention(attention("one")))
    const pending = broker.subscribe("0")
    broker.publish(await store.appendAttention(attention("two")))
    const subscriber = await pending
    expect((await subscriber.next()).value?.sequence).toBe("1")
    expect((await subscriber.next()).value?.sequence).toBe("2")
    subscriber.close()
  })

  test("disconnects at the event cap with the last delivered cursor", async () => {
    const store = await journal()
    const broker = new EventBroker(store, { maxEvents: 2, maxBytes: 1_000_000 })
    const subscriber = await broker.subscribe("0")
    for (const message of ["one", "two", "three"]) broker.publish(await store.appendAttention(attention(message)))
    expect(subscriber.disconnect).toEqual({ reason: "slow_consumer", last_delivered_cursor: "0" })
    expect(broker.subscriberCount).toBe(0)
  })

  test("disconnects at the encoded byte cap", async () => {
    const store = await journal()
    const broker = new EventBroker(store, { maxEvents: 256, maxBytes: 200 })
    const subscriber = await broker.subscribe("0")
    broker.publish(await store.appendAttention(attention("x".repeat(500))))
    expect(subscriber.disconnect?.reason).toBe("slow_consumer")
  })

  test("publishing is synchronous and isolates subscribers", async () => {
    const store = await journal()
    const broker = new EventBroker(store)
    const failed = await broker.subscribe("0")
    const healthy = await broker.subscribe("0")
    failed.close()
    const event = await store.appendAttention(attention("now"))
    const start = performance.now()
    broker.publish(event)
    expect(performance.now() - start).toBeLessThan(10)
    expect((await healthy.next()).value?.sequence).toBe(event.sequence)
  })
})
