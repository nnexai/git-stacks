import type { Signal, WebRepository, WebTerminal, WebWorkspace } from "@git-stacks/protocol"
import { matchesSignalScope, signalGroup, workspaceSuccessorOrder } from "./presentation.js"

export type AttentionRepository = Pick<WebRepository, "id" | "name">

export type AttentionWorkspace = Pick<WebWorkspace, "id" | "name" | "activity_at" | "priority"> & {
  pinned?: boolean
  repositories: readonly AttentionRepository[]
}

export type AttentionTerminal = Pick<WebTerminal, "id" | "workspace_id" | "repository_id" | "surface_id" | "state">

export type AttentionTarget = {
  workspaceId: string
  repositoryId: string
  terminalId?: string
  surfaceId?: string
}

export type AttentionInput = {
  workspaces: readonly AttentionWorkspace[]
  signals: readonly Signal[]
  terminals: readonly AttentionTerminal[]
  tabOrder: readonly string[]
  dismissedSignalIds?: readonly string[]
  current?: Pick<AttentionTarget, "workspaceId" | "repositoryId" | "terminalId">
}

export type AttentionCandidate = {
  target: AttentionTarget
  signal: Signal
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function targetKey(target: AttentionTarget): string {
  return `${target.workspaceId}\0${target.repositoryId}\0${target.terminalId ?? ""}`
}

function isResolvableTerminal(terminal: AttentionTerminal): boolean {
  return terminal.state === "starting" || terminal.state === "running"
}

function signalSeverity(signal: Signal): number {
  if (signal.kind === "activity" && signal.state === "failed") return 4
  if (signal.kind === "activity" && signal.state === "waiting") return 3
  if (signal.kind === "notification") return 2
  return 1
}

function representativeOrder(left: Signal, right: Signal): number {
  return signalSeverity(right) - signalSeverity(left)
    || Date.parse(right.occurred_at) - Date.parse(left.occurred_at)
    || lexicalCompare(left.id, right.id)
}

function tabIndex(tabOrder: readonly string[], terminalId: string | undefined): number {
  if (!terminalId) return -1
  const index = tabOrder.indexOf(terminalId)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

export function buildAttentionCandidates(input: AttentionInput): AttentionCandidate[] {
  const dismissed = new Set(input.dismissedSignalIds ?? [])
  const workspaces = new Map(input.workspaces.map((workspace) => [workspace.id, workspace]))
  const terminalsBySurface = new Map<string, AttentionTerminal>()
  for (const terminal of input.terminals) {
    if (!isResolvableTerminal(terminal)) continue
    const current = terminalsBySurface.get(terminal.surface_id)
    if (!current || lexicalCompare(terminal.id, current.id) < 0) terminalsBySurface.set(terminal.surface_id, terminal)
  }

  const candidates = new Map<string, AttentionCandidate>()
  for (const signal of input.signals) {
    if (dismissed.has(signal.id) || signalGroup(signal) !== "needs-attention") continue
    const workspace = workspaces.get(signal.workspace_id)
    if (!workspace || !signal.repository_id) continue
    const repository = workspace.repositories.find(({ id }) => id === signal.repository_id)
    if (!repository || !matchesSignalScope(signal, workspace.id, repository.id)) continue

    let target: AttentionTarget = { workspaceId: workspace.id, repositoryId: repository.id }
    if (signal.surface_id) {
      const terminal = terminalsBySurface.get(signal.surface_id)
      if (!terminal
        || terminal.workspace_id !== workspace.id
        || terminal.repository_id !== repository.id
        || !matchesSignalScope(signal, workspace.id, repository.id, terminal.surface_id)) continue
      target = {
        ...target,
        terminalId: terminal.id,
        surfaceId: terminal.surface_id,
      }
    }

    const key = targetKey(target)
    const existing = candidates.get(key)
    if (!existing || representativeOrder(signal, existing.signal) < 0) candidates.set(key, { target, signal })
  }

  return [...candidates.values()].sort((left, right) => {
    const leftWorkspace = workspaces.get(left.target.workspaceId)!
    const rightWorkspace = workspaces.get(right.target.workspaceId)!
    const workspaceOrder = workspaceSuccessorOrder(leftWorkspace, rightWorkspace)
    if (workspaceOrder) return workspaceOrder

    const leftRepository = leftWorkspace.repositories.find(({ id }) => id === left.target.repositoryId)!
    const rightRepository = rightWorkspace.repositories.find(({ id }) => id === right.target.repositoryId)!
    return lexicalCompare(leftRepository.name, rightRepository.name)
      || lexicalCompare(leftRepository.id, rightRepository.id)
      || tabIndex(input.tabOrder, left.target.terminalId) - tabIndex(input.tabOrder, right.target.terminalId)
      || lexicalCompare(left.target.terminalId ?? "", right.target.terminalId ?? "")
      || representativeOrder(left.signal, right.signal)
  })
}

function isCurrentTarget(candidate: AttentionTarget, current: AttentionInput["current"]): boolean {
  return current !== undefined
    && candidate.workspaceId === current.workspaceId
    && candidate.repositoryId === current.repositoryId
    && candidate.terminalId === current.terminalId
}

export function selectNextAttentionTarget(input: AttentionInput): AttentionCandidate | undefined {
  const candidates = buildAttentionCandidates(input)
  if (!candidates.length) return undefined
  const currentIndex = candidates.findIndex(({ target }) => isCurrentTarget(target, input.current))
  return candidates[currentIndex === -1 ? 0 : (currentIndex + 1) % candidates.length]
}
