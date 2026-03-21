# Design Decision: Stack Model vs Registry + Template + Workspace Model

**Status:** Decided
**Date:** 2026-03-18
**Requirements:** DESIGN-01, DESIGN-02

## Decision

**Stacks are eliminated.** Replaced by a three-primitive model: Repo Registry + Template + Workspace.

This is a zerover, clean break — no migration path, no backward compatibility for existing stack YAMLs.

---

## Model Overview

### Old Model (Stack + Workspace)

- **Stack** — a named set of repos with paths, types, and default modes. Stored as one YAML per stack at `~/.config/git-stacks/stacks/{name}.yml`.
- **Workspace** — a task-scoped instance created from a stack. Each workspace repo had a `stack: <name>` field pointing back to the stack definition.

### New Model (Registry + Template + Workspace)

- **Repo Registry** — a single flat file (`~/.config/git-stacks/registry.yml`) listing all repos on the machine by name. Each entry has: `name`, `local_path`, `default_branch`, `type`. This is the source of truth for where repos live.
- **Template** (optional) — an unrealized workspace recipe. References repos by registry name (no paths). Stores per-repo mode, base branch, branch pattern (`feature/<workspace-name>`), hooks, env, files, integrations. Stored at `~/.config/git-stacks/templates/{name}.yml`.
- **Workspace** — a task-scoped instance. Created from a template or ad-hoc from registry. Stores `template: <name>` as informational provenance (not a live link). Workspace is a snapshot at creation time.

---

## Workflow Comparisons

### Workflow 1: Onboarding a New Developer

**Old model:**
1. DevOps creates a stack YAML with hardcoded absolute paths (e.g., `/home/alice/workspaces/main/api`).
2. New developer clones the stack YAML into their `~/.config/git-stacks/stacks/`. Paths are wrong — they reference Alice's machine.
3. Developer must manually edit all repo paths to match their local directory structure.
4. Stack is now machine-specific and cannot be shared as-is.

**New model:**
1. DevOps creates a template YAML with repo registry names: `repo: api`, `repo: web`. No paths.
2. New developer runs `git-stacks repo add /home/bob/repos/api` to register repos on their machine.
3. Developer runs `git-stacks new TICKET-123 --from backend-template`. Template references `api` and `web` — resolved from the new developer's registry.
4. Template is portable — the same YAML works on any machine that has the repos registered.

**Winner: New model.** Old model requires manual path editing for every new team member. New model separates "where the repo lives" (registry, per-machine) from "how to use repos together" (template, portable).

---

### Workflow 2: Creating a Feature Branch Workspace Across 5 Repos

**Old model:**
1. Create or find a stack with the right 5 repos.
2. Run `git-stacks new JIRA-456`. The workspace is created with `branch: JIRA-456`.
3. All worktrees get a branch named `JIRA-456`. No way to use `feature/JIRA-456` without creating a new stack variant.
4. To use a different branch name pattern, the user must create another stack — one stack per branch naming convention.
5. 5 stacks in practice: `main-api-only`, `frontend-full`, `backend-full`, `backend-frontend`, `all-services`. Each duplicates the repo list with different modes.

**New model:**
1. Create a template with `branch_pattern: "feature/<workspace-name>"` per repo.
2. Run `git-stacks new JIRA-456 --from backend-template`.
3. `<workspace-name>` is replaced with `JIRA-456` at creation time → branch `feature/JIRA-456` created in each repo.
4. Template covers all feature branches. One template, infinite workspaces.
5. Per-repo mode (`worktree` vs `trunk`) is set in the template once, not duplicated.

**Winner: New model.** Branch pattern placeholders eliminate the need for multiple stacks per branch naming convention. Templates are reusable in a way stacks never were.

---

### Workflow 3: Sharing Workspace Config Across Machines

**Old model:**
1. User A has workspace YAML: `repos: [{name: api, stack: backend, main_path: /home/usera/workspaces/main/api}]`
2. User B wants the same workspace setup. They copy the workspace YAML.
3. `main_path` references User A's machine. Zod parse fails or worktree creation fails silently.
4. User B must also have the `backend` stack, with correct paths for their machine.
5. Sharing requires sharing both the workspace YAML AND a correctly-patched stack YAML. Not practical.

**New model:**
1. User B registers repos on their machine: `git-stacks repo add ~/repos/api`.
2. User A shares the template YAML (no paths). User B copies it to `~/.config/git-stacks/templates/`.
3. User B runs `git-stacks new TICKET-789 --from shared-template`. Paths resolved from User B's registry.
4. Workspace is created correctly on User B's machine without any manual path editing.

**Winner: New model.** Templates contain zero machine-specific data. Registry is the only machine-specific file, and it's generated locally. Templates can be checked into a team repo and shared freely.

---

## Why Stacks Failed to Deliver Reuse

1. **One stack per target branch.** Stacks had no branch placeholder mechanism. Each branch naming convention required a separate stack. Teams ended up with stacks like `feature-frontend`, `feature-backend`, `hotfix-backend` — divergent copies of essentially the same configuration.

2. **Repo paths embedded in stacks.** `StackRepoSchema.path` stored the absolute local path to the repo. This made stacks machine-specific. A stack written on one developer's machine could not be used on another without path surgery.

3. **Stack as both "template" and "instance" config.** Stacks tried to serve two purposes: describe repos (structural) and prescribe behavior (operational). This produced confusion about what belongs in a stack vs. a workspace.

4. **No composition or inheritance.** Stacks could not reference other stacks. There was no way to say "this stack extends the backend stack but adds a frontend repo." Every combination required a full duplicate.

5. **Discovery friction.** `git-stacks stack list` shows all stacks but gives no indication of which workspace was created from which stack. The `stack:` field in workspace repos linked back by name, but the link was checked only by `doctor` — never surfaced in normal UX.

---

## Backward Compatibility Stance

**This is a zerover clean break.** No migration tooling will be provided.

- Existing stack YAMLs at `~/.config/git-stacks/stacks/` will be orphaned. They will not be read, migrated, or deleted.
- Existing workspace YAMLs with `stack:` field in repo entries will fail `WorkspaceSchema` validation after the schema rename (`stack` → `repo`). `listWorkspaces()` will warn and skip them — this is the existing CONF-01 behavior.
- The `git-stacks stack *` command group is removed entirely. Any shell aliases or scripts referencing `stack` subcommands will break.
- The `STACKS_DIR` constant is removed from paths.ts. Any tooling that reads from `~/.config/git-stacks/stacks/` is orphaned.

**Rationale:** The project follows zerover semantics. The Stack model was never stable enough to warrant a migration path. Users with existing workspaces will need to re-create them under the new model. Given that workspaces are ephemeral task-scoped constructs (not long-lived state), this is acceptable.

---

## Registry Storage Design

**Decision:** Single flat file `~/.config/git-stacks/registry.yml` — an array of `RepoRegistryEntry` objects.

**Rationale:** Simpler than per-repo files. Consistent with `config.yml` (global config). Atomic reads. For a single-user CLI tool, concurrent write conflicts are not a real concern.

---

## Fulfillment of Requirements

- **DESIGN-01:** Three representative workflows compared (onboarding, feature branch creation, cross-machine sharing). Winning model documented with rationale.
- **DESIGN-02:** Decision documented — Stacks are eliminated, not renamed or supplemented. Backward-compatibility stance: zerover, clean break, no migration.
