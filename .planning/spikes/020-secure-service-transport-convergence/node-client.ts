import "reflect-metadata"
import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import { WebTransport, quicheLoaded } from "@fails-components/webtransport"
import { FrameParser, encodeJson, json } from "./protocol.ts"

type Descriptor = {
  http: string
  wtUrl: string
  pinA: string
  pairToken: string
  servicePublicKey: JsonWebKey
}

const descriptor = process.env.SPIKE_DESCRIPTOR
  ? JSON.parse(Buffer.from(process.env.SPIKE_DESCRIPTOR, "base64url").toString("utf8")) as Descriptor
  : JSON.parse(readFileSync(new URL(".state/descriptor.json", import.meta.url), "utf8")) as Descriptor
const helperId = `helper-${randomBytes(12).toString("hex")}`
const helperKey = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
const helperPublicKey = await crypto.subtle.exportKey("jwk", helperKey.publicKey)

function canonicalPin(pin: string, url: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([1, "git-stacks-spike-service", pin, url]))
}

function canonicalProof(nonce: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([1, "git-stacks-spike-service", helperId, nonce]))
}

async function open(pin: string, url = descriptor.wtUrl): Promise<WebTransport> {
  const transport = new WebTransport(url, {
    serverCertificateHashes: [{ algorithm: "sha-256", value: Buffer.from(pin, "base64url") }],
  })
  void transport.closed.catch(() => undefined)
  await transport.ready
  return transport
}

async function exchange(transport: WebTransport, initial: Record<string, unknown>, follow?: (message: Record<string, unknown>) => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const stream = await transport.createBidirectionalStream()
  const writer = stream.writable.getWriter()
  const reader = stream.readable.getReader()
  const parser = new FrameParser()
  await writer.write(encodeJson(2, 0n, initial))
  while (true) {
    const next = await reader.read()
    if (next.done) throw new Error("stream ended before response")
    for (const frame of parser.push(next.value)) {
      const message = json(frame)
      if (follow && message.type === "challenge") {
        await writer.write(encodeJson(2, 0n, await follow(message)))
        continue
      }
      await writer.close().catch(() => undefined)
      return message
    }
  }
}

await quicheLoaded
console.log(JSON.stringify({ event: "node-client.step", step: "pair" }))
const markerA = `REMOTE_TERMINAL_SECRET_${randomBytes(24).toString("base64url")}`
const first = await open(descriptor.pinA)
const paired = await exchange(first, { type: "helper-pair", token: descriptor.pairToken, helperId, publicKey: helperPublicKey, marker: markerA })
if (paired.type !== "paired" || typeof paired.nextPin !== "string" || typeof paired.nextUrl !== "string" || typeof paired.signature !== "string") throw new Error(`pairing failed: ${JSON.stringify(paired)}`)

const serviceKey = await crypto.subtle.importKey("jwk", descriptor.servicePublicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"])
const pinUpdateValid = await crypto.subtle.verify(
  { name: "ECDSA", hash: "SHA-256" },
  serviceKey,
  Buffer.from(paired.signature, "base64url"),
  canonicalPin(paired.nextPin, paired.nextUrl) as BufferSource,
)
if (!pinUpdateValid) throw new Error("signed certificate pin update rejected")
first.close()
await first.closed.catch(() => undefined)

console.log(JSON.stringify({ event: "node-client.step", step: "pair-replay" }))
const replay = await open(descriptor.pinA)
const replayResult = await exchange(replay, { type: "helper-pair", token: descriptor.pairToken, helperId: `${helperId}-replay`, publicKey: helperPublicKey, marker: markerA })
replay.close()
if (replayResult.type !== "rejected") throw new Error("one-use pairing token replay was accepted")

console.log(JSON.stringify({ event: "node-client.step", step: "wrong-pin" }))
const wrongPin = Buffer.from(descriptor.pinA, "base64url")
wrongPin[0] = wrongPin[0]! ^ 0xff
const wrong = new WebTransport(descriptor.wtUrl, { serverCertificateHashes: [{ algorithm: "sha-256", value: wrongPin }] })
void wrong.closed.catch(() => undefined)
let wrongRejected = false
await wrong.ready.catch(() => { wrongRejected = true })
wrong.close()
if (!wrongRejected) throw new Error("wrong WebTransport pin connected")

console.log(JSON.stringify({ event: "node-client.step", step: "rotation" }))
const rotation = await fetch(`${descriptor.http}/rotate`, { method: "POST" })
if (!rotation.ok) throw new Error(`rotation failed: ${rotation.status}`)
await new Promise((resolve) => setTimeout(resolve, 100))

const markerB = `RECONNECTED_TERMINAL_SECRET_${randomBytes(24).toString("base64url")}`
console.log(JSON.stringify({ event: "node-client.step", step: "reconnect" }))
const second = await open(paired.nextPin, paired.nextUrl)
const accepted = await exchange(second, { type: "auth-init", helperId }, async (challenge) => ({
  type: "proof",
  signature: Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, helperKey.privateKey, canonicalProof(String(challenge.nonce)) as BufferSource)).toString("base64url"),
  marker: markerB,
}))
second.close()
if (accepted.type !== "accepted") throw new Error(`reconnect failed: ${JSON.stringify(accepted)}`)

for (let index = 0; index < 16; index += 1) {
  const transport = await open(paired.nextPin, paired.nextUrl)
  const result = await exchange(transport, { type: "auth-init", helperId }, async (challenge) => ({
    type: "proof",
    signature: Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, helperKey.privateKey, canonicalProof(String(challenge.nonce)) as BufferSource)).toString("base64url"),
    marker: `SOAK_TERMINAL_SECRET_${index}_${randomBytes(8).toString("base64url")}`,
  }))
  transport.close()
  if (result.type !== "accepted") throw new Error(`soak reconnect ${index} failed`)
}

console.log(JSON.stringify({ event: "node-client.complete", paired: true, pairingReplayRejected: true, wrongPinRejected: wrongRejected, signedRotation: true, reconnects: 17, runtime: process.version }))
