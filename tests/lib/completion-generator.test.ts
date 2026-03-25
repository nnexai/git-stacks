import { describe, test, expect } from "bun:test"
import { Command } from "commander"
import { generateBash, generateZsh, generateFish } from "../../src/lib/completion-generator"

function buildTestProgram(): Command {
  const program = new Command()
  program.name("git-stacks").description("Test workspace manager")

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

  program
    .command("list")
    .description("List all workspaces")
    .option("--sort <key>", "Sort by: date, name, status", "date")

  const repoCmd = new Command("repo").description("Manage repo registry")
  repoCmd.command("add <path>").description("Register a repo from a local path")
  repoCmd.command("list").description("List registered repos")
  repoCmd.command("show <name>").description("Show repo details")
  repoCmd.command("remove <name>").description("Remove a repo from the registry")
  repoCmd.command("rename <name> <new-name>").description("Rename a registered repo")
  program.addCommand(repoCmd)

  const templateCmd = new Command("template").description("Manage workspace templates")
  templateCmd.command("new [name]").description("Create a new template interactively")
  templateCmd.command("list").description("List all templates")
  templateCmd.command("show <name>").description("Show template details")
  templateCmd.command("edit <name>").description("Edit an existing template")
  templateCmd.command("clone <name> <new-name>").description("Clone a template under a new name")
  templateCmd.command("rename <name> <new-name>").description("Rename a template")
  templateCmd.command("remove <name>").description("Remove a template")
  program.addCommand(templateCmd)

  program
    .command("completion [shell]")
    .description("Generate shell completion scripts")

  // sync command (has --strategy flag for OPTION_ENUMS testing)
  program
    .command("sync [name]")
    .description("Sync workspace branches")
    .option("--all", "Sync all workspaces")
    .option("--strategy <strategy>", "Sync strategy: rebase or merge")

  // new command (has --from for COMMAND_FLAG_COMPLETIONS testing)
  program
    .command("new [name]")
    .description("Create a new workspace interactively")
    .option("--from <source>", "Create from template name or local repo path")

  // close command (should complete workspace names)
  program
    .command("close <name>")
    .description("Close a workspace without deleting it")

  // message command group (for CMPL-05, CMPL-06 testing)
  const messageCmd = new Command("message").description("Workspace notifications")
  messageCmd
    .command("send <text>")
    .description("Send a notification")
    .option("--workspace <name>", "Target workspace")
    .option("--from <sender>", "Sender name")
  messageCmd
    .command("list")
    .description("List notifications")
    .option("--workspace <name>", "Target workspace")
    .option("--json", "Output as JSON")
  messageCmd
    .command("clear")
    .description("Clear notifications")
    .option("--workspace <name>", "Target workspace")
    .option("--from <sender>", "Clear by sender")
  program.addCommand(messageCmd)

  // integration command tree (3-4 level nesting)
  const integrationCmd = new Command("integration").description("Manage integrations")

  const githubCmd = new Command("github").description("GitHub integration")
  githubCmd.command("open [workspace]").description("Open GitHub repo in browser")

  const ghPrCmd = new Command("pr").description("Pull request operations")
  ghPrCmd.command("create <workspace>").description("Create a pull request")
  ghPrCmd.command("open <workspace>").description("Open PR in browser")
  ghPrCmd.command("status <workspace>").description("Show PR status")
  githubCmd.addCommand(ghPrCmd)

  const ghIssueCmd = new Command("issue").description("Issue operations")
  ghIssueCmd.command("link [workspace]").description("Link an issue")
  ghIssueCmd.command("unlink [workspace]").description("Unlink an issue")
  ghIssueCmd.command("open [workspace]").description("Open issue in browser")
  githubCmd.addCommand(ghIssueCmd)

  integrationCmd.addCommand(githubCmd)
  program.addCommand(integrationCmd)

  return program
}

