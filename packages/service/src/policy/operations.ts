import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises"

import { createHash, randomBytes } from "node:crypto"
import { join } from "node:path"
import { spawn as spawnChild } from "node:child_process"
import {
  OperationSchema,
  type ApiError,
  type Operation,
  type OperationProgress,
} from "@git-stacks/protocol"
import type { OperationEventPublisher } from "./event-journal"
import { openWorkspace as openWorkspaceDirect, renameWorkspace } from "@git-stacks/core/workspace-ops"
import {
  cleanWorkspace,
  closeWorkspace as closeWorkspaceDirect,
  mergeWorkspace,
  removeWorkspace,
} from "@git-stacks/core/workspace-lifecycle"
import { pushWorkspace, syncWorkspace } from "@git-stacks/core/workspace-git"
import { createWorkspaceFromRequest, planWorkspaceCreation, type WorkspaceCreationRequest } from "@git-stacks/core/workspace-creation"
import {
  deleteTemplate,
  listRegistryEntries,
  listTemplatesUncached,
  listWorkspacesUncached,
  readGlobalConfig,
  readTemplate,
  readWorkspace,
  writeRegistry,
  writeTemplate,
  writeWorkspace,
} from "@git-stacks/core/config"
import { runManualCommand } from "@git-stacks/core/workspace-command"
import { CLIENT_MODEL_LIMITS } from "@git-stacks/protocol"
import type { CoreMutationName, CoreMutationRequest } from "./core-contract"

export const DEFAULT_OPERATION_RETENTION_MS = 24 * 60 * 60 * 1_000
export const DEFAULT_OPERATION_TERMINAL_LIMIT = 10_000

export interface OperationStep {
  name: string
  stage: "preparing" | "executing"
  message: string
  run: (report: (progress: OperationProgressInput) => void | Promise<void>) => Promise<void>
  rollback?: () => Promise<void>
}

export type OperationProgressInput = Omit<OperationProgress, "stage"> & { stage?: OperationProgress["stage"] }

export interface OperationExecution {
  steps: OperationStep[]
  result?: Record<string, unknown>
}

export interface SubmitOperationInput {
  clientId: string
  endpoint: string
  idempotencyKey: string
  request: unknown
  execution: OperationExecution
}

export class IdempotencyConflictError extends Error {
  readonly code = "idempotency_conflict"
  constructor(readonly operationId: string) { super("Idempotency key was already used with different input") }
}

type PersistedReservation = {
  client_id: string
  endpoint: string
  idempotency_key: string
  request_hash: string
  operation_id: string
  created_at: string
}

type Store = { operations: Operation[]; reservations: PersistedReservation[] }

export interface OperationRegistryOptions {
  root: string
  now?: () => number
  id?: () => string
  publishOperationEvent: OperationEventPublisher
  schedule?: (run: () => void) => void
  onOperation?: (operation: Operation) => void | Promise<void>
  retentionMs?: number
  terminalLimit?: number
}

function error(code: ApiError["code"], message: string, details?: ApiError["details"]): ApiError {
  return { code, message, ...(details ? { details } : {}) }
}

function operationId(): string {
  return `op_${randomBytes(16).toString("base64url")}`
}

export class OperationRegistry {
  private readonly path: string
  private readonly now: () => number
  private readonly id: () => string
  private readonly publish: OperationEventPublisher
  private readonly schedule: (run: () => void) => void
  private readonly observe?: (operation: Operation) => void | Promise<void>
  private readonly retentionMs: number
  private readonly terminalLimit: number
  private queue: Promise<unknown> = Promise.resolve()
  private initialized = false
  private store: Store = { operations: [], reservations: [] }
  private readonly visibleOperations = new Map<string, Operation>()
  private readonly executions = new Map<string, Promise<void>>()
  private readonly cancellations = new Set<string>()

  constructor(private readonly options: OperationRegistryOptions) {
    this.path = join(options.root, "operations.json")
    this.now = options.now ?? Date.now
    this.id = options.id ?? operationId
    this.publish = options.publishOperationEvent
    this.schedule = options.schedule ?? ((run) => queueMicrotask(run))
    this.observe = options.onOperation
    this.retentionMs = options.retentionMs ?? DEFAULT_OPERATION_RETENTION_MS
    this.terminalLimit = options.terminalLimit ?? DEFAULT_OPERATION_TERMINAL_LIMIT
  }

