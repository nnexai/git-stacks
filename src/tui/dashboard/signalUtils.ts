import type { DashboardSignal } from "./hooks/useSignals"

export function formatSignalAge(timestamp: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function signalText(signal: DashboardSignal): string {
  return signal.title ?? (signal.kind === "activity" ? `${signal.source} ${signal.state}` : signal.source)
}
