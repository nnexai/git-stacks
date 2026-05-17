import { readTemplate, templateExists, type Template, type TemplateRepo } from "./config"

// --- Errors ---

export class CircularIncludesError extends Error {
  constructor(public cycle: string[]) {
    super(`Circular includes detected: ${cycle.join(" -> ")}`)
  }
}

export class MissingTemplateError extends Error {
  constructor(public templateName: string, public referencedBy: string) {
    super(`Template '${templateName}' not found (referenced by '${referencedBy}' includes)`)
  }
}

// --- Merge helpers ---

type HookKey =
  | "pre_create" | "post_create"
  | "pre_open" | "post_open"
  | "pre_remove" | "post_merge"
  | "pre_close" | "post_close"
  | "pre_clean" | "post_clean"
  | "pre_merge" | "post_remove"

const HOOK_KEYS: HookKey[] = [
  "pre_create", "post_create",
  "pre_open", "post_open",
  "pre_remove", "post_merge",
  "pre_close", "post_close",
  "pre_clean", "post_clean",
  "pre_merge", "post_remove",
]

function mergeRepos(templates: Template[]): TemplateRepo[] {
  // Map by repo name; later templates have higher precedence
  const repoMap = new Map<string, TemplateRepo>()
  // Track if any template marked a repo as "worktree"
  const worktreeSet = new Set<string>()

  for (const tpl of templates) {
    for (const repo of tpl.repos) {
      if (repo.mode === "worktree") {
        worktreeSet.add(repo.repo)
      }
      const existing = repoMap.get(repo.repo)
      if (existing) {
        // Higher precedence template: merge selectively
        repoMap.set(repo.repo, {
          repo: repo.repo,
          mode: worktreeSet.has(repo.repo) ? "worktree" : repo.mode,
          ...(repo.base_branch !== undefined ? { base_branch: repo.base_branch } : existing.base_branch !== undefined ? { base_branch: existing.base_branch } : {}),
          ...(repo.branch_pattern !== undefined ? { branch_pattern: repo.branch_pattern } : existing.branch_pattern !== undefined ? { branch_pattern: existing.branch_pattern } : {}),
          ...(repo.commands !== undefined ? { commands: repo.commands } : existing.commands !== undefined ? { commands: existing.commands } : {}),
        })
      } else {
        repoMap.set(repo.repo, {
          ...repo,
          mode: worktreeSet.has(repo.repo) ? "worktree" : repo.mode,
        })
      }
    }
  }

  return Array.from(repoMap.values())
}

function mergeHooks(templates: Template[]): Template["hooks"] {
  const result: Record<string, string[]> = {}
  let hasAny = false

  for (const key of HOOK_KEYS) {
    const merged: string[] = []
    for (const tpl of templates) {
      const hooks = tpl.hooks?.[key]
      if (hooks && hooks.length > 0) {
        merged.push(...hooks)
      }
    }
    if (merged.length > 0) {
      result[key] = merged
      hasAny = true
    }
  }

  return hasAny ? result as Template["hooks"] : undefined
}

function mergeEnvVars(templates: Template[]): Record<string, string> | undefined {
  let result: Record<string, string> | undefined
  for (const tpl of templates) {
    if (tpl.env) {
      if (!result) result = {}
      Object.assign(result, tpl.env)
    }
  }
  return result
}

function mergeTemplatePorts(templates: Template[]): Record<string, number | null> | undefined {
  let result: Record<string, number | null> | undefined
  for (const tpl of templates) {
    if (tpl.ports) {
      if (!result) result = {}
      Object.assign(result, tpl.ports)  // last-wins, same as env merge
    }
  }
  return result
}

function mergeCommands(templates: Template[]): Record<string, string> | undefined {
  let result: Record<string, string> | undefined
  for (const tpl of templates) {
    if (tpl.commands) {
      if (!result) result = {}
      Object.assign(result, tpl.commands)
    }
  }
  return result
}

