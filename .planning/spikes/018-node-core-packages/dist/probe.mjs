var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../../src/lib/paths.ts
import { homedir } from "os";
import { join } from "path";
function expandHome(p) {
  if (p.startsWith("~/")) return join(HOME, p.slice(2));
  return p;
}
var HOME, DEFAULT_WORKSPACE_ROOT, WS_CONFIG_DIR, WORKSPACES_DIR, GLOBAL_CONFIG_FILE, REGISTRY_FILE, TEMPLATES_DIR, NOTES_DIR, PORTS_LOCK_FILE;
var init_paths = __esm({
  "../../../src/lib/paths.ts"() {
    "use strict";
    HOME = homedir();
    DEFAULT_WORKSPACE_ROOT = join(HOME, "workspaces");
    WS_CONFIG_DIR = process.env.GIT_STACKS_CONFIG_DIR ?? join(HOME, ".config", "git-stacks");
    WORKSPACES_DIR = join(WS_CONFIG_DIR, "workspaces");
    GLOBAL_CONFIG_FILE = join(WS_CONFIG_DIR, "config.yml");
    REGISTRY_FILE = join(WS_CONFIG_DIR, "registry.yml");
    TEMPLATES_DIR = join(WS_CONFIG_DIR, "templates");
    NOTES_DIR = join(WS_CONFIG_DIR, "notes");
    PORTS_LOCK_FILE = join(WS_CONFIG_DIR, ".ports.lock");
  }
});

