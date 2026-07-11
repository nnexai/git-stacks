import type { ServiceEvent } from "./contract"
import type { EventJournal, ReplayResult } from "./event-journal"

export const DEFAULT_SUBSCRIBER_MAX_EVENTS = 256
export const DEFAULT_SUBSCRIBER_MAX_BYTES = 1024 * 1024

export interface EventBrokerLimits { maxEvents?: number; maxBytes?: number }
export interface SlowConsumerDisconnect { reason: "slow_consumer"; last_delivered_cursor: string }
export interface EventReservation { readonly event: ServiceEvent; readonly bytes: number }
export interface EventSubscriptionDiagnostics {
  queuedEvents: number; queuedBytes: number
  reservedEvents: number; reservedBytes: number
  combinedEvents: number; combinedBytes: number
  maxEvents: number; maxBytes: number
  lastTransportAcceptedCursor: string
  closed: boolean
}

export class EventSubscription implements AsyncIterable<ServiceEvent>, AsyncIterator<ServiceEvent> {
  private queue: Array<{ event: ServiceEvent; bytes: number }> = []
  private bytes = 0
  private waiters: Array<() => void> = []
  private reservation?: EventReservation
  private closeListeners = new Set<() => void>()
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

  get pendingEvents(): number { return this.queue.length }
  get pendingBytes(): number { return this.bytes }
  get diagnostics(): EventSubscriptionDiagnostics {
    const reservedEvents = this.reservation ? 1 : 0
    const reservedBytes = this.reservation?.bytes ?? 0
    return {
      queuedEvents: this.queue.length, queuedBytes: this.bytes,
      reservedEvents, reservedBytes,
      combinedEvents: this.queue.length + reservedEvents,
      combinedBytes: this.bytes + reservedBytes,
      maxEvents: this.maxEvents, maxBytes: this.maxBytes,
      lastTransportAcceptedCursor: this.lastDelivered,
      closed: this.closed,
    }
  }

  peek(): EventReservation | undefined { return this.reservation ?? this.queue[0] }

  reserve(): EventReservation | undefined {
    if (this.reservation) return this.reservation
    const item = this.queue.shift()
    if (!item) return undefined
    this.bytes -= item.bytes
    this.reservation = item
    return item
  }

  ack(reservation: EventReservation): void {
    if (this.reservation !== reservation) return
    this.lastDelivered = reservation.event.sequence
    this.reservation = undefined
  }

  waitForAvailable(): Promise<void> {
    if (this.queue.length || this.closed) return Promise.resolve()
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  onClosed(listener: () => void): () => void {
    if (this.closed) { listener(); return () => {} }
    this.closeListeners.add(listener)
    return () => this.closeListeners.delete(listener)
  }

  enqueue(event: ServiceEvent): boolean {
    if (this.closed || BigInt(event.sequence) <= BigInt(this.lastDelivered)) return true
    if (this.queue.some((item) => item.event.sequence === event.sequence)) return true
    const bytes = Buffer.byteLength(JSON.stringify(event), "utf8")
    const diagnostics = this.diagnostics
    if (diagnostics.combinedEvents + 1 > this.maxEvents || diagnostics.combinedBytes + bytes > this.maxBytes) {
      this.disconnect = { reason: "slow_consumer", last_delivered_cursor: this.lastDelivered }
      this.close()
      return false
    }
    this.queue.push({ event, bytes })
    this.bytes += bytes
    for (const waiter of this.waiters.splice(0)) waiter()
    return true
  }

  next(): Promise<IteratorResult<ServiceEvent>> {
    const item = this.reserve()
    if (item) { this.ack(item); return Promise.resolve({ done: false, value: item.event }) }
    if (this.closed) return Promise.resolve({ done: true, value: undefined })
    return this.waitForAvailable().then(() => this.next())
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.queue = []
    this.bytes = 0
    this.reservation = undefined
    for (const resolve of this.waiters.splice(0)) resolve()
    this.onClose()
    for (const listener of [...this.closeListeners]) listener()
    this.closeListeners.clear()
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
