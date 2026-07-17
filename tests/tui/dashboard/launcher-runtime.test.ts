import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"

const launcher = resolve("packages/tui/dist/index.js")
const directRun = resolve("packages/tui/dist/run.js")
const ptyFixture = resolve("tests/helpers/tui-launcher-pty.mjs")

type Scenario = "runtime" | "fatal" | "q" | "ctrl-c" | "sigint" | "sigterm" | "direct"
interface FixtureResult {
  output: string
  ptyExitCode: number
  durationMs: number
  pid?: number
  childAlive?: boolean
}

async function runFixture(scenario: Scenario, target = launcher): Promise<FixtureResult> {
  const child = Bun.spawn(["node", ptyFixture, scenario, process.execPath, target], {
    cwd: "/tmp",
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error(`PTY fixture ${scenario} timed out`))
    }, 7_000)
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
  test("loads the reactive runtime from /tmp and mounts a false Show without orphan text", async () => {
    const fixture = await runFixture("runtime")

    expect(result(fixture.output)).toEqual({ status: 0, tty: "restored" })
    expect(fixture.output).toContain("initial stale view")
    expect(fixture.output).toContain("git-stacks-tui renderer probe: reactive")
    expect(fixture.output).not.toContain("Orphan text error")
    expect(fixture.output).not.toContain("unexpected visible branch")
    expect(fixture.durationMs).toBeLessThan(3_000)
    expectAlternateScreenRestored(fixture.output)
  })

  test("fatal mount cleanup exits nonzero, restores the terminal, and leaves no child", async () => {
    const fixture = await runFixture("fatal")

    expect(result(fixture.output)).toEqual({ status: 1, tty: "restored" })
    expect(fixture.output.match(/git-stacks-tui:/g)).toHaveLength(1)
    expect(fixture.output).toContain("Orphan text error")
    expect(fixture.childAlive).toBe(false)
    expect(fixture.durationMs).toBeLessThan(3_000)
    expectAlternateScreenRestored(fixture.output)
  })

  for (const [scenario, input] of [["q", "q"], ["ctrl-c", "raw Ctrl+C"]] as const) {
    test(`${input} exits promptly and restores raw and alternate-screen state`, async () => {
      const fixture = await runFixture(scenario)

      expect(result(fixture.output)).toEqual({ status: 0, tty: "restored" })
      expect(fixture.output).not.toContain("Orphan text error")
      expect(fixture.durationMs).toBeLessThan(3_000)
      expectAlternateScreenRestored(fixture.output)
    })
  }

  for (const [scenario, signal] of [["sigint", "SIGINT"], ["sigterm", "SIGTERM"]] as const) {
    test(`external ${signal} exits promptly and restores raw and alternate-screen state`, async () => {
      const fixture = await runFixture(scenario)

      expect(result(fixture.output)).toEqual({ status: 0, tty: "restored" })
      expect(fixture.output).not.toContain("Orphan text error")
      expect(fixture.childAlive).toBe(false)
      expect(fixture.durationMs).toBeLessThan(3_000)
      expectAlternateScreenRestored(fixture.output)
    })
  }

  test("direct run.js without the preload fails clearly before renderer side effects", async () => {
    const fixture = await runFixture("direct", directRun)

    expect(result(fixture.output)).toEqual({ status: 1, tty: "restored" })
    expect(fixture.output).toContain("Unsupported TUI runtime")
    expect(fixture.output).toContain("@opentui/solid/preload")
    expect(fixture.output).not.toContain("Orphan text error")
    expect(fixture.output).not.toContain("[?1049h")
    expect(fixture.durationMs).toBeLessThan(3_000)
  })
})