// ../../../src/lib/config.ts
var config_exports = {};
__export(config_exports, {
  DirRepoSchema: () => DirRepoSchema,
  FileSyncEntrySchema: () => FileSyncEntrySchema,
  FilesSchema: () => FilesSchema,
  ForgeIntegrationConfigSchema: () => ForgeIntegrationConfigSchema,
  ForgeRepoMetadataSchema: () => ForgeRepoMetadataSchema,
  ForgeTypeSchema: () => ForgeTypeSchema,
  GlobalConfigSchema: () => GlobalConfigSchema,
  NameSchema: () => NameSchema,
  PortsSchema: () => PortsSchema,
  RepoRegistryEntrySchema: () => RepoRegistryEntrySchema,
  RepoRegistrySchema: () => RepoRegistrySchema,
  RepoTypeSchema: () => RepoTypeSchema,
  ShellIdentifierSchema: () => ShellIdentifierSchema,
  TemplateRepoSchema: () => TemplateRepoSchema,
  TemplateSchema: () => TemplateSchema,
  TrunkRepoSchema: () => TrunkRepoSchema,
  WorkspaceRepoSchema: () => WorkspaceRepoSchema,
  WorkspaceSchema: () => WorkspaceSchema,
  WorkspaceSettingsSchema: () => WorkspaceSettingsSchema,
  WorkspaceSourceSchema: () => WorkspaceSourceSchema,
  WorktreeRepoSchema: () => WorktreeRepoSchema,
  _cache: () => _cache,
  deleteTemplate: () => deleteTemplate,
  deleteWorkspace: () => deleteWorkspace,
  expandBranchPattern: () => expandBranchPattern,
  expandHome: () => expandHome,
  formatZodError: () => formatZodError,
  getRepoPath: () => getRepoPath,
  invalidateConfigCache: () => invalidateConfigCache,
  isGitRepo: () => isGitRepo,
  isWorktreeRepo: () => isWorktreeRepo,
  listRegistryEntries: () => listRegistryEntries,
  listTemplates: () => listTemplates,
  listTemplatesUncached: () => listTemplatesUncached,
  listWorkspaces: () => listWorkspaces,
  listWorkspacesUncached: () => listWorkspacesUncached,
  readGlobalConfig: () => readGlobalConfig,
  readRegistry: () => readRegistry,
  readTemplate: () => readTemplate,
  readWorkspace: () => readWorkspace,
  templateExists: () => templateExists,
  templatePath: () => templatePath,
  workspaceExists: () => workspaceExists,
  workspaceFilePath: () => workspaceFilePath,
  workspacePath: () => workspacePath,
  writeGlobalConfig: () => writeGlobalConfig,
  writeRegistry: () => writeRegistry,
  writeTemplate: () => writeTemplate,
  writeWorkspace: () => writeWorkspace
});
import { z } from "zod";
import { parse, stringify } from "yaml";
import { readFileSync, existsSync, mkdirSync, readdirSync, renameSync, openSync, writeSync, fsyncSync, closeSync, unlinkSync } from "fs";
import { join as join2, dirname } from "path";
function invalidateConfigCache() {
  workspaceIndex.clear();
  templateIndex.clear();
  workspaceListPopulated = false;
  templateListPopulated = false;
}
function formatZodError(err) {
  return err.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  }).join("; ");
}
function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
function readYaml(path, schema) {
  const raw = readFileSync(path, "utf-8");
  try {
    return schema.parse(parse(raw));
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      throw new Error(`Invalid config at ${path}: ${formatZodError(err)}`);
    }
    throw err;
  }
}
function writeYaml(path, data) {
  ensureDir(dirname(path));
  const tmpPath = `${path}.tmp`;
  const content = stringify(data);
  const fd = openSync(tmpPath, "w");
  try {
    writeSync(fd, content, 0, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, path);
}
function findWorkspaceFile(name) {
  if (!existsSync(WORKSPACES_DIR)) return null;
  const matches = [];
  for (const f of readdirSync(WORKSPACES_DIR).filter((f2) => f2.endsWith(".yml"))) {
    const filePath = join2(WORKSPACES_DIR, f);
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed2 = WorkspaceSchema.safeParse(parse(raw));
      if (parsed2.success && parsed2.data.name === name) {
        matches.push({ data: parsed2.data, filePath });
      }
    } catch {
    }
  }
  if (matches.length > 1) {
    console.error(`[git-stacks] Warning: multiple workspaces with name '${name}' \u2014 using first match`);
  }
  return matches[0] ?? null;
}
function findTemplateFile(name) {
  if (!existsSync(TEMPLATES_DIR)) return null;
  const matches = [];
  for (const f of readdirSync(TEMPLATES_DIR).filter((f2) => f2.endsWith(".yml"))) {
    const filePath = join2(TEMPLATES_DIR, f);
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed2 = TemplateSchema.safeParse(parse(raw));
      if (parsed2.success && parsed2.data.name === name) {
        matches.push({ data: parsed2.data, filePath });
      }
    } catch {
    }
  }
  if (matches.length > 1) {
    console.error(`[git-stacks] Warning: multiple templates with name '${name}' \u2014 using first match`);
  }
  return matches[0] ?? null;
}
function readGlobalConfig() {
  if (!existsSync(GLOBAL_CONFIG_FILE)) return GlobalConfigSchema.parse({});
  return readYaml(GLOBAL_CONFIG_FILE, GlobalConfigSchema);
}
function writeGlobalConfig(config2) {
  writeYaml(GLOBAL_CONFIG_FILE, config2);
}
function workspacePath(name) {
  return join2(WORKSPACES_DIR, `${name}.yml`);
}
function workspaceExists(name) {
  if (workspaceIndex.has(name)) return true;
  return findWorkspaceFile(name) !== null;
}
function readWorkspace(name) {
  const cached = workspaceIndex.get(name);
  if (cached) return cached;
  const found = findWorkspaceFile(name);
  if (!found) throw new Error(`Workspace '${name}' not found.`);
  workspaceIndex.set(name, found.data);
  return found.data;
}
function writeWorkspace(workspace2) {
  const parsed2 = WorkspaceSchema.safeParse(workspace2);
  if (!parsed2.success) throw new Error(`Invalid workspace: ${formatZodError(parsed2.error)}`);
  ensureDir(WORKSPACES_DIR);
  writeYaml(workspacePath(parsed2.data.name), parsed2.data);
  workspaceIndex.set(parsed2.data.name, parsed2.data);
  workspaceListPopulated = false;
}
function workspaceFilePath(name) {
  const found = findWorkspaceFile(name);
  if (!found) throw new Error(`Workspace '${name}' not found.`);
  return found.filePath;
}
function deleteWorkspace(name) {
  unlinkSync(workspacePath(name));
  workspaceIndex.delete(name);
  workspaceListPopulated = false;
}
function scanWorkspaces() {
  workspaceIndex.clear();
  if (!existsSync(WORKSPACES_DIR)) {
    workspaceListPopulated = true;
    return [];
  }
  for (const f of readdirSync(WORKSPACES_DIR).filter((f2) => f2.endsWith(".yml"))) {
    const filePath = join2(WORKSPACES_DIR, f);
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed2 = WorkspaceSchema.safeParse(parse(raw));
      if (parsed2.success) {
        workspaceIndex.set(parsed2.data.name, parsed2.data);
      } else {
        console.error(`[git-stacks] Skipping corrupt workspace '${f}': ${formatZodError(parsed2.error)}`);
      }
    } catch (err) {
      console.error(`[git-stacks] Skipping unreadable workspace '${f}': ${err}`);
    }
  }
  workspaceListPopulated = true;
  return Array.from(workspaceIndex.values());
}
function listWorkspaces() {
  if (workspaceListPopulated) return Array.from(workspaceIndex.values());
  return scanWorkspaces();
}
function listWorkspacesUncached() {
  workspaceListPopulated = false;
  return scanWorkspaces();
}
function readRegistry() {
  if (!existsSync(REGISTRY_FILE)) return [];
  try {
    const raw = readFileSync(REGISTRY_FILE, "utf-8");
    const parsed2 = RepoRegistrySchema.safeParse(parse(raw));
    if (parsed2.success) return parsed2.data;
    console.error(`[git-stacks] Registry parse error: ${formatZodError(parsed2.error)}`);
    return [];
  } catch (err) {
    console.error(`[git-stacks] Cannot read registry: ${err}`);
    return [];
  }
}
function writeRegistry(entries) {
  const parsed2 = RepoRegistrySchema.safeParse(entries);
  if (!parsed2.success) {
    throw new Error(`Invalid registry: ${formatZodError(parsed2.error)}`);
  }
  ensureDir(dirname(REGISTRY_FILE));
  writeYaml(REGISTRY_FILE, parsed2.data);
}
function listRegistryEntries() {
  return readRegistry();
}
function templatePath(name) {
  return join2(TEMPLATES_DIR, `${name}.yml`);
}
function templateExists(name) {
  if (templateIndex.has(name)) return true;
  return findTemplateFile(name) !== null;
}
function readTemplate(name) {
  const cached = templateIndex.get(name);
  if (cached) return cached;
  const found = findTemplateFile(name);
  if (!found) throw new Error(`Template '${name}' not found.`);
  templateIndex.set(name, found.data);
  return found.data;
}
function writeTemplate(template) {
  ensureDir(TEMPLATES_DIR);
  writeYaml(templatePath(template.name), template);
  templateIndex.set(template.name, template);
  templateListPopulated = false;
}
function deleteTemplate(name) {
  unlinkSync(templatePath(name));
  templateIndex.delete(name);
  templateListPopulated = false;
}
function listTemplates() {
  if (templateListPopulated) return Array.from(templateIndex.values());
  if (!existsSync(TEMPLATES_DIR)) return [];
  for (const f of readdirSync(TEMPLATES_DIR).filter((f2) => f2.endsWith(".yml"))) {
    const filePath = join2(TEMPLATES_DIR, f);
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed2 = TemplateSchema.safeParse(parse(raw));
      if (parsed2.success) {
        templateIndex.set(parsed2.data.name, parsed2.data);
      } else {
        console.error(`[git-stacks] Skipping corrupt template '${f}': ${formatZodError(parsed2.error)}`);
      }
    } catch (err) {
      console.error(`[git-stacks] Skipping unreadable template '${f}': ${err}`);
    }
  }
  templateListPopulated = true;
  return Array.from(templateIndex.values());
}
function listTemplatesUncached() {
  templateIndex.clear();
  templateListPopulated = false;
  return listTemplates();
}
function expandBranchPattern(pattern, workspaceName) {
  return pattern.replace(/<workspace-name>/g, workspaceName);
}
function getRepoPath(repo) {
  return repo.mode === "worktree" ? repo.task_path : repo.main_path;
}
function isWorktreeRepo(repo) {
  return repo.mode === "worktree";
}
function isGitRepo(repo) {
  return repo.mode !== "dir";
}
var workspaceIndex, templateIndex, workspaceListPopulated, templateListPopulated, _cache, RepoTypeSchema, ForgeTypeSchema, ForgeIntegrationConfigSchema, ForgeRepoMetadataSchema, FileSyncEntrySchema, FilesSchema, ShellIdentifierSchema, PortsSchema, LabelSchema, NameSchema, RepoRegistryEntrySchema, RepoRegistrySchema, TemplateRepoSchema, TemplateSchema, WorkspaceRepoHooksSchema, WorkspaceRepoBaseSchema, WorktreeRepoSchema, TrunkRepoSchema, DirRepoSchema, WorkspaceRepoSchema, WorkspaceSettingsSchema, WorkspaceSourceSchema, WorkspaceHooksSchema, WorkspaceSchema, GlobalConfigSchema;
var init_config = __esm({
  "../../../src/lib/config.ts"() {
    "use strict";
    init_paths();
    workspaceIndex = /* @__PURE__ */ new Map();
    templateIndex = /* @__PURE__ */ new Map();
    workspaceListPopulated = false;
    templateListPopulated = false;
    _cache = {
      workspaces: workspaceIndex,
      templates: templateIndex,
      resetList() {
        workspaceListPopulated = false;
        templateListPopulated = false;
      }
    };
    RepoTypeSchema = z.enum(["java", "typescript", "other"]);
    ForgeTypeSchema = z.enum(["github", "gitlab", "gitea"]).optional();
    ForgeIntegrationConfigSchema = z.object({
      enabled: z.boolean().optional(),
      base_url: z.string().url().optional()
    });
    ForgeRepoMetadataSchema = z.object({
      forge: z.enum(["github", "gitlab", "gitea"]),
      base_url: z.string().url().optional(),
      repo_path: z.string().min(1).optional()
    });
    FileSyncEntrySchema = z.object({
      source: z.string(),
      target: z.string(),
      git_exclude: z.boolean().optional()
    });
    FilesSchema = z.object({
      copy: z.array(z.string()).optional(),
      symlink: z.array(z.string()).optional(),
      sync: z.array(FileSyncEntrySchema).optional()
    }).optional();
    ShellIdentifierSchema = z.string().regex(
      /^[A-Za-z_][A-Za-z0-9_]*$/,
      "Must be a shell identifier (letters, digits, and underscores; cannot start with a digit)"
    );
    PortsSchema = z.record(ShellIdentifierSchema, z.number().nullable()).optional();
    LabelSchema = z.string().regex(
      /^[A-Za-z0-9._:-]+$/,
      "Label may only contain letters, digits, dots, colons, hyphens, underscores"
    );
    NameSchema = z.string().min(1, "Name must not be empty").regex(/^[A-Za-z0-9._-]+$/, "Name may only contain letters, digits, dots, hyphens, and underscores").refine((name) => name !== "." && name !== "..", "Name must not be '.' or '..'");
    RepoRegistryEntrySchema = z.object({
      name: NameSchema,
      schema_version: z.string().default("1"),
      local_path: z.string(),
      default_branch: z.string().default("main"),
      type: RepoTypeSchema.default("other"),
      forge: ForgeTypeSchema,
      forge_metadata: ForgeRepoMetadataSchema.optional(),
      is_dir: z.boolean().default(false)
    });
    RepoRegistrySchema = z.array(RepoRegistryEntrySchema).default([]);
    TemplateRepoSchema = z.object({
      repo: z.string(),
      // registry name
      mode: z.enum(["trunk", "worktree", "dir"]).default("worktree"),
      base_branch: z.string().optional(),
      // overrides registry default_branch
      branch_pattern: z.string().optional(),
      // e.g. "feature/<workspace-name>"
      commands: z.record(z.string(), z.string()).optional()
    });
    TemplateSchema = z.object({
      name: NameSchema,
      schema_version: z.string().default("1"),
      description: z.string().optional(),
      repos: z.array(TemplateRepoSchema).default([]),
      hooks: z.object({
        pre_create: z.array(z.string()).optional(),
        post_create: z.array(z.string()).optional(),
        pre_open: z.array(z.string()).optional(),
        post_open: z.array(z.string()).optional(),
        pre_remove: z.array(z.string()).optional(),
        post_merge: z.array(z.string()).optional(),
        pre_close: z.array(z.string()).optional(),
        post_close: z.array(z.string()).optional(),
        pre_clean: z.array(z.string()).optional(),
        post_clean: z.array(z.string()).optional(),
        pre_merge: z.array(z.string()).optional(),
        post_remove: z.array(z.string()).optional()
      }).optional(),
      env: z.record(ShellIdentifierSchema, z.string()).optional(),
      env_file: z.string().optional(),
      files: FilesSchema,
      integrations: z.record(z.string(), z.unknown()).optional(),
      includes: z.array(z.string()).optional(),
      ports: PortsSchema,
      labels: z.array(LabelSchema).optional(),
      commands: z.record(z.string(), z.string()).optional()
    });
    WorkspaceRepoHooksSchema = z.object({
      pre_open: z.array(z.string()).optional(),
      pre_clean: z.array(z.string()).optional()
    });
    WorkspaceRepoBaseSchema = z.object({
      id: z.string().uuid().optional(),
      name: z.string(),
      repo: z.string(),
      // registry name — replaces 'stack'
      type: RepoTypeSchema,
      main_path: z.string().transform(expandHome),
      base_branch: z.string().optional(),
      // base branch for merge/sync resolution
      hooks: WorkspaceRepoHooksSchema.optional(),
      files: FilesSchema,
      commands: z.record(z.string(), z.string()).optional()
    });
    WorktreeRepoSchema = WorkspaceRepoBaseSchema.extend({
      mode: z.literal("worktree"),
      task_path: z.string().transform(expandHome)
    });
    TrunkRepoSchema = WorkspaceRepoBaseSchema.extend({
      mode: z.literal("trunk"),
      task_path: z.string().transform(expandHome).optional()
    });
    DirRepoSchema = WorkspaceRepoBaseSchema.extend({
      mode: z.literal("dir"),
      task_path: z.string().transform(expandHome).optional()
    });
    WorkspaceRepoSchema = z.discriminatedUnion("mode", [
      WorktreeRepoSchema,
      TrunkRepoSchema,
      DirRepoSchema
    ]);
    WorkspaceSettingsSchema = z.object({
      /** Per-integration overrides keyed by integration id, e.g. { cmux: { enabled: false } } */
      integrations: z.record(z.string(), z.unknown()).optional()
    });
    WorkspaceSourceSchema = z.object({
      kind: z.literal("forge"),
      forge: z.enum(["gitlab", "gitea", "github"]),
      base_url: z.string().url(),
      url: z.string().url(),
      change_type: z.enum(["mr", "pr"]),
      change_number: z.number().int().positive(),
      repo: z.string().min(1),
      repo_path: z.string().min(1),
      source_branch: z.string().min(1),
      source_ref: z.string().min(1),
      target_branch: z.string().min(1),
      web_url: z.string().url(),
      fetched_ref: z.string().min(1),
      title: z.string().optional()
    });
    WorkspaceHooksSchema = z.object({
      pre_create: z.array(z.string()).optional(),
      post_create: z.array(z.string()).optional(),
      pre_open: z.array(z.string()).optional(),
      post_open: z.array(z.string()).optional(),
      post_merge: z.array(z.string()).optional(),
      pre_remove: z.array(z.string()).optional(),
      pre_close: z.array(z.string()).optional(),
      post_close: z.array(z.string()).optional(),
      pre_clean: z.array(z.string()).optional(),
      post_clean: z.array(z.string()).optional(),
      pre_merge: z.array(z.string()).optional(),
      post_remove: z.array(z.string()).optional()
    });
    WorkspaceSchema = z.object({
      id: z.string().uuid().optional(),
      name: NameSchema,
      // Migration strategy: bump default when schema changes; read-time migration functions keyed by version
      schema_version: z.string().default("1"),
      description: z.string().optional(),
      branch: z.string(),
      created: z.string(),
      last_opened: z.string().optional(),
      // ISO timestamp, updated by openWorkspace
      template: z.string().optional(),
      // informational: source template name
      cmux_workspace_id: z.string().optional(),
      hooks: WorkspaceHooksSchema.optional(),
      settings: WorkspaceSettingsSchema.optional(),
      source: WorkspaceSourceSchema.optional(),
      repos: z.array(WorkspaceRepoSchema).default([]),
      env: z.record(ShellIdentifierSchema, z.string()).optional(),
      env_file: z.string().optional(),
      files: FilesSchema,
      ports: PortsSchema,
      labels: z.array(LabelSchema).optional(),
      pinned: z.boolean().optional(),
      priority: z.number().int().min(-2147483648).max(2147483647).optional(),
      commands: z.record(z.string(), z.string()).optional()
    });
    GlobalConfigSchema = z.object({
      workspace_root: z.string().default(DEFAULT_WORKSPACE_ROOT).transform(expandHome),
      /** Per-integration config keyed by integration id, e.g. { vscode: { enabled: true, cmd: "code" } } */
      integrations: z.record(z.string(), z.unknown()).default({}),
      ports: z.object({
        range_start: z.number().int().default(1e4),
        range_end: z.number().int().default(65e3)
      }).default(() => ({ range_start: 1e4, range_end: 65e3 })),
      secrets: z.object({
        resolvers: z.array(z.string()).optional()
      }).optional()
    });
  }
});

