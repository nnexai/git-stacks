export type TerminalAttachmentData = {
  kind: "web-terminal"
  principalId: string
  sessionId: string
  streaming: boolean
}

export interface TerminalAttachment {
  readonly data: TerminalAttachmentData
  send(data: string | Uint8Array): number
  close(code?: number, reason?: string): void
  getBufferedAmount(): number
}
