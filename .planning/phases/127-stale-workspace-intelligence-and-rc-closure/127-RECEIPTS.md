# Phase 127 Exact-Candidate Evidence Receipts

This ledger freezes one release-candidate commit and separates local deterministic proof from every hosted, authenticated, live, physical, visual, interactive, human, and release-authority class. The marker-delimited JSON object is the canonical source of truth; the tables below are generated views of that object.

## Candidate Identity

| Field | Value |
|---|---|
| Candidate SHA | 233d294913bd4cd37602f6ef72f53cb960fb12d7 |
| Superseded candidate | f7bdca75f2545664251e88b233693b67fd37ee5c |
| Branch at freeze | planning/phase-127-revision-1 |
| Captured UTC | 2026-07-17T19:05:06Z |
| Package version | 0.22.0-rc.1 |
| Intended tag | v0.22.0-rc.1 |
| npm channel | next |
| Release authority | NOT_AUTHORIZED |

The replacement candidate was captured from a clean committed worktree after the catalog, TUI lifecycle, and service-authentication repairs and before this ledger was rebound. It supersedes `f7bdca75f2545664251e88b233693b67fd37ee5c`; no deterministic or human approval from that older source is reused. The replacement ledger and later validation commits must remain descendants of this immutable SHA and must not redefine it.

## Status Legend

| Status | Meaning |
|---|---|
| PASS | Exact-candidate local deterministic command output exists and the named check passed. |
| PENDING | Required external/manual evidence has not been supplied for this exact candidate SHA. |
| NOT_CLAIMED | Support is not claimed because no explicit supported-host list and exact-SHA receipts exist. |
| OPT_OUT | Capability is intentionally excluded with a recorded reason. |
| NOT_AUTHORIZED | No authority exists for tag, push, publish, release, or release-workflow actions. |

## Deterministic Local Receipts

| Receipt | Evidence class | Result | Command or audit | Candidate SHA |
|---|---|---|---|---|
| candidate_freeze | LOCAL_DETERMINISTIC | PASS | git rev-parse HEAD | 233d294913bd4cd37602f6ef72f53cb960fb12d7 |
| web_auto_launch | LOCAL_DETERMINISTIC | PASS | npm run build:packages; service stopped; node packages/cli/dist/index.js web | 233d294913bd4cd37602f6ef72f53cb960fb12d7 |
| release_check | LOCAL_DETERMINISTIC | PASS | npm run release:check | 233d294913bd4cd37602f6ef72f53cb960fb12d7 |
| tag_ref_integrity | LOCAL_DETERMINISTIC | PASS | git for-each-ref --format='%(refname):%(objectname)' refs/tags before and after npm run release:check | 233d294913bd4cd37602f6ef72f53cb960fb12d7 |
| planning_directory_integrity | LOCAL_DETERMINISTIC | PASS | compare .planning/phases directory inventory before and after npm run release:check | 233d294913bd4cd37602f6ef72f53cb960fb12d7 |
| outward_release_actions | EXECUTION_BOUNDARY | PASS | execution audit | 233d294913bd4cd37602f6ef72f53cb960fb12d7 |

- The repeated command was exactly `npm run release:check` with no tag flag and exited zero.
- A fresh package build followed by a cold one-command web launch started the managed service and opened the secure packaged client without `LocalEnvironmentPreparationError`; the service was stopped afterward.
- The complete command output existed locally and is represented by its SHA-256 digest in the canonical JSON; raw output is not embedded because it may contain machine-specific detail.
- All 41 tag refs were byte-identical before and after validation, and `v0.22.0-rc.1` was absent before and after.
- All 5 pre-existing phase directories remained present with an identical directory inventory; the repository was clean after validation.
- No tag, push, package publication, GitHub Release, hosted/release workflow dispatch, or release authorization occurred.
- These PASS receipts do not promote any external/manual row.

## Provider Capability Dispositions

| Capability | Disposition | Reason |
|---|---|---|
| GitHub.com pull-request read-only status | INTEGRATE |  |
| GitLab.com merge-request read-only status | INTEGRATE |  |
| Authenticated GitHub.com exact-SHA status | INTEGRATE |  |
| Authenticated GitLab.com exact-SHA status | INTEGRATE |  |
| Gitea change-status lookup | OPT_OUT | D-14 excludes Gitea status parity and requires a sanitized unsupported-provider outcome. |
| Self-hosted GitHub/GitLab status | NOT_CLAIMED | No explicit supported-host list or exact-candidate-SHA receipts were supplied. |
| Provider mutation | OPT_OUT | Stale intelligence is advisory and read-only and cannot mutate provider state. |
| Provider search or identity inference | OPT_OUT | Validated persisted provenance is required; branch and remote inference are forbidden. |
| Provider checkout or repository mutation | OPT_OUT | Status evaluation must not create refs, check out branches, or mutate repositories. |
| Background polling or base-snapshot provider work | OPT_OUT | D-05 requires one lazy revision-bound route with explicit view refresh. |