// ../../../src/lib/labels.ts
var labels_exports = {};
__export(labels_exports, {
  matchesLabels: () => matchesLabels
});
function matchesLabels(entity, terms) {
  if (terms.length === 0) return true;
  const labels = entity.labels ?? [];
  return terms.every((term) => labels.includes(term));
}
var init_labels = __esm({
  "../../../src/lib/labels.ts"() {
    "use strict";
  }
});

// ../../../src/lib/workspace-priorities.ts
var workspace_priorities_exports = {};
__export(workspace_priorities_exports, {
  setWorkspacePriorities: () => setWorkspacePriorities
});
function setWorkspacePriorities(priorities, dependencies = { listWorkspaces: listWorkspacesUncached, writeWorkspace }) {
  const workspaces = dependencies.listWorkspaces();
  const byId = new Map(workspaces.flatMap((workspace2) => workspace2.id ? [[workspace2.id, workspace2]] : []));
  for (const { workspace_id: id } of priorities) if (!byId.has(id)) throw new Error(`Unknown workspace identity: ${id}`);
  for (const { workspace_id: id, priority } of priorities) {
    const workspace2 = byId.get(id);
    const normalized = priority === 0 ? void 0 : priority;
    if (workspace2.priority === normalized) continue;
    const { priority: _priority, ...definition } = workspace2;
    dependencies.writeWorkspace(normalized === void 0 ? definition : { ...definition, priority: normalized });
  }
}
var init_workspace_priorities = __esm({
  "../../../src/lib/workspace-priorities.ts"() {
    "use strict";
    init_config();
  }
});