  private serialized<T>(run: () => Promise<T>): Promise<T> {
    const result = this.queue.then(run, run)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  private timestamp(): string { return new Date(this.now()).toISOString() }

  private async persist(): Promise<void> {
    await mkdir(this.options.root, { recursive: true, mode: 0o700 })
    const temporary = `${this.path}.${process.pid}.${crypto.randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(this.store, null, 2)}\n`, { mode: 0o600 })
    const handle = await open(temporary, "r")
    try { await handle.sync() } finally { await handle.close() }
    await rename(temporary, this.path)
  }

  private prune(): void {
    const cutoff = this.now() - this.retentionMs
    const active = this.store.operations.filter((item) => item.state === "accepted" || item.state === "running")
    const terminal = this.store.operations
      .filter((item) => item.state !== "accepted" && item.state !== "running")
      .filter((item) => Date.parse(item.finished_at) >= cutoff)
      .sort((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at))
      .slice(0, this.terminalLimit)
    const retainedIds = new Set([...active, ...terminal].map((item) => item.operation_id))
    this.store.operations = [...active, ...terminal]
    this.store.reservations = this.store.reservations.filter((item) => retainedIds.has(item.operation_id))
    for (const id of this.visibleOperations.keys()) if (!retainedIds.has(id)) this.visibleOperations.delete(id)
  }

  async initialize(): Promise<void> {
    await this.serialized(async () => {
      if (this.initialized) return
      await mkdir(this.options.root, { recursive: true, mode: 0o700 })
      try {
        const raw = JSON.parse(await readFile(this.path, "utf8")) as Store
        this.store = {
          operations: raw.operations.map((item) => OperationSchema.parse(item)),
          reservations: Array.isArray(raw.reservations) ? raw.reservations : [],
        }
      } catch (caught) {
        if ((caught as NodeJS.ErrnoException).code !== "ENOENT") throw caught
      }
      this.initialized = true
      for (const item of this.store.operations) {
        if (item.state !== "accepted" && item.state !== "running") this.visibleOperations.set(item.operation_id, item)
      }
      const interrupted = this.store.operations.filter((item) => item.state === "accepted" || item.state === "running")
      for (const item of interrupted) {
        const failed: Operation = OperationSchema.parse({
          operation_id: item.operation_id,
          state: "failed",
          accepted_at: item.accepted_at,
          ...(item.state === "running" ? { started_at: item.started_at } : {}),
          finished_at: this.timestamp(),
          completed_steps: [],
          error: error("operation_failed", "Operation interrupted by service restart", { reason: "interrupted" }),
          rollback_attempted: false,
          rollback_succeeded: false,
          rollback_errors: [],
        })
        this.replace(failed)
        await this.persist()
        await this.publish(failed)
        this.visibleOperations.set(failed.operation_id, failed)
        await this.observe?.(structuredClone(failed))
      }
      this.prune()
      await this.persist()
    })
  }

  private replace(operation: Operation): void {
    const index = this.store.operations.findIndex((item) => item.operation_id === operation.operation_id)
    if (index === -1) this.store.operations.push(operation)
    else this.store.operations[index] = operation
  }

  get(id: string): Operation | undefined {
    const found = this.visibleOperations.get(id)
    return found ? structuredClone(found) : undefined
  }

  ownerOf(id: string): string | undefined {
    return this.store.reservations.find((item) => item.operation_id === id)?.client_id
  }

  getForClient(id: string, clientId: string): Operation | undefined {
    return this.ownerOf(id) === clientId ? this.get(id) : undefined
  }

