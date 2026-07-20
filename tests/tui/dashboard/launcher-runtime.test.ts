import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { settleTuiCleanup } from "../../../packages/tui/src/run"

const launcher = resolve("packages/tui/dist/index.js")
const directRun = resolve("packages/tui/dist/run.js")
const cliLauncher = resolve("packages/cli/dist/index.js")
const ptyFixture = resolve("tests/helpers/tui-launcher-pty.mjs")
const promptExitLimitMs = process.platform === "darwin" ? 6_000 : 3_000
const dashboardExitLimitMs = process.platform === "darwin" ? 10_000 : 5_000

type Scenario = "runtime" | "fatal" | "q" | "ctrl-c" | "sigint" | "sigterm" | "direct" | "dashboard-q"
interface FixtureResult {
  output: string
  ptyExitCode: number
  durationMs: number
  pid?: number
  childAlive?: boolean
}

async function runFixture(
  scenario: Scenario,
  target = launcher,
  args: string[] = [],
  environment: Record<string, string> = {},
): Promise<FixtureResult> {
  const child = Bun.spawn(["node", ptyFixture, scenario, process.execPath, target, ...args], {
    cwd: "/tmp",
    env: { ...process.env, ...environment },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error(`PTY fixture ${scenario} timed out`))
    }, 14_000)
  })
  const [exitCode, stdout, stderr] = await Promise.race([
    Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]),
    timeout,
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
  expect(exitCode, stderr).toBe(0)
  return JSON.parse(stdout) as FixtureResult
}

function result(output: string): { status: number; tty: string } {
  const match = output.match(/__RESULT__ status=(\d+) tty=(\w+)/)
  if (!match) throw new Error(`Missing PTY result marker. Output:\n${output}`)
  return { status: Number(match[1]), tty: match[2]! }
}

function expectAlternateScreenRestored(output: string): void {
  const lastEnter = output.lastIndexOf("[?1049h")
  const lastLeave = output.lastIndexOf("[?1049l")
  expect(lastEnter).toBeGreaterThanOrEqual(0)
  expect(lastLeave).toBeGreaterThan(lastEnter)
}

describe("published TUI launcher", () => {
  test("bounds a client cleanup that does not settle", async () => {
    const startedAt = Date.now()
    const settled = await settleTuiCleanup(new Promise(() => {}), 25)

    expect(settled).toBe(false)
    expect(Date.now() - startedAt).toBeLessThan(250)
  })

  test("loads the reactive runtime from /tmp and mounts a false Show without orphan text", async () => {
    const fixture = await runFixture("runtime")

    expect(result(fixture.output)).toEqual({ status: 0, tty: "restored" })
    expect(fixture.output).toContain("initial stale view")
    expect(fixture.output).toContain("git-stacks-tui renderer probe: reactive")
    expect(fixture.output).not.toContain("Orphan text error")
    expect(fixture.output).not.toContain("unexpected visible branch")
    expect(fixture.durationMs).toBeLessThan(promptExitLimitMs)
    expectAlternateScreenRestored(fixture.output)
  }, 15_000)

  test("fatal mount cleanup exits nonzero, restores the terminal, and leaves no child", async () => {
    const fixture = await runFixture("fatal")

    expect(result(fixture.output)).toEqual({ status: 1, tty: "restored" })
    expect(fixture.output.match(/git-stacks-tui:/g)).toHaveLength(1)
    expect(fixture.output).toContain("Orphan text error")
    expect(fixture.childAlive).toBe(false)
    expect(fixture.durationMs).toBeLessThan(promptExitLimitMs)
    expectAlternateScreenRestored(fixture.output)
  }, 15_000)

  for (const [scenario, input] of [["q", "q"], ["ctrl-c", "raw Ctrl+C"]] as const) {
    test(`${input} exits promptly and restores raw and alternate-screen state`, async () => {
      const fixture = await runFixture(scenario)

      expect(result(fixture.output)).toEqual({ status: 0, tty: "restored" })
      expect(fixture.output).not.toContain("Orphan text error")
      expect(fixture.durationMs).toBeLessThan(promptExitLimitMs)
      expectAlternateScreenRestored(fixture.output)
    }, 15_000)
  }

  test("outer git-stacks manage exits when the fullscreen TUI exits", async () => {
    const fixture = await runFixture("q", cliLauncher, ["manage"], {
      GIT_STACKS_CLI: cliLauncher,
    })

    expect(result(fixture.output)).toEqual({ status: 0, tty: "restored" })
    expect(fixture.durationMs).toBeLessThan(promptExitLimitMs)
    expectAlternateScreenRestored(fixture.output)
  }, 15_000)

  test("real dashboard exits promptly after q while its managed service remains detached", async () => {
    const root = mkdtempSync(join(tmpdir(), "git-stacks-dashboard-exit-"))
    const configDir = join(root, "config")
    const workspaceRoot = join(root, "workspace-root")
    const environment = {
      GIT_STACKS_CONFIG_DIR: configDir,
      GIT_STACKS_KEY_STORE: "file",
      GIT_STACKS_CLI: cliLauncher,
    }
    mkdirSync(join(configDir, "workspaces"), { recursive: true })
    mkdirSync(join(configDir, "templates"), { recursive: true })
    mkdirSync(join(configDir, "notes"), { recursive: true })
    mkdirSync(workspaceRoot, { recursive: true })
    writeFileSync(join(configDir, "config.yml"), `workspace_root: ${workspaceRoot}\n`)
    writeFileSync(join(configDir, "registry.yml"), "[]\n")

    try {
      const fixture = await runFixture("dashboard-q", cliLauncher, ["manage"], environment)

      expect(result(fixture.output)).toEqual({ status: 0, tty: "restored" })
      expect(fixture.durationMs).toBeLessThan(dashboardExitLimitMs)
      expectAlternateScreenRestored(fixture.output)
    } finally {
      const stop = Bun.spawn([process.execPath, cliLauncher, "service", "stop"], {
        cwd: root,
        env: { ...process.env, ...environment },
        stdout: "ignore",
        stderr: "ignore",
      })
      await stop.exited
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)

  for (const [scenario, signal] of [["sigint", "SIGINT"], ["sigterm", "SIGTERM"]] as const) {
    test(`external ${signal} exits promptly and restores raw and alternate-screen state`, async () => {
      const fixture = await runFixture(scenario)

      expect(result(fixture.output)).toEqual({ status: 0, tty: "restored" })
      expect(fixture.output).not.toContain("Orphan text error")
      expect(fixture.childAlive).toBe(false)
      expect(fixture.durationMs).toBeLessThan(promptExitLimitMs)
      expectAlternateScreenRestored(fixture.output)
    }, 15_000)
  }

  test("direct run.js without the preload fails clearly before renderer side effects", async () => {
    const fixture = await runFixture("direct", directRun)

    expect(result(fixture.output)).toEqual({ status: 1, tty: "restored" })
    expect(fixture.output).toContain("Unsupported TUI runtime")
    expect(fixture.output).toContain("@opentui/solid/preload")
    expect(fixture.output).not.toContain("Orphan text error")
    expect(fixture.output).not.toContain("[?1049h")
    expect(fixture.durationMs).toBeLessThan(3_000)
  }, 15_000)
})
