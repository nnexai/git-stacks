import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { lstatSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "fs"
import { join } from "path"
import { parse } from "yaml"
import { useIsolatedConfig } from "../../helpers"

const isolated = useIsolatedConfig("service-identity-test")
const config = await import("../../../src/lib/config")
const { ensureWorkspaceIdentity } = await import("../../../src/lib/service/identity")
afterAll(() => isolated.cleanup())

const workspaceFile = (name: string) => join(isolated.configDir, "workspaces", `${name}.yml`)

beforeEach(() => {
  config.invalidateConfigCache()
})

describe("service identity migration", () => {
  test("assigns stable workspace and repository IDs exactly once", () => {
    writeFileSync(workspaceFile("legacy"), "name: legacy\nbranch: main\ncreated: today\nrepos:\n  - name: repo\n    repo: repo\n    type: other\n    mode: trunk\n    main_path: /tmp/repo\n")
    const ids = ["018f47f4-5ab1-7c2d-8e90-123456789abc", "018f47f4-5ab1-7c2d-8e90-abcdef012345"]
    const first = ensureWorkspaceIdentity("legacy", { randomUUID: () => ids.shift()! })
    config.invalidateConfigCache()
    const second = ensureWorkspaceIdentity("legacy", { randomUUID: () => { throw new Error("must not regenerate") } })
    expect(second.id).toBe(first.id)
    expect(second.repos[0]?.id).toBe(first.repos[0]?.id)
    expect(parse(readFileSync(workspaceFile("legacy"), "utf8")).id).toBe(first.id)
  })

  test("preserves IDs across rename and path changes", () => {
    writeFileSync(workspaceFile("before"), "name: before\nbranch: main\ncreated: today\nrepos: []\n")
    const migrated = ensureWorkspaceIdentity("before")
    config.writeWorkspace({ ...migrated, name: "after", branch: "renamed" })
    renameSync(workspaceFile("after"), workspaceFile("renamed-file"))
    config.invalidateConfigCache()
    expect(ensureWorkspaceIdentity("after").id).toBe(migrated.id)
  })

  test("rejects symlinked workspace files without modifying their target", () => {
    const target = join(isolated.configDir, "target.yml")
    writeFileSync(target, "name: linked\nbranch: main\ncreated: today\nrepos: []\n")
    symlinkSync(target, workspaceFile("linked"))
    expect(() => ensureWorkspaceIdentity("linked")).toThrow(/symlink/i)
    expect(lstatSync(workspaceFile("linked")).isSymbolicLink()).toBe(true)
    expect(readFileSync(target, "utf8")).not.toContain("id:")
  })
})
