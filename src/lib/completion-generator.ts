import { Command } from "commander"

type DynamicCompletion = "workspace" | "repo" | "template" | "shells"

const DYNAMIC_COMPLETIONS: Record<string, DynamicCompletion> = {
  clone:             "workspace",
  open:              "workspace",
  status:            "workspace",
  clean:             "workspace",
  remove:            "workspace",
  merge:             "workspace",
  rename:            "workspace",
  run:               "workspace",
  sync:              "workspace",
  cd:                "workspace",
  "repo.show":       "repo",
  "repo.remove":     "repo",
  "repo.rename":     "repo",
  "template.show":   "template",
  "template.edit":   "template",
  "template.clone":  "template",
  "template.rename": "template",
  "template.remove": "template",
  completion:        "shells",
}

interface OptionInfo {
  long: string
  description: string
}

interface CommandNode {
  path: string
  name: string
  description: string
  options: OptionInfo[]
  subcommands: CommandNode[]
  dynamic: DynamicCompletion | null
  firstArgRequired: boolean
}

function buildNode(cmd: Command, parentPath: string): CommandNode {
  const name = cmd.name()
  const path = parentPath ? `${parentPath}.${name}` : name
  const options = cmd.options
    .filter(opt => opt.long !== undefined && opt.long !== "--help" && opt.long !== "--version")
    .map(opt => ({ long: opt.long!, description: opt.description }))
  const subcommands = cmd.commands.map(sub => buildNode(sub, path))
  const firstArg = cmd.registeredArguments[0]
  return {
    path,
    name,
    description: cmd.description(),
    options,
    subcommands,
    dynamic: DYNAMIC_COMPLETIONS[path] ?? null,
    firstArgRequired: firstArg?.required === true,
  }
}

function buildTree(program: Command): CommandNode[] {
  return program.commands.map(cmd => buildNode(cmd, ""))
}

// ─── Bash ────────────────────────────────────────────────────────────────────

function bashDynamicLookup(type: DynamicCompletion, indent: string, name: string): string {
  if (type === "workspace") {
    return (
      `${indent}local names\n` +
      `${indent}names=$(ls "$HOME/.config/${name}/workspaces" 2>/dev/null | sed 's/\\.yml$//')\n` +
      `${indent}COMPREPLY=($(compgen -W "$names" -- "$cur"))\n`
    )
  }
  if (type === "repo") {
    return (
      `${indent}local names\n` +
      `${indent}names=$(grep '^- name:' "$HOME/.config/${name}/registry.yml" 2>/dev/null | sed 's/^- name: //')\n` +
      `${indent}COMPREPLY=($(compgen -W "$names" -- "$cur"))\n`
    )
  }
  if (type === "template") {
    return (
      `${indent}local names\n` +
      `${indent}names=$(ls "$HOME/.config/${name}/templates" 2>/dev/null | sed 's/\\.yml$//')\n` +
      `${indent}COMPREPLY=($(compgen -W "$names" -- "$cur"))\n`
    )
  }
  return ""
}

function bashCaseBody(node: CommandNode, name: string): string {
  const { subcommands, options, dynamic } = node

  if (subcommands.length > 0) {
    const subcmdNames = subcommands.map(s => s.name).join(" ")
    const byDynamic = new Map<DynamicCompletion, string[]>()
    for (const sub of subcommands) {
      if (sub.dynamic && sub.dynamic !== "shells") {
        if (!byDynamic.has(sub.dynamic)) byDynamic.set(sub.dynamic, [])
        byDynamic.get(sub.dynamic)!.push(sub.name)
      }
    }
    let out = `      if [[ \${COMP_CWORD} -eq 2 ]]; then\n`
    out += `        COMPREPLY=($(compgen -W "${subcmdNames}" -- "$cur"))\n`
    for (const [dynType, names] of byDynamic) {
      const pattern = names.length === 1 ? names[0] : `@(${names.join("|")})`
      out += `      elif [[ \${COMP_CWORD} -eq 3 ]] && [[ "\${words[2]}" == ${pattern} ]]; then\n`
      out += bashDynamicLookup(dynType, "        ", name)
    }
    out += "      fi\n"
    return out
  }

  if (dynamic === "shells") {
    return `      COMPREPLY=($(compgen -W "bash zsh fish" -- "$cur"))\n`
  }

  if (dynamic && options.length > 0) {
    const flagsStr = options.map(o => o.long).join(" ")
    return (
      `      if [[ "$cur" == -* ]]; then\n` +
      `        COMPREPLY=($(compgen -W "${flagsStr}" -- "$cur"))\n` +
      `      else\n` +
      bashDynamicLookup(dynamic, "        ", name) +
      `      fi\n`
    )
  }

  if (dynamic) {
    return bashDynamicLookup(dynamic, "      ", name)
  }

  return ""
}