describe("generateBash", () => {
  test("includes all top-level command names", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain("open clone clean remove merge list repo template completion")
  })

  test("workspace dynamic lookup for clone (no flags)", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain("    clone)")
    expect(out).toContain(".config/git-stacks/workspaces")
  })

  test("flag split for open (has flags + workspace)", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain("    open)")
    expect(out).toContain("$cur\" == -*")
    expect(out).toContain("--no-ide")
    expect(out).toContain("--no-cmux")
    expect(out).toContain(".config/git-stacks/workspaces")
  })

  test("flag split for clean includes --gone and --force", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain("    clean)")
    expect(out).toContain("--gone")
    expect(out).toContain("--force")
  })

  test("repo subcommands block", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain("    repo)")
    expect(out).toContain("COMP_CWORD} -eq 2")
    expect(out).toContain("add list show remove rename")
    expect(out).toContain("@(show|remove|rename)")
    expect(out).toContain(".config/git-stacks/registry.yml")
  })

  test("template subcommands block", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain("    template)")
    expect(out).toContain("new list show edit clone rename remove")
    expect(out).toContain(".config/git-stacks/templates")
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
  test("includes all top-level commands in _git_stacks_top_commands", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("'open:Open a workspace'")
    expect(out).toContain("'clone:Clone a workspace'")
    expect(out).toContain("'repo:Manage repo registry'")
    expect(out).toContain("'template:Manage workspace templates'")
    expect(out).toContain("'completion:Generate shell completion scripts'")
  })

  test("open uses _arguments with --no-ide and --no-cmux", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("'--no-ide[Skip opening IDEs]'")
    expect(out).toContain("'--no-cmux[Skip cmux session]'")
    expect(out).toContain("': :_git_stacks_workspaces'")
  })

  test("clean uses optional positional spec", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("':: :_git_stacks_workspaces'")
  })

  test("remove uses required positional spec", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("'--force[Skip dirty worktree check]'")
    // remove has required arg, so ': :_git_stacks_workspaces'
    expect(out).toContain("': :_git_stacks_workspaces'")
  })

  test("clone delegates to _git_stacks_workspaces directly", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("_git_stacks_workspaces")
  })

  test("repo delegates to _git_stacks_repo helper", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("_git_stacks_repo ;;")
    expect(out).toContain("_git_stacks_repo()")
    expect(out).toContain("'show:Show repo details'")
    expect(out).toContain("'remove:Remove a repo from the registry'")
    expect(out).toContain("show|remove|rename)")
    expect(out).toContain("_git_stacks_repos")
  })

  test("template delegates to _git_stacks_template helper", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("_git_stacks_template ;;")
    expect(out).toContain("_git_stacks_template()")
    expect(out).toContain("'show:Show template details'")
    expect(out).toContain("'edit:Edit an existing template'")
    expect(out).toContain("_git_stacks_templates")
  })

  test("completion uses _values 'shell'", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("_values 'shell' bash zsh fish")
  })

  test("includes static helpers", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("_git_stacks_workspaces()")
    expect(out).toContain("_git_stacks_repos()")
    expect(out).toContain("_git_stacks_templates()")
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
    expect(out).toContain("-a repo")
    expect(out).toContain("-a template")
    expect(out).toContain("-a completion")
  })

  test("workspace completions grouped in for loop", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("for cmd in open clone clean remove merge")
    expect(out).toContain("(__git_stacks_workspaces)")
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

  test("repo subcommand completions", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("__fish_seen_subcommand_from repo")
    expect(out).toContain("-a 'show'")
    expect(out).toContain("-a 'remove'")
    expect(out).toContain("(__git_stacks_repos)")
  })

  test("template subcommand completions", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("__fish_seen_subcommand_from template")
    expect(out).toContain("-a 'edit'")
    expect(out).toContain("(__git_stacks_templates)")
  })

  test("__git_stacks_no_subcommand includes all top-level names", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("not __fish_seen_subcommand_from open clone clean remove merge list repo template completion")
  })

  test("completion shell options directive", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("__fish_seen_subcommand_from completion")
    expect(out).toContain("-a 'bash zsh fish'")
  })

  test("includes shell wrapper", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("function git-stacks")
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

describe("OPTION_ENUMS - fixed-choice flag values", () => {
  test("bash: --strategy prev-word completes to rebase merge", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain('"--strategy"')
    expect(out).toContain('compgen -W "rebase merge"')
  })

  test("bash: --sort prev-word completes to date name status", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain('"--sort"')
    expect(out).toContain('compgen -W "date name status"')
  })

  test("zsh: --strategy gets enum completion", () => {
    const out = generateZsh(buildTestProgram())
    // zsh uses '--strategy[...]:strategy:(rebase merge)' pattern
    expect(out).toContain("rebase merge")
    expect(out).toContain("strategy")
  })

  test("zsh: --sort gets enum completion", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("date name status")
    expect(out).toContain("sort")
  })

  test("fish: --strategy has -a with enum values", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("rebase merge")
    expect(out).toContain("strategy")
  })

  test("fish: --sort has -a with enum values", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("date name status")
    expect(out).toContain("sort")
  })
})