// ../../../src/lib/service/signal-state.ts
var signal_state_exports = {};
__export(signal_state_exports, {
  SignalState: () => SignalState
});
var seq, activityKey, SignalState;
var init_signal_state = __esm({
  "../../../src/lib/service/signal-state.ts"() {
    "use strict";
    seq = (value) => BigInt(value);
    activityKey = (signal2) => `${signal2.source}\0${signal2.surface_id}`;
    SignalState = class {
      activities = /* @__PURE__ */ new Map();
      notifications = /* @__PURE__ */ new Map();
      dismissed = /* @__PURE__ */ new Map();
      overflow = 0;
      apply(mutation) {
        if ("dismissal" in mutation) {
          const current2 = this.dismissed.get(mutation.dismissal.signal_id);
          const signalExists = this.notifications.has(mutation.dismissal.signal_id) || [...this.activities.values()].some((signal2) => signal2.id === mutation.dismissal.signal_id);
          if (!signalExists || current2 && seq(mutation.sequence) <= seq(current2)) return false;
          this.dismissed.set(mutation.dismissal.signal_id, mutation.sequence);
          return true;
        }
        const incoming = mutation.signal;
        const dismissalSequence = this.dismissed.get(incoming.id);
        if (dismissalSequence && seq(mutation.sequence) > seq(dismissalSequence)) this.dismissed.delete(incoming.id);
        const current = incoming.kind === "activity" ? this.activities.get(activityKey(incoming)) : this.notifications.get(incoming.id);
        if (current && seq(mutation.sequence) <= seq(current.journal_sequence)) return false;
        if (incoming.kind === "activity" && incoming.state === "idle") {
          return this.activities.delete(activityKey(incoming));
        }
        const stored = { ...incoming, journal_sequence: mutation.sequence };
        if (incoming.kind === "activity") this.activities.set(activityKey(incoming), stored);
        else this.notifications.set(incoming.id, stored);
        this.evict();
        return true;
      }
      actionable(signal2) {
        if (this.dismissed.has(signal2.id)) return false;
        if (signal2.kind === "notification") return true;
        return signal2.state === "waiting" || signal2.state === "failed";
      }
      evict() {
        const all = [...this.activities.values(), ...this.notifications.values()];
        while (all.length > 64) {
          const candidate = all.filter((item) => !this.actionable(item)).sort((a, b) => Number(seq(a.journal_sequence) - seq(b.journal_sequence)))[0];
          if (!candidate) {
            this.overflow += 1;
            return;
          }
          if (candidate.kind === "activity") this.activities.delete(activityKey(candidate));
          else this.notifications.delete(candidate.id);
          all.splice(all.indexOf(candidate), 1);
        }
      }
      projection() {
        const signals = [...this.activities.values(), ...this.notifications.values()].sort((a, b) => Number(seq(a.journal_sequence) - seq(b.journal_sequence)));
        return { signals, unread: signals.filter((signal2) => this.actionable(signal2)), dismissed: [...this.dismissed.keys()], overflow: this.overflow };
      }
    };
  }
});

