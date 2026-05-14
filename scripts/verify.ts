#!/usr/bin/env bun
export type RunCommand = (command: string) => Promise<number>

export type VerifyWorkflowOptions = {
  runCommand?: RunCommand
  log?: (message: string) => void
}

const VERIFY_COMMANDS = [
  "bun run verify:prereqs",
  "bun run coverage",
  "bun run verify:gates",
  "bun run test",
  "bun run test:deps",
  "bun run typecheck",
] as const

export function getVerifyCommands(): string[] {
  return [...VERIFY_COMMANDS]
}

async function spawnCommand(command: string): Promise<number> {
  const proc = Bun.spawn(["sh", "-c", command], {
    cwd: process.cwd(),
    stdio: ["inherit", "inherit", "inherit"],
  })
  return proc.exited
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

if (import.meta.main) {
  const exitCode = await runVerifyWorkflow()
  process.exit(exitCode)
}
