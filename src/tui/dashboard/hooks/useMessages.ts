import { createSignal, onCleanup } from "solid-js"
import { listWorkspaces } from "../../../lib/config"
import { listMessages, listMessagesSync, clearMessages, type MessageRecord } from "../../../lib/messages"
import { setIpcCallback } from "../ipc-state"

export function useMessages() {
  const [msgMap, setMsgMap] = createSignal<Map<string, MessageRecord[]>>(new Map())
  const [tick, setTick] = createSignal(0)
  const [ipcCount, setIpcCount] = createSignal(0)

  // Synchronous load — used by R refresh so setMsgMap fires before reload()
  function loadAllSync() {
    try {
      const workspaces = listWorkspaces()
      const m = new Map<string, MessageRecord[]>()
      for (const ws of workspaces) {
        try {
          const msgs = listMessagesSync(ws.name)
          if (msgs.length > 0) m.set(ws.name, msgs)
        } catch { /* skip workspace */ }
      }
      setMsgMap(m)
    } catch { /* silently ignore */ }
  }

  // Async load — used by initial mount and tick timer
  async function loadAll() {
    try {
      const workspaces = listWorkspaces()
      const results = await Promise.allSettled(
        workspaces.map(async (ws) => {
          const msgs = await listMessages(ws.name)
          return [ws.name, msgs] as const
        })
      )
      const m = new Map<string, MessageRecord[]>()
      for (const r of results) {
        if (r.status === "fulfilled") {
          const [name, msgs] = r.value
          if (msgs.length > 0) m.set(name, msgs)
        }
      }
      setMsgMap(m)
    } catch { /* silently ignore */ }
  }

  // IPC push handler
  const handleIpc = (record: MessageRecord) => {
    setIpcCount(c => c + 1)
    setMsgMap(prev => {
      const next = new Map(prev)
      const existing = next.get(record.workspace) ?? []
      next.set(record.workspace, [record, ...existing])
      return next
    })
  }

  setIpcCallback(handleIpc)

  onCleanup(() => {
    setIpcCallback(null)
    clearInterval(tickTimer)
  })

  // Initial load (async is fine — no concurrent reload() at startup)
  loadAll()

  // Every 30s: reload files + bump tick
  const tickTimer = setInterval(() => {
    loadAll()
    setTick(t => t + 1)
  }, 30_000)

  async function clearSender(workspaceName: string, sender: string | undefined) {
    await clearMessages(workspaceName, sender ?? undefined)
    const refreshed = await listMessages(workspaceName)
    setMsgMap(prev => {
      const next = new Map(prev)
      if (refreshed.length > 0) {
        next.set(workspaceName, refreshed)
      } else {
        next.delete(workspaceName)
      }
      return next
    })
  }

  // Synchronous reload — setMsgMap fires immediately before caller's next line
  function reloadMessages() {
    loadAllSync()
    setTick(t => t + 1)
  }

  return { msgMap, tick, ipcCount, clearSender, reloadMessages }
}