// ../../../src/lib/service/presentation.ts
var presentation_exports = {};
__export(presentation_exports, {
  compactRelativeTime: () => compactRelativeTime,
  deduplicateProviderSessions: () => deduplicateProviderSessions,
  isActiveSession: () => isActiveSession,
  isBackgroundActivity: () => isBackgroundActivity,
  issueTrackerLabels: () => issueTrackerLabels,
  lifecycleLabel: () => lifecycleLabel,
  matchesSignalScope: () => matchesSignalScope,
  providerLetter: () => providerLetter,
  providerName: () => providerName,
  relativeTime: () => relativeTime,
  signalDisplayText: () => signalDisplayText,
  signalGroup: () => signalGroup,
  workspacePriorityOrder: () => workspacePriorityOrder
});
function providerName(source) {
  return providerNames[source] ?? source;
}
function providerLetter(source) {
  return providerLetters[source] ?? (source.slice(0, 1).toUpperCase() || "?");
}
function signalDisplayText(signal2) {
  return signal2.title ?? (signal2.kind === "activity" ? `${signal2.source} ${signal2.state}` : signal2.source);
}
function lifecycleLabel(signal2) {
  if (signal2.kind === "notification") return "Unread";
  switch (signal2.state) {
    case "waiting":
      return "Needs input";
    case "failed":
      return "Failed";
    case "completed":
      return "Completed";
    case "working":
      return "Working";
    default:
      return "Idle";
  }
}
function signalGroup(signal2) {
  return signal2.kind === "notification" || signal2.state === "waiting" || signal2.state === "failed" ? "needs-attention" : "recent-activity";
}
function isActiveSession(signal2) {
  return signal2.kind === "activity" && ["working", "waiting", "completed", "failed"].includes(signal2.state ?? "");
}
function isBackgroundActivity(signal2) {
  return signal2.kind === "activity" && signal2.state === "working";
}
function deduplicateProviderSessions(signals) {
  const providers = /* @__PURE__ */ new Map();
  for (const signal2 of signals) {
    if (!isActiveSession(signal2)) continue;
    const current = providers.get(signal2.source);
    const signalPriority = lifecyclePriority[signal2.state ?? ""] ?? 0;
    const currentPriority = lifecyclePriority[current?.state ?? ""] ?? 0;
    if (!current || signalPriority > currentPriority || signalPriority === currentPriority && signal2.occurred_at > current.occurred_at) providers.set(signal2.source, signal2);
  }
  return [...providers.values()].sort((left, right) => (lifecyclePriority[right.state ?? ""] ?? 0) - (lifecyclePriority[left.state ?? ""] ?? 0) || left.source.localeCompare(right.source));
}
function matchesSignalScope(signal2, workspaceId, repositoryId, surfaceId) {
  return signal2.workspace_id === workspaceId && (!repositoryId || !signal2.repository_id || signal2.repository_id === repositoryId) && (!surfaceId || signal2.surface_id === surfaceId);
}
function relativeTime(occurredAt, now = Date.now()) {
  const occurred = Date.parse(occurredAt);
  if (!Number.isFinite(occurred)) return "";
  const seconds = Math.max(0, Math.floor((now - occurred) / 1e3));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
function compactRelativeTime(occurredAt, now = Date.now()) {
  const occurred = Date.parse(occurredAt);
  if (!Number.isFinite(occurred)) return "";
  const seconds = Math.max(0, Math.floor((now - occurred) / 1e3));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
function workspacePriorityOrder(left, right) {
  return (right.priority ?? 0) - (left.priority ?? 0) || left.name.localeCompare(right.name) || (left.id ?? "").localeCompare(right.id ?? "");
}
var providerNames, providerLetters, issueTrackerLabels, lifecyclePriority;
var init_presentation = __esm({
  "../../../src/lib/service/presentation.ts"() {
    "use strict";
    providerNames = {
      claude: "Claude",
      copilot: "GitHub Copilot",
      codex: "Codex",
      opencode: "OpenCode",
      automation: "Automation",
      acp: "ACP",
      user: "User",
      other: "Other"
    };
    providerLetters = {
      claude: "C",
      copilot: "G",
      codex: "X",
      opencode: "O",
      automation: "A",
      acp: "P",
      user: "U",
      other: "?"
    };
    issueTrackerLabels = {
      github: "GitHub",
      gitlab: "GitLab",
      gitea: "Gitea",
      jira: "Jira"
    };
    lifecyclePriority = { failed: 4, waiting: 3, working: 2, completed: 1 };
  }
});

// ../../../src/lib/service/contract.ts
var contract_exports = {};
__export(contract_exports, {
  ActivitySignalSchema: () => ActivitySignalSchema,
  ApiErrorSchema: () => ApiErrorSchema,
  CLIENT_MODEL_LIMITS: () => CLIENT_MODEL_LIMITS,
  CapabilitiesSchema: () => CapabilitiesSchema,
  CapabilityAvailabilitySchema: () => CapabilityAvailabilitySchema,
  ClientModelLimitsSchema: () => ClientModelLimitsSchema,
  ClientModelStringByteLimitsSchema: () => ClientModelStringByteLimitsSchema,
  CommandIdSchema: () => CommandIdSchema,
  CursorSchema: () => CursorSchema,
  DiscoveryResponseSchema: () => DiscoveryResponseSchema,
  DiscoverySchema: () => DiscoverySchema,
  EntityIdSchema: () => EntityIdSchema,
  ErrorCodeSchema: () => ErrorCodeSchema,
  ErrorEnvelopeSchema: () => ErrorEnvelopeSchema,
  LaunchSpecificationSchema: () => LaunchSpecificationSchema,
  LaunchStepSchema: () => LaunchStepSchema,
  NamedLaunchSpecificationSchema: () => NamedLaunchSpecificationSchema,
  NotificationSignalSchema: () => NotificationSignalSchema,
  OperationFailureSchema: () => OperationFailureSchema,
  OperationIdSchema: () => OperationIdSchema,
  OperationProgressSchema: () => OperationProgressSchema,
  OperationResultSchema: () => OperationResultSchema,
  OperationSchema: () => OperationSchema,
  OperationStageSchema: () => OperationStageSchema,
  OperationStateSchema: () => OperationStateSchema,
  ProtocolVersionSchema: () => ProtocolVersionSchema,
  ReplayGapSchema: () => ReplayGapSchema,
  RepositorySnapshotSchema: () => RepositorySnapshotSchema,
  RequestIdSchema: () => RequestIdSchema,
  RevisionSchema: () => RevisionSchema,
  SIGNAL_MODEL_LIMITS: () => SIGNAL_MODEL_LIMITS,
  ServiceEventSchema: () => ServiceEventSchema,
  ServiceLimitsSchema: () => ServiceLimitsSchema,
  SignalActivityStateSchema: () => SignalActivityStateSchema,
  SignalDismissalSchema: () => SignalDismissalSchema,
  SignalIdSchema: () => SignalIdSchema,
  SignalSchema: () => SignalSchema,
  SignalSourceSchema: () => SignalSourceSchema,
  TerminalLaunchResolutionRequestSchema: () => TerminalLaunchResolutionRequestSchema,
  TerminalLaunchResolutionSchema: () => TerminalLaunchResolutionSchema,
  TerminalLaunchSpecificationSchema: () => TerminalLaunchSpecificationSchema,
  TimestampSchema: () => TimestampSchema,
  WorkspaceCreationCatalogSchema: () => WorkspaceCreationCatalogSchema,
  WorkspaceCreationRepositorySchema: () => WorkspaceCreationRepositorySchema,
  WorkspaceCreationRequestSchema: () => WorkspaceCreationRequestSchema,
  WorkspaceCreationTemplateSchema: () => WorkspaceCreationTemplateSchema,
  WorkspaceSnapshotResponseSchema: () => WorkspaceSnapshotResponseSchema,
  WorkspaceSnapshotSchema: () => WorkspaceSnapshotSchema,
  successEnvelope: () => successEnvelope,
  utf8BoundedString: () => utf8BoundedString
});
import { z as z2 } from "zod";
function utf8BoundedString(maximum, minimum = 0) {
  return z2.string().refine((value) => {
    if (value.length > 0 && !value.toWellFormed) return false;
    return value === value.toWellFormed() && utf8.encode(value).byteLength >= minimum && utf8.encode(value).byteLength <= maximum;
  }, { message: `String must contain between ${minimum} and ${maximum} UTF-8 bytes` });
}
var ProtocolVersionSchema, RequestIdSchema, EntityIdSchema, OperationIdSchema, CommandIdSchema, SignalIdSchema, CursorSchema, RevisionSchema, TimestampSchema, utf8, ClientModelStringByteLimitsSchema, ClientModelLimitsSchema, CLIENT_MODEL_LIMITS, ErrorCodeSchema, ApiErrorSchema, EnvelopeBase, ErrorEnvelopeSchema, successEnvelope, CapabilityAvailabilitySchema, CapabilitiesSchema, ServiceLimitsSchema, DiscoverySchema, DiscoveryResponseSchema, WorkspaceCreationTemplateSchema, WorkspaceCreationRepositorySchema, WorkspaceCreationCatalogSchema, WorkspaceCreationBase, WorkspaceCreationRequestSchema, RepositorySnapshotSchema, LaunchStepSchema, NamedLaunchSpecificationSchema, LaunchSpecificationSchema, WorkspaceSnapshotSchema, WorkspaceSnapshotResponseSchema, TerminalLaunchResolutionRequestSchema, TerminalLaunchSpecificationSchema, TerminalLaunchResolutionSchema, SignalActivityStateSchema, SignalSourceSchema, SignalCommon, ActivitySignalSchema, NotificationSignalSchema, SignalSchema, SignalDismissalSchema, SIGNAL_MODEL_LIMITS, OperationStageSchema, OperationStateSchema, OperationProgressSchema, OperationResultSchema, OperationFailureSchema, OperationSchema, ReplayGapSchema, EventBase, ServiceEventSchema;
var init_contract = __esm({
  "../../../src/lib/service/contract.ts"() {
    "use strict";
    ProtocolVersionSchema = z2.literal("v1");
    RequestIdSchema = z2.string().regex(/^req_[A-Za-z0-9_-]{16,}$/);
    EntityIdSchema = z2.string().uuid();
    OperationIdSchema = z2.string().regex(/^op_[A-Za-z0-9_-]{16,}$/);
    CommandIdSchema = z2.string().regex(/^cmd_[A-Za-z0-9_-]{16,}$/);
    SignalIdSchema = z2.string().regex(/^sig_[A-Za-z0-9_-]{16,}$/);
    CursorSchema = z2.string().regex(/^(0|[1-9][0-9]*)$/);
    RevisionSchema = CursorSchema;
    TimestampSchema = z2.string().datetime({ offset: true });
    utf8 = new TextEncoder();
    ClientModelStringByteLimitsSchema = z2.strictObject({
      workspace_name: z2.literal(96),
      workspace_label: z2.literal(64),
      repository_name: z2.literal(96),
      command_id: z2.literal(64),
      command_name: z2.literal(96),
      surface_command_id: z2.literal(64),
      surface_title: z2.literal(64),
      surface_cwd: z2.literal(128),
      signal_id: z2.literal(64),
      signal_title: z2.literal(160),
      signal_detail: z2.literal(500),
      signal_occurred_at: z2.literal(40),
      launch_environment_value: z2.literal(4096)
    });
    ClientModelLimitsSchema = z2.strictObject({
      workspaces: z2.literal(16),
      labels_per_workspace: z2.literal(16),
      repositories_per_workspace: z2.literal(8),
      authoritative_pairs: z2.literal(32),
      live_pair_identities: z2.literal(32),
      reserved_orphan_tombstones: z2.literal(32),
      surfaces_per_pair: z2.literal(16),
      commands: z2.literal(64),
      signal_items: z2.literal(64),
      string_bytes: ClientModelStringByteLimitsSchema
    });
    CLIENT_MODEL_LIMITS = Object.freeze(ClientModelLimitsSchema.parse({
      workspaces: 16,
      labels_per_workspace: 16,
      repositories_per_workspace: 8,
      authoritative_pairs: 32,
      live_pair_identities: 32,
      reserved_orphan_tombstones: 32,
      surfaces_per_pair: 16,
      commands: 64,
      signal_items: 64,
      string_bytes: {
        workspace_name: 96,
        workspace_label: 64,
        repository_name: 96,
        command_id: 64,
        command_name: 96,
        surface_command_id: 64,
        surface_title: 64,
        surface_cwd: 128,
        signal_id: 64,
        signal_title: 160,
        signal_detail: 500,
        signal_occurred_at: 40,
        launch_environment_value: 4096
      }
    }));
    ErrorCodeSchema = z2.enum([
      "invalid_request",
      "unauthorized",
      "not_found",
      "conflict",
      "rate_limited",
      "capability_unavailable",
      "replay_gap",
      "snapshot_busy",
      "internal_error",
      "operation_failed",
      "idempotency_conflict",
      "request_timeout",
      "capacity_exceeded"
    ]);
    ApiErrorSchema = z2.strictObject({
      code: ErrorCodeSchema,
      message: z2.string().min(1),
      retryable: z2.boolean().optional(),
      details: z2.record(z2.string(), z2.union([z2.string(), z2.number(), z2.boolean(), z2.null()])).optional()
    });
    EnvelopeBase = { protocol: ProtocolVersionSchema, request_id: RequestIdSchema };
    ErrorEnvelopeSchema = z2.strictObject({ ...EnvelopeBase, ok: z2.literal(false), error: ApiErrorSchema });
    successEnvelope = (data) => z2.strictObject({ ...EnvelopeBase, ok: z2.literal(true), data });
    CapabilityAvailabilitySchema = z2.discriminatedUnion("available", [
      z2.strictObject({ available: z2.literal(true) }),
      z2.strictObject({ available: z2.literal(false), reason: z2.literal("capability_unavailable") })
    ]);
    CapabilitiesSchema = z2.strictObject({
      workspace_snapshots: CapabilityAvailabilitySchema,
      operations: CapabilityAvailabilitySchema,
      signals: CapabilityAvailabilitySchema
    });
    ServiceLimitsSchema = z2.strictObject({
      request_body_bytes: z2.number().int().positive(),
      subscriber_events: z2.number().int().positive(),
      subscriber_bytes: z2.number().int().positive(),
      client_model: ClientModelLimitsSchema
    });
    DiscoverySchema = z2.strictObject({ service_version: z2.string().min(1), capabilities: CapabilitiesSchema, limits: ServiceLimitsSchema });
    DiscoveryResponseSchema = successEnvelope(DiscoverySchema);
    WorkspaceCreationTemplateSchema = z2.strictObject({
      name: utf8BoundedString(96, 1),
      description: utf8BoundedString(160).optional(),
      repository_count: z2.number().int().nonnegative(),
      command_count: z2.number().int().nonnegative(),
      labels: z2.array(utf8BoundedString(64, 1)).max(16)
    });
    WorkspaceCreationRepositorySchema = z2.strictObject({
      name: utf8BoundedString(96, 1),
      type: utf8BoundedString(64, 1),
      default_branch: utf8BoundedString(96, 1)
    });
    WorkspaceCreationCatalogSchema = z2.strictObject({
      templates: z2.array(WorkspaceCreationTemplateSchema),
      repositories: z2.array(WorkspaceCreationRepositorySchema),
      client_model: ClientModelLimitsSchema
    });
    WorkspaceCreationBase = { name: utf8BoundedString(96, 1), branch: utf8BoundedString(96, 1) };
    WorkspaceCreationRequestSchema = z2.union([
      z2.strictObject({ ...WorkspaceCreationBase, source: z2.strictObject({ kind: z2.literal("template"), template: utf8BoundedString(96, 1) }) }),
      z2.strictObject({ ...WorkspaceCreationBase, source: z2.strictObject({ kind: z2.literal("repositories"), repositories: z2.array(utf8BoundedString(96, 1)).min(1).max(8).refine((v) => new Set(v).size === v.length) }) })
    ]);
    RepositorySnapshotSchema = z2.strictObject({
      id: EntityIdSchema,
      name: z2.string().min(1),
      mode: z2.enum(["worktree", "trunk", "dir"]),
      path: z2.string().min(1)
    });
    LaunchStepSchema = z2.strictObject({
      bucket: z2.enum(["pre", "main", "post"]),
      scope: z2.enum(["workspace", "repo"]),
      command: z2.string().min(1),
      cwd: z2.string().min(1),
      repository_id: EntityIdSchema.optional(),
      repository_name: z2.string().min(1).optional(),
      environment: z2.record(z2.string(), z2.string())
    }).refine((step) => step.scope === "repo" ? Boolean(step.repository_id && step.repository_name) : !step.repository_id && !step.repository_name, {
      message: "repository identity is required only for repository-scoped steps"
    });
    NamedLaunchSpecificationSchema = z2.strictObject({
      id: CommandIdSchema,
      name: z2.string().min(1),
      scope: z2.enum(["workspace", "repository"]),
      repository_id: EntityIdSchema.optional(),
      steps: z2.array(LaunchStepSchema)
    }).refine((command) => command.scope === "repository" ? Boolean(command.repository_id) : command.repository_id === void 0, {
      message: "repository identity is required only for repository-scoped commands"
    });
    LaunchSpecificationSchema = z2.strictObject({
      commands: z2.array(z2.string()),
      environment: z2.record(z2.string(), z2.string()),
      redacted: z2.array(z2.string()),
      references: z2.record(z2.string(), z2.string()),
      cwd: z2.string().min(1).optional(),
      ports: z2.record(z2.string(), z2.number().int()).optional(),
      named: z2.array(NamedLaunchSpecificationSchema).optional()
    });
    WorkspaceSnapshotSchema = z2.strictObject({
      id: EntityIdSchema,
      name: z2.string().min(1),
      branch: z2.string(),
      repositories: z2.array(RepositorySnapshotSchema),
      launch: LaunchSpecificationSchema,
      labels: z2.array(z2.string().min(1).max(64)).max(16).optional(),
      pinned: z2.boolean().optional(),
      priority: z2.number().int().min(-2147483648).max(2147483647).optional(),
      commands: z2.array(z2.string()).optional(),
      status: z2.array(z2.strictObject({
        repository_id: EntityIdSchema,
        name: utf8BoundedString(96, 1),
        exists: z2.boolean(),
        dirty: z2.boolean(),
        branch: utf8BoundedString(96),
        default_branch: utf8BoundedString(96, 1),
        mode: z2.enum(["worktree", "trunk", "dir"]),
        ahead: z2.number().int().nonnegative(),
        behind: z2.number().int().nonnegative(),
        additions: z2.number().int().nonnegative(),
        removals: z2.number().int().nonnegative(),
        remote: z2.enum(["available", "missing", "not_applicable"]),
        degraded: z2.boolean(),
        fetch_stale: z2.boolean().optional(),
        pull_request: z2.strictObject({ number: z2.number().int().positive(), state: z2.enum(["open", "draft", "merged", "closed"]), checks: z2.enum(["pending", "passing", "failing"]).optional() }).optional()
      })).optional(),
      file_status: z2.strictObject({
        total: z2.number().int().nonnegative(),
        ok: z2.number().int().nonnegative(),
        warnings: z2.number().int().nonnegative(),
        errors: z2.number().int().nonnegative(),
        attention: z2.number().int().nonnegative()
      }).optional()
    });
    WorkspaceSnapshotResponseSchema = z2.strictObject({
      ...EnvelopeBase,
      ok: z2.literal(true),
      revision: RevisionSchema,
      generated_at: TimestampSchema,
      workspace: WorkspaceSnapshotSchema
    });
    TerminalLaunchResolutionRequestSchema = z2.strictObject({
      workspace_id: EntityIdSchema,
      repository_id: EntityIdSchema,
      command_id: CommandIdSchema.optional(),
      expected_revision: RevisionSchema
    });
    TerminalLaunchSpecificationSchema = z2.strictObject({
      argv: z2.array(z2.string()).min(1),
      cwd: z2.string().min(1),
      environment: z2.record(z2.string(), z2.string()),
      ports: z2.record(z2.string(), z2.number().int()),
      configuration: z2.strictObject({ command_id: CommandIdSchema.optional(), shell: z2.boolean() }),
      redacted: z2.array(z2.string())
    });
    TerminalLaunchResolutionSchema = z2.discriminatedUnion("resolved", [
      z2.strictObject({ resolved: z2.literal(true), revision: RevisionSchema, launch: TerminalLaunchSpecificationSchema }),
      z2.strictObject({ resolved: z2.literal(false), error: ApiErrorSchema })
    ]);
    SignalActivityStateSchema = z2.enum(["working", "waiting", "completed", "failed", "idle"]);
    SignalSourceSchema = z2.enum(["claude", "copilot", "codex", "opencode", "automation", "acp", "user", "other"]);
    SignalCommon = {
      version: z2.literal(1),
      id: SignalIdSchema,
      source: SignalSourceSchema,
      workspace_id: EntityIdSchema,
      repository_id: EntityIdSchema.optional(),
      surface_id: EntityIdSchema.optional(),
      session_id: z2.string().min(1).max(160).optional(),
      title: utf8BoundedString(160, 1).optional(),
      detail: utf8BoundedString(500).optional(),
      occurred_at: TimestampSchema
    };
    ActivitySignalSchema = z2.strictObject({
      ...SignalCommon,
      kind: z2.literal("activity"),
      surface_id: EntityIdSchema,
      session_id: utf8BoundedString(160, 1),
      state: SignalActivityStateSchema,
      title: utf8BoundedString(160, 1).optional()
    }).refine((signal2) => signal2.repository_id !== void 0, { message: "surface-scoped activity requires a repository identity" });
    NotificationSignalSchema = z2.strictObject({
      ...SignalCommon,
      kind: z2.literal("notification"),
      title: utf8BoundedString(160, 1),
      state: z2.never().optional()
    });
    SignalSchema = z2.discriminatedUnion("kind", [ActivitySignalSchema, NotificationSignalSchema]);
    SignalDismissalSchema = z2.strictObject({ kind: z2.literal("dismiss_signal"), signal_id: SignalIdSchema });
    SIGNAL_MODEL_LIMITS = Object.freeze({ signal_items: 64, signal_id: 64, signal_title: 160, signal_detail: 500, signal_occurred_at: 40 });
    OperationStageSchema = z2.enum(["accepted", "preparing", "executing", "rolling_back", "completed"]);
    OperationStateSchema = z2.enum(["accepted", "running", "succeeded", "failed", "cancelled"]);
    OperationProgressSchema = z2.strictObject({
      stage: OperationStageSchema,
      message: z2.string().optional(),
      completed: z2.number().int().nonnegative().optional(),
      total: z2.number().int().positive().optional(),
      data: z2.record(z2.string(), z2.unknown()).optional()
    }).refine((v) => v.completed === void 0 === (v.total === void 0), { message: "completed and total must be provided together" });
    OperationResultSchema = z2.strictObject({
      operation_id: OperationIdSchema,
      state: z2.literal("succeeded"),
      accepted_at: TimestampSchema,
      started_at: TimestampSchema,
      finished_at: TimestampSchema,
      completed_steps: z2.array(z2.string()),
      result: z2.record(z2.string(), z2.unknown()).optional()
    });
    OperationFailureSchema = z2.strictObject({
      operation_id: OperationIdSchema,
      state: z2.enum(["failed", "cancelled"]),
      accepted_at: TimestampSchema,
      started_at: TimestampSchema.optional(),
      finished_at: TimestampSchema,
      completed_steps: z2.array(z2.string()),
      error: ApiErrorSchema,
      rollback_attempted: z2.boolean(),
      rollback_succeeded: z2.boolean(),
      rollback_errors: z2.array(ApiErrorSchema)
    });
    OperationSchema = z2.discriminatedUnion("state", [
      z2.strictObject({ operation_id: OperationIdSchema, state: z2.literal("accepted"), accepted_at: TimestampSchema }),
      z2.strictObject({ operation_id: OperationIdSchema, state: z2.literal("running"), accepted_at: TimestampSchema, started_at: TimestampSchema, progress: OperationProgressSchema }),
      OperationResultSchema,
      OperationFailureSchema
    ]);
    ReplayGapSchema = z2.strictObject({ requested: CursorSchema, oldest_available: CursorSchema, newest_available: CursorSchema });
    EventBase = { protocol: ProtocolVersionSchema, sequence: CursorSchema, timestamp: TimestampSchema };
    ServiceEventSchema = z2.discriminatedUnion("type", [
      z2.strictObject({ ...EventBase, type: z2.literal("operation"), operation: OperationSchema }),
      z2.strictObject({ ...EventBase, type: z2.literal("signal"), signal: z2.union([SignalSchema, SignalDismissalSchema]) }),
      z2.strictObject({ ...EventBase, type: z2.literal("control"), control: z2.discriminatedUnion("kind", [
        z2.strictObject({ kind: z2.literal("heartbeat") }),
        z2.strictObject({ kind: z2.literal("replay_gap"), gap: ReplayGapSchema }),
        z2.strictObject({ kind: z2.literal("snapshot_invalidated"), revision: RevisionSchema })
      ]) })
    ]);
  }
});

// probe.ts
import { mkdtempSync, readFileSync as readFileSync2, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as join3 } from "node:path";
var root = mkdtempSync(join3(tmpdir(), "git-stacks-node-core-"));
process.env.GIT_STACKS_CONFIG_DIR = root;
var config = await Promise.resolve().then(() => (init_config(), config_exports));
var { matchesLabels: matchesLabels2 } = await Promise.resolve().then(() => (init_labels(), labels_exports));
var { setWorkspacePriorities: setWorkspacePriorities2 } = await Promise.resolve().then(() => (init_workspace_priorities(), workspace_priorities_exports));
var { SignalState: SignalState2 } = await Promise.resolve().then(() => (init_signal_state(), signal_state_exports));
var presentation = await Promise.resolve().then(() => (init_presentation(), presentation_exports));
var { SignalSchema: SignalSchema2 } = await Promise.resolve().then(() => (init_contract(), contract_exports));
var workspace = {
  id: crypto.randomUUID(),
  name: "node-core",
  branch: "feature/node-core",
  created: (/* @__PURE__ */ new Date()).toISOString(),
  repos: [],
  labels: ["architecture", "node"]
};
config.writeGlobalConfig({ workspace_root: join3(root, "workspaces"), integrations: {}, ports: { range_start: 1e4, range_end: 65e3 } });
config.writeWorkspace(workspace);
var parsed = config.readWorkspace(workspace.name);
var listed = config.listWorkspacesUncached();
setWorkspacePriorities2([{ workspace_id: workspace.id, priority: 25 }], {
  listWorkspaces: () => config.listWorkspacesUncached(),
  writeWorkspace: config.writeWorkspace
});
var prioritized = config.readWorkspace(workspace.name);
var state = new SignalState2();
var signal = SignalSchema2.parse({
  version: 1,
  kind: "activity",
  id: `sig_${"a".repeat(16)}`,
  source: "codex",
  state: "working",
  workspace_id: workspace.id,
  repository_id: crypto.randomUUID(),
  surface_id: crypto.randomUUID(),
  session_id: "session-node",
  occurred_at: (/* @__PURE__ */ new Date()).toISOString()
});
state.apply({ sequence: "1", signal });
var projection = state.projection();
var yaml = readFileSync2(config.workspaceFilePath(workspace.name), "utf8");
var report = {
  runtime: process.version,
  platform: `${process.platform}-${process.arch}`,
  passed: parsed.name === workspace.name && listed.length === 1 && prioritized.priority === 25 && matchesLabels2(prioritized, ["architecture", "node"]) && projection.signals.length === 1 && presentation.providerName(projection.signals[0].source) === "Codex" && yaml.includes("priority: 25"),
  checks: {
    atomicYamlRoundTrip: parsed.name === workspace.name && yaml.includes("priority: 25"),
    localPriorityMutation: prioritized.priority === 25,
    labelFiltering: matchesLabels2(prioritized, ["architecture", "node"]),
    sharedSignalReduction: projection.signals.length === 1,
    sharedPresentation: presentation.providerName(projection.signals[0].source)
  },
  bundle: "single ESM artifact targeting Node 20"
};
rmSync(root, { recursive: true, force: true });
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
//# sourceMappingURL=probe.mjs.map
