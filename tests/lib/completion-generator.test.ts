import { describe, test, expect } from "bun:test"
import { Command } from "commander"
import { generateBash, generateZsh, generateFish } from "../../src/lib/completion-generator"

function buildTestProgram(): Command {
  const program = new Command()
  program.name("ws").description("Test workspace manager")

  program
    .command("open <name>")
    .description("Open a workspace")
    .option("--no-ide", "Skip opening IDEs")
    .option("--no-cmux", "Skip cmux session")

  program
    .command("clone [source]")
    .description("Clone a workspace")

  program
    .command("clean [name]")
    .description("Remove worktrees for a workspace")
    .option("--gone", "Remove workspaces with deleted remote branches")
    .option("--force", "Skip dirty worktree check")

  program
    .command("remove <name>")
    .description("Permanently remove a workspace")
    .option("--force", "Skip dirty worktree check")

  program
    .command("merge <name>")
    .description("Merge worktree branches")
    .option("--force", "Skip dirty worktree check")

  program.command("list").description("List all workspaces")

  const stackCmd = new Command("stack").description("Manage stack definitions")
  stackCmd.command("new").description("Define a new stack interactively")
  stackCmd.command("init [dir]").description("Initialize from a directory of repos")
  stackCmd.command("edit <name>").description("Edit an existing stack")
  stackCmd.command("list").description("List all stacks")
  stackCmd.command("show <name>").description("Show stack details")
  program.addCommand(stackCmd)

  program
    .command("completion [shell]")
    .description("Generate shell completion scripts")

  return program
}

describe("generateBash", () => {
  test("includes all top-level command names", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain("open clone clean remove merge list stack completion")
  })

  test("workspace dynamic lookup for clone (no flags)", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain("    clone)")
    expect(out).toContain(".config/ws/workspaces")
  })

  test("flag split for open (has flags + workspace)", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain("    open)")
    expect(out).toContain("$cur\" == -*")
    expect(out).toContain("--no-ide")
    expect(out).toContain("--no-cmux")
    expect(out).toContain(".config/ws/workspaces")
  })

  test("flag split for clean includes --gone and --force", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain("    clean)")
    expect(out).toContain("--gone")
    expect(out).toContain("--force")
  })

  test("stack subcommands block", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain("    stack)")
    expect(out).toContain("COMP_CWORD} -eq 2")
    expect(out).toContain("new init edit list show")
    expect(out).toContain("@(edit|show)")
    expect(out).toContain(".config/ws/stacks")
  })

  test("completion shells", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain("    completion)")
    expect(out).toContain('compgen -W "bash zsh fish"')
  })

  test("list has no case branch (no completion needed)", () => {
    const out = generateBash(buildTestProgram())
    // list has no flags and no dynamic completion
    expect(out).not.toContain("    list)")
  })

  test("includes shell wrapper for cd", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain('if [[ "$1" == "cd" ]]')
    expect(out).toContain("builtin cd")
  })

  test("adding a new command auto-appears in top-level names", () => {
    const p = buildTestProgram()
    p.command("frobnicate").description("A new command")
    const out = generateBash(p)
    expect(out).toContain("frobnicate")
  })
})

describe("generateZsh", () => {
  test("includes all top-level commands in _ws_top_commands", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("'open:Open a workspace'")
    expect(out).toContain("'clone:Clone a workspace'")
    expect(out).toContain("'stack:Manage stack definitions'")
    expect(out).toContain("'completion:Generate shell completion scripts'")
  })

  test("open uses _arguments with --no-ide and --no-cmux", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("'--no-ide[Skip opening IDEs]'")
    expect(out).toContain("'--no-cmux[Skip cmux session]'")
    expect(out).toContain("': :_ws_workspaces'")
  })

  test("clean uses optional positional spec", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("':: :_ws_workspaces'")
  })

  test("remove uses required positional spec", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("'--force[Skip dirty worktree check]'")
    // remove has required arg, so ': :_ws_workspaces'
    expect(out).toContain("': :_ws_workspaces'")
  })

  test("clone delegates to _ws_workspaces directly", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("_ws_workspaces")
  })

  test("stack delegates to _ws_stack helper", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("_ws_stack ;;")
    expect(out).toContain("_ws_stack()")
    expect(out).toContain("'new:Define a new stack interactively'")
    expect(out).toContain("'edit:Edit an existing stack'")
    expect(out).toContain("edit|show)")
    expect(out).toContain("_ws_stacks")
  })

  test("completion uses _values 'shell'", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("_values 'shell' bash zsh fish")
  })

  test("includes static helpers", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("_ws_workspaces()")
    expect(out).toContain("_ws_stacks()")
  })

  test("adding a new command auto-appears in top-level list", () => {
    const p = buildTestProgram()
    p.command("frobnicate").description("A new command")
    const out = generateZsh(p)
    expect(out).toContain("'frobnicate:A new command'")
  })
})

describe("generateFish", () => {
  test("top-level complete directives for all commands", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("-a open")
    expect(out).toContain("-a clone")
    expect(out).toContain("-a stack")
    expect(out).toContain("-a completion")
  })

  test("workspace completions grouped in for loop", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("for cmd in open clone clean remove merge")
    expect(out).toContain("(__ws_workspaces)")
  })

  test("flag directives for open use long names without --", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("-l no-ide")
    expect(out).toContain("-l no-cmux")
  })

  test("flag directives for clean", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("-l gone")
    expect(out).toContain("-l force")
  })

  test("stack subcommand completions", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("__fish_seen_subcommand_from stack")
    expect(out).toContain("-a 'new'")
    expect(out).toContain("-a 'edit'")
    expect(out).toContain("(__ws_stacks)")
  })

  test("__ws_no_subcommand includes all top-level names", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("not __fish_seen_subcommand_from open clone clean remove merge list stack completion")
  })

  test("completion shell options directive", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("__fish_seen_subcommand_from completion")
    expect(out).toContain("-a 'bash zsh fish'")
  })

  test("includes shell wrapper", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("function ws")
    expect(out).toContain("test \"$argv[1]\" = \"cd\"")
  })

  test("adding a new command auto-appears everywhere", () => {
    const p = buildTestProgram()
    p.command("frobnicate").description("A new command")
    const out = generateFish(p)
    expect(out).toContain("-a frobnicate")
    expect(out).toContain("frobnicate")
  })
})
