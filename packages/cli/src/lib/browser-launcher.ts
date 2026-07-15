import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

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
  const escaped = target.toString().replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  const html = `<!doctype html><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; navigate-to file:"><meta http-equiv="refresh" content="0;url=${escaped}"><title>Opening git-stacks</title>\n`
  const fd = openSync(path, "wx", 0o600)
  try { writeFileSync(fd, html, "utf8") } finally { closeSync(fd) }
  return pathToFileURL(path)
}
