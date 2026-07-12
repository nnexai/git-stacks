import { mkdir, open, readFile, rename, stat, truncate, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { OperationSchema, ServiceEventSchema, StructuredAttentionEventSchema, type Operation, type ServiceEvent, type StructuredAttentionEvent } from "./contract"

export const DEFAULT_EVENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000
export const DEFAULT_EVENT_MAX_BYTES = 64 * 1024 * 1024

export interface EventJournalOptions {
  root: string
  now?: () => number
  snapshotRevision?: () => string | Promise<string>
  maxAgeMs?: number
  maxBytes?: number
  createRoot?: boolean
}

export type OperationEventPayload = Operation
export type AttentionEventPayload = { workspace_id: string; code: string; message: string } | Omit<StructuredAttentionEvent, "journal_sequence">
export type SnapshotInvalidationEventPayload = { kind: "snapshot_invalidated"; revision: string }
export type ReplayResult =
  | { kind: "events"; events: ServiceEvent[] }
  | { kind: "replay_gap"; requested: string; earliest_cursor: string; latest_cursor: string; snapshot_revision: string }

function cursor(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`invalid cursor: ${value}`)
  return BigInt(value)
}

export class EventJournal {
  private readonly path: string
  private readonly now: () => number
  private readonly snapshotRevision: () => string | Promise<string>
  private readonly maxAgeMs: number
  private readonly maxBytes: number
  private readonly createRoot: boolean
  private queue: Promise<unknown> = Promise.resolve()
  private initialized = false
  private records: ServiceEvent[] = []
  private nextSequence = 1n

  constructor(private readonly options: EventJournalOptions) {
    this.path = join(options.root, "events.jsonl")
    this.now = options.now ?? Date.now
    this.snapshotRevision = options.snapshotRevision ?? (() => "0")
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_EVENT_MAX_AGE_MS
    this.maxBytes = options.maxBytes ?? DEFAULT_EVENT_MAX_BYTES
    this.createRoot = options.createRoot ?? true
  }

