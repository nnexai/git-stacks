import { describe, expect, test } from "@test/api"
import { cleanup, createConfigFixture, formatCliFailure, makeTmpDir, runCli } from "../helpers"

describe("doctor support command", () => {
  test("human output stays local-only with forge integrations disabled", () => {
    const baseDir = makeTmpDir("support-doctor")
    try {
      const configDir = createConfigFixture(baseDir)
      const result = runCli(["doctor"], { baseDir, configDir })

      expect(result.exitCode, formatCliFailure(result)).toBe(0)
      expect(result.stdout).toContain("Runtime dependencies:")
      expect(result.stdout).toContain("git")
      expect(result.stdout).not.toContain("gh (GitHub CLI)")
      expect(result.stdout).not.toContain("glab (GitLab CLI)")
      expect(result.stdout).not.toContain("tea (Gitea CLI)")
      expect(result.stdout).not.toContain("jira (Jira CLI)")
      expect(result.stderr).toBe("")
    } finally { cleanup(baseDir) }
  })
})
