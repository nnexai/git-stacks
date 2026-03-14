import { spawn } from "bun"

// Runs an array of shell commands sequentially.
// cwd: working directory for each command.
// env: merged with process.env before running.
// abortOnFailure: if true (default), throws on first non-zero exit.
export async function runHooks(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  abortOnFailure = true
): Promise<void> {
  if (!commands || commands.length === 0) return

  const mergedEnv = { ...process.env, ...env } as Record<string, string>

  for (const cmd of commands) {
    const proc = spawn(["sh", "-c", cmd], {
      cwd,
      env: mergedEnv,
      stdout: "inherit",
      stderr: "inherit",
    })
    const exitCode = await proc.exited
    if (abortOnFailure && exitCode !== 0) {
      throw new Error(`Hook failed (exit ${exitCode}): ${cmd}`)
    }
  }
}
