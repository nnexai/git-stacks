import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const workflow = await readFile(new URL(".github/workflows/node-runtime-matrix.yml", root), "utf8")
const fixture = await readFile(new URL("tests/commands/user-shell-host-fixture.test.ts", root), "utf8")
const jobStart = workflow.indexOf("  shell-hosted:")
const hostedJob = jobStart < 0 ? "" : workflow.slice(jobStart)

test("hosted shell matrix requires Ubuntu 24.04 and macOS 15 without a soft-failure path", () => {
  assert.ok(jobStart >= 0, "shell-hosted job must exist")
  assert.match(hostedJob, /runner: \[ubuntu-24\.04, macos-15\]/)
  assert.match(hostedJob, /GIT_STACKS_REQUIRE_SHELLS: bash,zsh,fish/)
  assert.match(hostedJob, /GIT_STACKS_REQUIRE_SSH_AGENT: ["']1["']/)
  assert.match(hostedJob, /GIT_STACKS_SHELL_RECEIPT: shell-host-receipt\.json/)
  assert.match(hostedJob, /command -v "\$capability"/)
  assert.doesNotMatch(hostedJob, /continue-on-error:\s*true/)
  for (const required of [
    "tests/commands/user-shell-host-fixture.test.ts",
    "tests/service/managed-service-process.test.ts",
    "tests/service/web-terminal.test.ts",
  ]) assert.match(hostedJob, new RegExp(required.replaceAll(".", "\\.")))
})

test("required capabilities cannot enter the local skip branches", () => {
  assert.match(fixture, /GIT_STACKS_REQUIRE_SHELLS/)
  assert.match(fixture, /GIT_STACKS_REQUIRE_SSH_AGENT/)
  assert.doesNotMatch(fixture, /GIT_STACKS_REQUIRE_HOST_SHELLS/)
  assert.match(fixture, /test\.skipIf\(!path && !requiredShells\.has\(shell\)\)/)
  assert.match(fixture, /test\.skipIf\(!sshToolsAvailable && !requiredSshAgent\)/)
  assert.match(hostedJob, /assert\.equal\(receipt\.skip_count, 0\)/)
  assert.match(hostedJob, /assert\.equal\(receipt\.status, "pass"\)/)
})

test("every hosted cell always validates and uploads the complete receipt contract", () => {
  for (const field of [
    "schema_version", "commit_sha", "case_counts", "agent_cases", "ssh_add_cases",
    "process_tree", "skip_count", "status", "timestamp",
  ]) {
    assert.match(fixture, new RegExp(`\\b${field}\\b`), `fixture receipt must define ${field}`)
    assert.match(hostedJob, new RegExp(`\\b${field}\\b`), `hosted validator must require ${field}`)
  }
  assert.match(hostedJob, /name: Validate machine-readable zero-skip receipt\n\s+if: always\(\)/)
  assert.match(hostedJob, /uses: actions\/upload-artifact@[0-9a-f]{40}/)
  assert.match(hostedJob, /if-no-files-found: error/)
  assert.match(hostedJob, /name: shell-host-receipt-\$\{\{ matrix\.runner \}\}-\$\{\{ github\.sha \}\}/)
})
