import { describe, test, expect, beforeEach, afterEach } from "@test/api"
import { join } from "path"
import { detectRepoType, scanForRepos } from "../../packages/core/src/detect"
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

  test("includes path, detectedType, and isDir", () => {
    mkdir(tmp, "my-repo/.git")
    touch(tmp, "my-repo/pom.xml")
    const [repo] = scanForRepos(tmp)
    expect(repo.path).toBe(join(tmp, "my-repo"))
    expect(repo.detectedType).toBe("java")
    expect(repo.isDir).toBe(false)
  })

  test("returns empty array for non-existent directory", () => {
    expect(scanForRepos(join(tmp, "does-not-exist"))).toEqual([])
  })

  test("returns empty array for empty directory", () => {
    expect(scanForRepos(tmp)).toEqual([])
  })
})

describe("scanForRepos includeDirs", () => {
  test("returns plain directories with isDir: true when includeDirs is true", () => {
    mkdir(tmp, "plain-dir")
    const found = scanForRepos(tmp, { includeDirs: true })
    expect(found).toHaveLength(1)
    expect(found[0].name).toBe("plain-dir")
    expect(found[0].isDir).toBe(true)
  })

  test("returns git repos with isDir: false when includeDirs is true", () => {
    mkdir(tmp, "git-repo/.git")
    const found = scanForRepos(tmp, { includeDirs: true })
    expect(found).toHaveLength(1)
    expect(found[0].isDir).toBe(false)
  })

  test("returns both git repos and plain dirs sorted by name", () => {
    mkdir(tmp, "beta/.git")
    mkdir(tmp, "alpha-dir")
    const found = scanForRepos(tmp, { includeDirs: true })
    expect(found.map(r => r.name)).toEqual(["alpha-dir", "beta"])
    expect(found[0].isDir).toBe(true)
    expect(found[1].isDir).toBe(false)
  })

  test("plain dirs without options are still ignored (backward compat)", () => {
    mkdir(tmp, "git-repo/.git")
    mkdir(tmp, "plain-dir")
    const found = scanForRepos(tmp)
    expect(found).toHaveLength(1)
    expect(found[0].name).toBe("git-repo")
  })

  test("plain dir gets detectedType from file presence", () => {
    mkdir(tmp, "ts-dir")
    touch(tmp, "ts-dir/package.json")
    const found = scanForRepos(tmp, { includeDirs: true })
    expect(found[0].detectedType).toBe("typescript")
  })

  test("empty directory returns empty array with includeDirs", () => {
    expect(scanForRepos(tmp, { includeDirs: true })).toEqual([])
  })
})
