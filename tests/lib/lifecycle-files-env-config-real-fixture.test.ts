import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import {
  cleanup,
  makeTmpDir,
  realCache,
  realRunHooks,
  realRunHooksCaptured,
  useIsolatedConfig,
} from "../helpers"

type CapturedLine = { line: string; stream: "stdout" | "stderr" }

const isolated = useIsolatedConfig("lifecycle-files-env-config-real")

afterAll(() => isolated.cleanup())

let tmpDir: string

beforeEach(() => {
  realCache.workspaces.clear()
  realCache.templates.clear()
  realCache.resetList()
  tmpDir = makeTmpDir("lifecycle-files-env-config")
})

afterEach(() => {
  realCache.workspaces.clear()
  realCache.templates.clear()
  realCache.resetList()
  cleanup(tmpDir)
})

describe("lifecycle hooks with real subprocesses", () => {
  test("runHooks executes in the requested cwd with explicit env values", async () => {
    const artifact = join(tmpDir, "hook-env.txt")
    await realRunHooks([
      `printf "PWD=%s\\nVALUE=%s\\n" "$PWD" "$PHASE85_VALUE" > ${artifact}`,
    ], tmpDir, { PHASE85_VALUE: "from-env" })

    const content = readFileSync(artifact, "utf8")
    expect(content).toContain(`PWD=${tmpDir}`)
    expect(content).toContain("VALUE=from-env")
  })

  test("runHooksCaptured records stdout lines in command order and preserves stream tags", async () => {
    const lines: CapturedLine[] = []
    const results = await realRunHooksCaptured([
      "echo first && echo err-one >&2",
      "echo second",
    ], tmpDir, {}, (line: CapturedLine) => lines.push(line))

    expect(results.map((result: { exitCode: number }) => result.exitCode)).toEqual([0, 0])
    expect(lines.filter((line) => line.stream === "stdout").map((line) => line.line)).toEqual(["first", "second"])
    expect(lines).toContainEqual({ line: "err-one", stream: "stderr" })
  })

  test("runHooksCaptured stops after failure and preserves prior output", async () => {
    const lines: CapturedLine[] = []
    const results = await realRunHooksCaptured([
      "echo before",
      "echo fail >&2; exit 9",
      "echo after",
    ], tmpDir, {}, (line: CapturedLine) => lines.push(line))

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ exitCode: 0, failed: false })
    expect(results[1]).toMatchObject({ exitCode: 9, failed: true })
    expect(lines).toEqual([
      { line: "before", stream: "stdout" },
      { line: "fail", stream: "stderr" },
    ])
  })
})
