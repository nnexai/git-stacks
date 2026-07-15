// Canonical implementation owned by @git-stacks/core.
export type PlatformCommandResult = { exitCode: number; stdout: string; stderr?: string }

export class PlatformCommandError extends Error {
  constructor(readonly command: string, readonly result: PlatformCommandResult) {
    super(`${command} failed (exit ${result.exitCode})${result.stderr ? `: ${result.stderr.trim()}` : ""}`)
    this.name = "PlatformCommandError"
  }
}

/** Require a mutating platform command to succeed; probes should inspect exitCode directly. */
export function requirePlatformSuccess(command: string, result: PlatformCommandResult): void {
  if (result.exitCode !== 0) throw new PlatformCommandError(command, result)
}
