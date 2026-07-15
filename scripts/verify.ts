#!/usr/bin/env node
import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export type RunCommand = (command: string) => Promise<number>

export type VerifyWorkflowOptions = {
  runCommand?: RunCommand
  log?: (message: string) => void
}

const VERIFY_COMMANDS = [
  "npm run verify:prereqs",
  "npm run coverage",
  "npm run verify:gates",
  "npm test",
  "npm run test:deps",
  "npm run typecheck",
] as const

export function getVerifyCommands(): string[] {
  return [...VERIFY_COMMANDS]
}

async function spawnCommand(command: string): Promise<number> {
  const proc = spawn("sh", ["-c", command], {
    cwd: process.cwd(),
    stdio: "inherit",
  })
  return new Promise<number>((done, reject) => {
    proc.once("error", reject)
    proc.once("exit", (code) => done(code ?? 1))
  })
}

export async function runVerifyWorkflow(options: VerifyWorkflowOptions = {}): Promise<number> {
  const runCommand = options.runCommand ?? spawnCommand
  const log = options.log ?? console.log

  for (const command of VERIFY_COMMANDS) {
    log(`$ ${command}`)
    const exitCode = await runCommand(command)
    if (exitCode !== 0) return exitCode
  }

  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const exitCode = await runVerifyWorkflow()
  process.exit(exitCode)
}
