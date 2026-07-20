import { describe, expect, test } from "@test/api"
import { setTimeout as sleep } from "node:timers/promises"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { spawnSync } from "node:child_process"
import { which } from "../../packages/core/src/node-runtime"
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
const loadedMacRunner = process.platform === "darwin"
const requiredShells = new Set((process.env.GIT_STACKS_REQUIRE_SHELLS ?? "").split(",").map((shell) => shell.trim()).filter(Boolean))

function requireHostedShell(shell: "bash" | "zsh" | "fish", executable: string | null): void {
  if (requiredShells.has(shell)) expect(executable, `required host shell is unavailable: ${shell}`).not.toBeNull()
}

type FakeExitBehavior = "term" | "kill" | "never" | "retry-term" | "startup-exit"

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

function createPtyFactory(behaviors: FakeExitBehavior[]): {
  spawn: PtyFactory
  processes: Array<PtyProcess & { signals: string[]; exit(event: { exitCode: number; signal?: number }): void }>
  allocations: () => number
} {
  const processes: Array<PtyProcess & { signals: string[]; exit(event: { exitCode: number; signal?: number }): void }> = []
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
      exit: emitExit,
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
    } satisfies PtyProcess & { signals: string[]; exit(event: { exitCode: number; signal?: number }): void }
    processes.push(process)
    if (behavior === "startup-exit") queueMicrotask(() => emitExit({ exitCode: 1 }))
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

