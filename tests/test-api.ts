import { existsSync } from "node:fs"
import { isAbsolute, resolve } from "node:path"

import { vi } from "vitest"
import type { Mock } from "vitest"

export * from "vitest"
export type { Mock }

type MockFactory = typeof vi.fn & {
  module: (specifier: string, factory: () => unknown | Promise<unknown>) => void
  restore: () => void
}

const projectRoot = resolve(import.meta.dirname, "..")

function sourceModule(path: string): string {
  if (existsSync(path) && !path.endsWith(".ts")) return resolve(path, "index.ts")
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return path
  return `${path}.ts`
}

function canonicalMockId(specifier: string): string {
  if (isAbsolute(specifier)) return sourceModule(specifier)

  const packagePath = specifier.match(/(?:^|\/)packages\/(.+)$/)?.[1]
  if (packagePath) return sourceModule(resolve(projectRoot, "packages", packagePath))

  const exactAliases: Record<string, string> = {
    "@/lib/service/contract": "packages/protocol/src/service.ts",
    "@/lib/service/presentation": "packages/client/src/presentation.ts",
    "@/lib/integrations/wizard-helpers": "packages/cli/src/wizards/integration-helpers.ts",
    "@/lib/cli-program": "packages/cli/src/lib/cli-program.ts",
    "@/lib/completion-audit": "packages/cli/src/lib/completion-audit.ts",
    "@/lib/completion-generator": "packages/cli/src/lib/completion-generator.ts",
    "@/tui/utils": "packages/cli/src/prompts.ts",
  }
  if (exactAliases[specifier]) return resolve(projectRoot, exactAliases[specifier])

  const aliasPrefixes: Array<[string, string]> = [
    ["@/lib/service/", "packages/service/src/policy/"],
    ["@/lib/", "packages/core/src/"],
    ["@/commands/", "packages/cli/src/commands/"],
    ["@/tui/", "packages/cli/src/wizards/"],
  ]
  for (const [prefix, replacement] of aliasPrefixes) {
    if (specifier.startsWith(prefix)) {
      return sourceModule(resolve(projectRoot, replacement, specifier.slice(prefix.length)))
    }
  }

  return specifier
}

export const mock = Object.assign(
  (<T extends (...args: never[]) => unknown>(implementation?: T) => vi.fn(implementation)) as typeof vi.fn,
  {
    // Bun's mock.module calls in the existing suite are deliberately not
    // hoisted. Vitest's doMock has the same ordering contract for subsequent
    // dynamic imports while each test file runs in its own isolated worker.
    module: (specifier: string, factory: () => unknown | Promise<unknown>) => {
      vi.doMock(canonicalMockId(specifier), factory)
      vi.resetModules()
    },
    restore: () => {
      vi.restoreAllMocks()
      vi.resetModules()
    },
  }
) as MockFactory
