import { createSignal, onCleanup } from "solid-js"
import { listWorkspaces } from "../../../lib/config"
import { listMessages, clearMessages, type MessageRecord } from "../../../lib/messages"
import { setIpcCallback } from "../run"

export function useMessages() {
  const [msgMap, setMsgMap] = createSignal<Map<string, MessageRecord[]>>(new Map())
  // Tick signal — incremented periodically to force re-evaluation of relative times
  const [tick, setTick] = createSignal(0)

  // Eager load all workspaces' messages
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
    } catch {
      // silently ignore — messages are best-effort
    }
  }

  // IPC push handler — prepend new message to workspace's array
  const handleIpc = (record: MessageRecord) => {
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

  // Start loading
  loadAll()

  // Refresh relative times every 30 seconds
  const tickTimer = setInterval(() => setTick(t => t + 1), 30_000)

  // Clear a sender's messages and refresh reactive state
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

  function reloadMessages() {
    loadAll()
  }

  return { msgMap, tick, clearSender, reloadMessages }
}
