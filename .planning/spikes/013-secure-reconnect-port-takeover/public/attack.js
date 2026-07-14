const encoder = new TextEncoder()
const config = globalThis.ATTACK_CONFIG
const checks = document.querySelector("#checks")
const summary = document.querySelector("#summary")
const logElement = document.querySelector("#log")

function b64url(bytes) {
  let binary = ""
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function canonicalProof(delegation, nonce) {
  return encoder.encode(JSON.stringify([1, delegation.id, delegation.epoch, nonce, config.serviceAudience]))
}

function render(name, state, detail) {
  const row = document.createElement("div")
  row.className = `check ${state}`
  row.innerHTML = "<strong></strong><span></span><em></em>"
  row.querySelector("strong").textContent = name
  row.querySelector("span").textContent = state
  row.querySelector("em").textContent = detail
  checks.append(row)
}

function dbGet(key) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("git-stacks-spike-013", 1)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const request = open.result.transaction("state", "readonly").objectStore("state").get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => { open.result.close(); resolve(request.result) }
    }
  })
}

function authenticate(token, identity) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(config.verifierWs)
    const timeout = setTimeout(() => { socket.close(); reject(new Error("authentication timeout")) }, 4_000)
    const finish = (result) => { clearTimeout(timeout); socket.close(); resolve(result) }
    socket.onopen = () => socket.send(JSON.stringify({ type: "auth-init", token }))
    socket.onerror = () => { clearTimeout(timeout); reject(new Error("websocket error")) }
    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data)
      if (message.type === "challenge") {
        const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, identity.privateKey, canonicalProof(token.delegation, message.nonce))
        socket.send(JSON.stringify({ type: "proof", signature: b64url(signature) }))
      } else if (message.type === "auth-ok") finish({ ok: true })
      else if (message.type === "auth-error") finish({ ok: false, error: message.error })
    }
  })
}

const outcomes = []
async function check(name, action) {
  try { render(name, "pass", await action()); outcomes.push(true) }
  catch (error) { render(name, "fail", String(error)); outcomes.push(false) }
}

try {
  const identity = await dbGet("identity")
  const token = await dbGet("delegation")
  const precheck = await dbGet("precheck")
  await check("exact-origin state recovered", async () => {
    if (!identity?.privateKey || !token?.delegation) throw new Error("old IndexedDB state missing")
    if (identity.privateKey.extractable) throw new Error("old private key became extractable")
    return `attacker recovered key handle and epoch ${token.delegation.epoch.slice(0, 10)}…`
  })
  await check("old key remains invocable", async () => {
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, identity.privateKey, encoder.encode("attacker invocation proof"))
    if (!signature.byteLength) throw new Error("signature failed")
    return "same-origin attacker invoked the non-exportable private key"
  })
  await check("retired epoch blocks takeover", async () => {
    const result = await authenticate(token, identity)
    if (result.ok || result.error !== "epoch_revoked") throw new Error(JSON.stringify(result))
    return "remote service rejected valid old key material because helper epoch was revoked"
  })
  const takeoverPassed = outcomes.filter(Boolean).length
  const passed = (precheck?.passed ?? 0) + takeoverPassed
  const total = (precheck?.total ?? 0) + outcomes.length
  const allPassed = outcomes.every(Boolean) && precheck?.passed === precheck?.total
  summary.textContent = `${passed}/${total} reconnect and takeover checks passed`
  summary.className = allPassed ? "pass-text" : "fail-text"
  document.body.dataset.complete = "true"
  document.body.dataset.passed = String(allPassed)
  logElement.textContent = JSON.stringify({ at: new Date().toISOString(), event: "takeover-suite.complete", passed, total }, null, 2)
  console.log("WT013", { event: "takeover-suite.complete", passed, total })
} catch (error) {
  summary.textContent = String(error)
  summary.className = "fail-text"
  document.body.dataset.complete = "true"
  document.body.dataset.passed = "false"
}
