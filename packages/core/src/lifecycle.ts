import { executeUserShellCommand } from "./user-shell"

export type HookOutputLine = {
  line: string
  stream: "stdout" | "stderr"
}

export type ShellOutputLine = HookOutputLine

export type HookResult = {
  exitCode: number
  failed: boolean
  command: string
}

export type ShellSequenceResult = {
  exitCode: number
  failedCommand?: string
}

export type SpawnHandle = {
  exited: Promise<number>
  stdout: ReadableStream<Uint8Array> | null
  stderr: ReadableStream<Uint8Array> | null
}

export type ShellSpawnArgs = {
  command: string
  cwd: string
  env: Record<string, string>
  stdout: "inherit" | "pipe"
  stderr: "inherit" | "pipe"
  signal?: AbortSignal
}

export type ShellExecutor = {
  spawn(args: ShellSpawnArgs): SpawnHandle
}

type OutputBridge = {
  stream: ReadableStream<Uint8Array>
  enqueue(chunk: Uint8Array): void
  close(): void
  error(reason: unknown): void
}

function createOutputBridge(): OutputBridge {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start(value) { controller = value },
  })
  return {
    stream,
    enqueue: (chunk) => controller.enqueue(chunk),
    close: () => controller.close(),
    error: (reason) => controller.error(reason),
  }
}

function createAdapterHandle(args: ShellSpawnArgs): SpawnHandle {
  const stdoutBridge = args.stdout === "pipe" ? createOutputBridge() : undefined
  const stderrBridge = args.stderr === "pipe" ? createOutputBridge() : undefined
  const execution = executeUserShellCommand({
    command: args.command,
    cwd: args.cwd,
    inheritedEnvironment: process.env,
    overlay: args.env,
    signal: args.signal,
    onOutput: ({ stream, chunk }) => {
      if (stream === "stdout") {
        if (stdoutBridge) stdoutBridge.enqueue(chunk)
        else process.stdout.write(chunk)
      } else if (stderrBridge) {
        stderrBridge.enqueue(chunk)
      } else {
        process.stderr.write(chunk)
      }
    },
  })
  const exited = execution.then(
    (result) => {
      stdoutBridge?.close()
      stderrBridge?.close()
      return result.exitCode
    },
    (error) => {
      stdoutBridge?.error(error)
      stderrBridge?.error(error)
      throw error
    },
  )
  return {
    exited,
    stdout: stdoutBridge?.stream ?? null,
    stderr: stderrBridge?.stream ?? null,
  }
}

// Mutable property retained as the lifecycle and workspace-lifecycle test seam.
export const _exec: ShellExecutor = {
  spawn: createAdapterHandle,
}

export async function runHooksWithExecutor(
  executor: ShellExecutor,
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  abortOnFailure = true,
  signal?: AbortSignal,
): Promise<void> {
  if (!commands || commands.length === 0) return
  for (const command of commands) {
    const handle = executor.spawn({
      command,
      cwd,
      env,
      stdout: "inherit",
      stderr: "inherit",
      signal,
    })
    const exitCode = await handle.exited
    if (abortOnFailure && exitCode !== 0) {
      throw new Error(`Hook failed (exit ${exitCode}): ${command}`)
    }
  }
}

export async function runHooks(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  abortOnFailure = true,
  signal?: AbortSignal,
): Promise<void> {
  return runHooksWithExecutor(_exec, commands, cwd, env, abortOnFailure, signal)
}

async function readOutputStream(
  stream: ReadableStream<Uint8Array>,
  streamName: "stdout" | "stderr",
  onOutput: (output: ShellOutputLine) => void,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      buffer += decoder.decode()
      if (buffer) onOutput({ line: buffer, stream: streamName })
      return
    }
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (line) onOutput({ line, stream: streamName })
    }
  }
}

export async function runHooksCapturedWithExecutor(
  executor: ShellExecutor,
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  onOutput: (output: HookOutputLine) => void,
  abortOnFailure = true,
  signal?: AbortSignal,
): Promise<HookResult[]> {
  if (!commands || commands.length === 0) return []
  const results: HookResult[] = []
  for (const command of commands) {
    const handle = executor.spawn({
      command,
      cwd,
      env,
      stdout: "pipe",
      stderr: "pipe",
      signal,
    })
    const [, , exitCode] = await Promise.all([
      readOutputStream(handle.stdout!, "stdout", onOutput),
      readOutputStream(handle.stderr!, "stderr", onOutput),
      handle.exited,
    ])
    results.push({ exitCode, failed: exitCode !== 0, command })
    if (abortOnFailure && exitCode !== 0) break
  }
  return results
}

export async function runHooksCaptured(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  onOutput: (output: HookOutputLine) => void,
  abortOnFailure = true,
  signal?: AbortSignal,
): Promise<HookResult[]> {
  return runHooksCapturedWithExecutor(_exec, commands, cwd, env, onOutput, abortOnFailure, signal)
}

export async function runShellSequence(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  signal?: AbortSignal,
): Promise<ShellSequenceResult> {
  if (!commands || commands.length === 0) return { exitCode: 0 }
  for (const command of commands) {
    const handle = _exec.spawn({
      command,
      cwd,
      env,
      stdout: "inherit",
      stderr: "inherit",
      signal,
    })
    const exitCode = await handle.exited
    if (exitCode !== 0) return { exitCode, failedCommand: command }
  }
  return { exitCode: 0 }
}

export async function runShellSequenceCaptured(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  onOutput: (output: ShellOutputLine) => void,
  signal?: AbortSignal,
): Promise<ShellSequenceResult> {
  if (!commands || commands.length === 0) return { exitCode: 0 }
  for (const command of commands) {
    const handle = _exec.spawn({
      command,
      cwd,
      env,
      stdout: "pipe",
      stderr: "pipe",
      signal,
    })
    const [, , exitCode] = await Promise.all([
      readOutputStream(handle.stdout!, "stdout", onOutput),
      readOutputStream(handle.stderr!, "stderr", onOutput),
      handle.exited,
    ])
    if (exitCode !== 0) return { exitCode, failedCommand: command }
  }
  return { exitCode: 0 }
}
