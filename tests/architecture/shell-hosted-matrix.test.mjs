import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { parse } from "yaml"

const root = new URL("../../", import.meta.url)
const workflow = await readFile(new URL(".github/workflows/node-runtime-matrix.yml", root), "utf8")
const fixture = await readFile(new URL("tests/commands/user-shell-host-fixture.test.ts", root), "utf8")
const parsedWorkflow = parse(workflow)
const hostedDefinition = parsedWorkflow.jobs?.["shell-hosted"]
const jobStart = workflow.indexOf("  shell-hosted:")
const hostedJob = jobStart < 0 ? "" : workflow.slice(jobStart)

test("hosted shell matrix requires Ubuntu 24.04 and macOS 15 without a soft-failure path", () => {
  assert.ok(hostedDefinition, "shell-hosted job must exist")
  assert.deepEqual(hostedDefinition.strategy?.matrix?.runner, ["ubuntu-24.04", "macos-15"])
  assert.deepEqual(hostedDefinition.env, {
    GIT_STACKS_REQUIRE_SHELLS: "bash,zsh,fish",
    GIT_STACKS_REQUIRE_SSH_AGENT: "1",
    GIT_STACKS_SHELL_RECEIPT: "shell-host-receipt.json",
  })
  assert.equal(hostedDefinition["continue-on-error"], undefined)
  assert.match(hostedJob, /command -v "\$capability"/)
  const acceptance = hostedDefinition.steps.find((step) => step.name === "Run fail-on-skip shell and SSH acceptance")?.run ?? ""
  for (const required of [
    "tests/commands/user-shell-host-fixture.test.ts",
    "tests/service/managed-service-process.test.ts",
    "tests/service/web-terminal.test.ts",
  ]) assert.ok(acceptance.includes(required))
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
  const validation = hostedDefinition.steps.find((step) => step.name === "Validate machine-readable zero-skip receipt")
  assert.equal(validation?.if, "always()")
  const upload = hostedDefinition.steps.find((step) => /^actions\/upload-artifact@[0-9a-f]{40}$/.test(step.uses ?? ""))
  assert.equal(upload?.if, "always()")
  assert.equal(upload?.with?.["if-no-files-found"], "error")
  assert.equal(upload?.with?.name, "shell-host-receipt-${{ matrix.runner }}-${{ github.sha }}")
})
