const HEADER_BYTES = 13
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const config = await fetch("/config").then((response) => response.json())
const summary = document.querySelector("#summary")
const output = document.querySelector("#results")

function bytes(base64) { return Uint8Array.from(atob(base64), (value) => value.charCodeAt(0)) }

function frame(value) {
  const payload = encoder.encode(JSON.stringify(value))
  const result = new Uint8Array(HEADER_BYTES + payload.length)
  const view = new DataView(result.buffer)
  result[0] = 2
  view.setUint32(1, payload.length)
  view.setBigUint64(5, 0n)
  result.set(payload, HEADER_BYTES)
  return result
}

class Parser {
  pending = new Uint8Array(0)
  push(input) {
    const joined = new Uint8Array(this.pending.length + input.length)
    joined.set(this.pending)
    joined.set(input, this.pending.length)
    const output = []
    let offset = 0
    while (joined.length - offset >= HEADER_BYTES) {
      const view = new DataView(joined.buffer, joined.byteOffset + offset)
      const length = view.getUint32(1)
      if (joined.length - offset < HEADER_BYTES + length) break
      output.push({ type: joined[offset], cursor: view.getBigUint64(5), payload: joined.slice(offset + HEADER_BYTES, offset + HEADER_BYTES + length) })
      offset += HEADER_BYTES + length
    }
    this.pending = joined.slice(offset)
    return output
  }
}

const transport = new WebTransport(config.wtUrl, { serverCertificateHashes: [{ algorithm: "sha-256", value: bytes(config.hash) }] })
await transport.ready

async function scenario(command, options = {}) {
  const stream = await transport.createBidirectionalStream()
  const writer = stream.writable.getWriter()
  await writer.write(frame(command))
  await writer.close()
  const reader = stream.readable.getReader()
  const parser = new Parser()
  let received = 0
  let cursor = 0n
  let reset = false
  let result
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs))
      for (const item of parser.push(value)) {
        if (item.type === 1) {
          if (item.cursor <= cursor) throw new Error(`non-monotonic cursor ${item.cursor}`)
          cursor = item.cursor
          received += item.payload.length
          if (options.cancelAfter && received >= options.cancelAfter) {
            await reader.cancel("intentional consumer cancellation")
            return { received, cursor, cancelled: true }
          }
        } else if (item.type === 2) {
          const message = JSON.parse(decoder.decode(item.payload))
          if (message.type === "reset") { reset = true; cursor = BigInt(message.earliest) - 1n }
          if (message.type === "result") result = message
        }
      }
    }
  } finally { reader.releaseLock() }
  return { received, cursor, reset, result }
}

const results = []
async function check(name, action) {
  const started = performance.now()
  try {
    const detail = await action()
    results.push({ name, pass: true, elapsedMs: Math.round(performance.now() - started), detail })
  } catch (error) {
    results.push({ name, pass: false, elapsedMs: Math.round(performance.now() - started), error: String(error) })
  }
  output.textContent = JSON.stringify(results, null, 2)
}

await check("length-prefixed framing", async () => {
  const parser = new Parser()
  const first = frame({ one: 1 })
  const second = frame({ two: 2 })
  const combined = new Uint8Array(first.length + second.length)
  combined.set(first); combined.set(second, first.length)
  const split = Math.floor(first.length / 2)
  if (parser.push(combined.slice(0, split)).length !== 0) throw new Error("partial frame emitted")
  const decoded = parser.push(combined.slice(split))
  if (decoded.length !== 2) throw new Error(`expected two coalesced frames, got ${decoded.length}`)
  return "fragmented and coalesced byte-stream frames decode exactly"
})

await check("visible throughput", async () => {
  const value = await scenario({ scenario: "visible" })
  if (value.received !== 16 * 1024 * 1024 || value.result?.replayBytes > config.replayBytes) throw new Error(JSON.stringify(value.result))
  return { bytes: value.received, server: value.result }
})

await check("slow-consumer backpressure", async () => {
  const value = await scenario({ scenario: "slow" }, { delayMs: 2 })
  if (value.received !== 48 * 1024 * 1024 || value.result?.replayBytes > config.replayBytes) throw new Error(JSON.stringify(value.result))
  return { bytes: value.received, server: value.result }
})

await check("hidden terminal bounded replay", async () => {
  const value = await scenario({ scenario: "hidden" })
  if (!value.reset || !value.result?.gap || value.received > config.replayBytes || value.result.replayBytes > config.replayBytes) throw new Error(JSON.stringify(value))
  return { replayed: value.received, generated: value.result.generated }
})

await check("multiple terminal streams visible-only", async () => {
  const values = await Promise.all([true, false, false, false].map((active) => scenario({ scenario: "multi", active })))
  if (values[0].received !== 2 * 1024 * 1024 || values.slice(1).some((value) => value.received !== 0 || value.result?.replayBytes > config.replayBytes)) throw new Error(JSON.stringify(values))
  return values.map((value) => ({ received: value.received, active: value.result.active, retained: value.result.replayBytes }))
})

await check("reconnect replay and gap reset", async () => {
  const first = await scenario({ scenario: "reconnect", phase: 1 })
  const second = await scenario({ scenario: "reconnect", phase: 2, cursor: first.result.acknowledged })
  if (second.reset || second.result.gap) throw new Error("within-window reconnect reset unexpectedly")
  const third = await scenario({ scenario: "reconnect", phase: 3, cursor: second.result.acknowledged })
  if (!third.reset || !third.result.gap || third.received > config.replayBytes) throw new Error("replay gap was not bounded and reset")
  return { contiguousReplay: second.received, gapReplay: third.received, retained: third.result.replayBytes }
})

await check("consumer cancellation", async () => {
  const value = await scenario({ scenario: "cancel" }, { cancelAfter: 2 * 1024 * 1024 })
  if (!value.cancelled) throw new Error("reader did not cancel")
  for (let index = 0; index < 50; index += 1) {
    const server = await fetch("/metrics").then((response) => response.json())
    if (server.cancelObserved) return { receivedBeforeCancel: value.received, server }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error("server did not observe cancellation")
})

const passed = results.filter((item) => item.pass).length
summary.textContent = `${passed}/${results.length} terminal stream checks passed`
document.body.dataset.complete = "true"
document.body.dataset.passed = String(passed === results.length)
transport.close({ closeCode: 0, reason: "suite complete" })
