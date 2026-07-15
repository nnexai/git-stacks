import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import { connect } from "node:tls"
import { FrameParser, encodeJson, json } from "./protocol.ts"

declare const Bun: { version: string }

type Descriptor = { tui: { host: string; port: number; ca: string; wrongCa: string; token: string } }
const descriptor = process.env.SPIKE_DESCRIPTOR
  ? JSON.parse(Buffer.from(process.env.SPIKE_DESCRIPTOR, "base64url").toString("utf8")) as Descriptor
  : JSON.parse(readFileSync(new URL(".state/descriptor.json", import.meta.url), "utf8")) as Descriptor
const marker = `TUI_TERMINAL_SECRET_${randomBytes(24).toString("base64url")}`
const socket = connect({
  host: descriptor.tui.host,
  port: descriptor.tui.port,
  ca: descriptor.tui.ca,
  servername: "localhost",
  rejectUnauthorized: true,
  minVersion: "TLSv1.3",
  maxVersion: "TLSv1.3",
  ALPNProtocols: ["git-stacks/2"],
})
const parser = new FrameParser()
const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
  socket.once("error", reject)
  socket.once("secureConnect", () => {
    if (!socket.authorized) return reject(socket.authorizationError)
    if (socket.alpnProtocol !== "git-stacks/2") return reject(new Error(`unexpected ALPN ${socket.alpnProtocol}`))
    socket.write(encodeJson(2, 0n, { type: "tui-auth", token: descriptor.tui.token, marker }))
  })
  socket.on("data", (bytes) => {
    const frame = parser.push(bytes)[0]
    if (frame) resolve(json(frame))
  })
  socket.once("close", () => reject(new Error("TLS stream closed before response")))
})
socket.destroy()
if (result.type !== "accepted") throw new Error(`TUI connection rejected: ${JSON.stringify(result)}`)

const wrong = connect({
  host: descriptor.tui.host,
  port: descriptor.tui.port,
  ca: descriptor.tui.wrongCa,
  servername: "localhost",
  rejectUnauthorized: true,
  minVersion: "TLSv1.3",
  maxVersion: "TLSv1.3",
  ALPNProtocols: ["git-stacks/2"],
})
let wrongRejected = false
await new Promise<void>((resolve) => {
  wrong.once("secureConnect", () => { wrong.destroy(); resolve() })
  wrong.once("error", () => { wrongRejected = true; resolve() })
})
if (!wrongRejected) throw new Error("wrong TLS authority connected")
console.log(JSON.stringify({ event: "bun-client.complete", accepted: true, wrongAuthorityRejected: true, protocol: socket.getProtocol(), runtime: `Bun ${Bun.version}` }))
