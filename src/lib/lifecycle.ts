import { spawn } from "bun"

export type HookOutputLine = {
  line: string
  stream: "stdout" | "stderr"
}

export type HookResult = {
  exitCode: number
  failed: boolean
  command: string
}

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

// Runs an array of shell commands sequentially, capturing output via callback.
// Unlike runHooks, this does NOT write to the terminal — output is piped and
// delivered line-by-line through the onOutput callback. Returns results instead
// of throwing on failure.
export async function runHooksCaptured(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  onOutput: (output: HookOutputLine) => void,
  abortOnFailure = true
): Promise<HookResult[]> {
  if (!commands || commands.length === 0) return []

  const mergedEnv = { ...process.env, ...env } as Record<string, string>
  const results: HookResult[] = []

  for (const cmd of commands) {
    const proc = spawn(["sh", "-c", cmd], {
      cwd,
      env: mergedEnv,
      stdout: "pipe",
      stderr: "pipe",
    })

    const readStream = async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      stream: "stdout" | "stderr"
    ) => {
      const decoder = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          if (buf) { onOutput({ line: buf, stream }); buf = "" }
          break
        }
        buf += decoder.decode(value)
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          if (line) onOutput({ line, stream })
        }
      }
    }

    await Promise.all([
      readStream(proc.stdout.getReader(), "stdout"),
      readStream(proc.stderr.getReader(), "stderr"),
    ])

    const exitCode = await proc.exited
    const result: HookResult = { exitCode, failed: exitCode !== 0, command: cmd }
    results.push(result)

    if (abortOnFailure && exitCode !== 0) break
  }

  return results
}
