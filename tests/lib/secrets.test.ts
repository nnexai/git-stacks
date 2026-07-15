import { afterEach, describe, expect, test } from "bun:test"
import {
  REF_PATTERN,
  buildResolvers,
  buildKeychainCommand,
  cmdResolver,
  envResolver,
  keychainResolver,
  parseKeychainPath,
  parseSecretRef,
  resolveSecrets,
  type KeychainAttr,
  type SecretResolver,
} from "../../packages/core/src/secrets"

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

describe("parseKeychainPath", () => {
  test("parses new key=value syntax into KeychainAttr array", () => {
    expect(parseKeychainPath("service=myapp,account=db")).toEqual([
      { key: "service", value: "myapp" },
      { key: "account", value: "db" },
    ])
  })

  test("parses arbitrary N pairs in new syntax", () => {
    expect(parseKeychainPath("app=myapp,env=prod,key=db")).toEqual([
      { key: "app", value: "myapp" },
      { key: "env", value: "prod" },
      { key: "key", value: "db" },
    ])
  })

  test("parses legacy service/account syntax into KeychainAttr array", () => {
    expect(parseKeychainPath("myapp/db")).toEqual([
      { key: "service", value: "myapp" },
      { key: "account", value: "db" },
    ])
  })

  test("detects new syntax by presence of = in path", () => {
    // path with = triggers new syntax, not legacy
    const result = parseKeychainPath("service=x,account=y")
    expect(result[0].key).toBe("service")
    expect(result[0].value).toBe("x")
  })

  test("detects legacy syntax by absence of = in path", () => {
    const result = parseKeychainPath("svc/acct")
    expect(result).toEqual([
      { key: "service", value: "svc" },
      { key: "account", value: "acct" },
    ])
  })

  test("throws descriptive error for empty key in new syntax", () => {
    expect(() => parseKeychainPath("=value,account=db")).toThrow("Invalid keychain attribute")
  })

  test("throws descriptive error for empty value in new syntax", () => {
    expect(() => parseKeychainPath("service=,account=db")).toThrow("Invalid keychain attribute")
  })

  test("throws descriptive error for legacy path without slash", () => {
    expect(() => parseKeychainPath("missing-slash")).toThrow("expected 'service/account'")
  })
})

describe("buildKeychainCommand", () => {
  test("builds Linux secret-tool command for 2 attributes", () => {
    const attrs: KeychainAttr[] = [
      { key: "service", value: "myapp" },
      { key: "account", value: "db" },
    ]
    expect(buildKeychainCommand(attrs, "linux")).toEqual([
      "secret-tool",
      "lookup",
      "service",
      "myapp",
      "account",
      "db",
    ])
  })

  test("builds Linux secret-tool command for 3 attributes", () => {
    const attrs: KeychainAttr[] = [
      { key: "app", value: "x" },
      { key: "env", value: "y" },
      { key: "key", value: "z" },
    ]
    expect(buildKeychainCommand(attrs, "linux")).toEqual([
      "secret-tool",
      "lookup",
      "app",
      "x",
      "env",
      "y",
      "key",
      "z",
    ])
  })

  test("builds macOS security command for 2 attributes", () => {
    const attrs: KeychainAttr[] = [
      { key: "service", value: "myapp" },
      { key: "account", value: "db" },
    ]
    expect(buildKeychainCommand(attrs, "darwin")).toEqual([
      "security",
      "find-generic-password",
      "-s",
      "myapp",
      "-a",
      "db",
      "-w",
    ])
  })

  test("macOS maps first attr to -s and second to -a regardless of key names", () => {
    const attrs: KeychainAttr[] = [
      { key: "app", value: "myapp" },
      { key: "env", value: "prod" },
    ]
    expect(buildKeychainCommand(attrs, "darwin")).toEqual([
      "security",
      "find-generic-password",
      "-s",
      "myapp",
      "-a",
      "prod",
      "-w",
    ])
  })

  test("macOS throws for more than 2 attributes", () => {
    const attrs: KeychainAttr[] = [
      { key: "app", value: "x" },
      { key: "env", value: "y" },
      { key: "key", value: "z" },
    ]
    expect(() => buildKeychainCommand(attrs, "darwin")).toThrow(
      "macOS supports at most 2 keychain attributes"
    )
  })

  test("legacy format myapp/db produces correct Linux command", () => {
    const attrs = parseKeychainPath("myapp/db")
    expect(buildKeychainCommand(attrs, "linux")).toEqual([
      "secret-tool",
      "lookup",
      "service",
      "myapp",
      "account",
      "db",
    ])
  })

  test("legacy format myapp/db produces correct macOS command", () => {
    const attrs = parseKeychainPath("myapp/db")
    expect(buildKeychainCommand(attrs, "darwin")).toEqual([
      "security",
      "find-generic-password",
      "-s",
      "myapp",
      "-a",
      "db",
      "-w",
    ])
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
