import { describe, expect, test } from "@test/api"
import { stringify } from "yaml"

import { GlobalConfigSchema, type GlobalConfig } from "../../packages/core/src/config"
import {
  WEB_SHORTCUT_ACTION_IDS,
  WebShortcutConflictError,
  WebShortcutStaleRevisionError,
  WebShortcutValidationError,
  readWebShortcutSettings,
  updateWebShortcutSettings,
  type WebShortcutBinding,
  type WebShortcutMutationIntent,
} from "../../packages/core/src/web-shortcuts"

const binding = (
  code: `Key${string}`,
  modifiers: Partial<Record<"ctrl" | "alt" | "shift" | "meta", boolean>> = {},
): WebShortcutBinding => ({ code, ctrl: false, alt: false, shift: false, meta: false, ...modifiers })

function authority(initial: GlobalConfig = GlobalConfigSchema.parse({})) {
  let config = initial
  let writes = 0
  return {
    read: (platform: "macos" | "linux") => readWebShortcutSettings(platform, { readGlobalConfig: () => config }),
    update: (intent: WebShortcutMutationIntent) => updateWebShortcutSettings(intent, {
      updateGlobalConfig: (mutation) => {
        const next = GlobalConfigSchema.parse(mutation(config))
        config = next
        writes++
        return next
      },
    }),
    raw: () => stringify(config),
    config: () => config,
    writes: () => writes,
  }
}

