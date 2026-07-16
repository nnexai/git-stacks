import { describe, expect, test } from "@test/api"

import {
  WebShortcutConflictError,
  WebShortcutStaleRevisionError,
  WebShortcutValidationError,
  type WebShortcutMutationIntent,
  type WebShortcutSettings as CoreWebShortcutSettings,
} from "../../packages/core/src/web-shortcuts"
import {
  WEB_SHORTCUT_ACTION_IDS,
  WEB_SHORTCUT_OWNER_CONFLICT_ERROR_CODE,
  WEB_SHORTCUT_STALE_REVISION_ERROR_CODE,
  WebShortcutSettingsSchema,
} from "../../packages/protocol/src/web"
import { SecureResponseSchema } from "../../packages/protocol/src/secure"
import { createWebShortcutRuntimeComposition } from "../../packages/service/src/main"
import { SecureServiceRouter } from "../../packages/service/src/secure/router"
import type { SnapshotAdapter } from "../../packages/service/src/snapshot-adapter"

const binding = (code: `Key${string}`) => ({
  code, ctrl: true, alt: true, shift: true, meta: false,
})

function settings(platform: "macos" | "linux" = "linux", revision = "7"): CoreWebShortcutSettings {
  return {
    platform,
    revision,
    bindings: WEB_SHORTCUT_ACTION_IDS.map((actionId, index) => ({
      action_id: actionId,
      primary: binding(`Key${String.fromCharCode(65 + index)}`),
      aliases: [],
    })),
  }
}

function snapshot(): SnapshotAdapter {
  return {
    buildAll: async () => [],
    buildWorkspace: async () => { throw new Error("unused") },
  }
}

function context(scopes: string[], mode = "browser") {
  return {
    sessionId: "session-a",
    principalId: "principal-a",
    targetId: "22222222-2222-4222-8222-222222222222",
    mode,
    scopes,
  } as never
}

function request(method: string, body: unknown) {
  return { request_id: "request-a", method, body } as never
}

