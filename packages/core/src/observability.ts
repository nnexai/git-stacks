// Canonical implementation owned by @git-stacks/core.
import { configure, getLogger, getStreamSink, type Logger, type LogRecord } from "@logtape/logtape"

const ROOT_CATEGORY = "git-stacks"
const STDERR_SINK_ID = "stderr"

let enabled = false
let allowedCategories: Set<string> | null = null
const loggers = new Map<string, Logger>()

// Short alias → internal category name
const MODULE_ALIASES = new Map<string, string>([
  ["lifecycle", "workspace-lifecycle"],
  ["git", "workspace-git"],
  ["status", "workspace-status"],
  ["env", "workspace-env"],
  ["yaml", "workspace-yaml"],
])

// Internal category → short module name for output
function renderModuleName(category: string): string {
  // Strip "workspace-" prefix when present
  if (category.startsWith("workspace-")) {
    return category.slice("workspace-".length)
  }
  return category
}

function sanitizeMsg(msg: string): string {
  return msg.replace(/[\r\n]+/g, " ").trim()
}

function parseSelector(value: string | undefined): { enabled: boolean; categories: Set<string> | null } {
  if (value === undefined || value === "" || value === "0" || value === "false") {
    return { enabled: false, categories: null }
  }
  if (value === "1" || value === "true") {
    return { enabled: true, categories: null }
  }
  // Comma-separated token list
  const tokens = value
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)
  const categories = new Set<string>()
  for (const token of tokens) {
    const resolved = MODULE_ALIASES.get(token) ?? token
    categories.add(resolved)
  }
  return { enabled: categories.size > 0, categories }
}

function isCategoryAllowed(category: string): boolean {
  if (!enabled) return false
  if (allowedCategories === null) return true
  return allowedCategories.has(category)
}

function renderCategory(category: readonly string[]): string {
  return category[category.length - 1] ?? ROOT_CATEGORY
}

function renderMessage(record: LogRecord): string {
  return record.message.map((part) => String(part)).join("")
}

function createStderrSink() {
  return getStreamSink(
    new WritableStream<Uint8Array>({
      write(chunk) {
        process.stderr.write(chunk)
      },
    }),
    {
      formatter: (record) => {
        const cat = renderCategory(record.category)
        const msg = renderMessage(record)
        return `[${cat}] ${msg}`
      },
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

function formatErrorDetail(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as PromiseLike<T> | null)?.then === "function"
}

export async function configureObservability(selector: string | undefined): Promise<void> {
  const parsed = parseSelector(selector)
  allowedCategories = parsed.categories
  await applyObservabilityConfig(parsed.enabled ? "debug" : null)
}

export async function silenceObservability(): Promise<void> {
  allowedCategories = null
  await applyObservabilityConfig(null)
}

export function debugEnabled(): boolean {
  return enabled
}

export function logDebug(category: string, detail: string): void {
  if (!isCategoryAllowed(category)) return
  const moduleName = renderModuleName(category)
  const line = `op=debug module=${moduleName} msg=${sanitizeMsg(detail)}`
  getCategoryLogger(category).debug("{line}", { line })
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
  if (!isCategoryAllowed(category)) {
    return run()
  }

  const moduleName = renderModuleName(category)
  const startedAt = performance.now()

  const emitCompletion = (durationMs: number) => {
    const ms = Math.round(durationMs)
    const line = `op=${operation} module=${moduleName} msg=completed ms=${ms}`
    getCategoryLogger(category).debug("{line}", { line })
  }

  const emitFailure = (durationMs: number, error: unknown) => {
    const ms = Math.round(durationMs)
    const line = `op=${operation} module=${moduleName} msg=failed (${formatErrorDetail(error)}) ms=${ms}`
    getCategoryLogger(category).debug("{line}", { line })
  }

  try {
    const result = run()
    if (isPromiseLike(result)) {
      return result.then(
        (value) => {
          emitCompletion(performance.now() - startedAt)
          return value
        },
        (error) => {
          emitFailure(performance.now() - startedAt, error)
          throw error
        }
      )
    }

    emitCompletion(performance.now() - startedAt)
    return result
  } catch (error) {
    emitFailure(performance.now() - startedAt, error)
    throw error
  }
}
