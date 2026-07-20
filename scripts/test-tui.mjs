import { spawn } from "node:child_process"
import { globSync } from "node:fs"

const files = globSync("tests/tui/dashboard/**/*.test.{ts,tsx}").sort()
// GitHub's Intel macOS runners become CPU-starved when several Bun/OpenTUI
// processes initialize together, obscuring the launcher lifecycle assertions.
const concurrency = process.platform === "darwin" && process.arch === "x64"
  ? 1
  : Math.min(4, files.length)
let next = 0
let failed = false
let aborted = false
const children = new Set()

function run(file) {
  return new Promise((resolve) => {
    const child = spawn("bun", ["test", "--preload", "@opentui/solid/preload", file], { stdio: "inherit" })
    children.add(child)
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      children.delete(child)
      if (!ok) failed = true
      resolve()
    }
    child.once("error", (error) => {
      console.error(`Unable to run TUI test ${file}: ${error.message}`)
      finish(false)
    })
    child.once("exit", (code) => {
      finish(code === 0)
    })
  })
}

async function worker() {
  while (!aborted && next < files.length) {
    const file = files[next++]
    await run(file)
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    aborted = true
    failed = true
    for (const child of children) child.kill(signal)
  })
}

await Promise.all(Array.from({ length: concurrency }, () => worker()))
if (failed) process.exitCode = 1
