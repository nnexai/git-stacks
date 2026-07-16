// Shared presentation semantics for trusted and browser clients.
export type PresentedSignal = {
  kind: "activity" | "notification"
  source: string
  workspace_id: string
  repository_id?: string
  surface_id?: string
  state?: string
  title?: string
  occurred_at: string
}

export type SignalGroup = "needs-attention" | "recent-activity"

const providerNames: Record<string, string> = {
  claude: "Claude", copilot: "GitHub Copilot", codex: "Codex", opencode: "OpenCode",
  automation: "Automation", acp: "ACP", user: "User", other: "Other",
}
const providerLetters: Record<string, string> = {
  claude: "C", copilot: "G", codex: "X", opencode: "O", automation: "A", acp: "P", user: "U", other: "?",
}
export const issueTrackerLabels: Record<"github" | "gitlab" | "gitea" | "jira", string> = {
  github: "GitHub", gitlab: "GitLab", gitea: "Gitea", jira: "Jira",
}

export function providerName(source: string): string { return providerNames[source] ?? source }
export function providerLetter(source: string): string { return providerLetters[source] ?? (source.slice(0, 1).toUpperCase() || "?") }
export function signalDisplayText(signal: PresentedSignal): string {
  return signal.title ?? (signal.kind === "activity" ? `${signal.source} ${signal.state}` : signal.source)
}
export function lifecycleLabel(signal: PresentedSignal): string {
  if (signal.kind === "notification") return "Unread"
  switch (signal.state) {
    case "waiting": return "Needs input"
    case "failed": return "Failed"
    case "completed": return "Completed"
    case "working": return "Working"
    default: return "Idle"
  }
}
export function signalGroup(signal: PresentedSignal): SignalGroup {
  return signal.kind === "notification" || signal.state === "waiting" || signal.state === "failed" ? "needs-attention" : "recent-activity"
}
export function isActiveSession(signal: PresentedSignal): boolean {
  return signal.kind === "activity" && ["working", "waiting", "completed", "failed"].includes(signal.state ?? "")
}
export function isBackgroundActivity(signal: PresentedSignal): boolean { return signal.kind === "activity" && signal.state === "working" }

const lifecyclePriority: Record<string, number> = { failed: 4, waiting: 3, working: 2, completed: 1 }
export function deduplicateProviderSessions<T extends PresentedSignal>(signals: T[]): T[] {
  const providers = new Map<string, T>()
  for (const signal of signals) {
    if (!isActiveSession(signal)) continue
    const current = providers.get(signal.source)
    const signalPriority = lifecyclePriority[signal.state ?? ""] ?? 0
    const currentPriority = lifecyclePriority[current?.state ?? ""] ?? 0
    if (!current || signalPriority > currentPriority || (signalPriority === currentPriority && signal.occurred_at > current.occurred_at)) providers.set(signal.source, signal)
  }
  return [...providers.values()].sort((left, right) =>
    (lifecyclePriority[right.state ?? ""] ?? 0) - (lifecyclePriority[left.state ?? ""] ?? 0) || left.source.localeCompare(right.source))
}
export function matchesSignalScope(signal: PresentedSignal, workspaceId: string, repositoryId?: string, surfaceId?: string): boolean {
  return signal.workspace_id === workspaceId
    && (!repositoryId || !signal.repository_id || signal.repository_id === repositoryId)
    && (!surfaceId || signal.surface_id === surfaceId)
}
export function relativeTime(occurredAt: string, now = Date.now()): string {
  const occurred = Date.parse(occurredAt)
  if (!Number.isFinite(occurred)) return ""
  const seconds = Math.max(0, Math.floor((now - occurred) / 1000))
  if (seconds < 60) return "now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
export function compactRelativeTime(occurredAt: string, now = Date.now()): string {
  const occurred = Date.parse(occurredAt)
  if (!Number.isFinite(occurred)) return ""
  const seconds = Math.max(0, Math.floor((now - occurred) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export function workspaceSuccessorOrder(
  left: { pinned?: boolean; priority?: number; activity_at: string; name: string; id: string },
  right: { pinned?: boolean; priority?: number; activity_at: string; name: string; id: string },
): number {
  return Number(right.pinned === true) - Number(left.pinned === true)
    || (right.priority ?? 0) - (left.priority ?? 0)
    || Date.parse(right.activity_at) - Date.parse(left.activity_at)
    || left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id)
}

export function workspacePriorityOrder(
  left: { pinned?: boolean; priority?: number; activity_at?: string; name: string; id?: string },
  right: { pinned?: boolean; priority?: number; activity_at?: string; name: string; id?: string },
): number {
  return workspaceSuccessorOrder(
    { ...left, activity_at: left.activity_at ?? "", id: left.id ?? "" },
    { ...right, activity_at: right.activity_at ?? "", id: right.id ?? "" },
  )
}
