import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { WS_CONFIG_DIR } from "@git-stacks/core/paths"

export function createProtectedBrowserLauncher(target: URL, root = join(WS_CONFIG_DIR, "service", "browser-launches")): URL {
  if (!existsSync(root)) mkdirSync(root, { recursive: true, mode: 0o700 })
  const rootStat = lstatSync(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (typeof process.getuid === "function" && rootStat.uid !== process.getuid())) {
    throw new Error("Unsafe browser launcher directory")
  }
  chmodSync(root, 0o700)
  const cutoff = Date.now() - 5 * 60_000
  for (const name of readdirSync(root)) {
    const path = join(root, name)
    try {
      const stat = lstatSync(path)
      if (stat.isFile() && !stat.isSymbolicLink() && stat.mtimeMs < cutoff) unlinkSync(path)
    } catch {}
  }
  const path = join(root, `launch-${crypto.randomUUID()}.html`)
  if (target.protocol !== "file:") throw new Error("The protected browser client must be an installed file asset")
  const launch = new URLSearchParams(target.hash.slice(1)).get("launch")
  if (!launch || launch.length > 8_192 || !/^[A-Za-z0-9_-]+$/.test(launch)) throw new Error("The protected browser launch grant is malformed")
  const client = new URL(target)
  client.hash = ""
  client.search = ""
  const source = readFileSync(fileURLToPath(client), "utf8")
  const head = source.indexOf("<head>")
  if (head < 0) throw new Error("The installed browser client is malformed")
  const insertAt = head + "<head>".length
  const html = `${source.slice(0, insertAt)}\n    <meta name="git-stacks-launch" content="${launch}">${source.slice(insertAt)}`
  const fd = openSync(path, "wx", 0o600)
  try { writeFileSync(fd, html, "utf8") } finally { closeSync(fd) }
  return pathToFileURL(path)
}
