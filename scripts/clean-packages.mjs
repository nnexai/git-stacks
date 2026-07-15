import { readdir, rm } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
for (const entry of await readdir(join(root, "packages"), { withFileTypes: true })) {
  if (entry.isDirectory()) await rm(join(root, "packages", entry.name, "dist"), { recursive: true, force: true })
}
