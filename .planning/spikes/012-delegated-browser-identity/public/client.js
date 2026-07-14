const status = document.querySelector("#status")
const summary = document.querySelector("#summary")
const checks = document.querySelector("#checks")
const output = document.querySelector("#log")
const encoder = new TextEncoder()
let originalPairingCode
let config
let browserIdentity

function b64url(bytes) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function canonicalProof(delegationId, nonce) {
  return encoder.encode(JSON.stringify([1, delegationId, nonce, config.serviceAudience]))
}

function write(event, fields = {}) {
  const record = { at: new Date().toISOString(), event, ...fields }
  output.textContent += `${JSON.stringify(record)}\n`
  output.scrollTop = output.scrollHeight
  console.log("WT012", record)
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

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("git-stacks-spike-012", 1)
    request.onupgradeneeded = () => request.result.createObjectStore("identity")
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function databaseGet(db, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction("identity", "readonly").objectStore("identity").get(key)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function databasePut(db, key, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("identity", "readwrite")
    transaction.objectStore("identity").put(value, key)
    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = () => resolve()
  })
}

async function getOrCreateBrowserIdentity() {
  const db = await openDatabase()
  let identity = await databaseGet(db, "browser")
  if (!identity) {
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])
    const spki = await crypto.subtle.exportKey("spki", keys.publicKey)
    const keyId = b64url(await crypto.subtle.digest("SHA-256", spki))
    identity = { privateKey: keys.privateKey, publicKey: keys.publicKey, keyId, publicKeySpki: b64url(spki) }
    await databasePut(db, "browser", identity)
    write("browser-key.created", { keyId })
  } else {
    write("browser-key.restored", { keyId: identity.keyId })
  }
  db.close()
  return identity
}

async function pairFromFragment() {
  const parameters = new URLSearchParams(location.hash.slice(1))
  const code = parameters.get("pair")
  if (!code) {
    write("pairing.resume-attempt")
    return
  }
  originalPairingCode = code
  const response = await fetch("/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) })
  if (!response.ok) throw new Error(`Pairing failed: ${response.status}`)
  history.replaceState(null, "", location.pathname)
  write("pairing.complete")
}

async function delegation(ttlMs = 60_000) {
  const response = await fetch("/delegate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ publicKeySpki: browserIdentity.publicKeySpki, keyId: browserIdentity.keyId, ttlMs }),
  })
  if (!response.ok) throw new Error(`Delegation failed: ${response.status}`)
  return response.json()
}

async function authenticate(token, mode = "normal") {
  return new Promise((resolve, reject) => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:"
    const socket = new WebSocket(`${protocol}//${location.host}/verify`)
    let proof
    const timeout = setTimeout(() => { socket.close(); reject(new Error("authentication timeout")) }, 5_000)
    const finish = (value, error) => {
      clearTimeout(timeout)
      socket.close()
      if (error) reject(error); else resolve(value)
    }
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "auth-init", token })))
    socket.addEventListener("message", async (event) => {
      const message = JSON.parse(event.data)
      if (message.type === "challenge") {
        proof = b64url(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, browserIdentity.privateKey, canonicalProof(token.delegation.id, message.nonce)))
        socket.send(JSON.stringify({ type: "proof", signature: proof }))
      } else if (message.type === "auth-ok") {
        if (mode === "replay") socket.send(JSON.stringify({ type: "proof", signature: proof }))
        else finish({ ok: true, delegationId: message.delegationId })
      } else if (message.type === "auth-error") {
        finish({ ok: false, error: message.error })
      }
    })
    socket.addEventListener("error", () => finish(undefined, new Error("websocket error")))
  })
}

async function isolationCheck() {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe")
    iframe.hidden = true
    const timeout = setTimeout(() => { iframe.remove(); reject(new Error("isolation probe timeout")) }, 3_000)
    const listener = (event) => {
      if (event.origin !== config.isolationOrigin || event.data?.type !== "isolation-result") return
      clearTimeout(timeout)
      window.removeEventListener("message", listener)
      iframe.remove()
      resolve(event.data.found)
    }
    window.addEventListener("message", listener)
    iframe.src = `${config.isolationOrigin}/probe`
    document.querySelector("#isolation-frame").append(iframe)
  })
}

