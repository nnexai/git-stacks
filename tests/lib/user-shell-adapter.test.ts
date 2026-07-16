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
})