  async accept(execution: OperationExecution): Promise<Operation> {
    await this.initialize()
    const accepted = await this.serialized(async () => {
      const operation = OperationSchema.parse({ operation_id: this.id(), state: "accepted", accepted_at: this.timestamp() })
      this.replace(operation)
      await this.persist()
      try { await this.publish(operation) } catch (caught) {
        this.store.operations = this.store.operations.filter((item) => item.operation_id !== operation.operation_id)
        await this.persist()
        throw caught
      }
      this.visibleOperations.set(operation.operation_id, operation)
      await this.observe?.(structuredClone(operation))
      return operation
    })
    this.schedule(() => {
      const running = this.execute(accepted, execution)
      this.executions.set(accepted.operation_id, running)
      void running.finally(() => this.executions.delete(accepted.operation_id))
    })
    return structuredClone(accepted)
  }

  async submit(input: SubmitOperationInput): Promise<Operation> {
    await this.initialize()
    let shouldSchedule = false
    const operation = await this.serialized(async () => {
      this.prune()
      const existing = this.store.reservations.find((item) =>
        item.client_id === input.clientId && item.endpoint === input.endpoint && item.idempotency_key === input.idempotencyKey)
      const requestHash = canonicalRequestHash(input.request)
      if (existing) {
        if (existing.request_hash !== requestHash) throw new IdempotencyConflictError(existing.operation_id)
        const original = this.store.operations.find((item) => item.operation_id === existing.operation_id)
        if (!original) throw new Error(`idempotency reservation references missing operation: ${existing.operation_id}`)
        return original
      }
      const accepted = OperationSchema.parse({ operation_id: this.id(), state: "accepted", accepted_at: this.timestamp() })
      const reservation: PersistedReservation = {
        client_id: input.clientId,
        endpoint: input.endpoint,
        idempotency_key: input.idempotencyKey,
        request_hash: requestHash,
        operation_id: accepted.operation_id,
        created_at: accepted.accepted_at,
      }
      this.store.operations.push(accepted)
      this.store.reservations.push(reservation)
      await this.persist()
      try { await this.publish(accepted) } catch (caught) {
        this.store.operations = this.store.operations.filter((item) => item.operation_id !== accepted.operation_id)
        this.store.reservations = this.store.reservations.filter((item) => item !== reservation)
        await this.persist()
        throw caught
      }
      this.visibleOperations.set(accepted.operation_id, accepted)
      await this.observe?.(structuredClone(accepted))
      shouldSchedule = true
      return accepted
    })
    if (shouldSchedule) {
      this.schedule(() => {
        const running = this.execute(operation, input.execution)
        this.executions.set(operation.operation_id, running)
        void running.finally(() => this.executions.delete(operation.operation_id))
      })
    }
    return structuredClone(operation)
  }

  async cancel(id: string): Promise<Operation> {
    await this.initialize()
    const operation = this.get(id)
    if (!operation) throw new Error(`unknown operation: ${id}`)
    if (operation.state === "accepted" || operation.state === "running") this.cancellations.add(id)
    return operation
  }

  async wait(id: string): Promise<void> {
    for (let attempt = 0; attempt < 100 && !this.executions.has(id); attempt += 1) await new Promise<void>((resolve) => setTimeout(resolve, 1))
    await this.executions.get(id)
  }

  private async visible(operation: Operation): Promise<void> {
    await this.serialized(async () => {
      this.replace(operation)
      this.prune()
      await this.persist()
      await this.publish(operation)
      this.visibleOperations.set(operation.operation_id, operation)
      await this.observe?.(structuredClone(operation))
    })
  }