async function runChecks() {
  checks.textContent = ""
  summary.textContent = "running"
  const outcomes = []
  const check = async (name, action) => {
    try {
      const detail = await action()
      result(name, "pass", detail)
      outcomes.push(true)
    } catch (error) {
      result(name, "fail", String(error))
      outcomes.push(false)
    }
  }

  await check("helper key permissions", async () => {
    if (config.identityMode !== "600") throw new Error(`identity mode is ${config.identityMode}`)
    return "durable helper private key is stored with mode 0600"
  })
  await check("browser private key non-exportable", async () => {
    if (browserIdentity.privateKey.extractable) throw new Error("private key reports extractable")
    try {
      await crypto.subtle.exportKey("pkcs8", browserIdentity.privateKey)
      throw new Error("private key export unexpectedly succeeded")
    } catch (error) {
      if (String(error).includes("unexpectedly")) throw error
    }
    return "WebCrypto rejected PKCS#8 export"
  })
  await check("IndexedDB key persistence", async () => {
    const restored = await getOrCreateBrowserIdentity()
    if (restored.keyId !== browserIdentity.keyId) throw new Error("restored key changed")
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, restored.privateKey, encoder.encode("persistence-check"))
    if (!signature.byteLength) throw new Error("restored key could not sign")
    return `same non-exportable key restored as ${restored.keyId.slice(0, 12)}…`
  })
  await check("localhost port isolation", async () => {
    if (await isolationCheck()) throw new Error("different localhost port found this origin's key")
    return "a different localhost port has a separate IndexedDB"
  })
  await check("one-use bootstrap pairing", async () => {
    const response = await fetch("/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: originalPairingCode }) })
    if (response.status !== 401) throw new Error(`pairing replay returned ${response.status}`)
    return "the consumed launch code cannot be exchanged again"
  })
  await check("HttpOnly browser principal", async () => {
    if (document.cookie) throw new Error("a script-readable cookie is present")
    return "the bootstrap principal is not readable by page JavaScript"
  })
  await check("valid delegated authentication", async () => {
    const token = await delegation()
    const authenticated = await authenticate(token)
    if (!authenticated.ok) throw new Error(authenticated.error)
    return `helper-signed delegation ${authenticated.delegationId.slice(0, 10)}… proved key possession`
  })
  await check("fresh-challenge reconnect", async () => {
    const token = await delegation()
    const first = await authenticate(token)
    const second = await authenticate(token)
    if (!first.ok || !second.ok) throw new Error(`reconnect failed: ${JSON.stringify({ first, second })}`)
    return "one short-lived delegation proved the same key against two fresh challenges"
  })
  await check("delegation tamper rejection", async () => {
    const token = await delegation()
    token.delegation.scopes = ["terminal:admin"]
    const rejected = await authenticate(token)
    if (rejected.ok || rejected.error !== "invalid_delegation_signature") throw new Error(`unexpected result: ${JSON.stringify(rejected)}`)
    return "changing signed scopes invalidates the helper signature"
  })
  await check("expired delegation rejection", async () => {
    const token = await delegation(50)
    await new Promise((resolve) => setTimeout(resolve, 90))
    const rejected = await authenticate(token)
    if (rejected.ok || rejected.error !== "delegation_expired") throw new Error(`unexpected result: ${JSON.stringify(rejected)}`)
    return "an otherwise valid 50 ms delegation expired before authentication"
  })
  await check("proof replay rejection", async () => {
    const token = await delegation()
    const rejected = await authenticate(token, "replay")
    if (rejected.ok || rejected.error !== "proof_replay") throw new Error(`unexpected result: ${JSON.stringify(rejected)}`)
    return "a consumed challenge proof cannot be sent twice"
  })

  const passed = outcomes.filter(Boolean).length
  summary.textContent = `${passed}/${outcomes.length} checks passed`
  summary.className = passed === outcomes.length ? "pass-text" : "fail-text"
  document.body.dataset.complete = "true"
  document.body.dataset.passed = String(passed === outcomes.length)
  write("suite.complete", { passed, total: outcomes.length })
}

try {
  await pairFromFragment()
  config = await fetch("/config").then(async (response) => {
    if (!response.ok) throw new Error(`Configuration failed: ${response.status}`)
    return response.json()
  })
  browserIdentity = await getOrCreateBrowserIdentity()
  document.querySelector("#helper-id").textContent = config.helperId
  document.querySelector("#browser-key").textContent = browserIdentity.keyId
  document.querySelector("#audience").textContent = config.serviceAudience
  document.querySelector("#origin").textContent = location.origin
  status.textContent = "paired"
  status.className = "badge pass"
  write("page.ready", { helperId: config.helperId, browserKeyId: browserIdentity.keyId })
} catch (error) {
  status.textContent = "pairing failed"
  status.className = "badge fail"
  summary.textContent = String(error)
  write("page.error", { error: String(error) })
}

document.querySelector("#run").addEventListener("click", () => void runChecks())
document.querySelector("#clear").addEventListener("click", () => { output.textContent = "" })
