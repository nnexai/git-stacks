import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeSync } from "node:fs"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"

const [path, countText = "1"] = process.argv.slice(2)
if (!path) throw new Error("writer requires a target path")
const count = Number(countText)
mkdirSync(dirname(path), { recursive: true })

for (let index = 1; index <= count; index += 1) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  const content = `${JSON.stringify({ version: index, writer: process.pid })}\n`
  const descriptor = openSync(temporary, "wx", 0o600)
  try {
    writeSync(descriptor, content, 0, "utf8")
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  renameSync(temporary, path)
}
