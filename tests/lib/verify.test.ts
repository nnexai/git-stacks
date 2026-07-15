import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import { getVerifyCommands, runVerifyWorkflow } from "../../scripts/verify"

const root = join(import.meta.dir, "..", "..")

describe("verify command workflow", () => {
  test("runs prerequisites, coverage, gates, and existing component commands in order", async () => {
    const commands: string[] = []
    const exitCode = await runVerifyWorkflow({
      runCommand: async (command) => {
        commands.push(command)
        return 0
      },
      log: () => {},
    })

    expect(exitCode).toBe(0)
    expect(commands).toEqual([
      "bun run verify:prereqs",
      "bun run coverage",
      "bun run verify:gates",
      "bun run test",
      "bun run test:deps",
      "bun run typecheck",
    ])
    expect(getVerifyCommands()).toEqual(commands)
  })

  test("package.json exposes verify:prereqs for direct prerequisite debugging", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }

    expect(pkg.scripts["verify:prereqs"]).toBe("bun run scripts/verify-prereqs.ts")
  })

  test("package.json exposes the package-aware verification commands", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }

    expect(pkg.scripts.verify).toBe("bun run scripts/verify.ts")
    expect(pkg.scripts["verify:gates"]).toBe("bun run scripts/verify-gates.ts")
    expect(pkg.scripts.test).toBe("bun run scripts/test-runner.ts")
    expect(pkg.scripts["test:unit"]).toBe("bun run scripts/test-runner.ts --unit")
    expect(pkg.scripts["test:integ"]).toBe("bun run scripts/test-runner.ts --integ")
    expect(pkg.scripts["test:deps"]).toBe("node scripts/check-architecture.mjs --cycles")
    expect(pkg.scripts.typecheck).toBe("npm run typecheck --workspaces --if-present")
  })
})