function findPtyInitializationRootContaining(sentinel: string): string | undefined {
  try {
    for (const entry of readdirSync(tmpdir(), { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("git-stacks-pty-")) continue
      const root = join(tmpdir(), entry.name)
      try {
        for (const name of readdirSync(root)) {
          if (!name.startsWith("value.") && name !== "environment") continue
          if (readFileSync(join(root, name)).includes(Buffer.from(sentinel))) return root
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  return undefined
}

describe("service-owned web terminal", () => {
  test("applies and verifies the PTY overlay and directly runs commands despite hostile profile dispatch functions", () => {
    requireHostedShell("bash", which("bash"))
    requireHostedShell("zsh", which("zsh"))
    requireHostedShell("fish", which("fish"))
    const fixtures = ([
      {
        family: "bash" as const,
        executable: which("bash"),
        profileName: "bashrc",
        profile: [
          "shopt -s expand_aliases",
          "alias export='false'",
          "alias source='false'",
          "alias printf='false'",
          "function builtin { return 91; }",
          "function . { return 94; }",
          "function export { return 91; }",
          "function source { return 92; }",
          "function printf { return 93; }",
        ].join("\n"),
        argv: (profile: string, command: string) => ["--noprofile", "--rcfile", profile, "-i", "-c", command],
        environment: (_root: string) => ({}),
      },
      {
        family: "zsh" as const,
        executable: which("zsh"),
        profileName: ".zshrc",
        profile: [
          "alias export=false",
          "alias source=false",
          "alias printf=false",
          "function builtin { return 90 }",
          "function export { return 91 }",
          "function . { return 94 }",
          "function source { return 92 }",
          "function printf { return 93 }",
        ].join("\n"),
        argv: (_profile: string, command: string) => ["-i", "-c", command],
        environment: (root: string) => ({ ZDOTDIR: root }),
      },
      {
        family: "fish" as const,
        executable: which("fish"),
        profileName: "fish/config.fish",
        profile: [
          "function source; return 92; end",
          "function printf; return 93; end",
        ].join("\n"),
        argv: (_profile: string, command: string) => ["--interactive", "--command", command],
        environment: (root: string) => ({ XDG_CONFIG_HOME: root }),
      },
    ]).filter((fixture): fixture is typeof fixture & { executable: string } => fixture.executable !== null)

    expect(fixtures.map(({ family }) => family)).toContain("bash")
    for (const fixture of fixtures) {
      const root = mkdtempSync(join(tmpdir(), `git-stacks-hostile-${fixture.family}-`))
      const profilePath = join(root, fixture.profileName)
      mkdirSync(dirname(profilePath), { recursive: true })
      writeFileSync(profilePath, fixture.profile)
      const initialization = createPtyInitialization(fixture.family, { AUTHORITATIVE_OVERLAY: `ready-${fixture.family}` }, "/usr/bin/printf '%s' \"$AUTHORITATIVE_OVERLAY\"")
      try {
        expect(initialization.bootstrap).not.toContain(`ready-${fixture.family}`)
        const result = spawnSync(fixture.executable, fixture.argv(profilePath, `${initialization.bootstrap}; ${initialization.command}`), {
          encoding: "utf8",
          env: { ...process.env, HOME: root, AUTHORITATIVE_OVERLAY: "pre-profile", ...initialization.environment, ...fixture.environment(root) },
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
    const bash = which("bash")
    expect(bash).not.toBeNull()
    const root = mkdtempSync(join(tmpdir(), "git-stacks-hostile-readiness-"))
    const profilePath = join(root, "bashrc")
    writeFileSync(profilePath, [
      "readonly AUTHORITATIVE_OVERLAY=profile-wins",
      "function builtin { return 91; }",
    ].join("\n"))
    const initialization = createPtyInitialization("bash", { AUTHORITATIVE_OVERLAY: "service-wins" })
    try {
      spawnSync(bash!, ["--noprofile", "--rcfile", profilePath, "-i", "-c", initialization.bootstrap], {
        encoding: "utf8",
        env: { ...process.env, HOME: root, AUTHORITATIVE_OVERLAY: "pre-profile", ...initialization.environment },
        timeout: 3_000,
      })
      expect(existsSync(initialization.readyPath)).toBe(false)
    } finally {
      rmSync(initialization.root, { force: true, recursive: true })
      rmSync(root, { force: true, recursive: true })
    }
  })

  test("keeps authoritative PTY overlay values out of captured output when profiles enable tracing", () => {
    requireHostedShell("bash", which("bash"))
    requireHostedShell("zsh", which("zsh"))
    requireHostedShell("fish", which("fish"))
    const fixtures = ([
      {
        family: "bash" as const,
        executable: which("bash"),
        profileName: "bashrc",
        profile: [
          "exec 9>&2",
          "export BASH_XTRACEFD=9",
          "set -x",
          "shopt -s expand_aliases",
          "alias export='false'",
          "alias source='false'",
          "alias printf='false'",
          "function builtin { return 91; }",
          "function . { return 94; }",
          "function export { return 91; }",
          "function source { return 92; }",
          "function printf { return 93; }",
        ].join("\n"),
        argv: (profile: string, command: string) => ["--noprofile", "--rcfile", profile, "-i", "-c", command],
        environment: (_root: string) => ({}),
      },
      {
        family: "zsh" as const,
        executable: which("zsh"),
        profileName: ".zshrc",
        profile: [
          "set -x",
          "alias export=false",
          "alias source=false",
          "alias printf=false",
          "function builtin { return 90 }",
          "function export { return 91 }",
          "function . { return 94 }",
          "function source { return 92 }",
          "function printf { return 93 }",
        ].join("\n"),
        argv: (_profile: string, command: string) => ["-i", "-c", command],
        environment: (root: string) => ({ ZDOTDIR: root }),
      },
      {
        family: "fish" as const,
        executable: which("fish"),
        profileName: "fish/config.fish",
        profile: [
          "set -g fish_trace 1",
          "function source; return 92; end",
          "function printf; return 93; end",
        ].join("\n"),
        argv: (_profile: string, command: string) => ["--interactive", "--command", command],
        environment: (root: string) => ({ XDG_CONFIG_HOME: root }),
      },
    ]).filter((fixture): fixture is typeof fixture & { executable: string } => fixture.executable !== null)

    expect(fixtures.map(({ family }) => family)).toContain("bash")
    for (const fixture of fixtures) {
      const root = mkdtempSync(join(tmpdir(), `git-stacks-trace-${fixture.family}-`))
      const profilePath = join(root, fixture.profileName)
      mkdirSync(dirname(profilePath), { recursive: true })
      writeFileSync(profilePath, fixture.profile)
      const sentinel = `phase-124-trace-secret-${fixture.family}`
      const marker = `command-output-${fixture.family}`
      const stderrMarker = `command-stderr-${fixture.family}`
      const initialization = createPtyInitialization(fixture.family, { AUTHORITATIVE_OVERLAY: sentinel })
      try {
        expect(initialization.bootstrap).not.toContain(sentinel)
        const result = spawnSync(fixture.executable, fixture.argv(profilePath, `${initialization.bootstrap}; /usr/bin/printf '%s' '${marker}'; /usr/bin/printf '%s' '${stderrMarker}' >&2`), {
          encoding: "utf8",
          env: { ...process.env, HOME: root, AUTHORITATIVE_OVERLAY: "pre-profile", ...initialization.environment, ...fixture.environment(root) },
          timeout: 3_000,
        })
        const capturedOutput = `${result.stdout}${result.stderr}`
        expect(result.status, `${fixture.family}: ${capturedOutput}`).toBe(0)
        expect(result.stdout).toContain(marker)
        expect(result.stderr).toContain(stderrMarker)
        expect(capturedOutput).not.toContain(sentinel)
        expect(existsSync(initialization.readyPath)).toBe(true)
      } finally {
        rmSync(initialization.root, { force: true, recursive: true })
        rmSync(root, { force: true, recursive: true })
      }
    }
  })

  test("removes fish initialization value files when interactive PTY allocation throws", async () => {
    const sentinel = "phase-124-interactive-allocation-secret"
    let allocatedRoot: string | undefined
    const spawn: PtyFactory = () => {
      allocatedRoot = findPtyInitializationRootContaining(sentinel)
      throw new Error("forced interactive allocation failure")
    }
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/usr/bin/fish", "--interactive"], cwd: process.cwd(),
        environment: { RAW_ALLOCATION_SENTINEL: sentinel },
        initialization: { kind: "post-init-environment", shell: "fish" },
        ports: {}, configuration: { shell: true }, redacted: ["RAW_ALLOCATION_SENTINEL"],
      } }),
    }, undefined, undefined, Date.now, spawn)

    await expect(manager.create("browser-1", {
      workspace_id: WORKSPACE_A,
      repository_id: REPOSITORY,
      expected_revision: "1",
      cols: 80,
      rows: 24,
    })).rejects.toMatchObject({ code: "capability_unavailable", message: expect.stringContaining("forced interactive allocation failure") })
    expect(allocatedRoot).toBeDefined()
    expect(existsSync(allocatedRoot!)).toBe(false)
    expect(findPtyInitializationRootContaining(sentinel)).toBeUndefined()
  })

  test("preserves a Fish initialization diagnostic while retaining an unconfirmed group for teardown", async () => {
    const ptys = createPtyFactory(["startup-exit"])
    let groupExists = true
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/usr/bin/fish", "--interactive"], cwd: process.cwd(), environment: {},
        initialization: { kind: "post-init-environment", shell: "fish" },
        ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, ptys.spawn, undefined, 5, { ptyInitializationTimeoutMs: 5 }, undefined, () => groupExists)

    await expect(manager.create("browser-1", {
      workspace_id: WORKSPACE_A,
      repository_id: REPOSITORY,
      expected_revision: "1",
      cols: 80,
      rows: 24,
    })).rejects.toMatchObject({
      code: "capability_unavailable",
      message: expect.stringContaining("Shell exited before PTY initialization completed"),
    })
    expect(ptys.processes[0]?.signals).toEqual(["SIGTERM", "SIGKILL"])

    groupExists = false
    await manager.stop()
    expect(ptys.processes[0]?.signals).toEqual(["SIGTERM", "SIGKILL"])
    await manager.stop()
    expect(ptys.processes[0]?.signals).toEqual(["SIGTERM", "SIGKILL"])
  })

  test("answers POSIX terminal probes before injecting the private bootstrap", async () => {
    const writes: string[] = []
    let capabilityResponseAt = 0
    let bootstrapAt = 0
    let bootstrapWrites = 0
    let dataListener: (data: string) => void = () => undefined
    let exitListener: (event: { exitCode: number; signal?: number }) => void = () => undefined
    let spawnedArgv: string[] = []
    const spawn: PtyFactory = (argv) => {
      spawnedArgv = argv
      queueMicrotask(() => dataListener("startup-prefix\u001b[0cstartup-suffix"))
      return {
        pid: 920_000,
        write(data) {
          writes.push(data)
          if (data === "\u001b[?1;2c") {
            capabilityResponseAt = Date.now()
            return
          }
          if (data === "\u000c") return
          bootstrapWrites += 1
          if (bootstrapWrites === 1) {
            bootstrapAt = Date.now()
            return
          }
          const readyPath = data.match(/> '([^']+\/ready)'/)?.[1]
          expect(readyPath).toBeDefined()
          writeFileSync(readyPath!, "ready")
        },
        resize: () => undefined,
        kill: () => queueMicrotask(() => exitListener({ exitCode: 0 })),
        onData(listener) { dataListener = listener; return { dispose: () => { dataListener = () => undefined } } },
        onExit(listener) { exitListener = listener; return { dispose: () => { exitListener = () => undefined } } },
      }
    }
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/bin/zsh", "-f", "-i"], cwd: process.cwd(), environment: {},
        initialization: { kind: "post-init-environment", shell: "zsh" },
        ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, spawn, undefined, 1_000, {
      ptyInitializationTimeoutMs: 1_000,
      ptyBootstrapDelayMs: 250,
    })

    const terminal = await manager.create("browser-1", {
      workspace_id: WORKSPACE_A,
      repository_id: REPOSITORY,
      expected_revision: "1",
      cols: 80,
      rows: 24,
    })
    expect(spawnedArgv).toEqual([
      "/bin/zsh", "-f", "-i",
    ])
    expect(writes[0]).toBe("\u001b[?1;2c")
    expect(writes[1]).toContain("__GS_PTY_OK_")
    expect(writes[2]).toContain("__GS_PTY_OK_")
    expect(writes[3]).toBe("\u000c")
    expect(bootstrapAt - capabilityResponseAt).toBeGreaterThanOrEqual(90)
    const { sent } = attach(manager, terminal.id)
    const output = sent
      .filter((item): item is Uint8Array => item instanceof Uint8Array)
      .map((frame) => new TextDecoder().decode(frame.slice(9)))
      .join("")
    expect(output).toContain("startup-prefix")
    expect(output).toContain("startup-suffix")
    expect(output).not.toContain("\u001b[0c")
    await expect(manager.close("browser-1", terminal.id)).resolves.toMatchObject({ state: "ended" })
  })

  test("does not replay POSIX bootstraps as terminal input", async () => {
    const fixtures = ([
      { family: "bash" as const, executable: which("bash"), args: ["--noprofile", "--norc", "-i"] },
      { family: "zsh" as const, executable: which("zsh"), args: ["-f", "-i"] },
    ]).filter((fixture): fixture is typeof fixture & { executable: string } => fixture.executable !== null)
    requireHostedShell("bash", which("bash"))
    requireHostedShell("zsh", which("zsh"))

    for (const fixture of fixtures) {
      const manager = new WebTerminalManager({
        buildAll: async () => [],
        buildWorkspace: async () => { throw new Error("unused") },
        resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
          argv: [fixture.executable, ...fixture.args], cwd: process.cwd(),
          environment: { PATH: process.env.PATH ?? "/usr/bin:/bin", PS1: "$ ", PROMPT: "$ " },
          initialization: { kind: "post-init-environment", shell: fixture.family },
          ports: {}, configuration: { shell: true }, redacted: [],
        } }),
      }, undefined, undefined, Date.now, undefined, undefined, 1_000, {
        ptyBootstrapDelayMs: loadedMacRunner ? 1_000 : 25,
        ptyInitializationTimeoutMs: 30_000,
      })

      const terminal = await manager.create("browser-1", {
        workspace_id: WORKSPACE_A,
        repository_id: REPOSITORY,
        expected_revision: "1",
        cols: 80,
        rows: 24,
      })
      const { sent, socket } = attach(manager, terminal.id)
      const roundtripMarker = `WEB_TERMINAL_ROUNDTRIP_${fixture.family}`
      manager.message(socket, JSON.stringify({ type: "input", data: `printf '${roundtripMarker}\\n'\r` }))
      await waitFor(() => sent.some((item) => item instanceof Uint8Array
        && new TextDecoder().decode(item.slice(9)).includes(roundtripMarker)), loadedMacRunner ? 10_000 : 3_000)
      const output = sent
        .filter((item): item is Uint8Array => item instanceof Uint8Array)
        .map((frame) => new TextDecoder().decode(frame.slice(9)))
        .join("")
      expect(output).toContain(roundtripMarker)
      expect(output).not.toContain("BASH_XTRACEFD")
      expect(output).not.toContain("__GS_PTY_")
      await expect(manager.close("browser-1", terminal.id)).resolves.toMatchObject({ state: "ended" })
    }
  })

  test("initializes a login zsh through startup files and preserves interactive output", async () => {
    const zsh = which("zsh")
    requireHostedShell("zsh", zsh)
    if (!zsh) return
    const root = mkdtempSync(join(tmpdir(), "git-stacks-zsh-login-"))
    const profileMarker = "ZSH_LOGIN_PROFILE_READY"
    const roundtripMarker = "ZSH_LOGIN_ROUNDTRIP_READY"
    writeFileSync(join(root, ".zshrc"), [
      ...(loadedMacRunner ? [
        "printf '\\033[0c'",
        "IFS= read -r -k 7 __gs_terminal_response",
      ] : []),
      `printf '${profileMarker}\\n'`,
      "function source { return 92 }",
      "PROMPT='$ '",
    ].join("\n"))
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: [zsh, ...(loadedMacRunner ? [] : ["-d"]), "-l", "-i"], cwd: process.cwd(),
        environment: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: root, ZDOTDIR: root },
        initialization: { kind: "post-init-environment", shell: "zsh" },
        ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, undefined, undefined, 1_000, {
      ptyInitializationTimeoutMs: 30_000,
    })

    try {
      const terminal = await manager.create("browser-1", {
        workspace_id: WORKSPACE_A,
        repository_id: REPOSITORY,
        expected_revision: "1",
        cols: 80,
        rows: 24,
      })
      const { sent, socket } = attach(manager, terminal.id)
      manager.message(socket, JSON.stringify({ type: "input", data: `printf '${roundtripMarker}\\n'\r` }))
      await waitFor(() => sent.some((item) => item instanceof Uint8Array
        && new TextDecoder().decode(item.slice(9)).includes(roundtripMarker)), loadedMacRunner ? 10_000 : 3_000)
      const output = sent
        .filter((item): item is Uint8Array => item instanceof Uint8Array)
        .map((frame) => new TextDecoder().decode(frame.slice(9)))
        .join("")
      expect(output).toContain(profileMarker)
      expect(output).toContain(roundtripMarker)
      expect(output).not.toContain("__GS_PTY_")
      await expect(manager.close("browser-1", terminal.id)).resolves.toMatchObject({ state: "ended" })
    } finally {
      await manager.stop()
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("removes fish initialization value files when command PTY allocation throws", async () => {
    const fish = which("fish") ?? undefined
    requireHostedShell("fish", fish ?? null)
    if (!fish) return
    const previousShell = process.env.SHELL
    const sentinel = "phase-124-command-allocation-secret"
    let allocatedRoot: string | undefined
    const spawn: PtyFactory = () => {
      allocatedRoot = findPtyInitializationRootContaining(sentinel)
      throw new Error("forced command allocation failure")
    }
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        steps: [{ bucket: "main", scope: "workspace", command: "never-starts", cwd: process.cwd(), environment: { RAW_ALLOCATION_SENTINEL: sentinel } }],
        ports: {}, configuration: { command_id: "cmd_0123456789abcdef", shell: false }, redacted: ["RAW_ALLOCATION_SENTINEL"],
      } }),
    }, undefined, undefined, Date.now, spawn)

    try {
      process.env.SHELL = fish
      const terminal = await manager.create("browser-1", {
        workspace_id: WORKSPACE_A,
        repository_id: REPOSITORY,
        command_id: "cmd_0123456789abcdef",
        expected_revision: "1",
        cols: 80,
        rows: 24,
      })
      await waitFor(() => manager.get("browser-1", terminal.id)?.state === "ended")
      expect(manager.get("browser-1", terminal.id)).toMatchObject({ state: "ended", exit_code: 126 })
      expect(allocatedRoot).toBeDefined()
      expect(existsSync(allocatedRoot!)).toBe(false)
      expect(findPtyInitializationRootContaining(sentinel)).toBeUndefined()
      await manager.close("browser-1", terminal.id)
    } finally {
      if (previousShell === undefined) delete process.env.SHELL
      else process.env.SHELL = previousShell
    }
  })

  test("reaches a real Fish prompt before browser terminal capability replies are available", async () => {
    const fish = which("fish") ?? undefined
    if (!fish) return
    const promptMarker = "__GIT_STACKS_FISH_PROMPT__"
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: [fish, "--no-config", "--interactive", "--init-command", `function fish_prompt; printf '${promptMarker}'; end`], cwd: process.cwd(),
        environment: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
        initialization: { kind: "post-init-environment", shell: "fish" },
        ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    })

    const terminal = await manager.create("browser-1", {
      workspace_id: WORKSPACE_A,
      repository_id: REPOSITORY,
      expected_revision: "1",
      cols: 80,
      rows: 24,
    })
    expect(terminal.state).toBe("running")
    await sleep(100)
    const { sent } = attach(manager, terminal.id)
    await waitFor(() => sent.some((item) => item instanceof Uint8Array
      && new TextDecoder().decode(item.slice(9)).includes(promptMarker)), 2_000)
    const output = sent
      .filter((item): item is Uint8Array => item instanceof Uint8Array)
      .map((frame) => new TextDecoder().decode(frame.slice(9)))
      .join("")
    expect(output).not.toContain("Primary Device Attribute query")
    expect(output).not.toContain("\u001b[0c")
    await expect(manager.close("browser-1", terminal.id)).resolves.toMatchObject({ state: "ended" })
  })

  test("answers Fish DA1 before browser attachment without replaying the consumed query", async () => {
    const writes: string[] = []
    let dataListener: (data: string) => void = () => undefined
    let emitPtyData: (data: string) => void = () => undefined
    let exitListener: (event: { exitCode: number; signal?: number }) => void = () => undefined
    const spawn: PtyFactory = (argv) => {
      const bootstrap = argv[argv.indexOf("--init-command") + 1]
      const readyPath = bootstrap?.match(/> '([^']+\/ready)'/)?.[1]
      expect(readyPath).toBeDefined()
      writeFileSync(readyPath!, "ready")
      emitPtyData = (data) => dataListener(data)
      return {
        pid: 920_001,
        write(data) { writes.push(data) },
        resize: () => undefined,
        kill: () => queueMicrotask(() => exitListener({ exitCode: 0 })),
        onData(listener) { dataListener = listener; return { dispose: () => { dataListener = () => undefined } } },
        onExit(listener) { exitListener = listener; return { dispose: () => { exitListener = () => undefined } } },
      }
    }
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        argv: ["/usr/bin/fish", "--interactive"], cwd: process.cwd(), environment: {},
        initialization: { kind: "post-init-environment", shell: "fish" },
        ports: {}, configuration: { shell: true }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, spawn)

    const terminal = await manager.create("browser-1", {
      workspace_id: WORKSPACE_A,
      repository_id: REPOSITORY,
      expected_revision: "1",
      cols: 80,
      rows: 24,
    })
    emitPtyData("startup-prefix\u001b[")
    emitPtyData("0cstartup-suffix")
    await waitFor(() => writes.includes("\u001b[?1;2c"))

    const { sent } = attach(manager, terminal.id)
    const output = sent
      .filter((item): item is Uint8Array => item instanceof Uint8Array)
      .map((frame) => new TextDecoder().decode(frame.slice(9)))
      .join("")
    expect(output).toContain("startup-prefix")
    expect(output).toContain("startup-suffix")
    expect(output).not.toContain("\u001b[0c")
    expect(writes).toEqual(["\u001b[?1;2c"])

    await expect(manager.close("browser-1", terminal.id)).resolves.toMatchObject({ state: "ended" })
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
    const spawn: PtyFactory = (argv) => {
      const dataListeners = new Set<(data: string) => void>()
      const exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>()
      const record = { writes: [] as string[], resizes: [] as Array<[number, number]> }
      processes.push(record)
      const command = argv.at(-1)
      const readyPath = argv.find((value) => value.endsWith("/ready"))
      if (readyPath) writeFileSync(readyPath, "ready")
      if (command) record.writes.push(command)
      const finish = () => queueMicrotask(() => {
        for (const listener of exitListeners) listener({ exitCode: 0 })
      })
      if (command?.includes("printf done") && processes.length > 1) finish()
      return {
        pid: 910_000 + processes.length,
        write(data) {
          record.writes.push(data)
          const readyPath = data.match(/> '([^']+\/ready)'/)?.[1]
          if (readyPath) writeFileSync(readyPath, "ready")
          if (data === "typed-input\r") finish()
          if (data.includes("printf done") && processes.length > 1) finish()
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
    await waitFor(() => processes[0]?.writes.some((write) => write.includes("read answer")) === true)
    manager.message(socket, JSON.stringify({ type: "resize", cols: 101, rows: 37 }))
    manager.message(socket, JSON.stringify({ type: "input", data: "typed-input\r" }))
    await waitFor(() => manager.get("browser-1", terminal.id)?.state === "ended")

    expect(processes).toHaveLength(2)
    expect(processes[0]!.writes).toContain("typed-input\r")
    expect(processes[0]!.resizes).toContainEqual([101, 37])
    expect(processes[1]!.writes.some((write) => write.includes("printf done"))).toBe(true)
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

  test("trusts the original PTY exit and never re-signals a possibly reused group id", async () => {
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
    expect(manager.get("browser-1", terminal.id)).toMatchObject({ state: "ended", exit_code: 137 })
    expect(manager.activeCount).toBe(0)

    await expect(manager.close("browser-1", terminal.id)).resolves.toMatchObject({ state: "ended", exit_code: 137 })
    expect(ptys.processes[0]?.signals).toEqual(["SIGTERM", "SIGKILL"])
  })

  test("settles a failed-init command terminal when its original PTY eventually exits", async () => {
    const ptys = createPtyFactory(["never"])
    let groupExists = true
    const manager = new WebTerminalManager({
      buildAll: async () => [],
      buildWorkspace: async () => { throw new Error("unused") },
      resolveTerminalLaunch: async () => ({ resolved: true, revision: "1", launch: {
        steps: [{ bucket: "main", scope: "workspace", command: "never-starts", cwd: process.cwd(), environment: {} }],
        ports: {}, configuration: { command_id: "cmd_0123456789abcdef", shell: false }, redacted: [],
      } }),
    }, undefined, undefined, Date.now, ptys.spawn, undefined, 10, { ptyInitializationTimeoutMs: 5 }, undefined, () => groupExists)

    const terminal = await manager.create("browser-1", {
      workspace_id: WORKSPACE_A,
      repository_id: REPOSITORY,
      command_id: "cmd_0123456789abcdef",
      expected_revision: "1",
      cols: 80,
      rows: 24,
    })
    const attachment = attach(manager, terminal.id)
    await waitFor(() => (ptys.processes[0]?.signals.length ?? 0) >= 2)
    await waitFor(() => attachment.sent.some((item) =>
      item instanceof Uint8Array
      && new TextDecoder().decode(item.slice(9)).includes("[git-stacks shell cleanup]"),
    ))
    expect(manager.get("browser-1", terminal.id)).toMatchObject({ state: "running", exit_code: null })

    groupExists = false
    ptys.processes[0]!.exit({ exitCode: 137, signal: 9 })
    await waitFor(() => manager.get("browser-1", terminal.id)?.state === "ended")

    expect(manager.activeCount).toBe(0)
    expect(manager.get("browser-1", terminal.id)).toMatchObject({ state: "ended", exit_code: 137 })
    expect(ptys.processes[0]?.signals).toEqual(["SIGTERM", "SIGKILL"])
    await expect(manager.close("browser-1", terminal.id)).resolves.toMatchObject({ state: "ended" })
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
    const terminalText = (): string => {
      const output = sent.filter((item): item is Uint8Array => item instanceof Uint8Array).map((frame) => frame.slice(9))
      return new TextDecoder().decode(Buffer.concat(output))
    }
    await waitFor(() => terminalText().includes("WEB_PTY_MARKER") && terminalText().includes("27 91"))
    const text = terminalText()
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
