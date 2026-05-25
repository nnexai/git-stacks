import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import {
  cleanup,
  createConfigFixture,
  formatCliFailure,
  makeTmpDir,
  runCli,
  writeTemplateFixture,
  writeWorkspaceFixture,
} from "../helpers"

function expectSuccess(result: ReturnType<typeof runCli>) {
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function readTemplateFile(configDir: string, name: string): string {
  return readFileSync(join(configDir, "templates", `${name}.yml`), "utf8")
}

describe("template command subprocess contracts", () => {
  let baseDir: string
  let configDir: string

  beforeEach(() => {
    baseDir = makeTmpDir("template-commands-test")
    configDir = createConfigFixture(baseDir)
    writeTemplateFixture(
      configDir,
      "api.yml",
      `schema_version: "1"
name: api
description: API services
repos:
  - repo: core
    mode: trunk
    base_branch: main
hooks:
  post_create:
    - echo created
env:
  SERVICE: api
labels:
  - backend
  - sprint:82
`
    )
    writeTemplateFixture(
      configDir,
      "web.yml",
      `schema_version: "1"
name: web
description: Web frontend
repos:
  - repo: ui
    mode: dir
labels:
  - frontend
`
    )
  })

  afterEach(() => {
    cleanup(baseDir)
  })

  test("template list and template show print current details without order snapshots", () => {
    const list = runCli(["template", "list", "--label", "backend"], { baseDir, configDir })
    expectSuccess(list)
    expect(list.stdout).toContain("api")
    expect(list.stdout).toContain("API services")
    expect(list.stdout).toContain("core")
    expect(list.stdout).not.toContain("web")

    const show = runCli(["template", "show", "api"], { baseDir, configDir })
    expectSuccess(show)
    expect(show.stdout).toContain("Template:    api")
    expect(show.stdout).toContain("Description: API services")
    expect(show.stdout).toContain("mode:           trunk")
    expect(show.stdout).toContain("base_branch:    main")
    expect(show.stdout).toContain("post_create: echo created")
    expect(show.stdout).toContain("SERVICE=api")
  })

  test("template clone persists an independent template copy", () => {
    const cloned = runCli(["template", "clone", "api", "api-copy"], { baseDir, configDir })
    expectSuccess(cloned)
    expect(cloned.stdout).toContain("Cloned 'api'")
    expect(cloned.stdout).toContain("'api-copy'")

    const saved = readTemplateFile(configDir, "api-copy")
    expect(saved).toContain("name: api-copy")
    expect(saved).toContain("description: API services")
    expect(saved).toContain("backend")
    expect(readTemplateFile(configDir, "api")).toContain("name: api")
  })

  test("template rename cascades workspace references and removes the old file", () => {
    writeWorkspaceFixture(
      configDir,
      "feature-api.yml",
      `schema_version: "1"
name: feature-api
branch: feature/api
created: "2026-05-14"
template: api
repos: []
`
    )

    const renamed = runCli(["template", "rename", "api", "service-api"], { baseDir, configDir })
    expectSuccess(renamed)
    expect(renamed.stdout).toContain("Renamed 'api'")
    expect(renamed.stdout).toContain("'service-api'")
    expect(existsSync(join(configDir, "templates", "api.yml"))).toBe(false)
    expect(readTemplateFile(configDir, "service-api")).toContain("name: service-api")
    expect(readFileSync(join(configDir, "workspaces", "feature-api.yml"), "utf8")).toContain("template: service-api")
  })

  test("template remove --force deletes without entering the prompt path", () => {
    const removed = runCli(["template", "remove", "web", "--force"], { baseDir, configDir })
    expectSuccess(removed)
    expect(removed.stdout).toContain("Removed template 'web'.")
    expect(existsSync(join(configDir, "templates", "web.yml"))).toBe(false)

    const list = runCli(["template", "list"], { baseDir, configDir })
    expectSuccess(list)
    expect(list.stdout).toContain("api")
    expect(list.stdout).not.toContain("web")
  })

  test("template label add list remove and clear persist the YAML contract", () => {
    const add = runCli(["template", "label", "add", "api", "release:1", "backend"], { baseDir, configDir })
    expectSuccess(add)
    expect(add.stdout).toContain("Labels: backend, sprint:82, release:1")
    expect(readTemplateFile(configDir, "api")).toContain("release:1")

    const list = runCli(["template", "label", "list", "api"], { baseDir, configDir })
    expectSuccess(list)
    expect(list.stdout.trim().split("\n")).toEqual(["backend", "sprint:82", "release:1"])

    const remove = runCli(["template", "label", "remove", "api", "sprint:82", "release:1"], { baseDir, configDir })
    expectSuccess(remove)
    expect(remove.stdout).toContain("Labels: backend")
    expect(readTemplateFile(configDir, "api")).not.toContain("release:1")

    const clear = runCli(["template", "label", "clear", "api"], { baseDir, configDir })
    expectSuccess(clear)
    expect(clear.stdout).toContain("Labels cleared.")
    expect(readTemplateFile(configDir, "api")).not.toContain("labels:")
  }, 15000)
})
