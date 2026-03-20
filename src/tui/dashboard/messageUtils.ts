import type { MessageRecord } from "../../lib/messages"

export type SenderGroup = {
  sender: string | undefined   // undefined = "(system)"
  label: string                // "(system)" or sender name
  messages: MessageRecord[]    // newest first within group
}

export function formatAge(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60) return `${diffSecs}s`
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d`
}

export function isStale(isoTimestamp: string, thresholdMs = 30 * 60 * 1000): boolean {
  return Date.now() - new Date(isoTimestamp).getTime() > thresholdMs
}

export function groupBySender(messages: MessageRecord[]): SenderGroup[] {
  const map = new Map<string | undefined, MessageRecord[]>()
  for (const msg of messages) {
    const key = msg.from ?? undefined
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(msg)
  }
  return Array.from(map.entries()).map(([sender, msgs]) => ({
    sender,
    label: sender ?? "(system)",
    messages: msgs,
  }))
}
