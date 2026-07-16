import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import test from "node:test"

const bundleUrl = new URL("../../packages/web/dist/git-stacks.html", import.meta.url)

export function assertSecureBrowserBundle(html) {
  for (const forbidden of [
    "localStorage", "sessionStorage", "indexedDB", "serviceWorker", "SharedWorker",
    "CacheStorage", "EventSource(", "WebSocket(", "fetch(", "/web/api", "text/event-stream",
  ]) assert.equal(html.includes(forbidden), false, `bundle contains forbidden browser authority/transport: ${forbidden}`)
  assert.doesNotMatch(html, /navigator\s*\.\s*keyboard\s*\.\s*(?:lock|unlock)\s*\(/, "bundle contains forbidden Keyboard Lock API")
}

test("forbidden bundle assertion rejects a hostile Keyboard Lock fixture", () => {
  assert.throws(() => assertSecureBrowserBundle("navigator.keyboard.lock(['KeyK'])"), /Keyboard Lock/)
  assert.throws(() => assertSecureBrowserBundle("navigator.keyboard.unlock()"), /Keyboard Lock/)
})

test("packaged browser client is self-contained and has no durable authority or plaintext transport", async () => {
  const html = await readFile(bundleUrl, "utf8")
  assert.match(html, /^<!doctype html>/i)
  assert.match(html, /Content-Security-Policy/)
  assert.match(html, /connect-src https:\/\/127\.0\.0\.1:\*/)
  assert.match(html, /style-src 'sha256-/)
  assert.match(html, /style-src-elem 'unsafe-inline'/)
  assert.match(html, /style-src-attr 'unsafe-inline'/)
  assert.equal(html.match(/'unsafe-inline'/g)?.length, 2)
  assert.doesNotMatch(html, /script-src[^;]*(?:unsafe-inline|unsafe-eval)/)
  assert.doesNotMatch(html, /unsafe-eval/)
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)=["'](?!data:)/i)
  assertSecureBrowserBundle(html)
  const files = await readdir(new URL("../../packages/web/dist/", import.meta.url))
  assert.deepEqual(files.sort(), ["git-stacks.html", "index.html", "manifest.json"])
})
