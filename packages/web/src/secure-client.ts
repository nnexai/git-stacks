import {
  authenticateSecureCarrier,
  connectBrowserWebTransport,
  type FramedDuplex,
  type SecureRpcClient,
} from "@git-stacks/client"
import { decodeCanonical, type SecureFrame, type SecureScope } from "@git-stacks/protocol"

type LaunchDescriptor = {
  version: 1
  endpoint: string
  certificate_hash: string
  token: string
  expires_at: string
  listener_epoch: string
  target_id: string
  build: string
}

type WebSession = { rpc: SecureRpcClient; channel: FramedDuplex }
let sessionPromise: Promise<WebSession> | undefined

function bootstrap(): LaunchDescriptor {
  const value = new URLSearchParams(location.hash.slice(1)).get("launch")
  history.replaceState(null, "", `${location.pathname}${location.search}`)
  if (!value) throw new Error("This browser document has no one-use launch grant. Run git-stacks web again.")
  let parsed: unknown
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
    parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))))
  } catch { throw new Error("The browser launch descriptor is malformed") }
  const launch = parsed as Partial<LaunchDescriptor>
  if (launch.version !== 1 || typeof launch.endpoint !== "string" || typeof launch.certificate_hash !== "string"
    || typeof launch.token !== "string" || typeof launch.expires_at !== "string" || typeof launch.listener_epoch !== "string"
    || typeof launch.target_id !== "string" || typeof launch.build !== "string") throw new Error("The browser launch descriptor is incomplete")
  if (Date.parse(launch.expires_at) <= Date.now()) throw new Error("The browser launch grant has expired")
  const endpoint = new URL(launch.endpoint)
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "127.0.0.1") throw new Error("The browser may connect only to the loopback helper")
  return launch as LaunchDescriptor
}

export function initializeWebSession(): Promise<WebSession> {
  if (!sessionPromise) sessionPromise = (async () => {
    const launch = bootstrap()
    const carrier = await connectBrowserWebTransport(launch.endpoint, launch.certificate_hash)
    const authenticated = await authenticateSecureCarrier(carrier, {
      mode: "browser",
      targetId: launch.target_id,
      listenerEpoch: launch.listener_epoch,
      launchToken: launch.token,
      requestedScopes: [
        "snapshot.read", "operation.write", "event.read", "signal.read", "signal.dismiss",
        "terminal.read", "terminal.write", "terminal.create", "terminal.close", "target.select",
      ],
      build: launch.build,
    })
    const renew = window.setInterval(() => void authenticated.rpc.request("session.renew").catch(() => clearInterval(renew)), 15_000)
    void authenticated.rpc.closed.then(() => clearInterval(renew))
    return { rpc: authenticated.rpc, channel: authenticated.channel }
  })()
  return sessionPromise
}

export async function secureApi<T>(
  method: string,
  body?: unknown,
  options: { signal?: AbortSignal; scope?: SecureScope; idempotencyKey?: string } = {},
): Promise<T> {
  const session = await initializeWebSession()
  return session.rpc.request<T>(method, body, options)
}

export async function subscribeSecureEvents(cursor: string, observer: (event: unknown) => void): Promise<() => void> {
  const session = await initializeWebSession()
  const remove = session.rpc.observeEvents(observer)
  await session.rpc.request("events.subscribe", { cursor }, { scope: "event.read" })
  return remove
}

let nextTerminalStream = 1

export class SecureTerminalChannel {
  private readonly streamId = nextTerminalStream++
  private remove?: () => void
  private open = true

  constructor(
    private readonly session: WebSession,
    terminalId: string,
    cursor: string,
    streaming: boolean,
    private readonly receive: (data: string | Uint8Array) => void,
    private readonly closed: (reason?: string) => void,
  ) {
    this.remove = session.rpc.observeFrames((frame) => this.frame(frame))
    void session.channel.sendControl("terminal_control", { type: "attach", terminal_id: terminalId, cursor, streaming }, this.streamId)
  }

  static async open(terminalId: string, cursor: string, streaming: boolean, receive: (data: string | Uint8Array) => void, closed: (reason?: string) => void): Promise<SecureTerminalChannel> {
    return new SecureTerminalChannel(await initializeWebSession(), terminalId, cursor, streaming, receive, closed)
  }

  send(value: unknown): void {
    if (!this.open) return
    void this.session.channel.sendControl("terminal_control", value, this.streamId).catch(() => this.close("send failed"))
  }

  close(reason = "closed"): void {
    if (!this.open) return
    this.open = false
    void this.session.channel.sendControl("terminal_control", { type: "detach" }, this.streamId).catch(() => undefined)
    this.remove?.()
    this.remove = undefined
    this.closed(reason)
  }

  private frame(frame: SecureFrame): void {
    if (!this.open || frame.streamId !== this.streamId) return
    if (frame.kind === "terminal_data") this.receive(frame.payload)
    else if (frame.kind === "terminal_control") {
      const value = decodeCanonical(frame.payload)
      if ((value as { type?: unknown }).type === "closed") this.close(String((value as { reason?: unknown }).reason ?? "closed"))
      else this.receive(JSON.stringify(value))
    }
  }
}
