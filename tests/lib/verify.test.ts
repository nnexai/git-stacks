import { describe, expect, test } from "@test/api"
import { readFileSync } from "fs"
import { join } from "path"
import { getVerifyCommands, runVerifyWorkflow } from "../../scripts/verify"

const root = join(import.meta.dirname, "..", "..")

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
      "npm run verify:prereqs",
      "npm run coverage",
      "npm run verify:gates",
      "npm test",
      "npm run test:deps",
      "npm run typecheck",
    ])
    expect(getVerifyCommands()).toEqual(commands)
  })

  test("package.json exposes verify:prereqs for direct prerequisite debugging", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }

    expect(pkg.scripts["verify:prereqs"]).toBe("tsx scripts/verify-prereqs.ts")
  })

  test("package.json exposes the package-aware verification commands", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }

    expect(pkg.scripts.verify).toBe("tsx scripts/verify.ts")
    expect(pkg.scripts["verify:gates"]).toBe("tsx scripts/verify-gates.ts")
    expect(pkg.scripts.test).toContain("npm run test:vitest")
    expect(pkg.scripts["test:unit"]).toContain("vitest run")
    expect(pkg.scripts["test:integ"]).toBe("vitest run tests/commands")
    expect(pkg.scripts["test:deps"]).toBe("node scripts/check-architecture.mjs --cycles")
    expect(pkg.scripts.typecheck).toBe("npm run typecheck --workspaces --if-present")
  })
})
