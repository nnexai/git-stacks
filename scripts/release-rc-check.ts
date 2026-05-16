#!/usr/bin/env bun
import { readFileSync } from "fs"
import { runVerifyWorkflow } from "./verify"

const RC_VERSION = "0.18.0-rc.1"
const RC_TAG = `v${RC_VERSION}`

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

async function assertTagState(): Promise<"absent" | "same"> {
  const head = (await capture("git rev-parse HEAD")).stdout.trim()
  const tag = await capture(`git rev-parse ${RC_TAG}^{}`)

  if (tag.exitCode !== 0) return "absent"

  const taggedCommit = tag.stdout.trim()
  if (taggedCommit !== head) {
    console.error(`ERROR: ${RC_TAG} already points to ${taggedCommit}, not current HEAD ${head}. Refusing to move it.`)
    process.exit(1)
  }

  return "same"
}

async function createTagIfNeeded(options: RunOptions): Promise<void> {
  if (options.skipTag) {
    console.log(`Skipping tag creation for ${RC_TAG} (--skip-tag).`)
    return
  }

  const tagState = await assertTagState()
  if (tagState === "same") {
    console.log(`${RC_TAG} already points at the verified commit.`)
    return
  }

  const exitCode = await runCommand(`git tag -a ${RC_TAG} -m "git-stacks ${RC_VERSION} release candidate"`)
  if (exitCode !== 0) process.exit(exitCode)
}

async function main() {
  const options: RunOptions = {
    skipTag: process.argv.includes("--skip-tag"),
  }

  if (packageVersion() !== RC_VERSION) {
    console.error(`ERROR: package.json version must be ${RC_VERSION} before RC verification.`)
    process.exit(1)
  }

  const smokeExit = await runCommand("bun test tests/commands/release-rc.test.ts")
  if (smokeExit !== 0) process.exit(smokeExit)

  const verifyExit = await runVerifyWorkflow({ runCommand })
  if (verifyExit !== 0) process.exit(verifyExit)

  const publishExit = await runCommand("bun publish --dry-run")
  if (publishExit !== 0) process.exit(publishExit)

  await createTagIfNeeded(options)
  console.log(`RC verification passed for ${RC_VERSION}.`)
}

await main()