export function generateBash(program: Command): string {
  const name = program.name()
  const id   = name.replace(/-/g, "_")
  const nodes = buildTree(program)
  const topLevelNames = nodes.map(n => n.name).join(" ")

  let out = ""
  out += `# bash completion for ${name}\n`
  out += `# Add to ~/.bashrc:  eval "$(${name} completion bash)"\n`
  out += "\n"
  out += `# Shell wrapper — enables \`${name} cd\` to change the current directory\n`
  out += `${name}() {\n`
  out += `  if [[ "$1" == "cd" ]]; then\n`
  out += `    local dir\n`
  out += `    dir=$(command ${name} "$@") && builtin cd "$dir"\n`
  out += `  else\n`
  out += `    command ${name} "$@"\n`
  out += `  fi\n`
  out += `}\n`
  out += "\n"
  out += `_${id}_complete() {\n`
  out += "  local cur prev words cword\n"
  out += "  COMPREPLY=()\n"
  out += '  cur="${COMP_WORDS[COMP_CWORD]}"\n'
  out += '  prev="${COMP_WORDS[COMP_CWORD-1]}"\n'
  out += '  words=("${COMP_WORDS[@]}")\n'
  out += "\n"
  out += "  if [[ ${COMP_CWORD} -eq 1 ]]; then\n"
  out += `    COMPREPLY=($(compgen -W "${topLevelNames}" -- "$cur"))\n`
  out += "    return 0\n"
  out += "  fi\n"
  out += "\n"
  out += '  case "${words[1]}" in\n'

  for (const node of nodes) {
    const body = bashCaseBody(node, name)
    if (!body) continue
    out += `    ${node.name})\n`
    out += body
    out += "      return 0\n"
    out += "      ;;\n"
  }

  out += "  esac\n"
  out += "}\n"
  out += `complete -F _${id}_complete ${name}\n`

  return out
}

// ─── Zsh ─────────────────────────────────────────────────────────────────────

function zshCaseBody(node: CommandNode, id: string): string {
  const { subcommands, options, dynamic, firstArgRequired } = node

  if (subcommands.length > 0) {
    return `        _${id}_${node.name} ;;\n`
  }

  if (dynamic === "shells") {
    return `        _values 'shell' bash zsh fish ;;\n`
  }

  if (dynamic && options.length > 0) {
    const helper = dynamic === "repo" ? `_${id}_repos`
      : dynamic === "template" ? `_${id}_templates`
      : `_${id}_workspaces`
    const pos = `'${firstArgRequired ? ":" : "::"} :${helper}'`
    let out = `        _arguments \\\n`
    for (const opt of options) {
      out += `          '${opt.long}[${opt.description}]' \\\n`
    }
    out += `          ${pos}\n`
    out += `          ;;\n`
    return out
  }

  if (dynamic === "workspace") {
    return `        _${id}_workspaces ;;\n`
  }

  if (dynamic === "repo") {
    return `        _${id}_repos ;;\n`
  }

  if (dynamic === "template") {
    return `        _${id}_templates ;;\n`
  }

  return ""
}

