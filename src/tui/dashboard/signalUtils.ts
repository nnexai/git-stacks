import type { DashboardSignal } from "./hooks/useSignals"
import { compactRelativeTime, signalDisplayText } from "../../lib/service/presentation"

export function formatSignalAge(timestamp: string, now = Date.now()): string {
  return compactRelativeTime(timestamp, now)
}

export function signalText(signal: DashboardSignal): string {
  return signalDisplayText(signal)
}
