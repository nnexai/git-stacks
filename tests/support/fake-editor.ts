#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "fs"

const targetPath = process.argv[2]
if (!targetPath) {
  console.error("fake-editor: missing target path")
  process.exit(64)
}

const capturePath = process.env.FAKE_EDITOR_CAPTURE
if (capturePath) {
  appendFileSync(capturePath, `${targetPath}\n`)
}

const mode = process.env.FAKE_EDITOR_MODE ?? "mutate-valid"

switch (mode) {
  case "mutate-valid":
    appendFileSync(targetPath, "\n# fake-editor-mutated: true\n")
    process.exit(0)
  case "mutate-invalid":
    writeFileSync(targetPath, ":\n", "utf8")
    process.exit(0)
  case "fail":
    process.exit(17)
  default:
    console.error(`fake-editor: unknown mode '${mode}'`)
    process.exit(64)
}
