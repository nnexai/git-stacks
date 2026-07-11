import type { ServiceEvent } from "./contract"
import type { EventJournal, ReplayResult } from "./event-journal"

export const DEFAULT_SUBSCRIBER_MAX_EVENTS = 256
export const DEFAULT_SUBSCRIBER_MAX_BYTES = 1024 * 1024

export interface EventBrokerLimits { maxEvents?: number; maxBytes?: number }
export interface SlowConsumerDisconnect { reason: "slow_consumer"; last_delivered_cursor: string }

export class EventSubscription implements AsyncIterable<ServiceEvent>, AsyncIterator<ServiceEvent> {
  private queue: Array<{ event: ServiceEvent; bytes: number }> = []
  private bytes = 0
  private waiters: Array<(result: IteratorResult<ServiceEvent>) => void> = []
  private closed = false
  private lastDelivered: string
  disconnect?: SlowConsumerDisconnect

  constructor(
    after: string,
    private readonly maxEvents: number,
    private readonly maxBytes: number,
    private readonly onClose: () => void,
  ) { this.lastDelivered = after }

  [Symbol.asyncIterator](): AsyncIterator<ServiceEvent> { return this }

  enqueue(event: ServiceEvent): boolean {
    if (this.closed || BigInt(event.sequence) <= BigInt(this.lastDelivered)) return true
    if (this.queue.some((item) => item.event.sequence === event.sequence)) return true
    const bytes = Buffer.byteLength(JSON.stringify(event), "utf8")
    if (this.queue.length + 1 > this.maxEvents || this.bytes + bytes > this.maxBytes) {
      this.disconnect = { reason: "slow_consumer", last_delivered_cursor: this.lastDelivered }
      this.close()
      return false
    }
    const waiter = this.waiters.shift()
    if (waiter) {
      this.lastDelivered = event.sequence
      waiter({ done: false, value: event })
    } else {
      this.queue.push({ event, bytes })
      this.bytes += bytes
    }
    return true
  }

  next(): Promise<IteratorResult<ServiceEvent>> {
    const item = this.queue.shift()
    if (item) {
      this.bytes -= item.bytes
      this.lastDelivered = item.event.sequence
      return Promise.resolve({ done: false, value: item.event })
    }
    if (this.closed) return Promise.resolve({ done: true, value: undefined })
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.queue = []
    this.bytes = 0
    for (const resolve of this.waiters.splice(0)) resolve({ done: true, value: undefined })
    this.onClose()
  }
}

export type EventSubscribeResult = EventSubscription | ReplayResult

export class EventBroker {
  private readonly subscribers = new Set<EventSubscription>()
  private readonly maxEvents: number
  private readonly maxBytes: number

  constructor(private readonly journal: EventJournal, limits: EventBrokerLimits = {}) {
    this.maxEvents = limits.maxEvents ?? DEFAULT_SUBSCRIBER_MAX_EVENTS
    this.maxBytes = limits.maxBytes ?? DEFAULT_SUBSCRIBER_MAX_BYTES
  }

  get subscriberCount(): number { return this.subscribers.size }

  async subscribe(after: string): Promise<EventSubscription> {
    return this.journal.withSerialization(async (highWater) => {
      const subscriber = new EventSubscription(after, this.maxEvents, this.maxBytes, () => this.subscribers.delete(subscriber))
      this.subscribers.add(subscriber)
      const replay = await this.journal.replayWithinBoundary(after, highWater)
      if (replay.kind === "replay_gap") {
        subscriber.close()
        throw Object.assign(new Error("replay gap"), { replay })
      }
      for (const event of replay.events) {
        if (!subscriber.enqueue(event)) break
      }
      return subscriber
    })
  }

  publish(event: ServiceEvent): void {
    for (const subscriber of [...this.subscribers]) {
      try { subscriber.enqueue(event) } catch { subscriber.close() }
    }
  }

  close(): void {
    for (const subscriber of [...this.subscribers]) subscriber.close()
  }
}
