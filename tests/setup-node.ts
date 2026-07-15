import { randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.GIT_STACKS_CONFIG_DIR = join(tmpdir(), `git-stacks-vitest-${process.pid}-${randomUUID()}`)
delete process.env.GS_WORKSPACE_NAME
delete process.env.GS_WORKSPACE_BRANCH
delete process.env.GS_WORKSPACE_PATH
delete process.env.GS_REPO_NAME
delete process.env.GS_REPO_PATH
