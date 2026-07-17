import { resolve } from "node:path"

import { transform as transformWithEsbuild } from "esbuild"
import { defineConfig } from "vitest/config"

const root = import.meta.dirname
const staleTuiView = resolve(root, "packages/tui/src/StaleWorkspacesView.tsx")

export default defineConfig({
  plugins: [{
    name: "transform-stale-opentui-view",
    enforce: "pre",
    transform(code, id) {
      if (id.split("?", 1)[0] !== staleTuiView) return undefined
      return transformWithEsbuild(code, {
        sourcefile: id,
        loader: "tsx",
        jsx: "automatic",
        jsxImportSource: "@opentui/solid",
        sourcemap: "inline",
      })
    },
  }],
  resolve: {
    alias: [
      { find: "@test/api", replacement: resolve(root, "tests/test-api.ts") },
      { find: "@/lib/service/contract", replacement: resolve(root, "packages/protocol/src/service.ts") },
      { find: "@/lib/service/presentation", replacement: resolve(root, "packages/client/src/presentation.ts") },
      { find: /^@\/lib\/service\/(.+)$/, replacement: `${resolve(root, "packages/service/src/policy")}/$1.ts` },
      { find: "@/lib/integrations/wizard-helpers", replacement: resolve(root, "packages/cli/src/wizards/integration-helpers.ts") },
      { find: "@/lib/cli-program", replacement: resolve(root, "packages/cli/src/lib/cli-program.ts") },
      { find: "@/lib/completion-audit", replacement: resolve(root, "packages/cli/src/lib/completion-audit.ts") },
      { find: "@/lib/completion-generator", replacement: resolve(root, "packages/cli/src/lib/completion-generator.ts") },
      { find: /^@\/lib\/integrations$/, replacement: resolve(root, "packages/core/src/integrations/index.ts") },
      { find: /^@\/lib\/(.+)$/, replacement: `${resolve(root, "packages/core/src")}/$1.ts` },
      { find: /^@\/commands\/(.+)$/, replacement: `${resolve(root, "packages/cli/src/commands")}/$1.ts` },
      { find: "@/tui/utils", replacement: resolve(root, "packages/cli/src/prompts.ts") },
      { find: /^@\/tui\/(.+)$/, replacement: `${resolve(root, "packages/cli/src/wizards")}/$1.ts` },
      { find: "@git-stacks/service/client", replacement: resolve(root, "packages/service/src/client.ts") },
      { find: "@git-stacks/service", replacement: resolve(root, "packages/service/src/index.ts") },
      { find: /^@git-stacks\/core\/integrations$/, replacement: resolve(root, "packages/core/src/integrations/index.ts") },
      { find: /^@git-stacks\/core\/(.+)$/, replacement: `${resolve(root, "packages/core/src")}/$1.ts` },
      { find: "@git-stacks/core", replacement: resolve(root, "packages/core/src/index.ts") },
      { find: "@git-stacks/client", replacement: resolve(root, "packages/client/src/index.ts") },
      { find: "@git-stacks/protocol", replacement: resolve(root, "packages/protocol/src/index.ts") },
    ],
  },
  test: {
    name: "node",
    environment: "node",
    pool: "forks",
    isolate: true,
    setupFiles: [resolve(root, "tests/setup-node.ts")],
    maxWorkers: 8,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: [
      "tests/{commands,lib,service}/**/*.test.ts",
      "tests/tui/workspace-*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: ".coverage",
      reporter: ["text", "html", "json", "json-summary", "lcovonly"],
      include: [
        "packages/{protocol,client,core,cli,service,web}/src/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.d.ts",
        "packages/web/src/styles.d.ts",
      ],
    },
  },
})
