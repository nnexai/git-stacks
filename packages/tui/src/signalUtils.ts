import type { DashboardSignal } from "./hooks/useSignals"

import { compactRelativeTime, signalDisplayText } from "@git-stacks/client"

export function formatSignalAge(timestamp: string, now = Date.now()): string {
  return compactRelativeTime(timestamp, now)
}

export function signalText(signal: DashboardSignal): string {
  return signalDisplayText(signal)
}
