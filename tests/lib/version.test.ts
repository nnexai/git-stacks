import { describe, test, expect, beforeEach, afterEach } from "@test/api"
import { join } from "path"
import { readFileSync, writeFileSync } from "fs"
import { makeTmpDir, cleanup, makeGitRepo } from "../helpers"
import { getVersionString } from "../../packages/core/src/version"

// Read expected version from package.json dynamically
const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "../../package.json"), "utf8"))
const expectedVersion: string = pkg.version
const versionPattern = new RegExp(`^${expectedVersion.replace(/\./g, "\\.")}`)

// ---------------------------------------------------------------------------
// describe("getVersionString") — version helper tests
// ---------------------------------------------------------------------------

describe("getVersionString", () => {
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
  })

  afterEach(() => {
    process.chdir(originalCwd)
  })

  test("returns a string starting with version from package.json", async () => {
    // Run from project root (which is a git repo) — version must match package.json
    const result = await getVersionString()
    expect(result).toMatch(versionPattern)
    expect(result).not.toMatch(/0\.1\.1/)
  })

  test("returns version with 7-char hex hash when inside a git repo", async () => {
    const tmp = makeTmpDir("version-test")
    try {
      const repoPath = makeGitRepo(tmp)
      process.chdir(repoPath)
      const result = await getVersionString()
      // Should match: {version} ({7-char-hex}) or {version} ({7-char-hex}-dirty)
      expect(result).toMatch(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)? \([0-9a-f]{7}(-dirty)?\)$/)
    } finally {
      process.chdir(originalCwd)
      cleanup(tmp)
    }
  })

  test("returns version only (no hash, no parens) outside a git repo", async () => {
    const tmp = makeTmpDir("version-noRepo")
    try {
      process.chdir(tmp)
      const result = await getVersionString()
      // Should match just the semver — no parenthetical
      expect(result).toMatch(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/)
    } finally {
      process.chdir(originalCwd)
      cleanup(tmp)
    }
  })

  test("appends -dirty when working tree has uncommitted changes", async () => {
    const tmp = makeTmpDir("version-dirty")
    try {
      const repoPath = makeGitRepo(tmp)
      process.chdir(repoPath)
      // Create an uncommitted file to make the tree dirty
      writeFileSync(join(repoPath, "dirty-file.txt"), "uncommitted content")
      const result = await getVersionString()
      // Should contain -dirty suffix in the hash portion
      expect(result).toMatch(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)? \([0-9a-f]{7}-dirty\)$/)
    } finally {
      process.chdir(originalCwd)
      cleanup(tmp)
    }
  })
})