  private async execute(accepted: Operation, execution: OperationExecution): Promise<void> {
    const startedAt = this.timestamp()
    const completed: OperationStep[] = []
    const rollbackErrors: ApiError[] = []
    let current: Operation = OperationSchema.parse({
      operation_id: accepted.operation_id, state: "running", accepted_at: accepted.accepted_at,
      started_at: startedAt, progress: { stage: "preparing", message: "Preparing operation" },
    })
    try {
      await this.visible(current)
      for (let index = 0; index < execution.steps.length; index += 1) {
        if (this.cancellations.has(accepted.operation_id)) {
          await this.finishCancelled(accepted, startedAt, completed, rollbackErrors)
          return
        }
        const step = execution.steps[index]!
        current = OperationSchema.parse({
          operation_id: accepted.operation_id, state: "running", accepted_at: accepted.accepted_at, started_at: startedAt,
          progress: { stage: step.stage, message: step.message, completed: index, total: execution.steps.length },
        })
        await this.visible(current)
        await step.run(async (reported) => {
          current = OperationSchema.parse({
            operation_id: accepted.operation_id, state: "running", accepted_at: accepted.accepted_at, started_at: startedAt,
            progress: { ...reported, stage: reported.stage ?? step.stage },
          })
          await this.visible(current)
        })
        completed.push(step)
      }
      if (this.cancellations.has(accepted.operation_id)) {
        await this.finishCancelled(accepted, startedAt, completed, rollbackErrors)
        return
      }
      await this.visible(OperationSchema.parse({
        operation_id: accepted.operation_id, state: "succeeded", accepted_at: accepted.accepted_at,
        started_at: startedAt, finished_at: this.timestamp(), completed_steps: completed.map((step) => step.name), result: execution.result,
      }))
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      if (current.state === "running" && !this.get(accepted.operation_id)?.state.includes("failed")) {
        await this.rollback(accepted, startedAt, completed, rollbackErrors)
        await this.visible(OperationSchema.parse({
          operation_id: accepted.operation_id, state: "failed", accepted_at: accepted.accepted_at, started_at: startedAt,
          finished_at: this.timestamp(), completed_steps: completed.map((step) => step.name),
          error: error(message === "journal unavailable" ? "internal_error" : "operation_failed", message),
          rollback_attempted: completed.some((step) => step.rollback),
          rollback_succeeded: rollbackErrors.length === 0,
          rollback_errors: rollbackErrors,
        }))
      }
    } finally { this.cancellations.delete(accepted.operation_id) }
  }

  private async rollback(accepted: Operation, startedAt: string, completed: OperationStep[], rollbackErrors: ApiError[]): Promise<void> {
    if (!completed.some((step) => step.rollback)) return
    await this.visible(OperationSchema.parse({
      operation_id: accepted.operation_id, state: "running", accepted_at: accepted.accepted_at, started_at: startedAt,
      progress: { stage: "rolling_back", message: "Rolling back completed work" },
    }))
    for (const step of [...completed].reverse()) {
      if (!step.rollback) continue
      try { await step.rollback() } catch (caught) {
        rollbackErrors.push(error("operation_failed", caught instanceof Error ? caught.message : String(caught)))
      }
    }
  }

  private async finishCancelled(accepted: Operation, startedAt: string, completed: OperationStep[], rollbackErrors: ApiError[]): Promise<void> {
    await this.rollback(accepted, startedAt, completed, rollbackErrors)
    await this.visible(OperationSchema.parse({
      operation_id: accepted.operation_id, state: "cancelled", accepted_at: accepted.accepted_at, started_at: startedAt,
      finished_at: this.timestamp(), completed_steps: completed.map((step) => step.name),
      error: error("operation_failed", "Operation cancelled at a safe boundary", { reason: "cancelled" }),
      rollback_attempted: completed.some((step) => step.rollback),
      rollback_succeeded: rollbackErrors.length === 0,
      rollback_errors: rollbackErrors,
    }))
  }
}

export function canonicalRequestHash(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical)
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonical(nested)]))
    return input
  }
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")
}

type WorkspaceMutationRequest = CoreMutationRequest<"workspace.open">
type WorkspaceMutation = (request: WorkspaceMutationRequest) => OperationExecution
export type WorkspaceCreateMutation = (request: WorkspaceCreationRequest, signal?: AbortSignal) => OperationExecution
type WorkspaceFunction = (workspace: string, options: any, progress?: (message: string) => void) => Promise<{ ok: boolean; error?: string }>

export type CoreMutationAdapter = (request: any, signal?: AbortSignal) => OperationExecution
export type CoreMutationAdapters = Record<CoreMutationName, CoreMutationAdapter> & { "workspace.create": WorkspaceCreateMutation }

