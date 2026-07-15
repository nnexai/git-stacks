import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { delimiter, join } from "node:path"
import { Readable } from "node:stream"

type ProcessOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdin?: Buffer | string | "pipe" | "inherit" | null
  stdout?: "pipe" | "inherit" | null
  stderr?: "pipe" | "inherit" | null
  stdio?: ["pipe" | "inherit" | null, "pipe" | "inherit" | null, "pipe" | "inherit" | null]
}

export function runProcessSync(argv: string[], options: ProcessOptions = {}) {
  const stdio = options.stdio ?? [options.stdin ?? "pipe", options.stdout ?? "pipe", options.stderr ?? "pipe"]
  const input = Buffer.isBuffer(options.stdin) || (typeof options.stdin === "string" && options.stdin !== "pipe" && options.stdin !== "inherit")
    ? options.stdin
    : undefined
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: options.cwd,
    env: options.env,
    input,
    stdio: input === undefined ? stdio : ["pipe", stdio[1], stdio[2]],
  })
  if (result.error) throw result.error
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? Buffer.alloc(0),
    stderr: result.stderr ?? Buffer.alloc(0),
  }
}

export function runProcess(argv: string[], options: ProcessOptions = {}) {
  const child = spawn(argv[0], argv.slice(1), {
    cwd: options.cwd,
    env: options.env,
    stdio: [options.stdin ?? "ignore", options.stdout ?? "pipe", options.stderr ?? "pipe"],
  })
  const exited = new Promise<number>((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  })
  return {
    exited,
    stdout: child.stdout ? Readable.toWeb(child.stdout) as ReadableStream<Uint8Array> : null,
    stderr: child.stderr ? Readable.toWeb(child.stderr) as ReadableStream<Uint8Array> : null,
  }
}

export function hasCommand(command: string, path = process.env.PATH ?? ""): boolean {
  return path.split(delimiter).some((directory) => existsSync(join(directory, command)))
}