function mergeFiles(templates: Template[]): Template["files"] {
  const copy: string[] = []
  const symlink: string[] = []
  const sync: NonNullable<NonNullable<Template["files"]>["sync"]> = []
  let hasAny = false

  for (const tpl of templates) {
    if (tpl.files?.copy) {
      copy.push(...tpl.files.copy)
      hasAny = true
    }
    if (tpl.files?.symlink) {
      symlink.push(...tpl.files.symlink)
      hasAny = true
    }
    if (tpl.files?.sync) {
      sync.push(...tpl.files.sync)
      hasAny = true
    }
  }

  if (!hasAny) return undefined
  return {
    ...(copy.length > 0 ? { copy } : {}),
    ...(symlink.length > 0 ? { symlink } : {}),
    ...(sync.length > 0 ? { sync } : {}),
  }
}

function mergeIntegrations(templates: Template[]): Record<string, unknown> | undefined {
  let result: Record<string, unknown> | undefined
  for (const tpl of templates) {
    if (tpl.integrations) {
      if (!result) result = {}
      Object.assign(result, tpl.integrations)
    }
  }
  return result
}

function mergeLabels(templates: Template[]): string[] | undefined {
  const merged = [...new Set(templates.flatMap(tpl => tpl.labels ?? []))]
  return merged.length > 0 ? merged : undefined
}

// --- Main composition function ---

/**
 * Compose multiple templates into a single merged Template.
 *
 * The last name in the array is the "top-level" template with highest precedence.
 * Each template's `includes` field is resolved (1-level only), and included templates
 * are prepended to the merge order.
 *
 * Merge rules:
 * - repos: union by repo name; worktree mode wins over trunk
 * - hooks: concatenated in order; top-level last
 * - env: Object.assign in order; last wins per key
 * - env_file: last non-undefined wins
 * - files: copy/symlink arrays concatenated
 * - integrations: deep merge, last wins per key
 * - name/description/schema_version: from top-level template
 */
export function composeTemplates(templateNames: string[]): Template {
  if (templateNames.length === 0) {
    throw new Error("composeTemplates() requires at least one template name")
  }

  // Phase 1: Load all named templates and resolve their includes (1-level)
  const seen = new Set<string>()
  const orderedTemplates: Template[] = []

  for (const name of templateNames) {
    if (!templateExists(name)) {
      throw new MissingTemplateError(name, "composeTemplates()")
    }

    // Circular check against named templates
    if (seen.has(name)) {
      throw new CircularIncludesError([...seen, name])
    }
    seen.add(name)

    const tpl = readTemplate(name)

    // Resolve 1-level includes
    if (tpl.includes && tpl.includes.length > 0) {
      for (const incName of tpl.includes) {
        if (!templateExists(incName)) {
          throw new MissingTemplateError(incName, name)
        }

        // Circular check: included template already in the merge set
        if (seen.has(incName)) {
          throw new CircularIncludesError([...seen, incName])
        }
        seen.add(incName)

        const incTpl = readTemplate(incName)

        // 1-level limit: warn if included template itself has includes
        if (incTpl.includes && incTpl.includes.length > 0) {
          // Check for circular references in nested includes before ignoring them
          for (const nestedName of incTpl.includes) {
            if (seen.has(nestedName)) {
              throw new CircularIncludesError([...seen, incName, nestedName])
            }
          }
          console.error(`[git-stacks] Warning: '${incName}' has includes but nested includes are ignored (1-level limit)`)
        }

        orderedTemplates.push(incTpl)
      }
    }

    orderedTemplates.push(tpl)
  }

  if (orderedTemplates.length === 0) {
    throw new Error("No templates to compose")
  }

  // Phase 2: Merge in order (last = highest precedence)
  const topLevel = orderedTemplates[orderedTemplates.length - 1]

  // Find last non-undefined env_file
  let envFile: string | undefined
  for (const tpl of orderedTemplates) {
    if (tpl.env_file !== undefined) {
      envFile = tpl.env_file
    }
  }

  return {
    name: topLevel.name,
    schema_version: topLevel.schema_version,
    description: topLevel.description,
    repos: mergeRepos(orderedTemplates),
    hooks: mergeHooks(orderedTemplates),
    env: mergeEnvVars(orderedTemplates),
    env_file: envFile,
    files: mergeFiles(orderedTemplates),
    integrations: mergeIntegrations(orderedTemplates),
    labels: mergeLabels(orderedTemplates),
    ports: mergeTemplatePorts(orderedTemplates),
    commands: mergeCommands(orderedTemplates),
    // includes is not carried forward — the result is a fully resolved template
  }
}