describe("authoritative web shortcut configuration", () => {
  test("derives all eight safe platform defaults with no aliases", () => {
    const state = authority()
    const macos = state.read("macos")
    const linux = state.read("linux")

    expect(macos.bindings.map((row) => row.action_id)).toEqual(WEB_SHORTCUT_ACTION_IDS)
    expect(macos.bindings.map((row) => row.primary)).toEqual("K P N T W J L A".split(" ").map((key) =>
      binding(`Key${key}`, { ctrl: true, meta: true })))
    expect(linux.bindings.map((row) => row.primary)).toEqual("K P N T W J L A".split(" ").map((key) =>
      binding(`Key${key}`, { ctrl: true, alt: true, shift: true })))
    expect(macos.bindings.every((row) => row.aliases.length === 0)).toBe(true)
    expect(linux.bindings.every((row) => row.aliases.length === 0)).toBe(true)
    expect(macos.revision).toMatch(/^(0|[1-9][0-9]*)$/)
    expect(state.read("macos")).toEqual(macos)
  })

  test("round-trips primary replacement, aliases, unbind, and reset distinctly", () => {
    const state = authority(GlobalConfigSchema.parse({ integrations: { editor: { enabled: true } } }))
    let current = state.read("linux")

    current = state.update({
      platform: "linux", action_id: "commands.open", expected_revision: current.revision,
      intent: "set-primary", binding: binding("KeyO", { ctrl: true, alt: true, shift: true }),
    })
    expect(current.bindings[1]).toEqual({
      action_id: "commands.open",
      primary: binding("KeyO", { ctrl: true, alt: true, shift: true }),
      aliases: [],
    })

    current = state.update({
      platform: "linux", action_id: "commands.open", expected_revision: current.revision,
      intent: "set-aliases", aliases: [binding("KeyP", { ctrl: true, shift: true })],
    })
    expect(current.bindings[1]?.aliases).toEqual([binding("KeyP", { ctrl: true, shift: true })])

    current = state.update({
      platform: "linux", action_id: "commands.open", expected_revision: current.revision, intent: "unbind",
    })
    expect(current.bindings[1]).toEqual({ action_id: "commands.open", primary: null, aliases: [] })

    current = state.update({
      platform: "linux", action_id: "commands.open", expected_revision: current.revision, intent: "reset",
    })
    expect(current.bindings[1]).toEqual({
      action_id: "commands.open",
      primary: binding("KeyP", { ctrl: true, alt: true, shift: true }),
      aliases: [],
    })
    expect(state.config().web?.shortcuts?.linux?.["commands.open"]).toBeUndefined()
    expect(state.config().integrations).toEqual({ editor: { enabled: true } })
  })

  test("allows familiar opt-in aliases without replacing safe primaries", () => {
    const state = authority()
    let current = state.read("macos")
    current = state.update({
      platform: "macos", action_id: "workspace.switch", expected_revision: current.revision,
      intent: "set-aliases", aliases: [binding("KeyK", { ctrl: true })],
    })
    current = state.update({
      platform: "macos", action_id: "commands.open", expected_revision: current.revision,
      intent: "set-aliases", aliases: [binding("KeyP", { ctrl: true, shift: true })],
    })
    expect(current.bindings[0]).toEqual({
      action_id: "workspace.switch",
      primary: binding("KeyK", { ctrl: true, meta: true }),
      aliases: [binding("KeyK", { ctrl: true })],
    })
    expect(current.bindings[1]?.aliases).toEqual([binding("KeyP", { ctrl: true, shift: true })])
  })

  test("rejects conflicts, stale revisions, invalid bindings, and unknown actions without writing", () => {
    const state = authority(GlobalConfigSchema.parse({ secrets: { resolvers: ["environment"] } }))
    const initial = state.read("linux")
    const before = state.raw()

    const attempts: Array<() => unknown> = [
      () => state.update({
        platform: "linux", action_id: "commands.open", expected_revision: initial.revision,
        intent: "set-primary", binding: binding("KeyK", { ctrl: true, alt: true, shift: true }),
      }),
      () => state.update({
        platform: "linux", action_id: "commands.open", expected_revision: "999999",
        intent: "unbind",
      }),
      () => state.update({
        platform: "linux", action_id: "commands.open", expected_revision: initial.revision,
        intent: "set-primary", binding: binding("KeyP"),
      }),
      () => state.update({
        platform: "linux", action_id: "unknown" as "commands.open", expected_revision: initial.revision,
        intent: "reset",
      }),
    ]

    expect(attempts[0]).toThrow(WebShortcutConflictError)
    expect(attempts[1]).toThrow(WebShortcutStaleRevisionError)
    expect(attempts[2]).toThrow(WebShortcutValidationError)
    expect(attempts[3]).toThrow(WebShortcutValidationError)
    expect(state.raw()).toBe(before)
    expect(state.writes()).toBe(0)
    expect(state.config().secrets).toEqual({ resolvers: ["environment"] })
  })

  test("validates conflicts across every effective primary and alias as one atomic registry", () => {
    const state = authority()
    let current = state.read("linux")
    current = state.update({
      platform: "linux", action_id: "workspace.switch", expected_revision: current.revision,
      intent: "set-aliases", aliases: [binding("KeyO", { ctrl: true, alt: true })],
    })
    const before = state.raw()
    expect(() => state.update({
      platform: "linux", action_id: "commands.open", expected_revision: current.revision,
      intent: "set-primary", binding: binding("KeyO", { ctrl: true, alt: true }),
    })).toThrow(WebShortcutConflictError)
    expect(state.raw()).toBe(before)
  })

  test("attributes primary and alias conflicts to the pre-existing other action in both registry directions", () => {
    const expectConflict = (
      state: ReturnType<typeof authority>,
      mutation: Omit<WebShortcutMutationIntent, "expected_revision">,
      owner: WebShortcutMutationIntent["action_id"],
    ) => {
      const current = state.read(mutation.platform)
      const writesBefore = state.writes()
      try {
        state.update({ ...mutation, expected_revision: current.revision } as WebShortcutMutationIntent)
        throw new Error("Expected shortcut conflict")
      } catch (error) {
        expect(error).toBeInstanceOf(WebShortcutConflictError)
        expect(error).toMatchObject({ actionId: mutation.action_id, conflictActionId: owner })
      }
      expect(state.writes()).toBe(writesBefore)
    }

    expectConflict(authority(), {
      platform: "linux", action_id: "workspace.switch", intent: "set-primary",
      binding: binding("KeyP", { ctrl: true, alt: true, shift: true }),
    }, "commands.open")
    expectConflict(authority(), {
      platform: "linux", action_id: "commands.open", intent: "set-primary",
      binding: binding("KeyK", { ctrl: true, alt: true, shift: true }),
    }, "workspace.switch")

    const earlierAliasOwner = authority()
    let earlier = earlierAliasOwner.read("linux")
    earlierAliasOwner.update({
      platform: "linux", action_id: "workspace.switch", expected_revision: earlier.revision,
      intent: "set-aliases", aliases: [binding("KeyO", { ctrl: true, alt: true })],
    })
    expectConflict(earlierAliasOwner, {
      platform: "linux", action_id: "commands.open", intent: "set-primary",
      binding: binding("KeyO", { ctrl: true, alt: true }),
    }, "workspace.switch")

    const laterAliasOwner = authority()
    let later = laterAliasOwner.read("linux")
    laterAliasOwner.update({
      platform: "linux", action_id: "commands.open", expected_revision: later.revision,
      intent: "set-aliases", aliases: [binding("KeyO", { ctrl: true, alt: true })],
    })
    expectConflict(laterAliasOwner, {
      platform: "linux", action_id: "workspace.switch", intent: "set-primary",
      binding: binding("KeyO", { ctrl: true, alt: true }),
    }, "commands.open")
  })
})
