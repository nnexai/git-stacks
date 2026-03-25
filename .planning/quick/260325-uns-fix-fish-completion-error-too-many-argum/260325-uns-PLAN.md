---
phase: quick
plan: 260325-uns
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/completion-generator.ts
  - tests/lib/completion-generator.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Fish completion script parses without errors when descriptions contain single quotes"
    - "Zsh completion script parses without errors when descriptions contain single quotes"
    - "Bash completion continues to work (unaffected by change)"
  artifacts:
    - path: "src/lib/completion-generator.ts"
      provides: "Shell-safe description escaping for all generators"
      contains: "shellEscapeSingleQuote"
    - path: "tests/lib/completion-generator.test.ts"
      provides: "Tests verifying quote escaping in fish and zsh output"
  key_links:
    - from: "src/lib/completion-generator.ts"
      to: "fish/zsh completion output"
      via: "shellEscapeSingleQuote applied to all description interpolations inside single-quoted strings"
      pattern: "shellEscapeSingleQuote\\(.*\\.description\\)"
---

<objective>
Fix fish shell completion error "too many arguments" at line 244 of git-stacks.fish caused by unescaped single quotes in command descriptions.

Purpose: Descriptions like "Attach to a workspace's tmux session" break single-quoted strings in fish and zsh completion scripts. The apostrophe in "workspace's" terminates the string early, causing a parse error.

Output: Patched completion-generator.ts with proper single-quote escaping for fish and zsh generators, plus tests proving the fix.
</objective>