export function createWorkspaceMutationAdapters(dependencies: {
  openWorkspace?: WorkspaceFunction
  closeWorkspace?: WorkspaceFunction
  createWorkspace?: typeof createWorkspaceFromRequest
  planWorkspace?: typeof planWorkspaceCreation
  listWorkspaces?: typeof listWorkspacesUncached
} = {}): CoreMutationAdapters {
  const adapt = (name: "open" | "close", invoke: WorkspaceFunction): WorkspaceMutation => (request) => ({
    steps: [{
      name: `workspace.${name}`,
      stage: "executing",
      message: `${name === "open" ? "Opening" : "Closing"} workspace`,
      run: async (report) => {
        let progressQueue = Promise.resolve()
        const result = await invoke(request.workspace, { ...request.options, captured: true }, (message) => {
          progressQueue = progressQueue.then(() => report({ message })).then(() => undefined)
        })
        await progressQueue
        if (!result.ok) throw new Error(result.error ?? `Workspace ${name} failed`)
      },
    }],
    result: { workspace: request.workspace, snapshot_changed: true },
  })
  const lifecycle = (name: "clean" | "remove" | "merge", invoke: WorkspaceFunction): WorkspaceMutation => (request) => ({
    steps: [{
      name: `workspace.${name}`, stage: "executing", message: `${name === "remove" ? "Removing" : name === "merge" ? "Merging" : "Cleaning"} workspace`,
      run: async (report) => {
        let progressQueue = Promise.resolve()
        const result = await invoke(request.workspace, { ...request.options, captured: true }, (message) => {
          progressQueue = progressQueue.then(() => report({ message })).then(() => undefined)
        })
        await progressQueue
        if (!result.ok) throw new Error(result.error ?? `Workspace ${name} failed`)
      },
    }],
    result: { workspace: request.workspace, snapshot_changed: true },
  })
  const create: WorkspaceCreateMutation = (request) => ({
    steps: [{
      name: "workspace.create", stage: "preparing", message: "Preparing workspace",
      run: async (report) => {
        const plan = await (dependencies.planWorkspace ?? planWorkspaceCreation)(request)
        if (!plan.ok) throw new Error(plan.error)
        const current = (dependencies.listWorkspaces ?? listWorkspacesUncached)()
        const repositories = current.reduce((sum, workspace) => sum + workspace.repos.length, 0) + plan.plan.inputs.repos.length
        const commands = current.reduce((sum, workspace) => sum + Object.keys(workspace.commands ?? {}).length + workspace.repos.reduce((nested, repo) => nested + Object.keys(repo.commands ?? {}).length, 0), 0)
          + Object.keys(plan.plan.inputs.wsCommands ?? {}).length + plan.plan.inputs.repos.reduce((sum, repo) => sum + Object.keys(repo.commands ?? {}).length, 0)
        if (current.length + 1 > CLIENT_MODEL_LIMITS.workspaces) throw new Error("capacity_exceeded: workspaces")
        if (plan.plan.inputs.repos.length > CLIENT_MODEL_LIMITS.repositories_per_workspace || repositories > CLIENT_MODEL_LIMITS.authoritative_pairs) throw new Error("capacity_exceeded: repositories")
        if (commands > CLIENT_MODEL_LIMITS.commands) throw new Error("capacity_exceeded: commands")
        let progressQueue = Promise.resolve()
        const result = await (dependencies.createWorkspace ?? createWorkspaceFromRequest)(request, (message) => {
          progressQueue = progressQueue.then(() => report({ stage: "executing", message })).then(() => undefined)
        })
        await progressQueue
        if (!result.ok) {
          const rollback = result.rollbackErrors.length ? `; rollback errors: ${result.rollbackErrors.join("; ")}` : ""
          throw new Error(`${result.error}${rollback}`)
        }
      },
    }],
    result: { workspace_name: request.name, snapshot_changed: true },
  })
  const adapters: CoreMutationAdapters = {
    "workspace.open": adapt("open", dependencies.openWorkspace ?? openWorkspaceDirect),
    "workspace.close": adapt("close", dependencies.closeWorkspace ?? closeWorkspaceDirect),
    "workspace.clean": lifecycle("clean", cleanWorkspace),
    "workspace.remove": lifecycle("remove", removeWorkspace),
    "workspace.merge": lifecycle("merge", mergeWorkspace),
    "workspace.rename": (request: CoreMutationRequest<"workspace.rename">) => ({
      steps: [{
        name: "workspace.rename", stage: "executing", message: "Renaming workspace",
        run: async (report) => {
          let progressQueue = Promise.resolve()
          const result = await renameWorkspace(request.workspace, request.new_name, request.options ?? {}, (message) => {
            progressQueue = progressQueue.then(() => report({ message })).then(() => undefined)
          })
          await progressQueue
          if (!result.ok) throw new Error(result.error ?? "Workspace rename failed")
        },
      }],
      result: { workspace: request.new_name, previous_workspace: request.workspace, snapshot_changed: true },
    }),
    "workspace.sync": (request: CoreMutationRequest<"workspace.sync">) => {
      const result: Record<string, unknown> = { workspace: request.workspace, snapshot_changed: true }
      return { steps: [{
        name: "workspace.sync", stage: "executing", message: "Syncing workspace",
        run: async (report) => {
          let progressQueue = Promise.resolve()
          const options = request.options ?? {}
          const outcome = await syncWorkspace(request.workspace, {
            strategy: options.strategy === "merge" ? "merge" : "rebase",
            bestEffort: options.bestEffort !== false,
            stash: options.stash !== false,
          }, (row) => {
            progressQueue = progressQueue.then(() => report({ message: `${row.repo}: ${row.status}${row.detail ? ` (${row.detail})` : ""}`, data: { kind: "sync", ...row } })).then(() => undefined)
          })
          await progressQueue
          Object.assign(result, { synced: outcome.synced, skipped: outcome.skipped, stash_pop_failures: outcome.stashPopFailures ?? [] })
          if (!outcome.ok) throw new Error(outcome.error ?? "Workspace sync failed")
        },
      }], result }
    },
    "workspace.push": (request: CoreMutationRequest<"workspace.push">) => {
      const result: Record<string, unknown> = { workspace: request.workspace, snapshot_changed: true }
      return { steps: [{
        name: "workspace.push", stage: "executing", message: "Pushing workspace",
        run: async (report) => {
          let progressQueue = Promise.resolve()
          const outcome = await pushWorkspace(request.workspace, request.options ?? {}, (row) => {
            progressQueue = progressQueue.then(() => report({ message: `${row.repo}: ${row.status}${row.detail ? ` (${row.detail})` : ""}`, data: { kind: "push", ...row } })).then(() => undefined)
          })
          await progressQueue
          Object.assign(result, { pushed: outcome.pushed, skipped: outcome.skipped, failed: outcome.failed })
          if (!outcome.ok) throw new Error(outcome.error ?? "Workspace push failed")
        },
      }], result }
    },
    "workspace.labels.set": (request: CoreMutationRequest<"workspace.labels.set">) => ({
      steps: [{ name: "workspace.labels.set", stage: "executing", message: "Updating workspace labels", run: async () => {
        const workspace = readWorkspace(request.workspace)
        writeWorkspace({ ...workspace, labels: [...new Set(request.labels)] })
      } }],
      result: { workspace: request.workspace, snapshot_changed: true },
    }),
    "workspace.command.run": (request: CoreMutationRequest<"workspace.command.run">) => {
      const result: Record<string, unknown> = { workspace: request.workspace, command: request.command }
      return { steps: [{ name: "workspace.command.run", stage: "executing", message: `Running ${request.command}`, run: async (report) => {
        let progressQueue = Promise.resolve()
        let outputBatch: Array<{ stream: "stdout" | "stderr"; text: string }> = []
        let flushTimer: ReturnType<typeof setTimeout> | undefined
        const flushOutput = () => {
          if (flushTimer) clearTimeout(flushTimer)
          flushTimer = undefined
          if (outputBatch.length === 0) return
          const lines = outputBatch
          outputBatch = []
          progressQueue = progressQueue.then(() => report({
            message: lines.at(-1)?.text,
            data: { kind: "command-output", lines },
          })).then(() => undefined)
        }
        const outcome = await runManualCommand(readWorkspace(request.workspace), request.command, {
          config: readGlobalConfig(),
          onOutput: (output) => {
            outputBatch.push({ stream: output.stream, text: output.line })
            if (outputBatch.length >= 16) flushOutput()
            else if (!flushTimer) flushTimer = setTimeout(flushOutput, 50)
          },
        })
        flushOutput()
        await progressQueue
        Object.assign(result, { exit_code: outcome.exitCode, failed_command: outcome.failedCommand })
        if (outcome.exitCode !== 0) throw new Error(`Command ${request.command} failed with exit code ${outcome.exitCode}.${outcome.failedCommand ? ` Failed command: ${outcome.failedCommand}.` : ""}`)
      } }], result }
    },
    "workspace.issue.open": (request: CoreMutationRequest<"workspace.issue.open">) => {
      const result: Record<string, unknown> = { workspace: request.workspace, tracker: request.tracker }
      return { steps: [{ name: "workspace.issue.open", stage: "executing", message: `Opening ${request.tracker} issue`, run: async (report) => {
        const args = ["git-stacks", "integration", request.tracker, "issue", "open", request.workspace]
        if (request.tracker !== "jira") args.push("--web")
        const proc = spawnChild(args[0]!, args.slice(1), { stdio: ["ignore", "pipe", "pipe"] })
        const stdout: Buffer[] = [], stderr: Buffer[] = []
        proc.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
        proc.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
        const exitCode = await new Promise<number>((resolve, reject) => {
          proc.once("error", reject)
          proc.once("exit", (code) => resolve(code ?? 1))
        })
        const stdoutText = Buffer.concat(stdout).toString("utf8")
        const stderrText = Buffer.concat(stderr).toString("utf8")
        const lines = ([...stdoutText.split("\n").filter(Boolean).map((text) => ({ stream: "stdout" as const, text })),
          ...stderrText.split("\n").filter(Boolean).map((text) => ({ stream: "stderr" as const, text }))])
        if (lines.length) await report({ message: lines.at(-1)?.text, data: { kind: "command-output", lines } })
        result.exit_code = exitCode
        if (exitCode !== 0) throw new Error(`${request.tracker} issue open failed with exit code ${exitCode}`)
      } }], result }
    },
    "template.write": (request: CoreMutationRequest<"template.write">) => ({
      steps: [{ name: "template.write", stage: "executing", message: "Writing template", run: async () => { writeTemplate(request.template) } }],
      result: { template: request.template.name, snapshot_changed: true },
    }),
    "template.clone": (request: CoreMutationRequest<"template.clone">) => ({
      steps: [{ name: "template.clone", stage: "executing", message: "Cloning template", run: async () => {
        if (listTemplatesUncached().some((template) => template.name === request.new_name)) throw new Error(`Template '${request.new_name}' already exists`)
        writeTemplate({ ...readTemplate(request.template), name: request.new_name })
      } }],
      result: { template: request.new_name, snapshot_changed: true },
    }),
    "template.delete": (request: CoreMutationRequest<"template.delete">) => ({
      steps: [{ name: "template.delete", stage: "executing", message: "Deleting template", run: async () => { deleteTemplate(request.template) } }],
      result: { template: request.template, snapshot_changed: true },
    }),
    "repository.delete": (request: CoreMutationRequest<"repository.delete">) => ({
      steps: [{ name: "repository.delete", stage: "executing", message: "Deleting repository registration", run: async () => {
        const templates = listTemplatesUncached().filter((template) => template.repos.some((repo) => repo.repo === request.repository))
        const workspaces = listWorkspacesUncached().filter((workspace) => workspace.repos.some((repo) => repo.repo === request.repository))
        if (templates.length || workspaces.length) throw new Error(`Repository '${request.repository}' is still referenced`)
        const registry = listRegistryEntries()
        if (!registry.some((entry) => entry.name === request.repository)) throw new Error(`Repository '${request.repository}' not found`)
        writeRegistry(registry.filter((entry) => entry.name !== request.repository))
      } }],
      result: { repository: request.repository, snapshot_changed: true },
    }),
    "workspace.create": create,
  }
  return adapters
}
