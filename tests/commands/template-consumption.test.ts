import { afterEach, beforeEach, describe, expect, test } from "@test/api"
import { mkdirSync, readFileSync } from "fs"
import { join } from "path"
import {
  cleanup,
  createConfigFixture,
  formatCliFailure,
  makeTmpDir,
  runCli,
  writeRegistryFixture,
  writeTemplateFixture,
} from "../helpers"

function expectSuccess(result: ReturnType<typeof runCli>) {
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function workspaceYaml(configDir: string, name: string): string {
  return readFileSync(join(configDir, "workspaces", `${name}.yml`), "utf8")
}

function setupRegistryAndTemplates(baseDir: string, configDir: string) {
  const apiRepo = join(baseDir, "repos", "api")
  const docsRepo = join(baseDir, "repos", "docs")
  mkdirSync(apiRepo, { recursive: true })
  mkdirSync(docsRepo, { recursive: true })
  writeRegistryFixture(
    configDir,
    `- schema_version: "1"
  name: api
  local_path: ${apiRepo}
  default_branch: main
  type: typescript
  is_dir: true
- schema_version: "1"
  name: docs
  local_path: ${docsRepo}
  default_branch: main
  type: other
  is_dir: true
`
  )
  writeTemplateFixture(
    configDir,
    "base.yml",
    `schema_version: "1"
name: base
repos:
  - repo: api
    mode: dir
    commands:
      verify: echo api-verify
env:
  SHARED: base
  API_LEVEL: stable
labels:
  - base
hooks:
  post_create:
    - echo base
commands:
  verify: echo base-verify
  preverify: echo base-pre
`
  )
  writeTemplateFixture(
    configDir,
    "service.yml",
    `schema_version: "1"
name: service
repos:
  - repo: docs
    mode: dir
    commands:
      verify: echo docs-verify
env:
  API_LEVEL: service
  SERVICE_ONLY: "1"
labels:
  - service
hooks:
  pre_open:
    - echo open
commands:
  verify: echo service-verify
  postverify: echo service-post
`
  )
  writeTemplateFixture(
    configDir,
    "included.yml",
    `schema_version: "1"
name: included
repos:
  - repo: api
    mode: dir
  - repo: docs
    mode: dir
env:
  SHARED: included
  INCLUDED: "yes"
labels:
  - included
commands:
  verify: echo included-verify
`
  )
}

describe("template consumption subprocess contracts", () => {
  let baseDir: string
  let configDir: string

  beforeEach(() => {
    baseDir = makeTmpDir("template-consumption-test")
    configDir = createConfigFixture(baseDir)
    setupRegistryAndTemplates(baseDir, configDir)
  })

  afterEach(() => {
    cleanup(baseDir)
  })

  test("new --non-interactive --from <template> snapshots template labels config and commands", () => {
    const created = runCli(["new", "from-template", "--non-interactive", "--from", "included"], {
      baseDir,
      configDir,
    })

    expectSuccess(created)
    expect(created.stdout).toContain("Workspace 'from-template' ready")

    const saved = workspaceYaml(configDir, "from-template")
    expect(saved).toContain("template: included")
    expect(saved).toContain("SHARED: included")
    expect(saved).toContain("INCLUDED: yes")
    expect(saved).toContain("included")
    expect(saved).toContain("repo: api")
    expect(saved).toContain("repo: docs")
    expect(saved).toContain("commands:")
    expect(saved).toContain("verify: echo included-verify")
  })

  test("repeatable --template composition snapshots merged labels config repos and commands", () => {
    const created = runCli(
      ["new", "composed", "--non-interactive", "--template", "base", "--template", "service", "--label", "manual"],
      { baseDir, configDir }
    )

    expectSuccess(created)
    expect(created.stdout).toContain("Workspace 'composed' ready")

    const saved = workspaceYaml(configDir, "composed")
    expect(saved).toContain("template: service")
    expect(saved).toContain("SHARED: base")
    expect(saved).toContain("API_LEVEL: service")
    expect(saved).toContain("SERVICE_ONLY: \"1\"")
    expect(saved).toContain("base")
    expect(saved).toContain("service")
    expect(saved).toContain("manual")
    expect(saved).toContain("repo: api")
    expect(saved).toContain("repo: docs")
    expect(saved).toContain("post_create")
    expect(saved).toContain("pre_open")
    expect(saved).toContain("verify: echo service-verify")
    expect(saved).toContain("preverify: echo base-pre")
    expect(saved).toContain("postverify: echo service-post")
    expect(saved).toContain("commands:\n      verify: echo api-verify")
    expect(saved).toContain("commands:\n      verify: echo docs-verify")
  })

  test("clone --non-interactive preserves template-derived labels config and commands", () => {
    const created = runCli(
      ["new", "clone-source", "--non-interactive", "--template", "base", "--template", "service"],
      { baseDir, configDir }
    )
    expectSuccess(created)

    const cloned = runCli(["clone", "clone-source", "--non-interactive", "--name", "clone-target"], {
      baseDir,
      configDir,
    })

    expectSuccess(cloned)
    expect(cloned.stdout).toContain("Workspace 'clone-target' ready")

    const source = workspaceYaml(configDir, "clone-source")
    const target = workspaceYaml(configDir, "clone-target")
    expect(target).toContain("name: clone-target")
    expect(target).toContain("branch: feature/clone-target")
    expect(target).toContain("template: service")
    expect(target).toContain("SHARED: base")
    expect(target).toContain("API_LEVEL: service")
    expect(target).toContain("base")
    expect(target).toContain("service")
    expect(target).toContain("repo: api")
    expect(target).toContain("repo: docs")
    expect(target).toContain("verify: echo service-verify")
    expect(target).toContain("preverify: echo base-pre")
    expect(target).toContain("postverify: echo service-post")
    expect(source).toContain("name: clone-source")
  })
})
