import { configure, getLogger, getStreamSink, type Logger, type LogRecord } from "@logtape/logtape"

const ROOT_CATEGORY = "git-stacks"
const STDERR_SINK_ID = "stderr"

let enabled = false
const loggers = new Map<string, Logger>()

function renderCategory(category: readonly string[]): string {
  return category[category.length - 1] ?? ROOT_CATEGORY
}

function renderMessage(record: LogRecord): string {
  return record.message.map((part) => String(part)).join("")
}

function createStderrSink() {
  let writer: ReturnType<typeof Bun.stderr.writer> | null = null

  return getStreamSink(
    new WritableStream<Uint8Array>({
      start() {
        writer = Bun.stderr.writer()
      },
      write(chunk) {
        writer ??= Bun.stderr.writer()
        writer.write(chunk)
      },
      close() {
        writer?.flush()
      },
      abort() {
        writer?.flush()
      },
    }),
    {
      formatter: (record) => `[${renderCategory(record.category)}] ${renderMessage(record)}`,
    }
  )
}

async function applyObservabilityConfig(lowestLevel: "debug" | null): Promise<void> {
  await configure({
    reset: true,
    sinks: {
      [STDERR_SINK_ID]: createStderrSink(),
    },
    loggers: [
      {
        category: [],
        sinks: [STDERR_SINK_ID],
        lowestLevel,
      },
      {
        category: "logtape",
        sinks: [STDERR_SINK_ID],
        lowestLevel: lowestLevel === null ? null : "error",
      },
    ],
  })

  enabled = lowestLevel !== null
}

function getCategoryLogger(category: string): Logger {
  let logger = loggers.get(category)
  if (logger) return logger

  logger = getLogger([ROOT_CATEGORY, category])
  loggers.set(category, logger)
  return logger
}

function formatDuration(durationMs: number): string {
  return `${Math.round(durationMs)}ms`
}

function formatErrorDetail(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function logCompletion(category: string, operation: string, startedAt: number): void {
  logDebug(category, `${operation}: ${formatDuration(performance.now() - startedAt)}`)
}

function logFailure(category: string, operation: string, startedAt: number, error: unknown): void {
  logDebug(
    category,
    `${operation}: failed after ${formatDuration(performance.now() - startedAt)} (${formatErrorDetail(error)})`
  )
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as PromiseLike<T> | null)?.then === "function"
}

export async function configureObservability(enabledForProcess: boolean): Promise<void> {
  await applyObservabilityConfig(enabledForProcess ? "debug" : null)
}

export async function silenceObservability(): Promise<void> {
  await configureObservability(false)
}

export function debugEnabled(): boolean {
  return enabled
}

export function logDebug(category: string, detail: string): void {
  if (!enabled) return
  getCategoryLogger(category).debug("{detail}", { detail })
}

export function timeOperation<T>(
  category: string,
  operation: string,
  run: () => Promise<T>
): Promise<T>
export function timeOperation<T>(
  category: string,
  operation: string,
  run: () => T
): T
export function timeOperation<T>(
  category: string,
  operation: string,
  run: () => T | Promise<T>
): T | Promise<T> {
  if (!enabled) {
    return run()
  }

  const startedAt = performance.now()

  try {
    const result = run()
    if (isPromiseLike(result)) {
      return result.then(
        (value) => {
          logCompletion(category, operation, startedAt)
          return value
        },
        (error) => {
          logFailure(category, operation, startedAt, error)
          throw error
        }
      )
    }

    logCompletion(category, operation, startedAt)
    return result
  } catch (error) {
    logFailure(category, operation, startedAt, error)
    throw error
  }
}