function generateZshSubcmdHelper(node: CommandNode, id: string): string {
  const subcmds = node.subcommands
  const byDynamic = new Map<DynamicCompletion, string[]>()
  for (const sub of subcmds) {
    if (sub.dynamic && sub.dynamic !== "shells") {
      if (!byDynamic.has(sub.dynamic)) byDynamic.set(sub.dynamic, [])
      byDynamic.get(sub.dynamic)!.push(sub.name)
    }
  }

  let out = `_${id}_${node.name}() {\n`
  out += `  if (( CURRENT == 2 )); then\n`
  out += `    local subcmds\n`
  out += `    subcmds=(\n`
  for (const sub of subcmds) {
    out += `      '${sub.name}:${sub.description}'\n`
  }
  out += `    )\n`
  out += `    _describe 'subcommand' subcmds\n`
  out += `  else\n`
  out += `    case $words[2] in\n`
  for (const [dynType, names] of byDynamic) {
    const helper = dynType === "repo" ? `_${id}_repos`
      : dynType === "template" ? `_${id}_templates`
      : `_${id}_workspaces`
    out += `      ${names.join("|")})\n`
    out += `        ${helper} ;;\n`
  }
  out += `    esac\n`
  out += `  fi\n`
  out += `}\n`
  return out
}

export function generateZsh(program: Command): string {
  const name = program.name()
  const id   = name.replace(/-/g, "_")
  const nodes = buildTree(program)

  let out = ""
  out += `#compdef ${name}\n`
  out += `# zsh completion for ${name}\n`
  out += `# Add to ~/.zshrc:  eval "$(${name} completion zsh)"\n`
  out += "\n"
  out += `# Shell wrapper — enables \`${name} cd\` to change the current directory\n`
  out += `${name}() {\n`
  out += `  if [[ "$1" == "cd" ]]; then\n`
  out += `    local dir\n`
  out += `    dir=$(command ${name} "$@") && builtin cd "$dir"\n`
  out += `  else\n`
  out += `    command ${name} "$@"\n`
  out += `  fi\n`
  out += `}\n`
  out += "\n"
  out += `_${id}() {\n`
  out += "  local context state line\n"
  out += "  typeset -A opt_args\n"
  out += "\n"
  out += "  _arguments -C \\\n"
  out += `    '1: :_${id}_top_commands' \\\n`
  out += "    '*:: :->subcmd'\n"
  out += "\n"
  out += "  case $state in\n"
  out += "    subcmd)\n"
  out += "      case $words[1] in\n"

  for (const node of nodes) {
    const body = zshCaseBody(node, id)
    if (!body) continue
    out += `        ${node.name})\n`
    out += body
  }

  out += "      esac\n"
  out += "      ;;\n"
  out += "  esac\n"
  out += "}\n"
  out += "\n"
  out += `_${id}_top_commands() {\n`
  out += "  local cmds\n"
  out += "  cmds=(\n"
  for (const node of nodes) {
    out += `    '${node.name}:${node.description}'\n`
  }
  out += "  )\n"
  out += "  _describe 'command' cmds\n"
  out += "}\n"
  out += "\n"
  out += `_${id}_workspaces() {\n`
  out += `  local ws_dir="$HOME/.config/${name}/workspaces"\n`
  out += `  local workspaces=(\${ws_dir}/*.yml(N:t:r))\n`
  out += `  _values 'workspace' $workspaces\n`
  out += `}\n`
  out += "\n"
  out += `_${id}_repos() {\n`
  out += `  local names\n`
  out += `  names=($(grep '^- name:' "$HOME/.config/${name}/registry.yml" 2>/dev/null | sed 's/^- name: //'))\n`
  out += `  _values 'repo' $names\n`
  out += `}\n`
  out += "\n"
  out += `_${id}_templates() {\n`
  out += `  local templates_dir="$HOME/.config/${name}/templates"\n`
  out += `  local templates=(\${templates_dir}/*.yml(N:t:r))\n`
  out += `  _values 'template' $templates\n`
  out += `}\n`

  for (const node of nodes) {
    if (node.subcommands.length > 0) {
      out += "\n"
      out += generateZshSubcmdHelper(node, id)
    }
  }

  out += "\n"
  out += `_${id}\n`

  return out
}

// ─── Fish ────────────────────────────────────────────────────────────────────

