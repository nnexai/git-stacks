import assert from "node:assert/strict"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const cli = join(root, "packages/cli/dist/index.js")

function run(args, home) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      GIT_STACKS_CONFIG_DIR: join(home, ".config/git-stacks"),
      PATH: (process.env.PATH ?? "").split(":").filter((entry) => !/bun/i.test(entry)).join(":"),
    },
  })
}

test("the public CLI runs through Node with Bun absent from PATH", async () => {
  const home = await mkdtemp(join(tmpdir(), "git-stacks-node-cli-"))
  const help = run(["--help"], home)
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /Git worktree workspace manager/)
  const completion = run(["completion", "bash"], home)
  assert.equal(completion.status, 0, completion.stderr)
  assert.match(completion.stdout, /bash completion for git-stacks/)
})

test("ordinary local commands do not create service discovery state", async () => {
  const home = await mkdtemp(join(tmpdir(), "git-stacks-node-local-"))
  const list = run(["list", "--json"], home)
  assert.equal(list.status, 0, list.stderr)
  const { existsSync } = await import("node:fs")
  assert.equal(existsSync(join(home, ".config/git-stacks/service")), false)
})
