#!/usr/bin/env bun
import { basename } from "path"
import { $ } from "bun"
import { buildCliProgram } from "./lib/cli-program"
import { configureObservability } from "./lib/observability"
import { getVersionString } from "./lib/version"

async function checkGitVersion(): Promise<void> {
  const result = await $`git --version`.quiet().nothrow()
  if (result.exitCode !== 0) {
    console.error("git-stacks: git is not installed. Visit https://git-scm.com to install.")
    process.exit(1)
  }
  const match = result.stdout.toString().match(/(\d+)\.(\d+)/)
  if (!match) return
  const [major, minor] = [parseInt(match[1]), parseInt(match[2])]
  if (major < 2 || (major === 2 && minor < 24)) {
    console.error(
      `git-stacks: git >= 2.24 required (found ${major}.${minor}). Visit https://git-scm.com to install.`
    )
    process.exit(1)
  }
}

const rawName = basename(process.argv[1])
const binName = rawName.endsWith(".ts") || rawName.endsWith(".js") ? "git-stacks" : rawName

const versionString = await getVersionString()
const program = buildCliProgram(binName).version(versionString)

// Default to manage when no subcommand is given
if (process.argv.length <= 2) {
  process.argv.push("manage")
}

// Skip git check for completion subcommand (shell completions must work even without git)
const subcommand = process.argv[2]
if (subcommand !== "completion") {
  await checkGitVersion()
}
await configureObservability(process.env.GS_DEBUG ?? (process.env.GIT_STACKS_DEBUG === "1" ? "1" : undefined))
program.parse()