export function generateFish(program: Command): string {
  const name = program.name()
  const id   = name.replace(/-/g, "_")
  const nodes = buildTree(program)
  const allTopNames = nodes.map(n => n.name).join(" ")

  let out = ""
  out += `# fish completion for ${name}\n`
  out += `# Add to ~/.config/fish/config.fish:  ${name} completion fish | source\n`
  out += "\n"
  out += `# Shell wrapper — enables \`${name} cd\` to change the current directory\n`
  out += `function ${name}\n`
  out += `  if test (count $argv) -ge 1; and test "$argv[1]" = "cd"\n`
  out += `    set -l dir (command ${name} $argv)\n`
  out += "    and cd $dir\n"
  out += "  else\n"
  out += `    command ${name} $argv\n`
  out += "  end\n"
  out += "end\n"
  out += "\n"
  out += `function __${id}_workspaces\n`
  out += `  set -l ws_dir "$HOME/.config/${name}/workspaces"\n`
  out += "  if test -d $ws_dir\n"
  out += "    ls $ws_dir | sed 's/\\.yml$//'\n"
  out += "  end\n"
  out += "end\n"
  out += "\n"
  out += `function __${id}_repos\n`
  out += `  set -l reg "$HOME/.config/${name}/registry.yml"\n`
  out += "  if test -f $reg\n"
  out += "    grep '^- name:' $reg | sed 's/^- name: //'\n"
  out += "  end\n"
  out += "end\n"
  out += "\n"
  out += `function __${id}_templates\n`
  out += `  set -l templates_dir "$HOME/.config/${name}/templates"\n`
  out += "  if test -d $templates_dir\n"
  out += "    ls $templates_dir | sed 's/\\.yml$//'\n"
  out += "  end\n"
  out += "end\n"
  out += "\n"
  out += `function __${id}_no_subcommand\n`
  out += `  not __fish_seen_subcommand_from ${allTopNames}\n`
  out += "end\n"
  out += "\n"
  out += "# Top-level completions\n"
  for (const node of nodes) {
    const namePadded = node.name.padEnd(10)
    out += `complete -c ${name} -f -n __${id}_no_subcommand -a ${namePadded} -d '${node.description}'\n`
  }

  // Workspace dynamic completions — group commands into for loop
  const workspaceCmds = nodes.filter(n => n.dynamic === "workspace").map(n => n.name)
  if (workspaceCmds.length > 0) {
    out += "\n# Workspace name completions\n"
    out += `for cmd in ${workspaceCmds.join(" ")}\n`
    out += `  complete -c ${name} -f -n "__fish_seen_subcommand_from $cmd" -a "(__${id}_workspaces)"\n`
    out += "end\n"
  }

  // Per-command flags
  for (const node of nodes) {
    if (node.options.length === 0) continue
    out += `\n# Flags for ${node.name}\n`
    for (const opt of node.options) {
      const longName = opt.long.slice(2)  // strip "--"
      out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${node.name}' -l ${longName}  -d '${opt.description}'\n`
    }
  }

  // Commands with subcommands (e.g. stack)
  for (const node of nodes) {
    if (node.subcommands.length === 0) continue
    const subcmdNames = node.subcommands.map(s => s.name).join(" ")
    out += `\n# ${node.name} subcommands\n`
    for (const sub of node.subcommands) {
      out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${node.name}; and not __fish_seen_subcommand_from ${subcmdNames}' \\\n`
      out += `  -a '${sub.name}' -d '${sub.description}'\n`
    }
    // Repo-name completions for subcommands that need it
    const repoDynSubs = node.subcommands.filter(s => s.dynamic === "repo")
    if (repoDynSubs.length > 0) {
      out += `\nfor cmd in ${repoDynSubs.map(s => s.name).join(" ")}\n`
      out += `  complete -c ${name} -f -n "__fish_seen_subcommand_from ${node.name}; and __fish_seen_subcommand_from $cmd" \\\n`
      out += `    -a "(__${id}_repos)"\n`
      out += "end\n"
    }
    // Template-name completions for subcommands that need it
    const templateDynSubs = node.subcommands.filter(s => s.dynamic === "template")
    if (templateDynSubs.length > 0) {
      out += `\nfor cmd in ${templateDynSubs.map(s => s.name).join(" ")}\n`
      out += `  complete -c ${name} -f -n "__fish_seen_subcommand_from ${node.name}; and __fish_seen_subcommand_from $cmd" \\\n`
      out += `    -a "(__${id}_templates)"\n`
      out += "end\n"
    }
  }

  // Shells completion
  const shellsNode = nodes.find(n => n.dynamic === "shells")
  if (shellsNode) {
    out += `\n# Completion shell options\n`
    out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${shellsNode.name}' -a 'bash zsh fish'\n`
  }

  return out
}
