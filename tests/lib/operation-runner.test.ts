import { describe, test, expect } from "bun:test"
import { createRunner } from "@/lib/operation-runner"

describe("operation-runner", () => {
  describe("happy path", () => {
    test("runs forwards in order, never invokes undos, returns ok:true", async () => {
      const forwardOrder: string[] = []
      const undoOrder: string[] = []
      const messages: string[] = []
      const runner = createRunner((m) => messages.push(m))

      await runner.do(
        "A",
        async () => {
          forwardOrder.push("A")
        },
        async () => {
          undoOrder.push("A")
        }
      )
      await runner.do(
        "B",
        async () => {
          forwardOrder.push("B")
        },
        async () => {
          undoOrder.push("B")
        }
      )
      await runner.do(
        "C",
        async () => {
          forwardOrder.push("C")
        },
        async () => {
          undoOrder.push("C")
        }
      )

      const result = runner.result()
      expect(result.ok).toBe(true)
      expect(forwardOrder).toEqual(["A", "B", "C"])
      expect(undoOrder).toEqual([])
      expect(messages.filter((m) => m.startsWith("Rollback"))).toEqual([])
    })

    test("supports closures over earlier-step values (imperative API per D-04)", async () => {
      // Test 8: forward function uses values from earlier steps via closure.
      // Verifies the imperative API (do/do/do) supports closures rather than
      // requiring a declarative pre-built step list.
      const runner = createRunner()
      let producedByA = 0
      let bSawFromA = -1

      await runner.do(
        "A",
        async () => {
          producedByA = 42
        },
        async () => {}
      )
      await runner.do(
        "B",
        async () => {
          // B closes over the value produced by A
          bSawFromA = producedByA
        },
        async () => {}
      )

      const result = runner.result()
      expect(result.ok).toBe(true)
      expect(bSawFromA).toBe(42)
    })
  })

  describe("rollback on forward failure (LIFO per D-05)", () => {
    test("undos run in reverse order when a forward throws", async () => {
      // Test 2: A and B succeed, C throws. Undos run B then A (LIFO).
      const forwardOrder: string[] = []
      const undoOrder: string[] = []
      const messages: string[] = []
      const runner = createRunner((m) => messages.push(m))

      try {
        await runner.do(
          "A",
          async () => {
            forwardOrder.push("A")
          },
          async () => {
            undoOrder.push("A")
          }
        )
        await runner.do(
          "B",
          async () => {
            forwardOrder.push("B")
          },
          async () => {
            undoOrder.push("B")
          }
        )
        await runner.do(
          "C",
          async () => {
            forwardOrder.push("C")
            throw new Error("C boom")
          },
          async () => {
            undoOrder.push("C")
          }
        )
      } catch {
        /* expected — caller calls result() */
      }

      const result = runner.result()
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("C boom")
        expect(result.rollbackErrors).toEqual([])
      }
      expect(forwardOrder).toEqual(["A", "B", "C"])
      // LIFO: B's undo runs before A's; C's undo never pushed.
      expect(undoOrder).toEqual(["B", "A"])
      // Messages reflect the same LIFO order.
      const rollbackMessages = messages.filter((m) => m.startsWith("Rollback"))
      expect(rollbackMessages).toEqual(["Rollback: B", "Rollback: A"])
    })

    test("never invokes the failing step's own undo (it was never pushed)", async () => {
      // C's undo must NOT run because C's forward failed before push.
      const undoOrder: string[] = []
      const runner = createRunner()

      try {
        await runner.do(
          "A",
          async () => {},
          async () => {
            undoOrder.push("A")
          }
        )
        await runner.do(
          "C",
          async () => {
            throw new Error("C boom")
          },
          async () => {
            undoOrder.push("C")
          }
        )
      } catch {
        /* expected */
      }

      expect(undoOrder).toEqual(["A"])
      expect(undoOrder).not.toContain("C")
    })

    test("preserves the forward error verbatim in result.error (D-17)", async () => {
      // Test 5: forward error preservation. Even when rollback also produces
      // errors, result.error must be the EXACT forward error message.
      const sentinel = "specific forward failure msg 9f3a2b"
      const runner = createRunner()

      try {
        await runner.do(
          "A",
          async () => {},
          async () => {
            throw new Error("undo also blew up")
          }
        )
        await runner.do(
          "C",
          async () => {
            throw new Error(sentinel)
          },
          async () => {}
        )
      } catch {
        /* expected */
      }

      const result = runner.result()
      expect(result.ok).toBe(false)
      if (!result.ok) {
        // The forward error is preserved verbatim — NOT replaced by rollback content.
        expect(result.error).toBe(sentinel)
        // The rollback error is supplementary, not a replacement.
        expect(result.rollbackErrors.length).toBe(1)
        expect(result.rollbackErrors[0]).toContain("Rollback error: A failed")
      }
    })
  })

  describe("undo failure handling (best-effort per ENGN-03)", () => {
    test("a single failing undo does not abort remaining undos", async () => {
      // Test 3: A and B succeed, C throws. B's undo throws — A's undo still runs.
      const undoOrder: string[] = []
      const messages: string[] = []
      const runner = createRunner((m) => messages.push(m))

      try {
        await runner.do(
          "A",
          async () => {},
          async () => {
            undoOrder.push("A")
          }
        )
        await runner.do(
          "B",
          async () => {},
          async () => {
            undoOrder.push("B")
            throw new Error("B undo fail")
          }
        )
        await runner.do(
          "C",
          async () => {
            throw new Error("C boom")
          },
          async () => {}
        )
      } catch {
        /* expected */
      }

      // B's undo ran (and failed), then A's undo ran (LIFO order).
      expect(undoOrder).toEqual(["B", "A"])

      const result = runner.result()
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("C boom")
        expect(result.rollbackErrors.length).toBe(1)
        expect(result.rollbackErrors[0]).toMatch(/^Rollback error: B failed \(/)
      }

      // Ordering of progress messages: rollback message for B → error message
      // for B → rollback message for A. The failing undo's error is reported
      // during its own pop, not at the end.
      const idxRollbackB = messages.indexOf("Rollback: B")
      const idxErrorB = messages.findIndex((m) => m.startsWith("Rollback error: B failed"))
      const idxRollbackA = messages.indexOf("Rollback: A")
      expect(idxRollbackB).toBeGreaterThanOrEqual(0)
      expect(idxErrorB).toBeGreaterThan(idxRollbackB)
      expect(idxRollbackA).toBeGreaterThan(idxErrorB)
    })

    test("multiple failing undos are all collected in rollbackErrors", async () => {
      // Test 4: A, B, C succeed; D throws. C and A undos throw; B undo succeeds.
      // All three undos must be attempted (best-effort), and both failures must
      // appear in rollbackErrors in LIFO pop order (C first, then A).
      const undoOrder: string[] = []
      const runner = createRunner()

      try {
        await runner.do(
          "A",
          async () => {},
          async () => {
            undoOrder.push("A")
            throw new Error("A undo fail")
          }
        )
        await runner.do(
          "B",
          async () => {},
          async () => {
            undoOrder.push("B")
          }
        )
        await runner.do(
          "C",
          async () => {},
          async () => {
            undoOrder.push("C")
            throw new Error("C undo fail")
          }
        )
        await runner.do(
          "D",
          async () => {
            throw new Error("D boom")
          },
          async () => {}
        )
      } catch {
        /* expected */
      }

      // All three undos attempted in LIFO order: C, B, A.
      expect(undoOrder).toEqual(["C", "B", "A"])

      const result = runner.result()
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("D boom")
        expect(result.rollbackErrors.length).toBe(2)
        expect(result.rollbackErrors[0]).toMatch(/^Rollback error: C failed \(/)
        expect(result.rollbackErrors[1]).toMatch(/^Rollback error: A failed \(/)
      }
    })

    test("rollbackErrors strings match the 'Rollback error: <name> failed (...)' format", async () => {
      const runner = createRunner()

      try {
        await runner.do(
          "stepX",
          async () => {},
          async () => {
            throw new Error("permission denied")
          }
        )
        await runner.do(
          "trigger",
          async () => {
            throw new Error("trigger boom")
          },
          async () => {}
        )
      } catch {
        /* expected */
      }

      const result = runner.result()
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.rollbackErrors[0]).toBe("Rollback error: stepX failed (permission denied)")
      }
    })
  })

  describe("progress messaging (D-14, D-15, D-16)", () => {
    test("rollback messages flow through onProgress with 'Rollback: ' prefix", async () => {
      const messages: string[] = []
      const runner = createRunner((m) => messages.push(m))

      try {
        await runner.do(
          "first",
          async () => {},
          async () => {}
        )
        await runner.do(
          "second",
          async () => {
            throw new Error("boom")
          },
          async () => {}
        )
      } catch {
        /* expected */
      }

      expect(messages).toContain("Rollback: first")
      // Runner does not auto-emit on successful forwards.
      expect(messages.some((m) => m === "first" || m === "Forward: first")).toBe(false)
    })

    test("undo failure messages flow through onProgress with 'Rollback error: ' prefix", async () => {
      const messages: string[] = []
      const runner = createRunner((m) => messages.push(m))

      try {
        await runner.do(
          "alpha",
          async () => {},
          async () => {
            throw new Error("disk full")
          }
        )
        await runner.do(
          "beta",
          async () => {
            throw new Error("trigger")
          },
          async () => {}
        )
      } catch {
        /* expected */
      }

      expect(messages.some((m) => m.startsWith("Rollback error: alpha failed"))).toBe(true)
    })

    test("rollbackErrors array mirrors the streamed undo-failure messages (D-16)", async () => {
      const messages: string[] = []
      const runner = createRunner((m) => messages.push(m))

      try {
        await runner.do(
          "one",
          async () => {},
          async () => {
            throw new Error("fail one")
          }
        )
        await runner.do(
          "two",
          async () => {},
          async () => {
            throw new Error("fail two")
          }
        )
        await runner.do(
          "three",
          async () => {
            throw new Error("trigger")
          },
          async () => {}
        )
      } catch {
        /* expected */
      }

      const result = runner.result()
      expect(result.ok).toBe(false)
      if (!result.ok) {
        // Each rollbackErrors entry must also have been streamed through onProgress.
        for (const err of result.rollbackErrors) {
          expect(messages).toContain(err)
        }
        expect(result.rollbackErrors.length).toBe(2)
      }
    })

    test("onProgress is optional — runner does not throw when omitted", async () => {
      // Test 6: runner constructed without onProgress. Triggering rollback
      // (and undo failures) does NOT throw — the runner guards the optional
      // callback. Result still contains correct rollbackErrors.
      const runner = createRunner()

      try {
        await runner.do(
          "a",
          async () => {},
          async () => {
            throw new Error("a undo fail")
          }
        )
        await runner.do(
          "b",
          async () => {
            throw new Error("b boom")
          },
          async () => {}
        )
      } catch {
        /* expected */
      }

      const result = runner.result()
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("b boom")
        expect(result.rollbackErrors.length).toBe(1)
        expect(result.rollbackErrors[0]).toMatch(/^Rollback error: a failed \(/)
      }
    })
  })

  describe("empty stack (Test 7)", () => {
    test("constructing a runner and never calling do is harmless and returns ok", () => {
      const runner = createRunner()
      const result = runner.result()
      expect(result.ok).toBe(true)
    })
  })
})
