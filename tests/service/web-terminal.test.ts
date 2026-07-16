import { describe, expect, test } from "@test/api"
import { setTimeout as sleep } from "node:timers/promises"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { spawnSync } from "node:child_process"
import { UserShellError } from "../../packages/core/src/user-shell"
import type { Signal, TerminalLaunchResolution } from "../../packages/protocol/src/service"
import { createWorkspaceLifecycleAdmission } from "../../packages/service/src/policy/workspace-lifecycle-admission"
import type { TerminalAttachment } from "../../packages/service/src/terminal-attachment"
import {
  WebTerminalManager,
  createPtyInitialization,
  type PtyFactory,
  type PtyProcess,
  type TerminalCommandStepRunner,
  type TerminalAttachmentData,
} from "../../packages/service/src/web/terminal-manager"

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111"
const WORKSPACE_B = "33333333-3333-4333-8333-333333333333"
const REPOSITORY = "22222222-2222-4222-8222-222222222222"

type FakeExitBehavior = "term" | "kill" | "never" | "retry-term"

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

function createPtyFactory(behaviors: FakeExitBehavior[]): {
  spawn: PtyFactory
  processes: Array<PtyProcess & { signals: string[] }>
  allocations: () => number
} {
  const processes: Array<PtyProcess & { signals: string[] }> = []
  let allocations = 0
  const spawn: PtyFactory = () => {
    const behavior = behaviors[allocations] ?? behaviors.at(-1) ?? "term"
    allocations += 1
    const exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>()
    const emitExit = (event: { exitCode: number; signal?: number }) => {
      for (const listener of exitListeners) listener(event)
    }
    const process = {
      pid: 900_000 + allocations,
      signals: [] as string[],
      write: () => {},
      resize: () => {},
      kill: (signal = "SIGTERM") => {
        process.signals.push(signal)
        if (behavior === "term" && signal === "SIGTERM") queueMicrotask(() => emitExit({ exitCode: 0 }))
        if (behavior === "kill" && signal === "SIGKILL") queueMicrotask(() => emitExit({ exitCode: 137, signal: 9 }))
        if (behavior === "retry-term" && signal === "SIGTERM" && process.signals.filter((item) => item === "SIGTERM").length === 2) {
          queueMicrotask(() => emitExit({ exitCode: 0 }))
        }
      },
      onData: () => ({ dispose: () => {} }),
      onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => {
        exitListeners.add(listener)
        return { dispose: () => { exitListeners.delete(listener) } }
      },
    } satisfies PtyProcess & { signals: string[] }
    processes.push(process)
    return process
  }
  return { spawn, processes, allocations: () => allocations }
}

function createManager(publishSignal?: (signal: Signal) => Promise<void>): WebTerminalManager {
  return new WebTerminalManager({
    buildAll: async () => [],
    buildWorkspace: async () => { throw new Error("unused") },
    resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
      argv: ["/bin/bash", "--noprofile", "--norc", "-i"], cwd: process.cwd(),
      environment: { PATH: process.env.PATH ?? "/usr/bin:/bin", PS1: "$ " }, ports: {}, configuration: { shell: true }, redacted: [],
    } }),
  }, publishSignal)
}

function attach(manager: WebTerminalManager, terminalId: string, streaming = true): { sent: Array<string | Uint8Array>; socket: TerminalAttachment } {
  const sent: Array<string | Uint8Array> = []
  const socket = {
    data: { kind: "web-terminal", principalId: "browser-1", sessionId: terminalId, streaming } satisfies TerminalAttachmentData,
    send: (value: string | Uint8Array) => { sent.push(value); return typeof value === "string" ? value.length : value.length },
    close: () => {},
    getBufferedAmount: () => 0,
  } satisfies TerminalAttachment
  manager.attach(socket)
  return { sent, socket }
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) await sleep(20)
  expect(predicate()).toBe(true)
}

