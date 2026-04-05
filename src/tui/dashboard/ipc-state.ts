import type { MessageRecord } from "../../lib/messages"

export type SocketStatus = "off" | "bound" | "error"

let onIpcMessage: ((record: MessageRecord) => void) | null = null

export let socketStatus: SocketStatus = "off"

export function setSocketStatus(status: SocketStatus): void {
  socketStatus = status
}

export function setIpcCallback(fn: ((record: MessageRecord) => void) | null): void {
  onIpcMessage = fn
}

export function dispatchIpcMessage(record: MessageRecord): void {
  onIpcMessage?.(record)
}
