import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"

const root = join(import.meta.dir, "..", "..")

describe("Phase 83 coverage command surface", () => {
  test("package.json exposes the required coverage scripts", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }

    expect(pkg.scripts.coverage).toBe("bun run scripts/coverage-runner.ts")
    expect(pkg.scripts["coverage:unit"]).toBe("bun run scripts/coverage-runner.ts --unit")
    expect(pkg.scripts["coverage:integ"]).toBe("bun run scripts/coverage-runner.ts --integ")
  })

  test(".coverage artifacts stay local-only", () => {
    const gitignore = readFileSync(join(root, ".gitignore"), "utf8")
    expect(gitignore.split(/\r?\n/)).toContain(".coverage/")
  })

  test("coverage runner writes the required stable report names", () => {
    const runner = readFileSync(join(root, "scripts", "coverage-runner.ts"), "utf8")

    expect(runner).toContain("coverage-final.json")
    expect(runner).toContain("coverage-summary.json")
    expect(runner).toContain("lcov.info")
    expect(runner).toContain("index.html")
    expect(runner).toContain("istanbul-lib-instrument")
  })
})