describe("secure web shortcut authority", () => {
  test("allows only bounded typed shortcut conflict details on the secure transport", () => {
    const base = {
      id: "00000000-0000-4000-8000-000000000000",
      ok: false,
      error: { code: WEB_SHORTCUT_OWNER_CONFLICT_ERROR_CODE, message: "Shortcut conflict" },
    }
    expect(SecureResponseSchema.safeParse({
      ...base,
      error: { ...base.error, details: { kind: "binding_owner_conflict", owner_action_id: "commands.open" } },
    }).success).toBe(true)
    expect(SecureResponseSchema.safeParse({
      ...base,
      error: { ...base.error, details: { kind: "binding_owner_conflict", owner_action_id: "unknown.action" } },
    }).success).toBe(false)
    expect(SecureResponseSchema.safeParse({
      ...base,
      error: { ...base.error, details: { kind: "binding_owner_conflict", owner_action_id: "commands.open", secret: "/private/path" } },
    }).success).toBe(false)
    expect(SecureResponseSchema.safeParse({
      ...base,
      error: { ...base.error, details: { path: "/private/path" } },
    }).success).toBe(false)

    expect(SecureResponseSchema.safeParse({
      ...base,
      error: {
        ...base.error,
        details: {
          kind: "forge_failure",
          reason: "source_changed",
          recovery: "resolve_again",
          context: { kind: "provider", provider: "github" },
        },
      },
    }).success).toBe(true)
    expect(SecureResponseSchema.safeParse({
      ...base,
      error: {
        ...base.error,
        details: {
          kind: "forge_failure",
          reason: "source_changed",
          recovery: "resolve_again",
          path: "/private/path",
        },
      },
    }).success).toBe(false)
  })

  test("reads a complete projected registry under snapshot scope without disclosing core state", async () => {
    const calls: string[] = []
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      readWebShortcutSettings: (platform) => {
        calls.push(platform)
        return { ...settings(platform), config: { workspace_root: "/secret" }, environment: { TOKEN: "secret" } } as CoreWebShortcutSettings
      },
    })

    const result = await router.request(context(["snapshot.read"]), request("shortcuts.get", { platform: "linux" }))
    expect(calls).toEqual(["linux"])
    expect(WebShortcutSettingsSchema.parse(result)).toEqual(settings())
    expect(JSON.stringify(result)).not.toContain("workspace_root")
    expect(JSON.stringify(result)).not.toContain("TOKEN")
    await expect(router.request(context([]), request("shortcuts.get", { platform: "linux" }))).rejects.toMatchObject({ code: "unauthorized" })
  })

  test("strictly maps writes to core intents and returns the complete replacement", async () => {
    const calls: WebShortcutMutationIntent[] = []
    const router = new SecureServiceRouter({
      snapshot: snapshot(),
      updateWebShortcutSettings: (intent) => {
        calls.push(intent)
        return settings(intent.platform, "8")
      },
    })
    const body = {
      platform: "linux",
      action_id: "commands.open",
      expected_revision: "7",
      intent: "set-primary",
      binding: binding("KeyO"),
    }

    const result = await router.request(context(["operation.write"]), request("shortcuts.set", body))
    expect(calls).toEqual([body])
    expect(result).toEqual(settings("linux", "8"))
    await expect(router.request(context(["snapshot.read"]), request("shortcuts.set", body))).rejects.toMatchObject({ code: "unauthorized" })
  })

  test("rejects invalid bodies and unavailable capabilities with stable codes", async () => {
    const router = new SecureServiceRouter({ snapshot: snapshot() })
    await expect(router.request(context(["snapshot.read"]), request("shortcuts.get", { platform: "linux", path: "/secret" })))
      .rejects.toMatchObject({ code: "capability_unavailable" })

    const readable = new SecureServiceRouter({ snapshot: snapshot(), readWebShortcutSettings: () => settings() })
    await expect(readable.request(context(["snapshot.read"]), request("shortcuts.get", { platform: "linux", path: "/secret" })))
      .rejects.toMatchObject({ code: "invalid_request" })

    const writable = new SecureServiceRouter({ snapshot: snapshot(), updateWebShortcutSettings: () => settings() })
    await expect(writable.request(context(["operation.write"]), request("shortcuts.set", {
      platform: "linux", action_id: "commands.open", expected_revision: "7", intent: "unbind", path: "/secret",
    }))).rejects.toMatchObject({ code: "invalid_request" })
  })

  test("maps stale, conflict, and validation failures without leaking arbitrary errors", async () => {
    const cases: Array<[Error, string, unknown?]> = [
      [new WebShortcutStaleRevisionError(), WEB_SHORTCUT_STALE_REVISION_ERROR_CODE, { kind: "stale_revision" }],
      [new WebShortcutConflictError("commands.open", "workspace.switch"), WEB_SHORTCUT_OWNER_CONFLICT_ERROR_CODE, { kind: "binding_owner_conflict", owner_action_id: "workspace.switch" }],
      [new WebShortcutValidationError("invalid /secret/path TOKEN=value"), "invalid_request"],
      [new Error("raw config /secret/path TOKEN=value"), "internal_error"],
    ]
    for (const [failure, code, details] of cases) {
      const router = new SecureServiceRouter({
        snapshot: snapshot(),
        updateWebShortcutSettings: () => { throw failure },
      })
      const result = router.request(context(["operation.write"]), request("shortcuts.set", {
        platform: "linux", action_id: "commands.open", expected_revision: "7", intent: "unbind",
      }))
      await expect(result).rejects.toMatchObject({ code })
      if (details) await expect(result).rejects.toMatchObject({ details })
      await expect(result).rejects.not.toMatchObject({ message: expect.stringContaining("/secret/path") })
      await expect(result).rejects.not.toMatchObject({ message: expect.stringContaining("TOKEN=value") })
    }
  })

  test("projects the pre-existing shortcut owner in either conflict direction", async () => {
    for (const [edited, owner] of [
      ["workspace.switch", "commands.open"],
      ["commands.open", "workspace.switch"],
    ] as const) {
      const router = new SecureServiceRouter({
        snapshot: snapshot(),
        updateWebShortcutSettings: () => { throw new WebShortcutConflictError(edited, owner) },
      })
      await expect(router.request(context(["operation.write"]), request("shortcuts.set", {
        platform: "linux", action_id: edited, expected_revision: "7", intent: "unbind",
      }))).rejects.toMatchObject({
        code: WEB_SHORTCUT_OWNER_CONFLICT_ERROR_CODE,
        message: `Shortcut conflicts with ${owner}`,
        details: { kind: "binding_owner_conflict", owner_action_id: owner },
      })
    }
  })

  test("composes the core reader and updater as narrow managed-service capabilities", () => {
    const composition = createWebShortcutRuntimeComposition()
    expect(Object.keys(composition).sort()).toEqual(["readWebShortcutSettings", "updateWebShortcutSettings"])
    expect(composition.readWebShortcutSettings).toBeTypeOf("function")
    expect(composition.updateWebShortcutSettings).toBeTypeOf("function")
  })
})
