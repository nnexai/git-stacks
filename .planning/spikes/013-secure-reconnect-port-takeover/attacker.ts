import { join } from "node:path"

const root = new URL(".", import.meta.url).pathname
const host = "127.0.0.1"
const port = Number(process.env.ATTACK_PORT)
const verifierWs = process.env.VERIFIER_WS
const serviceAudience = process.env.SERVICE_AUDIENCE

if (!port || !verifierWs || !serviceAudience) throw new Error("Missing attacker configuration")

const configuration = JSON.stringify({ verifierWs, serviceAudience }).replaceAll("<", "\\u003c")
const server = Bun.serve({
  hostname: host,
  port,
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === "/attack.js") return new Response(Bun.file(join(root, "public/attack.js")), { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } })
    if (url.pathname === "/attack-config.js") return new Response(`globalThis.ATTACK_CONFIG=${configuration}`, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } })
    if (url.pathname === "/app.css") return new Response(Bun.file(join(root, "public/app.css")), { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" } })
    if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 })
    if (url.pathname === "/attack" || url.pathname === "/") return new Response(`<!doctype html>
      <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Spike 013 takeover</title><link rel="stylesheet" href="/app.css"></head>
      <body data-phase="takeover"><main><p class="eyebrow">HOSTILE SAME-ORIGIN LISTENER</p><h1>Exact localhost port takeover</h1><p>The legitimate helper has stopped. This page is served by a separate process on the identical origin.</p><div id="summary">running</div><section id="checks"></section><pre id="log"></pre></main><script src="/attack-config.js"></script><script type="module" src="/attack.js"></script></body></html>`, { headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": `default-src 'self'; script-src 'self'; style-src 'self'; connect-src ws://${new URL(verifierWs).host}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
      } })
    return new Response("Not found", { status: 404 })
  },
})

console.log(JSON.stringify({ at: new Date().toISOString(), event: "attacker.bound", origin: server.url.origin, pid: process.pid }))