## External and Manual Evidence Rows

| Receipt ID | Evidence class | Status | Required subcases | Candidate SHA | Gate |
|---|---|---|---|---|---|
| HST-RUNTIME | hosted-runtime | PENDING | 9 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 1 hosted/authenticated checkpoint |
| HST-SHELL | configured-shell | PENDING | 22 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 1 hosted/authenticated checkpoint |
| HST-SSH | configured-shell-ssh-agent | PENDING | 8 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 1 hosted/authenticated checkpoint |
| AUTH-GH-STATUS | authenticated-provider-status | PENDING | 12 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 1 hosted/authenticated checkpoint |
| AUTH-GL-STATUS | authenticated-provider-status | PENDING | 12 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 1 hosted/authenticated checkpoint |
| FORGE-GH-SAME | authenticated-forge-create | PENDING | 14 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 1 hosted/authenticated checkpoint |
| FORGE-GH-FORK | authenticated-forge-create | PENDING | 14 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 1 hosted/authenticated checkpoint |
| FORGE-GL-SAME | authenticated-forge-create | PENDING | 14 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 1 hosted/authenticated checkpoint |
| FORGE-GL-FORK | authenticated-forge-create | PENDING | 14 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 1 hosted/authenticated checkpoint |
| FORGE-RECOVERY | authenticated-forge-recovery | PENDING | 27 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 1 hosted/authenticated checkpoint |
| LIVE-ARCHIVE | live-service-manual | PENDING | 14 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 2 physical/manual checkpoint |
| LIVE-REMOVE-FORCE | live-service-manual | PENDING | 15 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 2 physical/manual checkpoint |
| LIVE-STALE | live-service-manual | PENDING | 25 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 2 physical/manual checkpoint |
| LIVE-ATTENTION-FUZZY | live-service-manual | PENDING | 12 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 2 physical/manual checkpoint |
| LIVE-P126-ACTIONS | live-service-manual | PENDING | 23 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 2 physical/manual checkpoint |
| LIVE-P126-NOTES | live-service-manual | PENDING | 13 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 2 physical/manual checkpoint |
| LIVE-P126-FILE-STATUS | live-service-manual | PENDING | 15 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 2 physical/manual checkpoint |
| LIVE-LIFECYCLE | live-service-manual | PENDING | 17 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 2 physical/manual checkpoint |
| PHYS-BROWSER-XTERM | physical-browser-manual | PENDING | 20 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 2 physical/manual checkpoint |
| VIS-RESPONSIVE | responsive-visual-manual | PENDING | 27 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 2 physical/manual checkpoint |
| INT-TUI | interactive-tui-manual | PENDING | 20 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 2 physical/manual checkpoint |
| HUMAN-PARITY | human-cross-client-parity | PENDING | 21 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | 127-13 Task 2 physical/manual checkpoint |
| RELEASE-AUTHORIZATION | release-authorization | NOT_AUTHORIZED | 6 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | Separate explicit operator authorization outside Phase 127 |

Every HST/AUTH/FORGE/LIVE/PHYS/VIS/INT/HUMAN row remains PENDING with null evidence until safe exact-candidate-SHA evidence covers every immutable `required_subcases` entry. Self-hosted support remains NOT_CLAIMED without an explicit host list. RELEASE-AUTHORIZATION remains NOT_AUTHORIZED.

## Planned Human Checkpoint Classes

1. **Hosted/authenticated checkpoint:** HST-RUNTIME, HST-SHELL, HST-SSH, AUTH-GH-STATUS, AUTH-GL-STATUS, all four provider/topology FORGE rows, and FORGE-RECOVERY.
2. **Physical/manual checkpoint:** LIVE-ARCHIVE, LIVE-REMOVE-FORCE, LIVE-STALE, LIVE-ATTENTION-FUZZY, LIVE-P126-ACTIONS, LIVE-P126-NOTES, LIVE-P126-FILE-STATUS, LIVE-LIFECYCLE, PHYS-BROWSER-XTERM, VIS-RESPONSIVE, INT-TUI, and HUMAN-PARITY.

One generic approval cannot satisfy multiple rows. Plan 127-13 must return row-keyed exact-SHA approvals with an approved-subcase set equal to each immutable required list; Plan 127-14 alone may sanitize and reconcile those approvals.

## Edge Assumptions

