// Canonical implementation owned by @git-stacks/core.
import { existsSync, readdirSync } from "node:fs"
import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from "node:child_process"
import { Readable } from "node:stream"
import { delimiter, isAbsolute, join, matchesGlob, relative } from "node:path"

export type ProcessOutput = {
  exitCode: number
  stdout: Buffer
  stderr: Buffer
  text(): string
}

function output(exitCode: number, stdout: Buffer, stderr: Buffer): ProcessOutput {
  return { exitCode, stdout, stderr, text: () => stdout.toString() }
}

function quote(value: unknown): string {
  if (Array.isArray(value)) return value.map(quote).join(" ")
  const text = String(value)
  return `'${text.replaceAll("'", `'\\''`)}'`
}

class ShellCommand implements PromiseLike<ProcessOutput> {
  private rejectOnFailure = true
  private execution?: Promise<ProcessOutput>

  constructor(private readonly command: string) {}

  quiet(): this { return this }
  nothrow(): this { this.rejectOnFailure = false; return this }

  private run(): Promise<ProcessOutput> {
    if (!this.execution) {
      this.execution = new Promise((resolve, reject) => {
        const child = nodeSpawn("/bin/sh", ["-c", this.command], {
          stdio: ["ignore", "pipe", "pipe"],
          env: process.env,
        })
        const stdout: Buffer[] = []
        const stderr: Buffer[] = []
        child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk))
        child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk))
        child.once("error", reject)
        child.once("close", (code) => {
          const result = output(code ?? 1, Buffer.concat(stdout), Buffer.concat(stderr))
          if (result.exitCode !== 0 && this.rejectOnFailure) {
            const error = new Error(`Command failed (${result.exitCode}): ${this.command}\n${result.stderr.toString().trim()}`) as Error & ProcessOutput
            Object.assign(error, result)
            reject(error)
          } else resolve(result)
        })
      })
    }
    return this.execution
  }

  async text(): Promise<string> {
    const result = await this.run()
    if (result.exitCode !== 0 && this.rejectOnFailure) throw new Error(result.stderr.toString())
    return result.stdout.toString()
  }

  then<TResult1 = ProcessOutput, TResult2 = never>(
    onfulfilled?: ((value: ProcessOutput) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected)
  }
}

export function $(strings: TemplateStringsArray, ...values: unknown[]): ShellCommand {
  let command = strings[0]
  for (let index = 0; index < values.length; index += 1) command += quote(values[index]) + strings[index + 1]
  return new ShellCommand(command)
}

type StdioMode = "pipe" | "inherit" | "ignore"
export type SpawnOptions = {
  cwd?: string
  env?: Record<string, string | undefined>
  timeoutMs?: number
  isolatedProcessGroup?: boolean
  stdin?: StdioMode
  stdout?: StdioMode
  stderr?: StdioMode
  stdio?: [StdioMode, StdioMode, StdioMode]
}

export type SpawnedProcess = {
  pid: number
  exited: Promise<number>
  stdout: ReadableStream<Uint8Array> | null
  stderr: ReadableStream<Uint8Array> | null
  kill(signal?: NodeJS.Signals | number): boolean
  killGroup(signal?: NodeJS.Signals | number): boolean
  unref(): void
}

export function spawn(argv: readonly string[], options: SpawnOptions = {}): SpawnedProcess {
  const stdio = options.stdio ?? [options.stdin ?? "ignore", options.stdout ?? "pipe", options.stderr ?? "pipe"]
  const isolatedProcessGroup = (options.isolatedProcessGroup === true || options.timeoutMs !== undefined)
    && process.platform !== "win32"
  const child = nodeSpawn(argv[0], argv.slice(1), {
    cwd: options.cwd,
    env: options.env as NodeJS.ProcessEnv | undefined,
    stdio,
    detached: isolatedProcessGroup,
  })
  let timeout: NodeJS.Timeout | undefined
  const clearProcessTimeout = () => { if (timeout) clearTimeout(timeout); timeout = undefined }
  if (options.timeoutMs !== undefined) {
    timeout = setTimeout(() => {
      if (isolatedProcessGroup && child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); return } catch { /* process may already have exited */ }
      }
      child.kill("SIGKILL")
    }, options.timeoutMs)
    timeout.unref()
  }
  const exited = new Promise<number>((resolve, reject) => {
    child.once("error", (error) => { clearProcessTimeout(); reject(error) })
    child.once("close", (code) => { clearProcessTimeout(); resolve(code ?? 1) })
  })
  return {
    pid: child.pid ?? -1,
    exited,
    stdout: child.stdout ? Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array> : null,
    stderr: child.stderr ? Readable.toWeb(child.stderr) as unknown as ReadableStream<Uint8Array> : null,
    kill: (signal) => child.kill(signal),
    killGroup: (signal) => {
      if (isolatedProcessGroup && child.pid) {
        try {
          process.kill(-child.pid, signal ?? "SIGTERM")
          return true
        } catch {
          // The process may have exited or group signaling may be unavailable.
        }
      }
      return child.kill(signal)
    },
    unref: () => child.unref(),
  }
}

export function spawnSync(argv: readonly string[], options: SpawnOptions = {}): ProcessOutput {
  const stdio = options.stdio ?? [options.stdin ?? "ignore", options.stdout ?? "pipe", options.stderr ?? "pipe"]
  const result = nodeSpawnSync(argv[0], argv.slice(1), {
    cwd: options.cwd,
    env: options.env as NodeJS.ProcessEnv | undefined,
    input: undefined,
    encoding: null,
    stdio,
  })
  return output(
    result.status ?? 1,
    Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? ""),
    Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? ""),
  )
}

export function which(command: string, path = process.env.PATH ?? ""): string | null {
  if (isAbsolute(command)) return command
  for (const directory of path.split(delimiter)) {
    const candidate = join(directory, command)
    if (existsSync(candidate)) return candidate
  }
  return null
}

export function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return }
    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
  })
}

export function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

export function expandGlobSync(pattern: string, cwd: string): string[] {
  const matches: string[] = []
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      const candidate = relative(cwd, absolute)
      if (matchesGlob(candidate, pattern)) matches.push(candidate)
      if (entry.isDirectory()) visit(absolute)
    }
  }
  visit(cwd)
  return matches.sort()
}