describe("FLAG_COMPLETIONS - --workspace flag value", () => {
  test("bash: --workspace prev-word triggers workspace lookup", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain('"--workspace"')
    expect(out).toContain('.config/git-stacks/workspaces')
  })

  test("zsh: --workspace flag gets workspace completion", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("--workspace")
    expect(out).toContain("_git_stacks_workspaces")
  })

  test("fish: --workspace flag gets workspace completion", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("workspace")
    expect(out).toContain("__git_stacks_workspaces")
  })
})

describe("message subcommand tree", () => {
  test("bash: message case includes send list clear subcommands", () => {
    const out = generateBash(buildTestProgram())
    expect(out).toContain("    message)")
    expect(out).toContain("send list clear")
  })

  test("zsh: message subcommand helper exists", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("_git_stacks_message()")
    expect(out).toContain("'send:Send a notification'")
    expect(out).toContain("'list:List notifications'")
    expect(out).toContain("'clear:Clear notifications'")
  })

  test("fish: message subcommands appear", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("__fish_seen_subcommand_from message")
    expect(out).toContain("-a 'send'")
    expect(out).toContain("-a 'list'")
    expect(out).toContain("-a 'clear'")
  })

  test("bash: message subcommands include workspace lookup for --workspace", () => {
    const out = generateBash(buildTestProgram())
    // message subcommand case should reference workspace completion
    expect(out).toContain("message)")
  })

  test("zsh: message top-level appears in command list", () => {
    const out = generateZsh(buildTestProgram())
    expect(out).toContain("'message:Workspace notifications'")
  })

  test("fish: message appears in top-level completions", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain("-a message")
  })
})

describe("COMMAND_FLAG_COMPLETIONS - per-command flag completions", () => {
  test("bash: new --from completes template names", () => {
    const out = generateBash(buildTestProgram())
    // Inside the new) case, $prev == --from should trigger template lookup
    expect(out).toContain('"--from")')
    expect(out).toContain('.config/git-stacks/templates')
  })

  test("zsh: new --from gets template completion in _arguments spec", () => {
    const out = generateZsh(buildTestProgram())
    // The --from flag in the new command should reference _git_stacks_templates
    // The _arguments spec should contain --from[...]:from:_git_stacks_templates
    expect(out).toContain("_git_stacks_templates")
    // And the from option in new command should use the template helper
    expect(out).toContain("--from[Create from template name or local repo path]:from:_git_stacks_templates")
  })

  test("fish: new --from completes template names", () => {
    const out = generateFish(buildTestProgram())
    expect(out).toContain(
      "complete -c git-stacks -f -n '__fish_seen_subcommand_from new' -l from -ra \"(__git_stacks_templates)\""
    )
  })

  test("message send --from has no template completion in bash", () => {
    const out = generateBash(buildTestProgram())
    // The global --from case in bash should not appear — only per-command via COMMAND_FLAG_COMPLETIONS
    // message.send --from is freeform, so no template lookup for it
    // Verify there's no template lookup associated with 'message' command context
    const messageSection = out.slice(out.indexOf("    message)"), out.indexOf("    message)") + 500)
    expect(messageSection).not.toContain('.config/git-stacks/templates')
  })

  test("message send --from has no template completion in fish", () => {
    const out = generateFish(buildTestProgram())
    // There should NOT be a per-command flag completion for message.send:--from
    expect(out).not.toContain(
      "__fish_seen_subcommand_from message; and __fish_seen_subcommand_from send' -l from -ra \"(__git_stacks_templates)\""
    )
  })
})