- **A-EDGE-STALE-03:** CLOSED_DETERMINISTIC by green runtime mutation sentinels plus hostile read-only capability tests. This does not claim live or human proof.
- **A-EDGE-REL-01:** UNRESOLVED and flagged until operator review accepts safe exact-SHA evidence for every required external/manual row.

## Canonical Machine-Readable Record

<!-- phase127-receipts-json:start -->
{
  "schema_version": 1,
  "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
  "supersedes_candidate_sha": "f7bdca75f2545664251e88b233693b67fd37ee5c",
  "branch": "planning/phase-127-revision-1",
  "captured_at": "2026-07-17T19:05:06Z",
  "version": "0.22.0-rc.1",
  "tag": "v0.22.0-rc.1",
  "channel": "next",
  "release_authority": "NOT_AUTHORIZED",
  "deterministic_receipts": {
    "candidate_freeze": {
      "evidence_class": "LOCAL_DETERMINISTIC",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "command": "git rev-parse HEAD",
      "captured_at": "2026-07-17T19:05:06Z",
      "result": "PASS",
      "clean_worktree_and_index": true,
      "ledger_absent_at_capture": false,
      "replacement_ledger_not_yet_rebound": true
    },
    "web_auto_launch": {
      "evidence_class": "LOCAL_DETERMINISTIC",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "build_command": "npm run build:packages",
      "launch_command": "node packages/cli/dist/index.js web",
      "managed_service_running_before_launch": false,
      "managed_service_started_by_launch": true,
      "secure_packaged_client_opened": true,
      "local_environment_preparation_error": false,
      "managed_service_stopped_after_launch": true,
      "observed_at": "2026-07-17T18:59:27Z",
      "result": "PASS",
      "limitation": "Local cold-launch proof does not satisfy HST-RUNTIME or any physical, visual, interactive, or human row."
    },
    "release_check": {
      "evidence_class": "LOCAL_DETERMINISTIC",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "command": "npm run release:check",
      "tag_flag_supplied": false,
      "started_at": "2026-07-17T19:02:06Z",
      "completed_at": "2026-07-17T19:03:46Z",
      "exit_code": 0,
      "result": "PASS",
      "sanitized_result": "RC verification passed for 0.22.0-rc.1.",
      "output_sha256": "aad0b0d2f37d0988f47230fea01f4bbb932f46a6d1bab1f672ff50ff69cbfb69",
      "artifact_reference": "127-12-SUMMARY.md local validation receipt",
      "local_runtime": {
        "node": "v26.5.0",
        "npm": "11.17.0",
        "limitation": "Local runtime metadata does not satisfy HST-RUNTIME or any hosted OS/architecture row."
      },
      "limitation": "This local deterministic pass does not satisfy hosted, authenticated, live, physical, visual, interactive, human, or release-authorization rows."
    },
    "tag_ref_integrity": {
      "evidence_class": "LOCAL_DETERMINISTIC",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "command": "git for-each-ref --format='%(refname):%(objectname)' refs/tags before and after npm run release:check",
      "result": "PASS",
      "ref_count_before": 41,
      "ref_count_after": 41,
      "snapshot_sha256_before": "e40ec092d8b7158398327c98156f853b6a32ac8b6843dd291739cc75c2526b86",
      "snapshot_sha256_after": "e40ec092d8b7158398327c98156f853b6a32ac8b6843dd291739cc75c2526b86",
      "identical": true,
      "intended_tag_present_before": false,
      "intended_tag_present_after": false
    },
    "planning_directory_integrity": {
      "evidence_class": "LOCAL_DETERMINISTIC",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "command": "compare .planning/phases directory inventory before and after npm run release:check",
      "result": "PASS",
      "directory_count_before": 5,
      "directory_count_after": 5,
      "inventory_sha256_before": "8db96d493d452ccc7ef19807d937010de909525b26fd53d7599481f2dfe98ad4",
      "inventory_sha256_after": "8db96d493d452ccc7ef19807d937010de909525b26fd53d7599481f2dfe98ad4",
      "identical": true,
      "worktree_clean_after_validation": true
    },
    "outward_release_actions": {
      "evidence_class": "EXECUTION_BOUNDARY",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "result": "PASS",
      "git_tag": "NOT_PERFORMED",
      "git_push": "NOT_PERFORMED",
      "package_publish": "NOT_PERFORMED",
      "github_release": "NOT_PERFORMED",
      "hosted_or_release_workflow_dispatch": "NOT_PERFORMED",
      "release_authorization": "NOT_GRANTED"
    }
  },
  "capabilities": {
    "github_com_pull_request_read_only_status": "INTEGRATE",
    "gitlab_com_merge_request_read_only_status": "INTEGRATE",
    "authenticated_github_com_exact_sha_status": "INTEGRATE",
    "authenticated_gitlab_com_exact_sha_status": "INTEGRATE",
    "gitea_change_status": "OPT_OUT",
    "gitea_change_status_reason": "D-14 excludes Gitea status parity and requires a sanitized unsupported-provider outcome.",
    "self_hosted": "NOT_CLAIMED",
    "self_hosted_reason": "No explicit supported-host list or exact-candidate-SHA receipts were supplied.",
    "provider_mutation": "OPT_OUT",
    "provider_mutation_reason": "Stale intelligence is advisory and read-only and cannot mutate provider state.",
    "provider_search_or_identity_inference": "OPT_OUT",
    "provider_search_or_identity_inference_reason": "Validated persisted provenance is required; branch and remote inference are forbidden.",
    "provider_checkout_or_repository_mutation": "OPT_OUT",
    "provider_checkout_or_repository_mutation_reason": "Status evaluation must not create refs, check out branches, or mutate repositories.",
    "background_polling_or_base_snapshot_provider_work": "OPT_OUT",
    "background_polling_or_base_snapshot_provider_work_reason": "D-05 requires one lazy revision-bound route with explicit view refresh."
  },
  "assumptions": {
    "A-EDGE-STALE-03": {
      "status": "CLOSED_DETERMINISTIC",
      "flagged": false,
      "outcome": "Runtime mutation sentinels and hostile read-only capability proofs passed; this is not live or human evidence.",
      "source": ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-09-SUMMARY.md"
    },
    "A-EDGE-REL-01": {
      "status": "UNRESOLVED",
      "flagged": true,
      "outcome": "Operator review and every exact-candidate-SHA external/manual row remain required.",
      "source": ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md"
    }
  },
  "rows": {
    "HST-RUNTIME": {
      "description": "Hosted supported-runtime, package-policy, and optional TUI matrix",
      "evidence_class": "hosted-runtime",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "node24_ubuntu_24_04_x64",
        "node24_ubuntu_24_04_arm64",
        "node24_macos_15_intel_x64",
        "node24_macos_15_apple_silicon_arm64",
        "package_and_policy_gate",
        "optional_bun_tui_gate",
        "supported_shell_job_matrix",
        "safe_run_references",
        "artifact_checksums"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 1 hosted/authenticated checkpoint"
    },
    "HST-SHELL": {
      "description": "Configured Bash, zsh, and fish command, hook, PTY, initialization, and diagnostic behavior",
      "evidence_class": "configured-shell",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "bash_configured_command",
        "bash_lifecycle_hook",
        "bash_interactive_pty",
        "zsh_configured_command",
        "zsh_lifecycle_hook",
        "zsh_interactive_pty",
        "fish_configured_command",
        "fish_lifecycle_hook",
        "fish_interactive_pty",
        "profile_only_runtime_manager",
        "profile_only_shell_function",
        "profile_only_alias",
        "authoritative_overlay_precedence",
        "dynamic_path_refresh",
        "output_and_exit_status_preservation",
        "quoting_preservation",
        "cancellation_and_process_tree_cleanup",
        "broken_startup_file_diagnostic",
        "missing_executable_diagnostic",
        "unsupported_shell_diagnostic",
        "initialization_timeout_diagnostic",
        "no_raw_environment_disclosure"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 1 hosted/authenticated checkpoint"
    },
    "HST-SSH": {
      "description": "Dynamic SSH-agent authority across refreshed configured-shell launches",
      "evidence_class": "configured-shell-ssh-agent",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "ssh_auth_sock_allowlisted_refresh",
        "ssh_agent_discovery",
        "ssh_add_behavior",
        "socket_rotation_without_service_restart",
        "configured_command_uses_rotated_socket",
        "lifecycle_hook_uses_rotated_socket",
        "interactive_pty_uses_rotated_socket",
        "no_raw_socket_value_or_key_material_disclosure"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 1 hosted/authenticated checkpoint"
    },
    "AUTH-GH-STATUS": {
      "description": "Authenticated GitHub.com read-only pull-request status and sanitized recovery",
      "evidence_class": "authenticated-provider-status",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "authenticated_pull_request_merged",
        "authenticated_pull_request_closed",
        "authenticated_pull_request_open",
        "missing_cli_sanitized_unknown",
        "authentication_required_sanitized_unknown",
        "rate_limit_sanitized_unknown",
        "provider_unavailable_sanitized_unknown",
        "request_timeout_sanitized_unknown",
        "request_abort_sanitized_unknown",
        "malformed_or_oversized_json_sanitized_unknown",
        "recovery_after_transient_failure",
        "bounded_argv_only_read_only_execution"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md"
      ],
      "gate": "127-13 Task 1 hosted/authenticated checkpoint"
    },
    "AUTH-GL-STATUS": {
      "description": "Authenticated GitLab.com read-only merge-request status and sanitized recovery",
      "evidence_class": "authenticated-provider-status",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "authenticated_merge_request_merged",
        "authenticated_merge_request_closed",
        "authenticated_merge_request_open",
        "missing_cli_sanitized_unknown",
        "authentication_required_sanitized_unknown",
        "rate_limit_sanitized_unknown",
        "provider_unavailable_sanitized_unknown",
        "request_timeout_sanitized_unknown",
        "request_abort_sanitized_unknown",
        "malformed_or_oversized_json_sanitized_unknown",
        "recovery_after_transient_failure",
        "bounded_argv_only_read_only_execution"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md"
      ],
      "gate": "127-13 Task 1 hosted/authenticated checkpoint"
    },
    "FORGE-GH-SAME": {
      "description": "GitHub same-repository full URL Resolve, editable Review, and explicit Create",
      "evidence_class": "authenticated-forge-create",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "full_pull_request_url_resolve",
        "source_resolved_without_creation",
        "editable_workspace_name",
        "editable_template",
        "editable_repository_plan",
        "editable_branch_plan",
        "immutable_host_repository_change_anchors",
        "immutable_head_base_source_anchors",
        "reviewed_real_head_sha",
        "explicit_one_shot_create",
        "ordinary_git_and_worktree_creation",
        "same_repository_topology",
        "no_provider_checkout",
        "authoritative_post_create_reconciliation"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 1 hosted/authenticated checkpoint"
    },
    "FORGE-GH-FORK": {
      "description": "GitHub fork-source full URL Resolve, editable Review, and explicit Create",
      "evidence_class": "authenticated-forge-create",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "full_pull_request_url_resolve",
        "source_resolved_without_creation",
        "editable_workspace_name",
        "editable_template",
        "editable_repository_plan",
        "editable_branch_plan",
        "immutable_host_repository_change_anchors",
        "immutable_head_base_source_anchors",
        "reviewed_real_head_sha",
        "explicit_one_shot_create",
        "ordinary_git_and_worktree_creation",
        "fork_source_topology",
        "no_provider_checkout",
        "authoritative_post_create_reconciliation"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 1 hosted/authenticated checkpoint"
    },
    "FORGE-GL-SAME": {
      "description": "GitLab same-project full URL Resolve, editable Review, and explicit Create",
      "evidence_class": "authenticated-forge-create",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "full_merge_request_url_resolve",
        "source_resolved_without_creation",
        "editable_workspace_name",
        "editable_template",
        "editable_repository_plan",
        "editable_branch_plan",
        "immutable_host_repository_change_anchors",
        "immutable_source_target_head_anchors",
        "reviewed_real_head_sha",
        "explicit_one_shot_create",
        "ordinary_git_and_worktree_creation",
        "same_project_topology",
        "no_provider_checkout",
        "authoritative_post_create_reconciliation"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 1 hosted/authenticated checkpoint"
    },
    "FORGE-GL-FORK": {
      "description": "GitLab fork-source full URL Resolve, editable Review, and explicit Create",
      "evidence_class": "authenticated-forge-create",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "full_merge_request_url_resolve",
        "source_resolved_without_creation",
        "editable_workspace_name",
        "editable_template",
        "editable_repository_plan",
        "editable_branch_plan",
        "immutable_host_repository_change_anchors",
        "immutable_source_target_head_anchors",
        "reviewed_real_head_sha",
        "explicit_one_shot_create",
        "ordinary_git_and_worktree_creation",
        "fork_source_topology",
        "no_provider_checkout",
        "authoritative_post_create_reconciliation"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 1 hosted/authenticated checkpoint"
    },
    "FORGE-RECOVERY": {
      "description": "Complete GitHub/GitLab same/fork Resolve, Review, Create recovery and rollback matrix",
      "evidence_class": "authenticated-forge-recovery",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "missing_provider_cli",
        "authentication_required",
        "unsupported_host",
        "unconfigured_host",
        "malformed_change_url_or_metadata",
        "inaccessible_change",
        "closed_change",
        "missing_change",
        "rate_limit",
        "provider_outage",
        "no_repository_match",
        "ambiguous_repository_match",
        "template_repository_mismatch",
        "non_worktree_mode",
        "unreachable_fork_or_source_repository",
        "source_or_head_movement",
        "stale_catalog_revision",
        "expired_review_token",
        "branch_conflict",
        "cancellation",
        "request_timeout",
        "creation_failure",
        "rollback_no_workspace_yaml",
        "rollback_no_worktree",
        "rollback_no_private_ref",
        "rollback_no_browser_local_draft",
        "rollback_no_replayable_create_intent"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 1 hosted/authenticated checkpoint"
    },
    "LIVE-ARCHIVE": {
      "description": "Complete archived-workspace lifecycle and active/archive-empty transitions in web and TUI",
      "evidence_class": "live-service-manual",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "web_archive_confirms_terminal_exit_before_persistence",
        "tui_archive_confirms_terminal_exit_before_persistence",
        "terminal_exit_failure_leaves_archive_state_unchanged",
        "successor_order_pin_priority_activity_and_stable_identity",
        "web_undo_archive",
        "tui_undo_archive",
        "unarchive_preserves_resources_without_terminal_recreation",
        "archived_list_newest_first_identity_activity_unarchive_only",
        "archived_rows_have_no_normal_detail_drill_in",
        "final_active_empty_state",
        "archived_list_populated_while_active_empty",
        "final_archived_empty_state_after_unarchive",
        "unrelated_workspace_state_preserved",
        "no_path_secret_environment_or_cross_principal_disclosure"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 2 physical/manual checkpoint"
    },
    "LIVE-REMOVE-FORCE": {
      "description": "Clean removal, typed dirty blocker, exact-name Force Remove, stale confirmation, and failure behavior",
      "evidence_class": "live-service-manual",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "web_clean_remove_with_safe_default_cancel",
        "tui_clean_remove_with_safe_default_cancel",
        "inventory_names_terminals_worktrees_directory_and_yaml",
        "named_progress_and_authoritative_replacement",
        "terminal_failure_deletes_nothing",
        "dirty_blocker_names_every_repository",
        "force_remove_absent_before_typed_dirty_result",
        "wrong_partial_and_case_mismatched_names_stay_disabled",
        "exact_case_sensitive_current_name_enables_force",
        "fresh_revision_inventory_authorizes_force",
        "non_dirty_failure_never_enables_force",
        "stale_confirmation_refreshes_without_replay",
        "successful_remove_reconciles_selection_tabs_signals_counts_and_navigation",
        "managed_targets_deleted_and_unrelated_state_preserved",
        "failure_retains_actionable_recovery_context"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-UI-SPEC.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 2 physical/manual checkpoint"
    },
    "LIVE-STALE": {
      "description": "Every approved stale-workspace state, evidence class, action, revision, and reconciliation path",
      "evidence_class": "live-service-manual",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "initial_loading_without_fabricated_rows",
        "populated_candidates_in_service_rank_order",
        "merged_change_reason_and_provider_timestamp",
        "closed_change_reason_and_provider_timestamp",
        "deleted_remote_branch_repository_scope_and_observation_time",
        "missing_managed_worktree_observation_time",
        "strictly_older_than_30_days_inactivity",
        "candidate_with_unknown_evidence_and_cautions",
        "unknown_only_evaluation_in_incomplete_section",
        "zero_candidates_and_zero_incomplete_all_clear",
        "zero_candidates_with_incomplete_not_all_clear",
        "one_candidate_full_hierarchy",
        "many_candidates_bounded_scroll_and_stable_selection",
        "retained_data_refresh_failure",
        "first_load_failure_and_retry",
        "view_refresh_force_bypasses_cache",
        "revision_mismatch_reload_and_single_retry",
        "older_response_cannot_overwrite_newer_generation",
        "open_success_navigates_after_authoritative_result",
        "open_failure_retains_row_and_view",
        "canonical_archive_remove_and_conditional_force_authority",
        "no_automatic_archive_remove_terminal_worktree_yaml_or_provider_mutation",
        "post_lifecycle_authoritative_normal_and_stale_reconciliation",
        "unknowns_cautions_and_long_safe_text_remain_visible",
        "no_score_confidence_or_deletion_safety_claim"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-UI-SPEC.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 2 physical/manual checkpoint"
    },
    "LIVE-ATTENTION-FUZZY": {
      "description": "Fuzzy top-result execution, archived exclusion, singleton focus, and deterministic attention navigation",
      "evidence_class": "live-service-manual",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "workspace_switcher_top_partial_match_enter",
        "configured_command_top_partial_match_enter",
        "archived_workspaces_excluded_from_search",
        "singleton_overlay_repeated_entry_refocus",
        "exact_valid_invoker_or_terminal_focus_restoration",
        "xterm_matched_shortcut_invokes_once",
        "xterm_unmatched_input_reaches_pty_unchanged",
        "next_attention_skips_archived_removed_dismissed_stale_and_inaccessible_targets",
        "next_attention_wraps_deterministically",
        "next_attention_preserves_unrelated_attention",
        "clear_no_attention_result",
        "visible_ui_shortcut_and_help_surfaces"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 2 physical/manual checkpoint"
    },
    "LIVE-P126-ACTIONS": {
      "description": "Complete Phase 126 shared action inventory, entry surfaces, operation semantics, and reconciliation",
      "evidence_class": "live-service-manual",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "archive_action",
        "unarchive_action",
        "remove_action",
        "rename_action",
        "open_action",
        "close_action",
        "pin_action",
        "unpin_action",
        "sync_action",
        "pull_action",
        "push_action",
        "merge_action",
        "visible_control_entry",
        "context_menu_entry",
        "shortcut_entry",
        "canonical_availability_and_written_disabled_reasons",
        "canonical_confirmation_and_safe_defaults",
        "one_shot_submission",
        "named_progress",
        "cancellation",
        "structured_failure",
        "authoritative_result_and_snapshot_refresh",
        "web_tui_action_authority_parity"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 2 physical/manual checkpoint"
    },
    "LIVE-P126-NOTES": {
      "description": "Authoritative notes zero/one/many, add/clear, conflict, failure-retention, and parity behavior",
      "evidence_class": "live-service-manual",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "notes_zero_state",
        "notes_one_state",
        "notes_many_newest_first_state",
        "long_note_wrapping",
        "add_validation",
        "add_success_and_authoritative_refresh",
        "clear_confirmation_safe_default",
        "clear_success",
        "add_failure_retains_input_and_existing_notes",
        "clear_failure_retains_notes",
        "revision_conflict_and_recovery",
        "no_browser_local_persistence_or_authority",
        "web_tui_order_count_and_mutation_result_parity"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 2 physical/manual checkpoint"
    },
    "LIVE-P126-FILE-STATUS": {
      "description": "Authoritative path-free file status groups, states, counts, reasons, loading/error/retry, and parity",
      "evidence_class": "live-service-manual",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "file_status_empty",
        "file_status_loading",
        "file_status_error",
        "file_status_retry",
        "file_status_healthy",
        "file_status_attention",
        "group_ordering",
        "semantic_states",
        "counts",
        "severity",
        "reasons",
        "long_logical_target_presentation",
        "authoritative_refresh_after_operation",
        "no_machine_path_or_raw_git_error_disclosure",
        "web_tui_projection_parity"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 2 physical/manual checkpoint"
    },
    "LIVE-LIFECYCLE": {
      "description": "Durable operation lifecycle, reconnect, cancellation, refresh-failed lock, concurrency, and convergence",
      "evidence_class": "live-service-manual",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "accepted_and_running_stage_presentation",
        "disconnect_and_reconnect_by_same_durable_operation_id",
        "reconnect_does_not_resubmit_intent",
        "cancel_available_submits_once",
        "cancel_too_late_or_non_cancellable_honest_result",
        "failed_and_cancelled_terminal_results",
        "terminal_result_refresh_failure_locks_actions",
        "retry_refresh_unlocks_only_after_authoritative_success",
        "simultaneous_web_and_tui_observation",
        "stale_confirmation_requires_new_action_and_confirmation",
        "no_stale_confirmation_replay",
        "no_mutation_replay_after_ambiguous_transport",
        "authoritative_selection_convergence",
        "authoritative_count_convergence",
        "authoritative_signal_convergence",
        "authoritative_terminal_tab_and_state_convergence",
        "unrelated_state_preserved"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 2 physical/manual checkpoint"
    },
    "PHYS-BROWSER-XTERM": {
      "description": "Physical browser pointer, keyboard, xterm input isolation, focus defaults, and exact restoration",
      "evidence_class": "physical-browser-manual",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "pointer_direct_controls",
        "pointer_context_menus",
        "arrow_home_end_enter_space_escape",
        "tab_and_shift_tab_containment",
        "stale_entry_shortcut_with_xterm_focused",
        "contained_refresh_key_with_stale_view_focused",
        "matched_app_shortcut_invokes_once",
        "unmatched_key_reaches_pty_unchanged",
        "altgraph_input_reaches_pty_unchanged",
        "ime_and_composition_input_reaches_pty_unchanged",
        "dead_key_input_reaches_pty_unchanged",
        "non_us_layout_input_reaches_pty_unchanged",
        "repeated_key_behavior",
        "held_key_behavior",
        "singleton_replacement",
        "in_place_retry",
        "destructive_confirmation_safe_cancel_initial_focus",
        "form_first_unresolved_field_initial_focus",
        "menu_and_form_input_isolation",
        "exact_nested_terminal_or_invoker_focus_restoration"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-UI-SPEC.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 2 physical/manual checkpoint"
    },
    "VIS-RESPONSIVE": {
      "description": "Light/dark desktop, 375px, and 320px screenshots for all stale and required Phase 126 states",
      "evidence_class": "responsive-visual-manual",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "desktop_light",
        "desktop_dark",
        "width_375_light",
        "width_375_dark",
        "width_320_light",
        "width_320_dark",
        "stale_initial_loading",
        "stale_populated_candidates",
        "stale_candidate_unknowns_and_cautions",
        "stale_incomplete_only",
        "stale_all_clear_empty",
        "stale_retained_data_refresh_failure",
        "stale_first_load_failure",
        "stale_remove_confirmation_return",
        "phase126_action_groups_and_disabled_reasons",
        "remove_confirmation",
        "force_remove_confirmation",
        "merge_confirmation",
        "clear_notes_confirmation",
        "operation_running_reconnecting_failed_cancelled_and_overflow",
        "notes_empty_one_many_loading_error_add_and_clear",
        "file_empty_loading_error_healthy_attention_and_long_targets",
        "forge_resolve_review_long_identities_validation_sticky_footer_and_recovery",
        "no_horizontal_overflow_or_clipping",
        "no_hover_only_required_action",
        "visible_focus_and_readable_contrast",
        "no_path_credential_raw_error_or_environment_disclosure"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-UI-SPEC.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 2 physical/manual checkpoint"
    },
    "INT-TUI": {
      "description": "Interactive OpenTUI width/height tiers and complete archived/action/operation/notes/file/forge/stale matrix",
      "evidence_class": "interactive-tui-manual",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "wide_80_plus_split_layout",
        "below_80_stacked_layout",
        "below_56_single_column_layout",
        "short_height_independent_detail_scrolling",
        "below_40_by_12_too_small_safe_fallback",
        "archived_view_and_unarchive_interaction",
        "canonical_actions_and_written_disabled_reasons",
        "operation_stages_cancel_once_reconnect_and_refresh_failed_lock",
        "notes_zero_one_many_add_clear_and_failure_retention",
        "file_groups_states_counts_reasons_loading_error_retry_and_no_path_leak",
        "forge_resolve_review_field_order_picker_focus_and_long_safe_identities",
        "explicit_create_key_and_no_blind_create_when_too_small",
        "stale_navigation_reasons_timestamps_unknowns_and_cautions",
        "generation_safe_refresh_and_repeated_refresh_suppression",
        "open_success_and_failure",
        "canonical_archive_remove_and_force_lifecycle",
        "incomplete_only_action_rejection",
        "owned_keys_do_not_leak_to_dashboard_or_input",
        "escape_restores_origin_row_and_view",
        "long_text_wraps_or_scrolls_without_disclosure"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-UI-SPEC.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 2 physical/manual checkpoint"
    },
    "HUMAN-PARITY": {
      "description": "Side-by-side web/TUI human approval against the same authoritative fixtures",
      "evidence_class": "human-cross-client-parity",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "PENDING",
      "evidence": null,
      "required_subcases": [
        "same_authoritative_fixtures",
        "action_ids_and_user_facing_labels",
        "disabled_reason_text_and_visibility",
        "destructive_safe_defaults_and_exact_name_eligibility",
        "confirmation_consequences_and_cta_copy",
        "operation_stages_and_progress",
        "cancellation_availability_and_outcomes",
        "operation_failures_refresh_and_final_results",
        "notes_order_count_and_mutation_results",
        "file_state_count_severity_and_reason_projection",
        "github_pull_head_base_terminology",
        "gitlab_merge_source_target_terminology",
        "resolve_review_explicit_create_transitions",
        "stale_candidate_order",
        "stale_reason_labels_and_timestamps",
        "unknown_and_caution_separation",
        "candidate_and_incomplete_counts",
        "archive_remove_force_and_undo_behavior",
        "selection_counts_signals_and_terminal_state",
        "authoritative_post_operation_reconciliation",
        "no_release_approval_inference"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-UI-SPEC.md",
        ".planning/ROADMAP.md"
      ],
      "gate": "127-13 Task 2 physical/manual checkpoint"
    },
    "RELEASE-AUTHORIZATION": {
      "description": "Separate operator authority for outward release actions",
      "evidence_class": "release-authorization",
      "candidate_sha": "233d294913bd4cd37602f6ef72f53cb960fb12d7",
      "status": "NOT_AUTHORIZED",
      "evidence": null,
      "required_subcases": [
        "git_tag_not_authorized",
        "git_push_not_authorized",
        "package_publication_not_authorized",
        "github_release_not_authorized",
        "release_only_workflow_dispatch_not_authorized",
        "candidate_validation_does_not_imply_release_authority"
      ],
      "source_artifacts": [
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-COVERAGE.md",
        ".planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md",
        ".planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md",
        "docs/releasing.md"
      ],
      "gate": "Separate explicit operator authorization outside Phase 127"
    }
  }
}
<!-- phase127-receipts-json:end -->
