import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

function run(command, args) {
  console.log(`$ ${[command, ...args].join(" ")}`)
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function packageVersion() {
  return JSON.parse(readFileSync("package.json", "utf8")).version
}

function assertTagCanBeCreated(rcTag) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
  const existing = spawnSync("git", ["rev-parse", `${rcTag}^{}`], { encoding: "utf8" })
  if (existing.status !== 0) return true
  if (existing.stdout.trim() === head) return false
  throw new Error(`${rcTag} already points to ${existing.stdout.trim()}, not current HEAD ${head}; refusing to move it`)
}

const rcVersion = packageVersion()
if (!/^\d+\.\d+\.\d+-rc\.\d+$/.test(rcVersion)) {
  throw new Error(`package.json version must be a release candidate; found ${rcVersion}`)
}
if (!readFileSync("CHANGELOG.md", "utf8").includes(`## [${rcVersion}]`)) {
  throw new Error(`CHANGELOG.md must contain an entry for ${rcVersion}`)
}

run("npm", ["run", "build:packages"])
run("npm", ["run", "tui:build"])
run("npm", ["run", "typecheck"])
run("npm", ["run", "test:architecture"])
run("npm", ["run", "test:deps"])
run("npm", ["run", "test:vitest"])
run("npm", ["run", "test:node"])
run("npm", ["run", "test:tui"])
run("npm", ["run", "coverage"])
run("npm", ["run", "verify:gates"])
run("npm", ["run", "audit:licenses"])
run("npm", ["run", "audit:runtime"])
run("npm", ["run", "check:packages"])

const rcTag = `v${rcVersion}`
if (process.argv.includes("--tag")) {
  if (assertTagCanBeCreated(rcTag)) run("git", ["tag", "-a", rcTag, "-m", `git-stacks ${rcVersion} release candidate`])
  else console.log(`${rcTag} already points at the verified commit.`)
} else {
  console.log(`Verification only. Pass --tag explicitly to create ${rcTag}; publication occurs only after the matching GitHub Release is published.`)
}
console.log(`RC verification passed for ${rcVersion}.`)
