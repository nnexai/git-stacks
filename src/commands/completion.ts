import { Command } from "commander"

const WORKSPACE_CMDS = "open status clean"
const STACK_SUBCMDS = "new init edit list show"
const STACK_NAME_CMDS = "edit show"
const TOP_LEVEL = "new open list status clean stack config completion"

function bashCompletion(): string {
  return `# bash completion for ws
# Add to ~/.bashrc:  eval "$(ws completion bash)"
_ws_complete() {
  local cur prev words cword
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  words=("\${COMP_WORDS[@]}")

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=($(compgen -W "${TOP_LEVEL}" -- "$cur"))
    return 0
  fi

  case "\${words[1]}" in
    ${WORKSPACE_CMDS.split(" ").join("|")})
      local names
      names=$(ls "$HOME/.config/ws/workspaces" 2>/dev/null | sed 's/\\.yml$//')
      COMPREPLY=($(compgen -W "$names" -- "$cur"))
      return 0
      ;;
    stack)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=($(compgen -W "${STACK_SUBCMDS}" -- "$cur"))
      elif [[ \${COMP_CWORD} -eq 3 ]] && [[ "\${words[2]}" == @(${STACK_NAME_CMDS.split(" ").join("|")}) ]]; then
        local names
        names=$(ls "$HOME/.config/ws/stacks" 2>/dev/null | sed 's/\\.yml$//')
        COMPREPLY=($(compgen -W "$names" -- "$cur"))
      fi
      return 0
      ;;
    completion)
      COMPREPLY=($(compgen -W "bash zsh fish" -- "$cur"))
      return 0
      ;;
  esac
}
complete -F _ws_complete ws
`
}

function zshCompletion(): string {
  return `#compdef ws
# zsh completion for ws
# Add to ~/.zshrc:  eval "$(ws completion zsh)"
_ws() {
  local context state line
  typeset -A opt_args

  _arguments -C \\
    '1: :_ws_top_commands' \\
    '*:: :->subcmd'

  case $state in
    subcmd)
      case $words[1] in
        open|status|clean)
          _ws_workspaces ;;
        stack)
          _ws_stack ;;
        completion)
          _values 'shell' bash zsh fish ;;
      esac
      ;;
  esac
}

_ws_top_commands() {
  local cmds
  cmds=(
    'new:Create a new workspace'
    'open:Open a workspace'
    'list:List all workspaces'
    'status:Show workspace status'
    'clean:Remove worktrees for a workspace'
    'stack:Manage stack definitions'
    'config:View and edit global configuration'
    'completion:Generate shell completion scripts'
  )
  _describe 'command' cmds
}

_ws_workspaces() {
  local ws_dir="$HOME/.config/ws/workspaces"
  local workspaces=(\${ws_dir}/*.yml(N:t:r))
  _values 'workspace' $workspaces
}

_ws_stacks() {
  local stacks_dir="$HOME/.config/ws/stacks"
  local stacks=(\${stacks_dir}/*.yml(N:t:r))
  _values 'stack' $stacks
}

_ws_stack() {
  if (( CURRENT == 2 )); then
    local subcmds
    subcmds=(
      'new:Define a new stack interactively'
      'init:Initialize from a directory of repos'
      'edit:Edit an existing stack'
      'list:List all stacks'
      'show:Show stack details'
    )
    _describe 'subcommand' subcmds
  else
    case $words[2] in
      edit|show)
        _ws_stacks ;;
    esac
  fi
}

_ws
`
}

function fishCompletion(): string {
  return `# fish completion for ws
# Add to ~/.config/fish/config.fish:  ws completion fish | source

function __ws_workspaces
  set -l ws_dir "$HOME/.config/ws/workspaces"
  if test -d $ws_dir
    ls $ws_dir | sed 's/\\.yml\$//'
  end
end

function __ws_stacks
  set -l stacks_dir "$HOME/.config/ws/stacks"
  if test -d $stacks_dir
    ls $stacks_dir | sed 's/\\.yml\$//'
  end
end

function __ws_no_subcommand
  not __fish_seen_subcommand_from new open list status clean stack config completion
end

# Top-level completions
complete -c ws -f -n __ws_no_subcommand -a new       -d 'Create a new workspace'
complete -c ws -f -n __ws_no_subcommand -a open      -d 'Open a workspace'
complete -c ws -f -n __ws_no_subcommand -a list      -d 'List all workspaces'
complete -c ws -f -n __ws_no_subcommand -a status    -d 'Show workspace status'
complete -c ws -f -n __ws_no_subcommand -a clean     -d 'Remove worktrees for a workspace'
complete -c ws -f -n __ws_no_subcommand -a stack     -d 'Manage stack definitions'
complete -c ws -f -n __ws_no_subcommand -a config    -d 'View and edit global configuration'
complete -c ws -f -n __ws_no_subcommand -a completion -d 'Generate shell completion scripts'

# Workspace name completions
for cmd in open status clean
  complete -c ws -f -n "__fish_seen_subcommand_from $cmd" -a "(__ws_workspaces)"
end

# Stack subcommands
complete -c ws -f -n '__fish_seen_subcommand_from stack; and not __fish_seen_subcommand_from new init edit list show' \\
  -a 'new'  -d 'Define a new stack interactively'
complete -c ws -f -n '__fish_seen_subcommand_from stack; and not __fish_seen_subcommand_from new init edit list show' \\
  -a 'init' -d 'Initialize from a directory'
complete -c ws -f -n '__fish_seen_subcommand_from stack; and not __fish_seen_subcommand_from new init edit list show' \\
  -a 'edit' -d 'Edit a stack'
complete -c ws -f -n '__fish_seen_subcommand_from stack; and not __fish_seen_subcommand_from new init edit list show' \\
  -a 'list' -d 'List all stacks'
complete -c ws -f -n '__fish_seen_subcommand_from stack; and not __fish_seen_subcommand_from new init edit list show' \\
  -a 'show' -d 'Show stack details'

for cmd in edit show
  complete -c ws -f -n "__fish_seen_subcommand_from stack; and __fish_seen_subcommand_from $cmd" \\
    -a "(__ws_stacks)"
end

# Completion shell options
complete -c ws -f -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'
`
}

export const completionCommand = new Command("completion")
  .description("Generate shell completion scripts")
  .argument("[shell]", "Shell type: bash, zsh, or fish")
  .action((shell?: string) => {
    if (!shell) {
      console.log("Usage: ws completion [bash|zsh|fish]")
      console.log("\nAdd to your shell profile:")
      console.log('  bash:  eval "$(ws completion bash)"')
      console.log('  zsh:   eval "$(ws completion zsh)"')
      console.log("  fish:  ws completion fish | source")
      return
    }
    switch (shell) {
      case "bash": process.stdout.write(bashCompletion()); break
      case "zsh":  process.stdout.write(zshCompletion());  break
      case "fish": process.stdout.write(fishCompletion()); break
      default:
        console.error(`Unknown shell '${shell}'. Supported: bash, zsh, fish`)
        process.exit(1)
    }
  })
