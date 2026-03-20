import { createSignal, onCleanup } from "solid-js"
import { listWorkspaces } from "../../../lib/config"
import { listMessages, clearMessages, type MessageRecord } from "../../../lib/messages"
import { setIpcCallback } from "../run"

export function useMessages() {
  const [msgMap, setMsgMap] = createSignal<Map<string, MessageRecord[]>>(new Map())

  // Eager load all workspaces' messages
  async function loadAll() {
    const workspaces = listWorkspaces()
    const results = await Promise.all(
      workspaces.map(async (ws) => {
        const msgs = await listMessages(ws.name)
        return [ws.name, msgs] as const
      })
    )
    const m = new Map<string, MessageRecord[]>()
    for (const [name, msgs] of results) {
      if (msgs.length > 0) m.set(name, msgs)
    }
    setMsgMap(m)
  }

  // IPC push handler — prepend new message to workspace's array
  // setMsgMap is a stable reference from createSignal, safe in closure
  const handleIpc = (record: MessageRecord) => {
    setMsgMap(prev => {
      const next = new Map(prev)
      const existing = next.get(record.workspace) ?? []
      next.set(record.workspace, [record, ...existing])
      return next
    })
  }

  // Assign the IPC callback once during initialization
  setIpcCallback(handleIpc)

  // Cleanup on unmount
  onCleanup(() => {
    setIpcCallback(null)
  })

  // Start loading
  loadAll()

  // Per-workspace message accessor (returns newest-first array)
  const messagesFor = (workspaceName: string): MessageRecord[] =>
    msgMap().get(workspaceName) ?? []

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

  // Reload all messages (e.g. after manual R refresh)
  function reloadMessages() {
    loadAll()
  }

  return { messagesFor, clearSender, reloadMessages }
}
