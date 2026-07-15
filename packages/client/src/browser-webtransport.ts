import { promoteEncryptedCarrier, type SecureDuplex, type SecureSessionCarrier } from "./secure-session.js"

type BrowserWebTransportStream = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }
type BrowserWebTransportSession = {
  ready: Promise<void>
  closed: Promise<unknown>
  createBidirectionalStream(): Promise<BrowserWebTransportStream>
  close(info?: { closeCode?: number; reason?: string }): void
}
type BrowserWebTransportConstructor = new (
  url: string,
  options: { serverCertificateHashes: Array<{ algorithm: "sha-256"; value: Uint8Array }> },
) => BrowserWebTransportSession

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

export async function connectBrowserWebTransport(endpoint: string, certificateHash: string): Promise<SecureSessionCarrier> {
  const Constructor = (globalThis as typeof globalThis & { WebTransport?: BrowserWebTransportConstructor }).WebTransport
  if (!globalThis.isSecureContext || !Constructor) throw new Error("This browser does not support secure WebTransport")
  const transport = new Constructor(endpoint, {
    serverCertificateHashes: [{ algorithm: "sha-256", value: decodeBase64Url(certificateHash) }],
  })
  void transport.closed.catch(() => undefined)
  await transport.ready
  let opened = false
  return promoteEncryptedCarrier({
    encrypted: true,
    serverAuthenticated: true,
    peerBinding: certificateHash,
    async openControl(): Promise<SecureDuplex> {
      if (opened) throw new Error("Browser WebTransport control stream is already open")
      opened = true
      const stream = await transport.createBidirectionalStream()
      return {
        readable: stream.readable,
        writable: stream.writable,
        async close() { transport.close({ closeCode: 0, reason: "closed" }) },
      }
    },
    async openStream() { throw new Error("Logical streams are multiplexed by the secure protocol") },
    async *incomingStreams() {},
    async close(reason = "closed") { transport.close({ closeCode: 0, reason: reason.slice(0, 128) }); await transport.closed.catch(() => undefined) },
  })
}