describe("service-owned web terminal", () => {
  test("applies the authoritative PTY overlay and sources commands despite hostile profile aliases and functions", () => {
    const fixtures = ([
      {
        family: "bash" as const,
        executable: "/usr/bin/bash",
        profileName: "bashrc",
        profile: [
          "shopt -s expand_aliases",
          "alias export='false'",
          "alias source='false'",
          "alias printf='false'",
          "function builtin { return 91; }",
          "function export { return 91; }",
          "function source { return 92; }",
          "function printf { return 93; }",
        ].join("\n"),
        argv: (profile: string, command: string) => ["--noprofile", "--rcfile", profile, "-i", "-c", command],
        environment: (_root: string) => ({}),
      },
      {
        family: "zsh" as const,
        executable: "/usr/bin/zsh",
        profileName: ".zshrc",
        profile: [
          "alias export=false",
          "alias source=false",
          "alias printf=false",
          "function export { return 91 }",
          "function source { return 92 }",
          "function printf { return 93 }",
        ].join("\n"),
        argv: (_profile: string, command: string) => ["-i", "-c", command],
        environment: (root: string) => ({ ZDOTDIR: root }),
      },
      {
        family: "fish" as const,
        executable: "/usr/bin/fish",
        profileName: "fish/config.fish",
        profile: [
          "function source; return 92; end",
          "function printf; return 93; end",
        ].join("\n"),
        argv: (_profile: string, command: string) => ["--interactive", "--command", command],
        environment: (root: string) => ({ XDG_CONFIG_HOME: root }),
      },
    ]).filter(({ executable }) => existsSync(executable))

    expect(fixtures.map(({ family }) => family)).toContain("bash")
    for (const fixture of fixtures) {
      const root = mkdtempSync(join(tmpdir(), `git-stacks-hostile-${fixture.family}-`))
      const profilePath = join(root, fixture.profileName)
      mkdirSync(dirname(profilePath), { recursive: true })
      writeFileSync(profilePath, fixture.profile)
      const initialization = createPtyInitialization(fixture.family, { AUTHORITATIVE_OVERLAY: `ready-${fixture.family}` }, "/usr/bin/printf '%s' \"$AUTHORITATIVE_OVERLAY\"")
      try {
        const result = spawnSync(fixture.executable, fixture.argv(profilePath, `${initialization.bootstrap}; ${initialization.runCommand}`), {
          encoding: "utf8",
          env: { ...process.env, HOME: root, AUTHORITATIVE_OVERLAY: "pre-profile", ...fixture.environment(root) },
          timeout: 3_000,
        })
        expect(result.status, `${fixture.family}: ${result.stderr}`).toBe(0)
        expect(result.stdout).toContain(`ready-${fixture.family}`)
        expect(existsSync(initialization.readyPath)).toBe(true)
      } finally {
        rmSync(initialization.root, { force: true, recursive: true })
        rmSync(root, { force: true, recursive: true })
      }
    }
  })

  test("creates POSIX PTY readiness only after the complete overlay verifies", () => {
    const root = mkdtempSync(join(tmpdir(), "git-stacks-hostile-readiness-"))
    const profilePath = join(root, "bashrc")
    writeFileSync(profilePath, [
      "readonly AUTHORITATIVE_OVERLAY=profile-wins",
      "function builtin { return 91; }",
    ].join("\n"))
    const initialization = createPtyInitialization("bash", { AUTHORITATIVE_OVERLAY: "service-wins" })
    try {
      spawnSync("/usr/bin/bash", ["--noprofile", "--rcfile", profilePath, "-i", "-c", initialization.bootstrap], {
        encoding: "utf8",
        env: { ...process.env, HOME: root, AUTHORITATIVE_OVERLAY: "pre-profile" },
        timeout: 3_000,
      })
      expect(existsSync(initialization.readyPath)).toBe(false)
    } finally {
      rmSync(initialization.root, { force: true, recursive: true })
      rmSync(root, { force: true, recursive: true })
    }
  })

  test("runs typed command steps separately in one logical terminal and stops on the exact failing step", async () => {
    const calls: Array<{ command: string; cwd: string; overlay?: Record<string, string> }> = []
    const runner: TerminalCommandStepRunner = async (request) => {
      calls.push({ command: request.command, cwd: request.cwd, overlay: request.overlay })
      request.onOutput?.({ stream: "stdout", chunk: Buffer.from(`step:${request.command}\n`) })
      const exitCode = request.command === "repo-fails" ? 23 : 0
      return {
        exitCode,
        shell: { executable: "/bin/bash", family: "bash" },
        stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), initializationDiagnostics: Buffer.alloc(0),
        ...(exitCode === 0 ? {} : { diagnostic: { category: "execution" as const, shell: "/bin/bash", mode: "command" as const, stage: "command-exit", message: "exit 23", recovery: "fix command" } }),
      }
    }
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        steps: [
          { bucket: "pre", scope: "workspace", command: "prepare", cwd: "/workspace", environment: { PHASE: "pre" } },
          { bucket: "main", scope: "workspace", command: "main", cwd: "/workspace", environment: { PHASE: "main" } },
          { bucket: "main", scope: "repo", command: "repo-fails", cwd: "/workspace/repo", repository_id: REPOSITORY, repository_name: "repo", environment: { PHASE: "repo" } },
          { bucket: "post", scope: "workspace", command: "must-not-run", cwd: "/workspace", environment: { PHASE: "post" } },
        ],
        ports: {}, configuration: { command_id: "cmd_0123456789abcdef", shell: false }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, undefined, undefined, 10, {}, runner)

    const terminal = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, command_id: "cmd_0123456789abcdef", expected_revision: "1", cols: 80, rows: 24 })
    await waitFor(() => manager.get("browser-1", terminal.id)?.state === "ended")
    expect(manager.list("browser-1")).toHaveLength(1)
    expect(calls.map(({ command, cwd }) => ({ command, cwd }))).toEqual([
      { command: "prepare", cwd: "/workspace" },
      { command: "main", cwd: "/workspace" },
      { command: "repo-fails", cwd: "/workspace/repo" },
    ])
    expect(calls.map((call) => call.overlay?.PHASE)).toEqual(["pre", "main", "repo"])
    expect(calls.every((call) => call.overlay?.GIT_STACKS_SURFACE_ID === terminal.surface_id)).toBe(true)
    expect(manager.get("browser-1", terminal.id)).toMatchObject({ exit_code: 23, state: "ended" })
    await manager.close("browser-1", terminal.id)
  })

  test("keeps an active real PTY for typed steps and forwards input and resize while sequencing", async () => {
    const processes: Array<{ writes: string[]; resizes: Array<[number, number]> }> = []
    const spawn: PtyFactory = () => {
      const dataListeners = new Set<(data: string) => void>()
      const exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>()
      const record = { writes: [] as string[], resizes: [] as Array<[number, number]> }
      processes.push(record)
      const finish = () => queueMicrotask(() => {
        for (const listener of exitListeners) listener({ exitCode: 0 })
      })
      return {
        pid: 910_000 + processes.length,
        write(data) {
          record.writes.push(data)
          const readyPath = data.match(/(?:\: >|touch --|printf '' >) '([^']+\/ready)'/)?.[1]
          if (readyPath) writeFileSync(readyPath, "ready")
          if (data === "typed-input\r") finish()
          if (data.includes("command.") && processes.length > 1) finish()
        },
        resize(columns, rows) { record.resizes.push([columns, rows]) },
        kill: () => finish(),
        onData(listener) { dataListeners.add(listener); return { dispose: () => { dataListeners.delete(listener) } } },
        onExit(listener) { exitListeners.add(listener); return { dispose: () => { exitListeners.delete(listener) } } },
      }
    }
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        steps: [
          { bucket: "pre", scope: "workspace", command: "read answer", cwd: process.cwd(), environment: { PHASE: "pre" } },
          { bucket: "main", scope: "workspace", command: "printf done", cwd: process.cwd(), environment: { PHASE: "main" } },
        ],
        ports: {}, configuration: { command_id: "cmd_0123456789abcdef", shell: false }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, spawn)

    const terminal = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, command_id: "cmd_0123456789abcdef", expected_revision: "1", cols: 80, rows: 24 })
    const { socket } = attach(manager, terminal.id)
    await waitFor(() => processes[0]?.writes.some((write) => write.includes("command.")) === true)
    manager.message(socket, JSON.stringify({ type: "resize", cols: 101, rows: 37 }))
    manager.message(socket, JSON.stringify({ type: "input", data: "typed-input\r" }))
    await waitFor(() => manager.get("browser-1", terminal.id)?.state === "ended")

    expect(processes).toHaveLength(2)
    expect(processes[0]!.writes).toContain("typed-input\r")
    expect(processes[0]!.resizes).toContainEqual([101, 37])
    expect(processes[1]!.writes.some((write) => write.includes("command."))).toBe(true)
    await manager.close("browser-1", terminal.id)
  })

  test("decodes split multi-byte command output as one streaming UTF-8 sequence", async () => {
    const bytes = Buffer.from("stream-λ\n")
    const runner: TerminalCommandStepRunner = async (request) => {
      request.onOutput?.({ stream: "stdout", chunk: bytes.subarray(0, 8) })
      request.onOutput?.({ stream: "stdout", chunk: bytes.subarray(8) })
      return {
        exitCode: 0,
        shell: { executable: "/bin/bash", family: "bash" },
        stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), initializationDiagnostics: Buffer.alloc(0),
      }
    }
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        steps: [{ bucket: "main", scope: "workspace", command: "stream", cwd: "/workspace", environment: {} }],
        ports: {}, configuration: { command_id: "cmd_0123456789abcdef", shell: false }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, undefined, undefined, 10, {}, runner)

    const terminal = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, command_id: "cmd_0123456789abcdef", expected_revision: "1", cols: 80, rows: 24 })
    await waitFor(() => manager.get("browser-1", terminal.id)?.state === "ended")
    const { sent } = attach(manager, terminal.id)
    const output = sent.filter((entry): entry is Uint8Array => entry instanceof Uint8Array)
      .map((entry) => new TextDecoder().decode(entry.subarray(9))).join("")
    expect(output).toBe("stream-λ\n")
    await manager.close("browser-1", terminal.id)
  })

  test("cancels the active command-step adapter and reports safe cancellation metadata", async () => {
    let activeSignal: AbortSignal | undefined
    let started!: () => void
    const running = new Promise<void>((resolve) => { started = resolve })
    const runner: TerminalCommandStepRunner = (request) => new Promise((_resolve, reject) => {
      activeSignal = request.signal
      request.signal?.addEventListener("abort", () => reject(new UserShellError({
        category: "cancellation",
        shell: "/bin/bash",
        mode: "command",
        stage: "process-group-term",
        message: "Command cancelled and its process group was stopped.",
        recovery: "Retry the command when ready.",
      })), { once: true })
      started()
    })
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        steps: [{ bucket: "main", scope: "workspace", command: "long-running", cwd: "/workspace", environment: { SECRET_CANARY: "must-not-print" } }],
        ports: {}, configuration: { command_id: "cmd_0123456789abcdef", shell: false }, redacted: ["SECRET_CANARY"],
      } }),
    }, undefined, undefined, Date.now, undefined, undefined, 10, {}, runner)

    const terminal = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, command_id: "cmd_0123456789abcdef", expected_revision: "1", cols: 80, rows: 24 })
    const attachment = attach(manager, terminal.id)
    await running
    await expect(manager.close("browser-1", terminal.id)).resolves.toMatchObject({ state: "ended", exit_code: 130 })
    expect(activeSignal?.aborted).toBe(true)
    const output = attachment.sent.filter((entry): entry is Uint8Array => entry instanceof Uint8Array)
      .map((entry) => new TextDecoder().decode(entry.subarray(9))).join("")
    expect(output).toContain("[git-stacks shell cancellation]")
    expect(output).not.toContain("must-not-print")
  })

  test("passes resolved PTY argv, cwd, and environment without reparsing", async () => {
    const launches: Array<{ argv: string[]; cwd: string; env: Record<string, string | undefined> }> = []
    const ptys = createPtyFactory(["term"])
    const spawn: PtyFactory = (argv, options) => {
      launches.push({ argv: [...argv], cwd: options.cwd, env: { ...options.env } })
      return ptys.spawn(argv, options)
    }
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/phase124/bash", "-lic", "fixed-bootstrap", "phase124-original-command"],
        cwd: "/phase124/repository",
        environment: { PATH: "/phase124/bin", SSH_AUTH_SOCK: "/tmp/phase124-agent.sock" },
        ports: {}, configuration: { shell: false }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, spawn, undefined, 10)

    const terminal = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    expect(launches).toHaveLength(1)
    expect(launches[0]).toMatchObject({
      argv: ["/phase124/bash", "-lic", "fixed-bootstrap", "phase124-original-command"],
      cwd: "/phase124/repository",
      env: { PATH: "/phase124/bin", SSH_AUTH_SOCK: "/tmp/phase124-agent.sock" },
    })
    await manager.close("browser-1", terminal.id)
  })

  test("PHASE123_RED terminal barrier contract", async () => {
    const admission = createWorkspaceLifecycleAdmission()
    const ptys = createPtyFactory(["term", "term"])
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/bin/bash"], cwd: process.cwd(), environment: {}, ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, ptys.spawn, admission, 10)

    const firstLease = await admission.acquire(WORKSPACE_A)
    let queuedLeaseGranted = false
    const queuedLease = admission.acquire(WORKSPACE_A).then((lease) => { queuedLeaseGranted = true; return lease })
    const unrelatedLease = await admission.acquire(WORKSPACE_B)
    unrelatedLease.release()
    await Promise.resolve()
    expect(queuedLeaseGranted).toBe(false)
    await expect(manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })).rejects.toMatchObject({ code: "workspace_lifecycle_in_progress" })
    expect(ptys.allocations()).toBe(0)

    const other = await manager.create("browser-1", { workspace_id: WORKSPACE_B, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    expect(other.workspace_id).toBe(WORKSPACE_B)
    expect(ptys.allocations()).toBe(1)
    await manager.close("browser-1", other.id)
    firstLease.release()
    const secondLease = await queuedLease
    secondLease.release()
  })

  test("holds lifecycle behind an in-flight terminal resolve and closes the registered PTY before lifecycle completes", async () => {
    const admission = createWorkspaceLifecycleAdmission()
    const ptys = createPtyFactory(["term"])
    let resumeResolution!: () => void
    const resolutionPaused = new Promise<void>((resolve) => { resumeResolution = resolve })
    let resolutionStarted!: () => void
    const started = new Promise<void>((resolve) => { resolutionStarted = resolve })
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => {
        resolutionStarted()
        await resolutionPaused
        return { resolved: true, revision: "1", launch: {
          argv: ["/bin/bash"], cwd: process.cwd(), environment: {}, ports: {}, configuration: { shell: true }, redacted: [],
        } }
      },
    }, undefined, undefined, Date.now, ptys.spawn, admission, 10)

    const creating = manager.create("browser-1", {
      workspace_id: WORKSPACE_A,
      repository_id: REPOSITORY,
      expected_revision: "1",
      cols: 80,
      rows: 24,
    })
    await started

    let lifecycleGranted = false
    const lifecycle = admission.acquire(WORKSPACE_A).then((lease) => {
      lifecycleGranted = true
      return lease
    })
    await Promise.resolve()
    expect(lifecycleGranted).toBe(false)
    await expect(manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })).rejects.toMatchObject({ code: "workspace_lifecycle_in_progress" })

    resumeResolution()
    const terminal = await creating
    const lease = await lifecycle
    expect(ptys.allocations()).toBe(1)
    await expect(manager.closeWorkspace(WORKSPACE_A)).resolves.toEqual({ ok: true, status: "closed", requested: 1, closed: 1, failed: 0 })
    expect(terminal.workspace_id).toBe(WORKSPACE_A)
    expect(manager.activeCount).toBe(0)
    lease.release()
  })

  test("times out a stalled launch, releases lifecycle admission, and ignores its late resolution", async () => {
    const admission = createWorkspaceLifecycleAdmission()
    const ptys = createPtyFactory(["term"])
    const stalled = deferred<TerminalLaunchResolution>()
    let attempt = 0
    let launchSignal: AbortSignal | undefined
    let timeoutCallback: (() => void) | undefined
    const resolvedLaunch: TerminalLaunchResolution = { resolved: true, revision: "1", launch: {
      argv: ["/bin/bash"], cwd: process.cwd(), environment: {}, ports: {}, configuration: { shell: true }, redacted: [],
    } }
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async (_request, signal) => {
        attempt += 1
        if (attempt === 1) {
          launchSignal = signal
          return stalled.promise
        }
        return resolvedLaunch
      },
    }, undefined, undefined, Date.now, ptys.spawn, admission, 10, {
      launchResolutionTimeoutMs: 25,
      setTimeout(callback, delayMs) {
        expect(delayMs).toBe(25)
        timeoutCallback = callback
        return callback
      },
      clearTimeout() {},
    })

    const creating = manager.create("browser-1", {
      workspace_id: WORKSPACE_A,
      repository_id: REPOSITORY,
      expected_revision: "1",
      cols: 80,
      rows: 24,
    })
    await Promise.resolve()
    expect(launchSignal?.aborted).toBe(false)

    let lifecycleGranted = false
    const lifecycle = admission.acquire(WORKSPACE_A).then((lease) => {
      lifecycleGranted = true
      return lease
    })
    await Promise.resolve()
    expect(lifecycleGranted).toBe(false)
    timeoutCallback?.()
    await expect(creating).rejects.toMatchObject({ code: "request_timeout", status: 504 })
    const lease = await lifecycle
    expect(launchSignal?.aborted).toBe(true)
    expect(ptys.allocations()).toBe(0)

    stalled.resolve(resolvedLaunch)
    await Promise.resolve()
    await Promise.resolve()
    expect(ptys.allocations()).toBe(0)

    lease.release()
    const recovered = await manager.create("browser-1", {
      workspace_id: WORKSPACE_A,
      repository_id: REPOSITORY,
      expected_revision: "1",
      cols: 80,
      rows: 24,
    })
    expect(recovered.workspace_id).toBe(WORKSPACE_A)
    expect(ptys.allocations()).toBe(1)
    await manager.close("browser-1", recovered.id)
  })

  test("confirms TERM and KILL exits and reports a never-exiting PTY honestly", async () => {
    const ptys = createPtyFactory(["term", "kill", "never"])
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/bin/bash"], cwd: process.cwd(), environment: {}, ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, ptys.spawn, undefined, 10)

    const term = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    await expect(manager.close("browser-1", term.id)).resolves.toMatchObject({ state: "ended" })
    expect(ptys.processes[0]?.signals).toEqual(["SIGTERM"])

    const killed = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    await expect(manager.close("browser-1", killed.id)).resolves.toMatchObject({ state: "ended" })
    expect(ptys.processes[1]?.signals).toEqual(["SIGTERM", "SIGKILL"])

    const stuck = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    await expect(manager.close("browser-1", stuck.id)).resolves.toMatchObject({ state: "cleanup_failed" })
    expect(ptys.processes[2]?.signals).toEqual(["SIGTERM", "SIGKILL"])
    expect(manager.get("browser-1", stuck.id)).toMatchObject({ state: "cleanup_failed" })
    await expect(manager.closeWorkspace(WORKSPACE_A)).resolves.toEqual({ ok: false, status: "cleanup_failed", requested: 1, closed: 0, failed: 1 })
  })

  test("SIGKILLs descendants when the PTY leader exits but its process group survives TERM", async () => {
    const ptys = createPtyFactory(["term"])
    let groupExists = true
    const spawn: PtyFactory = (argv, options) => {
      const child = ptys.spawn(argv, options)
      const kill = child.kill.bind(child)
      child.kill = (signal) => {
        kill(signal)
        if (signal === "SIGKILL") setTimeout(() => { groupExists = false }, 2)
      }
      return child
    }
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/bin/bash"], cwd: process.cwd(), environment: {}, ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, spawn, undefined, 25, {}, undefined, () => groupExists)

    const terminal = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    await expect(manager.close("browser-1", terminal.id)).resolves.toMatchObject({ state: "ended" })
    expect(ptys.processes[0]?.signals).toEqual(["SIGTERM", "SIGKILL"])
    expect(groupExists).toBe(false)
  })

  test("terminates and confirms a command PTY group before reporting initialization timeout", async () => {
    const ptys = createPtyFactory(["kill"])
    let groupExists = true
    const spawn: PtyFactory = (argv, options) => {
      const child = ptys.spawn(argv, options)
      const kill = child.kill.bind(child)
      child.kill = (signal) => {
        kill(signal)
        if (signal === "SIGKILL") setTimeout(() => { groupExists = false }, 2)
      }
      return child
    }
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        steps: [{ bucket: "main", scope: "workspace", command: "never-starts", cwd: process.cwd(), environment: {} }],
        ports: {}, configuration: { command_id: "cmd_0123456789abcdef", shell: false }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, spawn, undefined, 25, { ptyInitializationTimeoutMs: 5 }, undefined, () => groupExists)

    const terminal = await manager.create("browser-1", {
      workspace_id: WORKSPACE_A,
      repository_id: REPOSITORY,
      command_id: "cmd_0123456789abcdef",
      expected_revision: "1",
      cols: 80,
      rows: 24,
    })
    await waitFor(() => (ptys.processes[0]?.signals.length ?? 0) >= 2)
    await sleep(30)
    expect(ptys.processes[0]?.signals).toEqual(["SIGTERM", "SIGKILL"])
    expect(groupExists).toBe(false)
    await waitFor(() => manager.get("browser-1", terminal.id)?.state === "ended")
    expect(manager.activeCount).toBe(0)
    expect(manager.get("browser-1", terminal.id)).toMatchObject({ state: "ended", exit_code: 126 })
    await manager.close("browser-1", terminal.id)
  })

  test("does not logically finish a command PTY while initialization cleanup leaves its group alive", async () => {
    const ptys = createPtyFactory(["kill"])
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        steps: [{ bucket: "main", scope: "workspace", command: "never-starts", cwd: process.cwd(), environment: {} }],
        ports: {}, configuration: { command_id: "cmd_0123456789abcdef", shell: false }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, ptys.spawn, undefined, 10, { ptyInitializationTimeoutMs: 5 }, undefined, () => true)

    const terminal = await manager.create("browser-1", {
      workspace_id: WORKSPACE_A,
      repository_id: REPOSITORY,
      command_id: "cmd_0123456789abcdef",
      expected_revision: "1",
      cols: 80,
      rows: 24,
    })
    await waitFor(() => (ptys.processes[0]?.signals.length ?? 0) >= 2)
    await sleep(30)
    expect(ptys.processes[0]?.signals).toEqual(["SIGTERM", "SIGKILL"])
    expect(manager.get("browser-1", terminal.id)).toMatchObject({ state: "running", exit_code: null })
    expect(manager.activeCount).toBe(1)

    await expect(manager.close("browser-1", terminal.id)).resolves.toMatchObject({ state: "cleanup_failed", exit_code: null })
    expect(ptys.processes[0]?.signals).toEqual(["SIGTERM", "SIGKILL", "SIGTERM", "SIGKILL"])
  })

  test("marks a logical PTY sequence cancelled before signaling its active process group", async () => {
    const ptys = createPtyFactory(["term"])
    let cancellations = 0
    const spawn: PtyFactory = (argv, options) => {
      const child = ptys.spawn(argv, options)
      child.cancelSequence = () => { cancellations += 1 }
      return child
    }
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/bin/bash"], cwd: process.cwd(), environment: {}, ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, spawn, undefined, 10)

    const terminal = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    await manager.close("browser-1", terminal.id)
    expect(cancellations).toBe(1)
  })

  test("shares concurrent close settlement and closes a workspace across principals without metadata", async () => {
    const ptys = createPtyFactory(["kill", "term", "term", "term"])
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/bin/bash"], cwd: process.cwd(), environment: {}, ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, ptys.spawn, undefined, 10)

    const shared = await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    const firstClose = manager.close("browser-1", shared.id)
    const secondClose = manager.close("browser-1", shared.id)
    expect(firstClose).toBe(secondClose)
    expect(await firstClose).toMatchObject({ state: "ended" })

    await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    await manager.create("browser-2", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    const unrelated = await manager.create("browser-1", { workspace_id: WORKSPACE_B, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    await expect(manager.closeWorkspace(WORKSPACE_A)).resolves.toEqual({ ok: true, status: "closed", requested: 2, closed: 2, failed: 0 })
    expect(manager.list("browser-1")).toEqual([expect.objectContaining({ id: unrelated.id, workspace_id: WORKSPACE_B })])
    expect(manager.list("browser-2")).toEqual([])
    await manager.close("browser-1", unrelated.id)
  })

  test("retries TERM and KILL cleanup after a failed close attempt", async () => {
    const ptys = createPtyFactory(["retry-term"])
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/bin/bash"], cwd: process.cwd(), environment: {}, ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, ptys.spawn, undefined, 10)

    await manager.create("browser-1", { workspace_id: WORKSPACE_A, repository_id: REPOSITORY, expected_revision: "1", cols: 80, rows: 24 })
    await expect(manager.closeWorkspace(WORKSPACE_A)).resolves.toEqual({ ok: false, status: "cleanup_failed", requested: 1, closed: 0, failed: 1 })
    expect(ptys.processes[0]?.signals).toEqual(["SIGTERM", "SIGKILL"])

    await expect(manager.closeWorkspace(WORKSPACE_A)).resolves.toEqual({ ok: true, status: "closed", requested: 1, closed: 1, failed: 0 })
    expect(ptys.processes[0]?.signals).toEqual(["SIGTERM", "SIGKILL", "SIGTERM"])
    expect(manager.activeCount).toBe(0)
  })

  test("runs a real PTY roundtrip, resizes, and closes its process group", async () => {
    if (process.platform !== "linux") return
    const manager = createManager()
    const terminal = await manager.create("browser-1", { workspace_id: "11111111-1111-4111-8111-111111111111", repository_id: "22222222-2222-4222-8222-222222222222", expected_revision: "1", cols: 80, rows: 24 })
    const { sent, socket } = attach(manager, terminal.id)
    manager.message(socket, JSON.stringify({ type: "resize", cols: 91, rows: 27 }))
    manager.message(socket, JSON.stringify({ type: "input", data: "echo WEB_PTY_MARKER; stty size\r" }))
    await sleep(150)
    const output = sent.filter((item): item is Uint8Array => item instanceof Uint8Array).map((frame) => frame.slice(9))
    const text = new TextDecoder().decode(Buffer.concat(output))
    expect(text).toContain("WEB_PTY_MARKER")
    expect(text).toContain("27 91")
    expect(manager.diagnostics.inputs_received).toBe(1)
    const closed = await manager.close("browser-1", terminal.id)
    expect(closed?.state).toBe("ended")
    expect(manager.list("browser-1")).toEqual([])
    expect(manager.diagnostics.sessions).toBe(0)
    await manager.stop()
  })

  test("pauses hidden output, keeps lifecycle controls live, and replays on resume", async () => {
    if (process.platform !== "linux") return
    const manager = createManager()
    const terminal = await manager.create("browser-1", { workspace_id: "11111111-1111-4111-8111-111111111111", repository_id: "22222222-2222-4222-8222-222222222222", expected_revision: "1", cols: 80, rows: 24 })
    const { sent, socket } = attach(manager, terminal.id, false)
    manager.rename("browser-1", terminal.id, "Paused shell", "manual")
    manager.message(socket, JSON.stringify({ type: "input", data: "echo PAUSED_OUTPUT_MARKER\r" }))
    await sleep(150)

    expect(manager.diagnostics).toMatchObject({ attached: 1, streaming: 0 })
    expect(sent.filter((item) => item instanceof Uint8Array)).toHaveLength(0)
    expect(sent.filter((item): item is string => typeof item === "string").some((item) => item.includes('"type":"renamed"'))).toBe(true)

    manager.message(socket, JSON.stringify({ type: "flow", streaming: true }))
    await waitFor(() => sent.some((item) => item instanceof Uint8Array && new TextDecoder().decode(item.slice(9)).includes("PAUSED_OUTPUT_MARKER")))
    expect(manager.diagnostics.streaming).toBe(1)
    await manager.close("browser-1", terminal.id)
    await manager.stop()
  })

  test("captures agent lifecycle signals while terminal output streaming is paused", async () => {
    if (process.platform !== "linux") return
    const published: Signal[] = []
    const manager = createManager(async (signal) => { published.push(signal) })
    const terminal = await manager.create("browser-1", { workspace_id: "11111111-1111-4111-8111-111111111111", repository_id: "22222222-2222-4222-8222-222222222222", expected_revision: "1", cols: 80, rows: 24 })
    const { sent, socket } = attach(manager, terminal.id, false)

    manager.message(socket, JSON.stringify({ type: "input", data: "printf '\\033]9;git-stacks-signal:%s:codex:codex-hidden:working\\033\\\\' \"$GIT_STACKS_SIGNAL_TOKEN\"\r" }))
    await waitFor(() => published.length === 1)

    expect(published[0]).toMatchObject({ kind: "activity", source: "codex", session_id: "codex-hidden", state: "working", surface_id: terminal.surface_id })
    expect(sent.filter((item) => item instanceof Uint8Array)).toHaveLength(0)
    expect(manager.diagnostics.streaming).toBe(0)
    await manager.close("browser-1", terminal.id)
    expect(published.at(-1)).toMatchObject({ kind: "activity", source: "codex", session_id: "codex-hidden", state: "idle", surface_id: terminal.surface_id })
    await manager.stop()
  })

  test("tracks automatic titles until a manual override is pinned and restores automation when cleared", async () => {
    if (process.platform !== "linux") return
    const manager = createManager()
    const terminal = await manager.create("browser-1", { workspace_id: "11111111-1111-4111-8111-111111111111", repository_id: "22222222-2222-4222-8222-222222222222", expected_revision: "1", cols: 80, rows: 24 })

    expect(manager.rename("browser-1", terminal.id, "fish · project", "automatic")).toMatchObject({ title: "fish · project", title_pinned: false })
    expect(manager.rename("browser-1", terminal.id, "Build shell", "manual")).toMatchObject({ title: "Build shell", title_pinned: true })
    expect(manager.rename("browser-1", terminal.id, "fish · elsewhere", "automatic")).toMatchObject({ title: "Build shell", title_pinned: true })
    expect(manager.rename("browser-1", terminal.id, "", "manual")).toMatchObject({ title: "fish · elsewhere", title_pinned: false })

    await manager.close("browser-1", terminal.id)
    await manager.stop()
  })

  test("retains an unattached shell and replays it when the browser reconnects", async () => {
    if (process.platform !== "linux") return
    const manager = createManager()
    const terminal = await manager.create("browser-1", { workspace_id: "11111111-1111-4111-8111-111111111111", repository_id: "22222222-2222-4222-8222-222222222222", expected_revision: "1", cols: 80, rows: 24 })
    const first = attach(manager, terminal.id)
    manager.detached(first.socket)
    manager.message(first.socket, JSON.stringify({ type: "input", data: "echo should-not-route\r" }))
    expect(manager.diagnostics).toMatchObject({ sessions: 1, active: 1, attached: 0 })

    const second = attach(manager, terminal.id)
    manager.message(second.socket, JSON.stringify({ type: "input", data: "echo RECONNECTED_SHELL\r" }))
    await waitFor(() => second.sent.some((item) => item instanceof Uint8Array && new TextDecoder().decode(item.slice(9)).includes("RECONNECTED_SHELL")))

    await manager.close("browser-1", terminal.id)
    await manager.stop()
  })

  test("resets to retained history when a paused terminal exceeds the replay window", async () => {
    if (process.platform !== "linux") return
    const manager = createManager()
    const terminal = await manager.create("browser-1", { workspace_id: "11111111-1111-4111-8111-111111111111", repository_id: "22222222-2222-4222-8222-222222222222", expected_revision: "1", cols: 80, rows: 24 })
    const { sent, socket } = attach(manager, terminal.id, false)
    manager.message(socket, JSON.stringify({ type: "input", data: "printf '%1050000s' x\r" }))
    await waitFor(() => manager.get("browser-1", terminal.id)?.history_available === false, 5_000)

    manager.message(socket, JSON.stringify({ type: "flow", streaming: true }))
    await waitFor(() => sent.some((item) => typeof item === "string" && item.includes('"type":"history_unavailable"')))
    const controls = sent.filter((item): item is string => typeof item === "string")
    expect(controls.some((item) => item.includes('"type":"ready"') && item.includes('"reset":true'))).toBe(true)
    expect(sent.filter((item) => item instanceof Uint8Array).reduce((size, frame) => size + frame.byteLength - 9, 0)).toBeLessThanOrEqual(1024 * 1024)
    await manager.close("browser-1", terminal.id)
    await manager.stop()
  })
})
