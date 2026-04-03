import { afterEach, describe, expect, test } from "bun:test"
import {
  REF_PATTERN,
  buildResolvers,
  cmdResolver,
  envResolver,
  keychainResolver,
  parseSecretRef,
  resolveSecrets,
  type SecretResolver,
} from "../../src/lib/secrets"

describe("parseSecretRef", () => {
  test("matches the documented reference pattern", () => {
    expect(REF_PATTERN.test("${{ env:HOME }}")).toBe(true)
    expect(REF_PATTERN.test("prefix-${{ env:HOME }}")).toBe(false)
  })

  test("parses env references", () => {
    expect(parseSecretRef("${{ env:MY_VAR }}")).toEqual({ id: "env", path: "MY_VAR" })
  })

  test("parses keychain references", () => {
    expect(parseSecretRef("${{ keychain:service/account }}")).toEqual({
      id: "keychain",
      path: "service/account",
    })
  })

  test("parses cmd references", () => {
    expect(parseSecretRef("${{ cmd:echo hello }}")).toEqual({ id: "cmd", path: "echo hello" })
  })

  test("trims whitespace around id and path", () => {
    expect(parseSecretRef("${{  env:SPACED  }}")).toEqual({ id: "env", path: "SPACED" })
  })

  test("returns null for plain values and partial references", () => {
    expect(parseSecretRef("plain-value")).toBeNull()
    expect(parseSecretRef("prefix-${{ env:VAR }}-suffix")).toBeNull()
  })
})

describe("envResolver", () => {
  afterEach(() => {
    delete process.env.GS_SECRET_TEST_VALUE
  })

  test("resolves existing environment variables", async () => {
    process.env.GS_SECRET_TEST_VALUE = "present"
    await expect(envResolver.resolve("GS_SECRET_TEST_VALUE")).resolves.toBe("present")
  })

  test("throws when the environment variable is missing", async () => {
    await expect(envResolver.resolve("GS_SECRET_TEST_MISSING")).rejects.toThrow("GS_SECRET_TEST_MISSING")
  })
})

describe("keychainResolver", () => {
  test("rejects invalid keychain paths before spawning", async () => {
    await expect(keychainResolver.resolve("missing-slash")).rejects.toThrow("expected 'service/account'")
  })
})

describe("cmdResolver", () => {
  test("resolves command output", async () => {
    await expect(cmdResolver.resolve("echo hello")).resolves.toBe("hello")
  })

  test("propagates failed commands", async () => {
    await expect(cmdResolver.resolve("exit 1")).rejects.toThrow("Failed to resolve cmd:exit 1")
  })
})

describe("buildResolvers", () => {
  const baseConfig = {
    workspace_root: "/tmp/workspaces",
    integrations: {},
    ports: { range_start: 10000, range_end: 65000 },
  }

  test("defaults to keychain and env", () => {
    expect(buildResolvers(baseConfig).map((resolver) => resolver.id)).toEqual(["keychain", "env"])
  })

  test("includes cmd only when opted in", () => {
    expect(
      buildResolvers({
        ...baseConfig,
        secrets: { resolvers: ["keychain", "env", "cmd"] },
      }).map((resolver) => resolver.id)
    ).toEqual(["keychain", "env", "cmd"])
  })

  test("supports custom subsets and ignores unknown ids", () => {
    expect(
      buildResolvers({
        ...baseConfig,
        secrets: { resolvers: ["env", "unknown"] },
      }).map((resolver) => resolver.id)
    ).toEqual(["env"])
  })

  test("returns defaults when secrets object omits resolvers", () => {
    expect(buildResolvers({ ...baseConfig, secrets: {} }).map((resolver) => resolver.id)).toEqual([
      "keychain",
      "env",
    ])
  })
})

describe("resolveSecrets", () => {
  const mockResolver: SecretResolver = {
    id: "mock",
    async resolve(path: string) {
      return `resolved:${path}`
    },
  }

  test("passes through plain values", async () => {
    await expect(resolveSecrets({ A: "plain", B: "also-plain" }, [])).resolves.toEqual({
      A: "plain",
      B: "also-plain",
    })
  })

  test("resolves referenced values", async () => {
    await expect(
      resolveSecrets({ TOKEN: "${{ mock:api-token }}", PLAIN: "value" }, [mockResolver])
    ).resolves.toEqual({
      TOKEN: "resolved:api-token",
      PLAIN: "value",
    })
  })

  test("returns an empty object for empty input", async () => {
    await expect(resolveSecrets({}, [])).resolves.toEqual({})
  })

  test("throws for unknown resolvers", async () => {
    await expect(resolveSecrets({ TOKEN: "${{ unknown:value }}" }, [mockResolver])).rejects.toThrow(
      "No resolver for 'unknown'"
    )
  })

  test("propagates resolver failures", async () => {
    const failingResolver: SecretResolver = {
      id: "broken",
      async resolve() {
        throw new Error("resolver exploded")
      },
    }

    await expect(resolveSecrets({ TOKEN: "${{ broken:value }}" }, [failingResolver])).rejects.toThrow(
      "resolver exploded"
    )
  })

  test("can use envResolver with the orchestrator", async () => {
    process.env.GS_SECRET_TEST_VALUE = "from-env"
    await expect(
      resolveSecrets({ TOKEN: "${{ env:GS_SECRET_TEST_VALUE }}" }, [envResolver])
    ).resolves.toEqual({ TOKEN: "from-env" })
    delete process.env.GS_SECRET_TEST_VALUE
  })
})
