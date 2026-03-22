import { describe, test, expect } from "bun:test"
import { formatConfigValue } from "../../../src/tui/dashboard/configUtils"

describe("formatConfigValue", () => {
  test("string pass-through", () => {
    expect(formatConfigValue("code")).toBe("code")
  })

  test("boolean to string", () => {
    expect(formatConfigValue(true)).toBe("true")
    expect(formatConfigValue(false)).toBe("false")
  })

  test("number to string", () => {
    expect(formatConfigValue(42)).toBe("42")
    expect(formatConfigValue(0)).toBe("0")
  })

  test("null returns empty string", () => {
    expect(formatConfigValue(null)).toBe("")
  })

  test("undefined returns empty string", () => {
    expect(formatConfigValue(undefined)).toBe("")
  })

  test("array of primitives joined with comma", () => {
    expect(formatConfigValue(["a", "b", "c"])).toBe("a, b, c")
    expect(formatConfigValue([1, 2, 3])).toBe("1, 2, 3")
  })

  test("niri columns array (objects with windows key) returns N cols", () => {
    const columns = [
      { width: "50%", windows: [{ app: "foot" }] },
      { windows: [{ source: "vscode" }] },
    ]
    expect(formatConfigValue(columns)).toBe("2 cols")
  })

  test("niri single column returns 1 col (singular)", () => {
    const columns = [{ windows: [{ app: "foot" }] }]
    expect(formatConfigValue(columns)).toBe("1 col")
  })

  test("generic object returns compact JSON", () => {
    expect(formatConfigValue({ nested: "obj" })).toBe(JSON.stringify({ nested: "obj" }))
  })

  test("array of generic objects (no windows key) returns compact JSON", () => {
    const arr = [{ foo: "bar" }, { baz: 1 }]
    expect(formatConfigValue(arr)).toBe(JSON.stringify(arr))
  })
})
