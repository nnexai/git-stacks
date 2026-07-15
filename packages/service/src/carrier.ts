export type WebSocketData = {

  kind: "web-terminal"
  principalId: string
  sessionId: string
  streaming: boolean
}

export interface TerminalSocket {
  readonly data: WebSocketData
  send(data: string | Uint8Array): number
  close(code?: number, reason?: string): void
  getBufferedAmount(): number
}

export interface ServiceRequestContext {
  readonly hostname: string
  readonly port: number
  timeout(request: Request, seconds: number): void
  upgrade(request: Request, options: { data: WebSocketData }): boolean
}
