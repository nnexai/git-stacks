export interface ProcessResult {
  exitCode: number
  stdout: Uint8Array
  stderr: Uint8Array
}

export interface ProcessRunner {
  run(argv: readonly string[], options?: { cwd?: string; env?: Readonly<Record<string, string | undefined>>; signal?: AbortSignal }): Promise<ProcessResult>
}

export interface Clock {
  now(): number
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>
}

export interface ExecutableResolver {
  resolve(command: string): Promise<string | undefined>
}

export interface FileMatcher {
  match(root: string, pattern: string): AsyncIterable<string>
}

export interface CoreLogger {
  debug(message: string, attributes?: Readonly<Record<string, unknown>>): void
  info(message: string, attributes?: Readonly<Record<string, unknown>>): void
  warn(message: string, attributes?: Readonly<Record<string, unknown>>): void
  error(message: string, attributes?: Readonly<Record<string, unknown>>): void
}

export interface DisposableResource {
  dispose(): void | Promise<void>
}

export interface MutationLease extends DisposableResource {}

export interface MutationCoordinator {
  acquire(target: string, signal?: AbortSignal): Promise<MutationLease>
}

export interface ChangeObserver {
  watch(roots: readonly string[], invalidate: () => void): DisposableResource
}
