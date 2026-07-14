#!/usr/bin/env bun
import { readFileSync } from "fs"
import { runVerifyWorkflow } from "./verify"

type RunOptions = {
  skipTag: boolean
}

async function runCommand(command: string): Promise<number> {
  console.log(`$ ${command}`)
  const proc = Bun.spawn(["sh", "-c", command], {
    cwd: process.cwd(),
    stdio: ["inherit", "inherit", "inherit"],
  })
  return proc.exited
}

async function capture(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["sh", "-c", command], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

function packageVersion(): string {
  return JSON.parse(readFileSync("package.json", "utf8")).version
}

function changelog(): string {
  return readFileSync("CHANGELOG.md", "utf8")
}

async function assertTagState(rcTag: string): Promise<"absent" | "same"> {
  const head = (await capture("git rev-parse HEAD")).stdout.trim()
  const tag = await capture(`git rev-parse ${rcTag}^{}`)

  if (tag.exitCode !== 0) return "absent"

  const taggedCommit = tag.stdout.trim()
  if (taggedCommit !== head) {
    console.error(`ERROR: ${rcTag} already points to ${taggedCommit}, not current HEAD ${head}. Refusing to move it.`)
    process.exit(1)
  }

  return "same"
}

async function createTagIfNeeded(rcVersion: string, options: RunOptions): Promise<void> {
  const rcTag = `v${rcVersion}`
  if (options.skipTag) {
    console.log(`Skipping tag creation for ${rcTag} (--skip-tag).`)
    return
  }

  const tagState = await assertTagState(rcTag)
  if (tagState === "same") {
    console.log(`${rcTag} already points at the verified commit.`)
    return
  }

  const exitCode = await runCommand(`git tag -a ${rcTag} -m "git-stacks ${rcVersion} release candidate"`)
  if (exitCode !== 0) process.exit(exitCode)
}

async function main() {
  const options: RunOptions = {
    skipTag: process.argv.includes("--skip-tag"),
  }

  const rcVersion = packageVersion()
  if (!/^\d+\.\d+\.\d+-rc\.\d+$/.test(rcVersion)) {
    console.error(`ERROR: package.json version must be a release candidate before RC verification. Found ${rcVersion}.`)
    process.exit(1)
  }

  if (!changelog().includes(`## [${rcVersion}]`)) {
    console.error(`ERROR: CHANGELOG.md must contain an entry for ${rcVersion} before RC verification.`)
    process.exit(1)
  }

  const smokeExit = await runCommand("bun test tests/commands/release-rc.test.ts")
  if (smokeExit !== 0) process.exit(smokeExit)

  const verifyExit = await runVerifyWorkflow({ runCommand })
  if (verifyExit !== 0) process.exit(verifyExit)

  const publishExit = await runCommand("bun publish --dry-run --tag next")
  if (publishExit !== 0) process.exit(publishExit)

  await createTagIfNeeded(rcVersion, options)
  console.log(`RC verification passed for ${rcVersion}.`)
}

await main()