<execution_context>
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/workflows/execute-plan.md
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/completion-generator.ts
@tests/lib/completion-generator.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add single-quote escaping helper and apply to all fish/zsh description interpolations</name>
  <files>src/lib/completion-generator.ts, tests/lib/completion-generator.test.ts</files>
  <behavior>
    - Test: fish output for a command with apostrophe in description (e.g., "workspace's") produces escaped form `workspace'\''s` inside single-quoted `-d` argument
    - Test: zsh output for a command with apostrophe in description produces escaped form in `_describe` arrays and `_arguments` specs
    - Test: existing tests continue to pass (no regression)
  </behavior>
  <action>
    1. In `src/lib/completion-generator.ts`, add a helper near the top (after the imports/types section, before `buildNode`):

    ```typescript
    /** Escape single quotes for embedding in single-quoted shell strings: ' -> '\'' */
    function shellEscapeSingleQuote(s: string): string {
      return s.replace(/'/g, "'\\''")
    }
    ```

    2. Apply `shellEscapeSingleQuote()` to every `description` interpolation inside a single-quoted string. All affected lines:

    **Fish generator (`generateFish` and `emitFishSubcommands`):**
    - Line 609: `-d '${sub.description}'` -> `-d '${shellEscapeSingleQuote(sub.description)}'`
    - Line 618: `-d '${opt.description}'` -> `-d '${shellEscapeSingleQuote(opt.description)}'`
    - Line 705: `-d '${node.description}'` -> `-d '${shellEscapeSingleQuote(node.description)}'`
    - Line 723: `-d '${opt.description}'` -> `-d '${shellEscapeSingleQuote(opt.description)}'`

    **Zsh generator (`zshOptionSpec`, `generateZshSubcmdHelperRecursive`, `generateZsh`):**
    - Line 370: `'${opt.long}[${opt.description}]...'` -> `'${opt.long}[${shellEscapeSingleQuote(opt.description)}]...'`
    - Line 376: same pattern
    - Line 378: same pattern
    - Line 449: `'${sub.name}:${sub.description}'` -> `'${sub.name}:${shellEscapeSingleQuote(sub.description)}'`
    - Line 555: `'${node.name}:${node.description}'` -> `'${node.name}:${shellEscapeSingleQuote(node.description)}'`

    Do NOT escape descriptions in bash generator — bash uses `$'...'` or double-quoted strings where single quotes are safe. Verify by checking bash output format.

    3. In `tests/lib/completion-generator.test.ts`, add a command with an apostrophe to `buildTestProgram()`:

    Add before `return program`:
    ```typescript
    // tmux-like subcommand with apostrophe in description (quote escaping test)
    program
      .command("attach <name>")
      .description("Attach to a workspace's tmux session")
    ```

    Then add test cases:

    In `describe("generateFish")`:
    ```typescript
    test("escapes single quotes in descriptions", () => {
      const out = generateFish(buildTestProgram())
      // The description must not contain a raw unescaped apostrophe inside the -d '...' string
      // Correct escaping: -d 'Attach to a workspace'\''s tmux session'
      expect(out).toContain("workspace'\\''s tmux session")
      expect(out).not.toContain("-d 'Attach to a workspace's tmux session'")
    })
    ```

    In `describe("generateZsh")`:
    ```typescript
    test("escapes single quotes in descriptions", () => {
      const out = generateZsh(buildTestProgram())
      // Zsh _describe arrays use 'name:description' — apostrophes must be escaped
      expect(out).toContain("workspace'\\''s tmux session")
      expect(out).not.toContain("'attach:Attach to a workspace's tmux session'")
    })
    ```
  </action>
  <verify>
    <automated>cd /home/nnex/dev/prj/git-stacks && bun test tests/lib/completion-generator.test.ts</automated>
  </verify>
  <done>
    - shellEscapeSingleQuote helper exists and is applied to all 9 description interpolation sites in fish and zsh generators
    - New tests pass confirming apostrophes are escaped in both fish and zsh output
    - All existing completion-generator tests continue to pass
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify fix against real CLI program and regenerate completions</name>
  <files>none (verification only)</files>
  <action>
    1. Run the real CLI to generate fish completions and verify no parse errors:
       ```
       bun run src/index.ts completion fish > /tmp/git-stacks-fish-test.fish
       fish -c "source /tmp/git-stacks-fish-test.fish" 2>&1
       ```
       Expect: no output (clean source), exit code 0.

    2. Run the real CLI to generate zsh completions and verify syntax:
       ```
       bun run src/index.ts completion zsh > /tmp/git-stacks-zsh-test.zsh
       zsh -c "source /tmp/git-stacks-zsh-test.zsh" 2>&1
       ```
       Expect: no output, exit code 0.

    3. Grep the generated fish file for the tmux description to confirm escaping:
       ```
       grep "workspace" /tmp/git-stacks-fish-test.fish | grep -i "tmux\|attach\|niri"
       ```
       Confirm the apostrophe is escaped as `'\''` not raw `'`.

    4. Run `bun run typecheck` to confirm no type errors introduced.

    5. Run full test suite: `bun test tests/` to confirm no regressions.
  </action>
  <verify>
    <automated>cd /home/nnex/dev/prj/git-stacks && bun run src/index.ts completion fish > /tmp/gs-fish-check.fish && fish -c "source /tmp/gs-fish-check.fish" 2>&1 && echo "FISH_OK" && bun run src/index.ts completion zsh > /tmp/gs-zsh-check.zsh && zsh -c "source /tmp/gs-zsh-check.zsh" 2>&1 && echo "ZSH_OK" && bun run typecheck && bun test tests/</automated>
  </verify>
  <done>
    - Fish completion script sources without errors (no "too many arguments")
    - Zsh completion script sources without errors
    - Typecheck passes
    - Full test suite passes
  </done>
</task>

</tasks>

<verification>
1. `bun test tests/lib/completion-generator.test.ts` — all tests pass including new escaping tests
2. `fish -c "source <(bun run src/index.ts completion fish)"` — no parse errors
3. `bun run typecheck` — no type errors
4. `bun test tests/` — full suite green
</verification>

<success_criteria>
- Fish completion script generated by `git-stacks completion fish` sources cleanly in fish shell with no "too many arguments" error
- Zsh completion script handles descriptions with apostrophes correctly
- All existing and new tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/260325-uns-fix-fish-completion-error-too-many-argum/260325-uns-SUMMARY.md`
</output>