describe("close command - workspace completions", () => {
  test("bash: close appears in workspace completions case", () => {
    const out = generateBash(buildTestProgram())
    // close should have a case branch with workspace lookup
    expect(out).toContain("    close)")
    expect(out).toContain('.config/git-stacks/workspaces')
  })

  test("zsh: close gets workspace completion in case body", () => {
    const out = generateZsh(buildTestProgram())
    // close should map to _git_stacks_workspaces
    expect(out).toContain("        close)")
    expect(out).toContain("_git_stacks_workspaces")
  })

  test("fish: close in workspace completion for loop", () => {
    const out = generateFish(buildTestProgram())
    // close should appear in the for cmd in ... workspace loop
    expect(out).toMatch(/for cmd in[^\n]*\bclose\b/)
    expect(out).toContain("(__git_stacks_workspaces)")
  })
})

describe("integration nested completions (depth 3-4)", () => {
  describe("bash", () => {
    test("integration case lists provider names (github)", () => {
      const out = generateBash(buildTestProgram())
      expect(out).toContain("    integration)")
      expect(out).toContain("github")
    })

    test("integration github lists sub-subcommands (open pr issue)", () => {
      const out = generateBash(buildTestProgram())
      // Should have a nested case for github that lists its subcommands
      expect(out).toMatch(/github.*\n[\s\S]*?(open|pr|issue)/)
    })

    test("integration github pr lists leaf commands (create open status)", () => {
      const out = generateBash(buildTestProgram())
      // Should list pr subcommands at the correct depth
      expect(out).toContain("create open status")
    })

    test("integration github pr create triggers workspace lookup", () => {
      const out = generateBash(buildTestProgram())
      // At the leaf level, workspace lookup should appear after integration > github > pr > create
      const integrationSection = out.slice(out.indexOf("    integration)"))
      expect(integrationSection).toContain(".config/git-stacks/workspaces")
    })

    test("integration github issue link triggers workspace lookup", () => {
      const out = generateBash(buildTestProgram())
      const integrationSection = out.slice(out.indexOf("    integration)"))
      // issue subcommands should also have workspace lookup
      expect(integrationSection).toContain("link unlink open")
    })
  })

  describe("zsh", () => {
    test("integration dispatches to _git_stacks_integration helper", () => {
      const out = generateZsh(buildTestProgram())
      expect(out).toContain("_git_stacks_integration ;;")
    })

    test("_git_stacks_integration lists providers including github", () => {
      const out = generateZsh(buildTestProgram())
      expect(out).toContain("_git_stacks_integration()")
      expect(out).toContain("'github:GitHub integration'")
    })

    test("nested github subcommands generate recursive helpers or inline dispatch", () => {
      const out = generateZsh(buildTestProgram())
      // github has its own subcommands (open, pr, issue) so it should dispatch recursively
      // Either a _git_stacks_integration_github helper or inline case handling for pr/issue
      expect(out).toMatch(/_git_stacks_integration_github|github\)[\s\S]*?(pr|issue)/)
    })

    test("leaf commands with workspace dynamic get workspace completion", () => {
      const out = generateZsh(buildTestProgram())
      // Leaf commands like pr create should ultimately resolve to workspace completion
      const integrationSection = out.slice(out.indexOf("_git_stacks_integration()"))
      expect(integrationSection).toContain("_git_stacks_workspaces")
    })
  })

  describe("fish", () => {
    test("integration subcommands listed (github)", () => {
      const out = generateFish(buildTestProgram())
      // Should have a section listing integration subcommands when integration is seen
      expect(out).toContain("__fish_seen_subcommand_from integration")
      expect(out).toContain("github")
    })

    test("github sub-subcommands listed (open pr issue)", () => {
      const out = generateFish(buildTestProgram())
      // Should list github's subcommands with a multi-level fish_seen_subcommand_from chain
      expect(out).toMatch(/__fish_seen_subcommand_from integration.*__fish_seen_subcommand_from github/)
    })

    test("pr leaf commands listed (create open status)", () => {
      const out = generateFish(buildTestProgram())
      // At depth 3, should list pr's leaf commands with 3-level chain
      expect(out).toMatch(/__fish_seen_subcommand_from integration.*__fish_seen_subcommand_from github.*__fish_seen_subcommand_from pr/)
    })

    test("leaf commands get workspace completion", () => {
      const out = generateFish(buildTestProgram())
      // Leaf commands with workspace dynamic should get workspace lookup
      const integrationSection = out.slice(out.indexOf("# integration subcommands") > -1 ? out.indexOf("# integration subcommands") : 0)
      expect(integrationSection).toContain("(__git_stacks_workspaces)")
    })
  })
})
