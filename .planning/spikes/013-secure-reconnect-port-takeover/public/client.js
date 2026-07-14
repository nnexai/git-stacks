const encoder = new TextEncoder()
const checks = document.querySelector("#checks")
const summary = document.querySelector("#summary")
const logElement = document.querySelector("#log")
let config
let identity

function b64url(bytes) {
  let binary = ""
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function canonicalProof(delegation, nonce) {
  return encoder.encode(JSON.stringify([1, delegation.id, delegation.epoch, nonce, config.serviceAudience]))
}

function write(event, fields = {}) {
  const record = { at: new Date().toISOString(), event, ...fields }
  logElement.textContent += `${JSON.stringify(record)}\n`
  console.log("WT013", record)
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

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("git-stacks-spike-013", 1)
    request.onupgradeneeded = () => request.result.createObjectStore("state")
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function dbGet(key) {
  const db = await openDb()
  const result = await new Promise((resolve, reject) => {
    const request = db.transaction("state", "readonly").objectStore("state").get(key)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
  db.close()
  return result
}

async function dbPut(key, value) {
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite")
    tx.objectStore("state").put(value, key)
    tx.onerror = () => reject(tx.error)
    tx.oncomplete = resolve
  })
  db.close()
}

async function browserIdentity() {
  let value = await dbGet("identity")
  if (!value) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])
    const spki = await crypto.subtle.exportKey("spki", pair.publicKey)
    value = { privateKey: pair.privateKey, publicKeySpki: b64url(spki), keyId: b64url(await crypto.subtle.digest("SHA-256", spki)) }
    await dbPut("identity", value)
  }
  return value
}

async function pair() {
  const code = new URLSearchParams(location.hash.slice(1)).get("pair")
  if (!code) return
  const response = await fetch("/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) })
  if (!response.ok) throw new Error(`pairing failed: ${response.status}`)
  history.replaceState(null, "", location.pathname)
}

async function getDelegation() {
  const response = await fetch("/delegate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keyId: identity.keyId, publicKeySpki: identity.publicKeySpki }) })
  if (!response.ok) throw new Error(`delegation failed: ${response.status}`)
  return response.json()
}

function authenticate(token) {
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
  try {
    const detail = await action()
    render(name, "pass", detail)
    outcomes.push(true)
  } catch (error) {
    render(name, "fail", String(error))
    outcomes.push(false)
  }
}

try {
  await pair()
  config = await fetch("/config").then((response) => response.ok ? response.json() : Promise.reject(new Error(`config failed: ${response.status}`)))
  identity = await browserIdentity()
  let token = await getDelegation()
  await dbPut("delegation", token)

  await check("valid live epoch", async () => {
    const result = await authenticate(token)
    if (!result.ok) throw new Error(result.error)
    return `epoch ${token.delegation.epoch.slice(0, 10)}… authenticated`
  })
  await check("fresh-challenge reconnect", async () => {
    const first = await authenticate(token)
    const second = await authenticate(token)
    if (!first.ok || !second.ok) throw new Error(JSON.stringify({ first, second }))
    return "same delegation reconnects while helper heartbeat is live"
  })
  await check("bounded heartbeat loss", async () => {
    const response = await fetch("/epoch/stop-heartbeats", { method: "POST" })
    if (!response.ok) throw new Error(`stop failed: ${response.status}`)
    const result = await authenticate(token)
    if (!result.ok) throw new Error(result.error)
    return `existing delegation remains usable within ${config.graceMs} ms grace`
  })
  await check("abrupt-loss expiry", async () => {
    await new Promise((resolve) => setTimeout(resolve, config.graceMs + 250))
    const result = await authenticate(token)
    if (result.ok || result.error !== "epoch_expired") throw new Error(JSON.stringify(result))
    return "service rejects the signed delegation after heartbeat grace expires"
  })
  const expiredToken = token
  await fetch("/epoch/rotate", { method: "POST" }).then((response) => response.ok ? response.json() : Promise.reject(new Error(`rotate failed: ${response.status}`)))
  token = await getDelegation()
  await dbPut("delegation", token)
  await check("new helper epoch", async () => {
    const fresh = await authenticate(token)
    const stale = await authenticate(expiredToken)
    if (!fresh.ok || stale.ok || stale.error !== "epoch_expired") throw new Error(JSON.stringify({ fresh, stale }))
    return "fresh epoch authenticates without reviving the expired delegation"
  })
  await check("helper key portability", async () => {
    if (config.identityMode !== "600") throw new Error(`identity mode ${config.identityMode}`)
    return "portable P-256 helper identity is permission-restricted with no native addon"
  })

  await dbPut("precheck", { passed: outcomes.filter(Boolean).length, total: outcomes.length })
  summary.textContent = `${outcomes.filter(Boolean).length}/${outcomes.length} pre-takeover checks passed; transferring exact port…`
  summary.className = outcomes.every(Boolean) ? "pass-text" : "fail-text"
  if (!outcomes.every(Boolean)) throw new Error("pre-takeover checks failed")
  write("takeover.requested", { epoch: token.delegation.epoch, keyId: identity.keyId })
  const response = await fetch("/takeover", { method: "POST" })
  if (!response.ok) throw new Error(`takeover failed: ${response.status}`)
  await new Promise((resolve) => setTimeout(resolve, 300))
  location.replace("/attack")
} catch (error) {
  summary.textContent = String(error)
  summary.className = "fail-text"
  document.body.dataset.complete = "true"
  document.body.dataset.passed = "false"
  write("suite.failed", { error: String(error) })
}
