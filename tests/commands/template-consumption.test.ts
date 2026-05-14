import { afterEach, beforeEach, describe, expect, test } from "bun:test"
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
env:
  SHARED: base
  API_LEVEL: stable
labels:
  - base
hooks:
  post_create:
    - echo base
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
env:
  API_LEVEL: service
  SERVICE_ONLY: "1"
labels:
  - service
hooks:
  pre_open:
    - echo open
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

  test("new --non-interactive --from <template> snapshots template labels and config", () => {
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
  })

  test("repeatable --template composition snapshots merged labels config and repos", () => {
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
  })

  test("clone --non-interactive preserves template-derived labels and config", () => {
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
    expect(source).toContain("name: clone-source")
  })
})
