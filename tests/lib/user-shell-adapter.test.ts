import { afterAll, describe, expect, test } from "@test/api"
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { cleanup, makeTmpDir } from "../helpers"

const ADAPTER_PATH = join(import.meta.dirname, "../../packages/core/src/user-shell.ts")
const fixtureRoot = makeTmpDir("phase124-user-shell-contract")

type ShellFixture = {
  family: "bash" | "zsh" | "fish"
  executable: string
}

const shellFixtures: ShellFixture[] = (["bash", "zsh", "fish"] as const).map((family) => {
  const executable = join(fixtureRoot, family)
  mkdirSync(fixtureRoot, { recursive: true })
  writeFileSync(executable, "#!/bin/sh\nexit 0\n", "utf8")
  chmodSync(executable, 0o700)
  return { family, executable }
})

const hostileCommand = [
  "printf '%s\\n' \"double quoted\"",
  "printf '%s\\n' '$LITERAL_DOLLAR'",
  "printf '%s\\n' 'backslash\\\\value;$(not-expanded-by-adapter)'",
  "printf '%s\\n' 'unicode-λ'",
].join("\n")

afterAll(() => cleanup(fixtureRoot))

describe("Phase 124 user-shell adapter RED contract", () => {
  test("fixture executables cover absolute Bash, zsh, and fish identities without host-shell dependence", () => {
    expect(shellFixtures.map(({ family }) => family)).toEqual(["bash", "zsh", "fish"])
    for (const fixture of shellFixtures) {
      expect(isAbsolute(fixture.executable)).toBe(true)
      expect(existsSync(fixture.executable)).toBe(true)
    }
  })

  test("fixture command preserves hostile command bytes for the future one-argument assertion", () => {
    expect(hostileCommand).toContain("$LITERAL_DOLLAR")
    expect(hostileCommand).toContain("$(not-expanded-by-adapter)")
    expect(hostileCommand.split("\n")).toHaveLength(4)
  })

  test("PHASE124_RED shell profile process-tree contract", () => {
    expect(
      existsSync(ADAPTER_PATH),
      "PHASE124_RED shell profile process-tree contract: shared adapter is not implemented",
    ).toBe(true)
  })

  test("implemented adapter exposes discovery, bootstrap, and execution authorities", () => {
    if (!existsSync(ADAPTER_PATH)) return

    const source = readFileSync(ADAPTER_PATH, "utf8")
    expect(source).toMatch(/export\s+(?:async\s+)?function\s+discoverUserShell\b/)
    expect(source).toMatch(/export\s+(?:async\s+)?function\s+buildUserShellBootstrap\b/)
    expect(source).toMatch(/export\s+(?:async\s+)?function\s+executeUserShellCommand\b/)
    expect(source).toMatch(/discovery[\s\S]*validation[\s\S]*initialization/)
    expect(source).toMatch(/cancellation[\s\S]*cleanup/)
    expect(source).toContain("10_000")
    expect(source).toMatch(/SIGTERM/)
    expect(source).toMatch(/SIGKILL/)
    expect(source).not.toMatch(/(?:fallback|default)[^\n]*\/bin\/sh/i)
  })

  test("discovers only executable absolute Bash, zsh, and fish paths", async () => {
    if (!existsSync(ADAPTER_PATH)) return
    const { discoverUserShell } = await import("../../packages/core/src/user-shell")

    for (const fixture of shellFixtures) {
      expect(discoverUserShell({ SHELL: fixture.executable })).toEqual({
        executable: fixture.executable,
        family: fixture.family,
      })
    }

    for (const [shell, category] of [
      [undefined, "discovery"],
      ["bash", "discovery"],
      [join(fixtureRoot, "missing-bash"), "discovery"],
    ] as const) {
      try {
        discoverUserShell({ SHELL: shell })
        throw new Error(`expected ${String(shell)} to fail`)
      } catch (error) {
        expect(error).toMatchObject({ diagnostic: { category, mode: "command" } })
      }
    }

    const unsupported = join(fixtureRoot, "sh")
    writeFileSync(unsupported, "#!/bin/sh\nexit 0\n", "utf8")
    chmodSync(unsupported, 0o700)
    const nonExecutable = join(fixtureRoot, "bash-non-executable")
    writeFileSync(nonExecutable, "#!/bin/sh\nexit 0\n", "utf8")
    chmodSync(nonExecutable, 0o600)

    for (const shell of [unsupported, nonExecutable]) {
      try {
        discoverUserShell({ SHELL: shell })
        throw new Error(`expected ${shell} to fail`)
      } catch (error) {
        expect(error).toMatchObject({ diagnostic: { category: "validation", mode: "command" } })
      }
    }
  })

  test("plans a fixed interactive-login bootstrap with the unchanged command in one argv slot", async () => {
    if (!existsSync(ADAPTER_PATH)) return
    const { buildUserShellBootstrap, discoverUserShell } = await import("../../packages/core/src/user-shell")

    for (const fixture of shellFixtures) {
      const shell = discoverUserShell({ SHELL: fixture.executable })
      const plan = buildUserShellBootstrap(shell, {
        mode: "command",
        command: hostileCommand,
        readinessPath: "/private/ready",
        acknowledgementPath: "/private/ack",
        environmentPath: "/private/environment",
      })

      expect(plan.argv.filter((argument) => argument === hostileCommand)).toHaveLength(1)
      expect(plan.bootstrap).not.toContain(hostileCommand)
      expect(plan.initialization).toEqual({
        readiness: "private-file-handshake",
        timeoutMs: 10_000,
      })
      expect(plan.argv[0]).toBe(fixture.executable)
      expect(plan.mode).toBe("command")
    }
  })

  test("plans adapter-specific interactive login PTY arguments without command bootstrap source", async () => {
    if (!existsSync(ADAPTER_PATH)) return
    const { buildUserShellBootstrap, discoverUserShell } = await import("../../packages/core/src/user-shell")
    const expected = {
      bash: ["--login", "--interactive"],
      zsh: ["-l", "-i"],
      fish: ["--login", "--interactive"],
    }

    for (const fixture of shellFixtures) {
      const plan = buildUserShellBootstrap(discoverUserShell({ SHELL: fixture.executable }, "pty"), {
        mode: "pty",
      })
      expect(plan.argv).toEqual([fixture.executable, ...expected[fixture.family]])
      expect(plan.bootstrap).toBeUndefined()
    }
  })

  test("limits the ten-second timeout to initialization and terminates the owned group", async () => {
    if (!existsSync(ADAPTER_PATH)) return
    const { executeUserShellCommand } = await import("../../packages/core/src/user-shell")
    let now = 0
    const signals: Array<NodeJS.Signals | number> = []
    let resolveExit!: (exitCode: number) => void
    const exited = new Promise<number>((resolve) => { resolveExit = resolve })

    const execution = executeUserShellCommand({
      command: hostileCommand,
      cwd: fixtureRoot,
      shellEnvironment: { SHELL: shellFixtures[0].executable },
    }, {
      now: () => now,
      wait: async (milliseconds) => { now += milliseconds },
      spawn: () => ({
        pid: 4242,
        exited,
        stdout: null,
        stderr: null,
        kill: () => true,
        killGroup: (signal) => {
          signals.push(signal ?? "SIGTERM")
          resolveExit(143)
          return true
        },
        unref: () => undefined,
      }),
    })

    await expect(execution).rejects.toMatchObject({
      diagnostic: {
        category: "initialization",
        mode: "command",
        stage: "initialization-timeout",
      },
    })
    expect(now).toBe(10_000)
    expect(signals).toEqual(["SIGTERM"])
  })

  test("does not apply the initialization timeout after the readiness handshake", async () => {
    if (!existsSync(ADAPTER_PATH)) return
    const { executeUserShellCommand } = await import("../../packages/core/src/user-shell")
    let resolveExit!: (exitCode: number) => void
    const exited = new Promise<number>((resolve) => { resolveExit = resolve })
    let spawnedArgv: readonly string[] = []
    let waitCalls = 0

    const execution = executeUserShellCommand({
      command: hostileCommand,
      cwd: fixtureRoot,
      shellEnvironment: { SHELL: shellFixtures[0].executable },
    }, {
      wait: async () => { waitCalls += 1 },
      spawn: (argv) => {
        spawnedArgv = argv
        writeFileSync(argv.at(-4)!, "ready", "utf8")
        return {
          pid: 4243,
          exited,
          stdout: null,
          stderr: null,
          kill: () => true,
          killGroup: () => true,
          unref: () => undefined,
        }
      },
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(spawnedArgv.at(-1)).toBe(hostileCommand)
    expect(waitCalls).toBe(0)
    resolveExit(0)
    await expect(execution).resolves.toMatchObject({ exitCode: 0 })
  })
})
