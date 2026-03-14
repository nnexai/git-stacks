import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { join } from "path"
import { detectRepoType, scanForRepos } from "../../src/lib/detect"
import { makeTmpDir, cleanup, mkdir, touch } from "../helpers"

let tmp: string

beforeEach(() => { tmp = makeTmpDir("detect") })
afterEach(() => cleanup(tmp))

describe("detectRepoType", () => {
  test("detects java from pom.xml", () => {
    touch(tmp, "repo/pom.xml")
    expect(detectRepoType(join(tmp, "repo"))).toBe("java")
  })

  test("detects java from build.gradle", () => {
    touch(tmp, "repo/build.gradle")
    expect(detectRepoType(join(tmp, "repo"))).toBe("java")
  })

  test("detects java from build.gradle.kts", () => {
    touch(tmp, "repo/build.gradle.kts")
    expect(detectRepoType(join(tmp, "repo"))).toBe("java")
  })

  test("detects typescript from package.json", () => {
    touch(tmp, "repo/package.json")
    expect(detectRepoType(join(tmp, "repo"))).toBe("typescript")
  })

  test("returns other when no known files", () => {
    mkdir(tmp, "repo")
    expect(detectRepoType(join(tmp, "repo"))).toBe("other")
  })

  test("prefers java over typescript when both present", () => {
    touch(tmp, "repo/pom.xml")
    touch(tmp, "repo/package.json")
    expect(detectRepoType(join(tmp, "repo"))).toBe("java")
  })
})

describe("scanForRepos", () => {
  test("finds dirs that contain .git", () => {
    mkdir(tmp, "repo-a/.git")
    mkdir(tmp, "repo-b/.git")
    const found = scanForRepos(tmp)
    expect(found.map((r) => r.name)).toEqual(["repo-a", "repo-b"])
  })

  test("ignores dirs without .git", () => {
    mkdir(tmp, "repo-a/.git")
    mkdir(tmp, "not-a-repo")
    const found = scanForRepos(tmp)
    expect(found).toHaveLength(1)
    expect(found[0].name).toBe("repo-a")
  })

  test("returns results sorted by name", () => {
    mkdir(tmp, "zebra/.git")
    mkdir(tmp, "alpha/.git")
    mkdir(tmp, "mango/.git")
    const names = scanForRepos(tmp).map((r) => r.name)
    expect(names).toEqual(["alpha", "mango", "zebra"])
  })

  test("includes path and detectedType", () => {
    mkdir(tmp, "my-repo/.git")
    touch(tmp, "my-repo/pom.xml")
    const [repo] = scanForRepos(tmp)
    expect(repo.path).toBe(join(tmp, "my-repo"))
    expect(repo.detectedType).toBe("java")
  })

  test("returns empty array for non-existent directory", () => {
    expect(scanForRepos(join(tmp, "does-not-exist"))).toEqual([])
  })

  test("returns empty array for empty directory", () => {
    expect(scanForRepos(tmp)).toEqual([])
  })
})