  private serialized<T>(run: () => Promise<T>): Promise<T> {
    const result = this.queue.then(run, run)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  async withSerialization<T>(run: (highWater: string) => Promise<T>): Promise<T> {
    return this.serialized(async () => {
      await this.initialize()
      return run((this.nextSequence - 1n).toString())
    })
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.createRoot) await mkdir(this.options.root, { recursive: true, mode: 0o700 })
    let raw: string
    try { raw = await readFile(this.path, "utf8") } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      raw = ""
    }
    const finalNewline = raw.length === 0 || raw.endsWith("\n")
    const parts = raw.split("\n")
    if (!finalNewline) parts.pop()
    const records: ServiceEvent[] = []
    for (const [index, line] of parts.entries()) {
      if (!line) continue
      let value: unknown
      try { value = JSON.parse(line) } catch { throw new Error(`corrupt journal record at line ${index + 1}`) }
      const parsed = ServiceEventSchema.safeParse(value)
      if (!parsed.success) throw new Error(`corrupt journal record at line ${index + 1}: ${parsed.error.message}`)
      if (records.length && cursor(parsed.data.sequence) <= cursor(records.at(-1)!.sequence)) throw new Error(`corrupt journal ordering at line ${index + 1}`)
      records.push(parsed.data)
    }
    if (!finalNewline) await truncate(this.path, raw.lastIndexOf("\n") + 1)
    this.records = records
    this.nextSequence = records.length ? cursor(records.at(-1)!.sequence) + 1n : 1n
    this.initialized = true
  }

  private async append(build: (sequence: string, timestamp: string) => ServiceEvent): Promise<ServiceEvent> {
    return this.serialized(async () => {
      await this.initialize()
      const event = ServiceEventSchema.parse(build(this.nextSequence.toString(), new Date(this.now()).toISOString()))
      const handle = await open(this.path, "a", 0o600)
      try {
        await handle.write(`${JSON.stringify(event)}\n`, null, "utf8")
        await handle.sync()
      } finally { await handle.close() }
      this.records.push(event)
      this.nextSequence += 1n
      return event
    })
  }

  appendOperation(operation: OperationEventPayload): Promise<ServiceEvent> {
    const validated = OperationSchema.parse(operation)
    return this.append((sequence, timestamp) => ({ protocol: "v1", sequence, timestamp, type: "operation", operation: validated }))
  }

  appendAttention(attention: AttentionEventPayload): Promise<ServiceEvent> {
    return this.append((sequence, timestamp) => ({ protocol: "v1", sequence, timestamp, type: "attention", attention:
      "state" in attention ? StructuredAttentionEventSchema.parse({ ...attention, journal_sequence: sequence }) : attention }))
  }

  appendSnapshotInvalidated(revision: string): Promise<ServiceEvent> {
    return this.append((sequence, timestamp) => ({
      protocol: "v1", sequence, timestamp, type: "control",
      control: { kind: "snapshot_invalidated", revision },
    }))
  }

  async highWaterCursor(): Promise<string> {
    return this.serialized(async () => { await this.initialize(); return (this.nextSequence - 1n).toString() })
  }

  async earliestCursor(): Promise<string> {
    return this.serialized(async () => { await this.initialize(); return this.records[0]?.sequence ?? this.nextSequence.toString() })
  }

  async replay(after: string, through?: string): Promise<ReplayResult> {
    return this.serialized(async () => this.replayLoaded(after, through))
  }

  private async replayLoaded(after: string, through?: string): Promise<ReplayResult> {
    await this.initialize()
    const requested = cursor(after)
    const earliest = this.records[0] ? cursor(this.records[0].sequence) : this.nextSequence
    const latest = this.records.at(-1) ? cursor(this.records.at(-1)!.sequence) : this.nextSequence - 1n
    if (this.records.length && requested < earliest - 1n) {
      return { kind: "replay_gap", requested: after, earliest_cursor: earliest.toString(), latest_cursor: latest.toString(), snapshot_revision: await this.snapshotRevision() }
    }
    const upper = through === undefined ? latest : cursor(through)
    return { kind: "events", events: this.records.filter((record) => cursor(record.sequence) > requested && cursor(record.sequence) <= upper) }
  }

  replayWithinBoundary(after: string, through: string): Promise<ReplayResult> {
    return this.replayLoaded(after, through)
  }

  async compact(): Promise<void> {
    await this.serialized(async () => {
      await this.initialize()
      const cutoff = this.now() - this.maxAgeMs
      let retained = this.records.filter((record) => Date.parse(record.timestamp) >= cutoff)
      const encoded = (record: ServiceEvent) => `${JSON.stringify(record)}\n`
      let bytes = retained.reduce((sum, record) => sum + Buffer.byteLength(encoded(record)), 0)
      while (retained.length > 1 && bytes > this.maxBytes) bytes -= Buffer.byteLength(encoded(retained.shift()!))
      if (retained.length === 1 && bytes > this.maxBytes) retained = []
      const temporary = `${this.path}.${process.pid}.${crypto.randomUUID()}.tmp`
      const content = retained.map(encoded).join("")
      await writeFile(temporary, content, { mode: 0o600 })
      const handle = await open(temporary, "r")
      try { await handle.sync() } finally { await handle.close() }
      await rename(temporary, this.path)
      this.records = retained
      try { await unlink(temporary) } catch {}
      await stat(this.path)
    })
  }
}

export type OperationEventPublisher = (operation: OperationEventPayload) => Promise<ServiceEvent>

export async function publishOperationEvent(
  journal: EventJournal,
  operation: OperationEventPayload,
  publish?: (event: ServiceEvent) => void | Promise<void>,
): Promise<ServiceEvent> {
  const event = await journal.appendOperation(operation)
  if (publish) await publish(event)
  return event
}
