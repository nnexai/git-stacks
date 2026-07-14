const support = document.querySelector("#support")
const target = document.querySelector("#target")
const pin = document.querySelector("#pin")
const origin = document.querySelector("#origin")
const checks = document.querySelector("#checks")
const summary = document.querySelector("#summary")
const output = document.querySelector("#log")
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const config = await fetch("/config", { cache: "no-store" }).then((response) => response.json())
let activeTransport

document.querySelector("#certificate-description").textContent = `Real browser handshakes against a self-signed, ${config.certificateValidityDays}-day ECDSA certificate.`
origin.textContent = location.origin
target.textContent = config.wtUrl
pin.textContent = config.certificateHashBase64

function bytes(base64) {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

function write(event, fields = {}) {
  const record = { at: new Date().toISOString(), event, ...fields }
  output.textContent += `${JSON.stringify(record)}\n`
  output.scrollTop = output.scrollHeight
  console.log("WT011", record)
}

function result(name, state, detail) {
  let row = document.querySelector(`[data-check="${name}"]`)
  if (!row) {
    row = document.createElement("div")
    row.dataset.check = name
    row.innerHTML = `<strong></strong><span></span><em></em>`
    checks.append(row)
  }
  row.className = `check ${state}`
  row.querySelector("strong").textContent = name
  row.querySelector("span").textContent = state
  row.querySelector("em").textContent = detail
}

async function connectWithPin(hashBase64, label) {
  const started = performance.now()
  write("connect.begin", { label })
  const transport = new WebTransport(config.wtUrl, {
    serverCertificateHashes: [{ algorithm: "sha-256", value: bytes(hashBase64) }],
  })
  await transport.ready
  write("connect.ready", { label, elapsedMs: Math.round(performance.now() - started) })
  return transport
}

async function echo(transport, text) {
  const stream = await transport.createBidirectionalStream()
  const writer = stream.writable.getWriter()
  const reader = stream.readable.getReader()
  await writer.write(encoder.encode(text))
  await writer.close()
  let echoed = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    echoed += decoder.decode(value, { stream: true })
  }
  reader.releaseLock()
  return echoed + decoder.decode()
}

async function closeActive() {
  if (!activeTransport) return
  activeTransport.close({ closeCode: 0, reason: "spike check complete" })
  await activeTransport.closed.catch(() => undefined)
  activeTransport = undefined
}

async function correctPinCheck(name = "correct pin + stream echo") {
  await closeActive()
  try {
    activeTransport = await connectWithPin(config.certificateHashBase64, "correct")
    const message = `git-stacks-${config.nonce}`
    const echoed = await echo(activeTransport, message)
    if (echoed !== message) throw new Error(`echo mismatch: ${JSON.stringify(echoed)}`)
    result(name, "pass", `${message.length} encrypted bytes echoed over a bidirectional stream`)
    write("echo.pass", { bytes: message.length })
    return true
  } catch (error) {
    result(name, "fail", String(error))
    write("echo.fail", { error: String(error) })
    return false
  }
}

async function wrongPinCheck() {
  const started = performance.now()
  let transport
  try {
    transport = await connectWithPin(config.wrongHashBase64, "wrong")
    result("wrong pin rejected", "fail", "browser accepted a certificate with a mismatched SHA-256 pin")
    write("wrong-pin.unexpected-ready")
    return false
  } catch (error) {
    result("wrong pin rejected", "pass", `handshake rejected after ${Math.round(performance.now() - started)} ms`)
    write("wrong-pin.rejected", { elapsedMs: Math.round(performance.now() - started), error: String(error) })
    return true
  } finally {
    transport?.close()
  }
}

async function reconnectCheck() {
  await closeActive()
  const first = await correctPinCheck("first pinned connection")
  await closeActive()
  const second = await correctPinCheck("pinned reconnect")
  const passed = first && second
  result("repeatable reconnect", passed ? "pass" : "fail", passed ? "two independent pinned sessions completed" : "one of two sessions failed")
  return passed
}

async function runAll() {
  summary.textContent = "running"
  const results = [await correctPinCheck(), await wrongPinCheck(), await reconnectCheck()]
  const passed = results.filter(Boolean).length
  summary.textContent = `${passed}/${results.length} scenarios passed`
  summary.className = passed === results.length ? "pass-text" : "fail-text"
  document.body.dataset.complete = "true"
  document.body.dataset.passed = String(passed === results.length)
  write("suite.complete", { passed, total: results.length })
}

if ("WebTransport" in globalThis && globalThis.isSecureContext) {
  support.textContent = "WebTransport available"
  support.className = "badge pass"
} else {
  support.textContent = `unsupported · secure=${globalThis.isSecureContext}`
  support.className = "badge fail"
}

document.querySelector("#connect-correct").addEventListener("click", () => void correctPinCheck())
document.querySelector("#connect-wrong").addEventListener("click", () => void wrongPinCheck())
document.querySelector("#reconnect").addEventListener("click", () => void reconnectCheck())
document.querySelector("#run-all").addEventListener("click", () => void runAll())
document.querySelector("#clear").addEventListener("click", () => { output.textContent = "" })
write("page.ready", { webTransport: "WebTransport" in globalThis, secureContext: globalThis.isSecureContext })
