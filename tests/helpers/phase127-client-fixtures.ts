import {
  PHASE127_DISCLOSURE_CANARIES,
  PHASE127_IDS,
  PHASE127_TIMES,
  makeCandidateRow,
  makeCaution,
  makeConfirmedReason,
  makeIncompleteRow,
  makeStaleResponse,
  makeUnknownEvidence,
  type Phase127CandidateRow,
  type Phase127IncompleteRow,
  type Phase127StaleResponse,
} from "./phase127-stale-fixtures"

export const PHASE127_CLIENT_COPY = Object.freeze({
  title: "Stale Workspaces",
  entry: "Stale workspaces",
  intro: "Review confirmed reasons before opening, archiving, or removing a workspace. Nothing is changed automatically.",
  refresh: "Refresh evidence",
  refreshing: "Refreshing stale workspace evidence…",
  initialLoading: "Loading stale workspace evidence…",
  candidateSection: "Cleanup candidates",
  incompleteSection: "Evaluation incomplete",
  emptyHeading: "No stale workspaces",
  emptyBody: "No workspace currently has a confirmed stale reason. Refresh evidence to check again.",
  incompleteOnly: "No confirmed stale workspaces. Some workspaces could not be fully evaluated.",
  firstLoadError: "Stale workspace evidence could not be loaded. Existing workspace state was not changed. Retry refresh.",
  retainedError: "Stale evidence could not be refreshed. Showing results checked",
  revisionRecovery: "Workspace state changed. Reloading current workspaces before checking again…",
  open: "Open workspace",
  actions: "Workspace actions",
  openFailure: "The stale view was not changed. Refresh workspace state and try again.",
  incompleteActions: "Cleanup actions require at least one confirmed stale reason.",
  cautionHeading: "Cautions",
  cautionExplanation: "Cautions do not determine whether this workspace is stale.",
  unknownHeading: "Unknown evidence",
  confirmedHeading: "Confirmed reasons",
  tooSmall: "Terminal is too small for Stale Workspaces. Resize to at least 40 × 12.",
  reasonLabels: Object.freeze({
    merged: "Pull request merged",
    closed: "Merge request closed",
    remote_branch_deleted: "Remote branch missing",
    managed_worktree_missing: "Managed worktree missing",
    inactive: "Inactive for 30 days",
  }),
  unknownLabels: Object.freeze({
    provider_unavailable: "Change status unknown — provider unavailable.",
    authentication_required: "Change status unknown — authentication required.",
    remote_check_failed: "Remote branch status unknown",
    worktree_inaccessible: "Managed worktree status unknown",
    activity_unavailable: "Last activity is unavailable.",
  }),
  cautionLabels: Object.freeze({
    dirty_worktree: "Uncommitted work is present.",
    ahead_of_remote: "Local commits are ahead of the tracked branch.",
    workspace_drift: "Workspace file drift needs attention.",
    notes_present: "Workspace notes are present.",
  }),
})

const LONG_WORKSPACE_NAME = "workspace-with-a-deliberately-long-but-bounded-name-for-responsive-and-accessible-rendering"
const LONG_REPOSITORY_NAME = "repository-with-a-deliberately-long-but-bounded-name-for-wrapping-and-detail-scrolling"

const mergedCandidate = makeCandidateRow({
  workspace_id: PHASE127_IDS.workspaces.merged,
  workspace_name: "zulu-service-first",
  activity_at: "2026-05-28T07:10:00.000Z",
  confirmed_reasons: [
    makeConfirmedReason({
      code: "merged",
      occurred_at: PHASE127_TIMES.mergedAt,
      repository_id: PHASE127_IDS.repositories.app,
      repository_name: "app",
      provider: "github",
    }),
    makeConfirmedReason({
      code: "remote_branch_deleted",
      occurred_at: PHASE127_TIMES.observedAt,
      repository_id: PHASE127_IDS.repositories.api,
      repository_name: "api",
      provider: undefined,
    }),
    makeConfirmedReason({
      code: "inactive",
      occurred_at: "2026-05-28T07:10:00.000Z",
      repository_id: undefined,
      repository_name: undefined,
      provider: undefined,
    }),
  ],
  unknown_evidence: [
    makeUnknownEvidence({
      code: "worktree_inaccessible",
      observed_at: PHASE127_TIMES.observedAt,
      repository_id: PHASE127_IDS.repositories.docs,
      repository_name: "docs",
      provider: undefined,
    }),
  ],
  cautions: [
    makeCaution({
      code: "dirty_worktree",
      repository_id: PHASE127_IDS.repositories.app,
      repository_name: "app",
    }),
    makeCaution({
      code: "notes_present",
      repository_id: undefined,
      repository_name: undefined,
      count: 2,
    }),
  ],
})

const closedCandidate = makeCandidateRow({
  workspace_id: PHASE127_IDS.workspaces.closed,
  workspace_name: "alpha-service-second",
  activity_at: "2026-06-01T08:00:00.000Z",
  confirmed_reasons: [
    makeConfirmedReason({
      code: "closed",
      occurred_at: PHASE127_TIMES.closedAt,
      repository_id: PHASE127_IDS.repositories.app,
      repository_name: "app",
      provider: "gitlab",
    }),
    makeConfirmedReason({
      code: "managed_worktree_missing",
      occurred_at: PHASE127_TIMES.observedAt,
      repository_id: PHASE127_IDS.repositories.docs,
      repository_name: "docs",
      provider: undefined,
    }),
    makeConfirmedReason({
      code: "inactive",
      occurred_at: "2026-06-01T08:00:00.000Z",
      repository_id: undefined,
      repository_name: undefined,
      provider: undefined,
    }),
  ],
  unknown_evidence: [],
  cautions: [
    makeCaution({
      code: "ahead_of_remote",
      repository_id: PHASE127_IDS.repositories.app,
      repository_name: "app",
      count: 3,
    }),
  ],
})

const longCandidate = makeCandidateRow({
  workspace_id: PHASE127_IDS.workspaces.inactive,
  workspace_name: LONG_WORKSPACE_NAME,
  activity_at: PHASE127_TIMES.beforeCutoff,
  confirmed_reasons: [
    makeConfirmedReason({
      code: "remote_branch_deleted",
      occurred_at: PHASE127_TIMES.observedAt,
      repository_id: PHASE127_IDS.repositories.api,
      repository_name: LONG_REPOSITORY_NAME,
      provider: undefined,
    }),
    makeConfirmedReason({
      code: "inactive",
      occurred_at: PHASE127_TIMES.beforeCutoff,
      repository_id: undefined,
      repository_name: undefined,
      provider: undefined,
    }),
  ],
  unknown_evidence: [
    makeUnknownEvidence({
      code: "remote_check_failed",
      observed_at: PHASE127_TIMES.observedAt,
      repository_id: PHASE127_IDS.repositories.docs,
      repository_name: LONG_REPOSITORY_NAME,
      provider: undefined,
    }),
  ],
  cautions: [
    makeCaution({
      code: "workspace_drift",
      repository_id: PHASE127_IDS.repositories.docs,
      repository_name: LONG_REPOSITORY_NAME,
    }),
  ],
})

const incompleteRow = makeIncompleteRow({
  workspace_id: PHASE127_IDS.workspaces.incomplete,
  workspace_name: "unknown-only-evaluation",
  activity_at: "2026-07-03T14:20:00.000Z",
  unknown_evidence: [
    makeUnknownEvidence({
      code: "authentication_required",
      observed_at: PHASE127_TIMES.observedAt,
      repository_id: PHASE127_IDS.repositories.app,
      repository_name: "app",
      provider: "github",
    }),
    makeUnknownEvidence({
      code: "activity_unavailable",
      observed_at: PHASE127_TIMES.observedAt,
      repository_id: undefined,
      repository_name: undefined,
      provider: undefined,
    }),
  ],
  cautions: [
    makeCaution({
      code: "workspace_drift",
      repository_id: PHASE127_IDS.repositories.app,
      repository_name: "app",
    }),
  ],
})

export const PHASE127_CLIENT_RESPONSES = Object.freeze({
  empty: makeStaleResponse({ candidates: [], incomplete: [] }),
  incompleteOnly: makeStaleResponse({ candidates: [], incomplete: [incompleteRow] }),
  one: makeStaleResponse({ candidates: [mergedCandidate], incomplete: [] }),
  populated: makeStaleResponse({
    candidates: [mergedCandidate, closedCandidate],
    incomplete: [incompleteRow],
  }),
  many: makeStaleResponse({
    candidates: [mergedCandidate, closedCandidate, longCandidate],
    incomplete: [incompleteRow],
  }),
  refreshed: makeStaleResponse({
    revision: "8",
    checked_at: "2026-07-17T12:05:00.000Z",
    candidates: [closedCandidate, longCandidate],
    incomplete: [],
  }),
}) satisfies Readonly<Record<string, Phase127StaleResponse>>

export const PHASE127_CLIENT_ROWS = Object.freeze({
  mergedCandidate,
  closedCandidate,
  longCandidate,
  incompleteRow,
  longWorkspaceName: LONG_WORKSPACE_NAME,
  longRepositoryName: LONG_REPOSITORY_NAME,
})

export type Phase127ClientUiState =
  | { phase: "initial-loading"; response?: undefined; message: string }
  | { phase: "loaded"; response: Phase127StaleResponse; message?: string }
  | { phase: "refreshing"; response: Phase127StaleResponse; message: string }
  | { phase: "first-load-error"; response?: undefined; message: string }
  | { phase: "retained-error"; response: Phase127StaleResponse; message: string }
  | { phase: "revision-recovery"; response?: Phase127StaleResponse; message: string }
  | { phase: "open-pending"; response: Phase127StaleResponse; workspaceId: string; message: string }
  | { phase: "open-error"; response: Phase127StaleResponse; workspaceId: string; message: string }
  | { phase: "inventory-pending"; response: Phase127StaleResponse; workspaceId: string; message: string }
  | { phase: "inventory-error"; response: Phase127StaleResponse; workspaceId: string; message: string }

export const PHASE127_CLIENT_STATES = Object.freeze({
  initialLoading: Object.freeze({
    phase: "initial-loading",
    message: PHASE127_CLIENT_COPY.initialLoading,
  }) as Phase127ClientUiState,
  loaded: Object.freeze({
    phase: "loaded",
    response: PHASE127_CLIENT_RESPONSES.populated,
  }) as Phase127ClientUiState,
  refreshing: Object.freeze({
    phase: "refreshing",
    response: PHASE127_CLIENT_RESPONSES.populated,
    message: PHASE127_CLIENT_COPY.refreshing,
  }) as Phase127ClientUiState,
  firstLoadError: Object.freeze({
    phase: "first-load-error",
    message: PHASE127_CLIENT_COPY.firstLoadError,
  }) as Phase127ClientUiState,
  retainedError: Object.freeze({
    phase: "retained-error",
    response: PHASE127_CLIENT_RESPONSES.populated,
    message: `${PHASE127_CLIENT_COPY.retainedError} 5 minutes ago.`,
  }) as Phase127ClientUiState,
  revisionRecovery: Object.freeze({
    phase: "revision-recovery",
    response: PHASE127_CLIENT_RESPONSES.populated,
    message: PHASE127_CLIENT_COPY.revisionRecovery,
  }) as Phase127ClientUiState,
  openPending: Object.freeze({
    phase: "open-pending",
    response: PHASE127_CLIENT_RESPONSES.populated,
    workspaceId: PHASE127_IDS.workspaces.merged,
    message: "Opening zulu-service-first…",
  }) as Phase127ClientUiState,
  openError: Object.freeze({
    phase: "open-error",
    response: PHASE127_CLIENT_RESPONSES.populated,
    workspaceId: PHASE127_IDS.workspaces.merged,
    message: `Could not open zulu-service-first. ${PHASE127_CLIENT_COPY.openFailure}`,
  }) as Phase127ClientUiState,
  inventoryPending: Object.freeze({
    phase: "inventory-pending",
    response: PHASE127_CLIENT_RESPONSES.populated,
    workspaceId: PHASE127_IDS.workspaces.merged,
    message: "Loading workspace actions…",
  }) as Phase127ClientUiState,
  inventoryError: Object.freeze({
    phase: "inventory-error",
    response: PHASE127_CLIENT_RESPONSES.populated,
    workspaceId: PHASE127_IDS.workspaces.merged,
    message: "Workspace actions could not be loaded. Refresh workspace state and try again.",
  }) as Phase127ClientUiState,
})

export type Phase127LifecycleDescriptor = {
  action_id: "workspace.open" | "workspace.archive" | "workspace.remove" | "workspace.force-remove"
  subject: { kind: "workspace"; workspace_id: string }
  availability: { available: true } | { available: false; message: string }
  confirmation: "none" | "confirm" | "exact-name"
}

export const PHASE127_ACTION_INVENTORIES = Object.freeze({
  candidate: Object.freeze([
    Object.freeze({
      action_id: "workspace.open",
      subject: { kind: "workspace", workspace_id: PHASE127_IDS.workspaces.merged },
      availability: { available: true },
      confirmation: "none",
    }),
    Object.freeze({
      action_id: "workspace.archive",
      subject: { kind: "workspace", workspace_id: PHASE127_IDS.workspaces.merged },
      availability: { available: true },
      confirmation: "none",
    }),
    Object.freeze({
      action_id: "workspace.remove",
      subject: { kind: "workspace", workspace_id: PHASE127_IDS.workspaces.merged },
      availability: { available: false, message: "Uncommitted work must be reviewed before removal." },
      confirmation: "confirm",
    }),
  ] satisfies readonly Phase127LifecycleDescriptor[]),
  forceReauthorized: Object.freeze([
    Object.freeze({
      action_id: "workspace.force-remove",
      subject: { kind: "workspace", workspace_id: PHASE127_IDS.workspaces.merged },
      availability: { available: true },
      confirmation: "exact-name",
    }),
  ] satisfies readonly Phase127LifecycleDescriptor[]),
})

export const PHASE127_LIFECYCLE_OUTCOMES = Object.freeze({
  openSucceeded: Object.freeze({
    kind: "succeeded",
    workspace_id: PHASE127_IDS.workspaces.merged,
    repository_id: PHASE127_IDS.repositories.app,
    revision: "8",
  }),
  openFailed: Object.freeze({
    kind: "failed",
    code: "workspace_open_failed",
    message: "Workspace could not be opened.",
  }),
  dirtyRemoval: Object.freeze({
    kind: "workspace_dirty",
    blocking_repositories: ["app"],
    terminals_stopped: true,
    force_allowed: true,
    revision: "8",
  }),
  acceptedOperation: Object.freeze({
    kind: "operation",
    operation_id: "op_phase127_stale_action_0001",
  }),
  terminalOperation: Object.freeze({
    operation_id: "op_phase127_stale_action_0001",
    state: "succeeded",
    workspace_id: PHASE127_IDS.workspaces.merged,
  }),
})

export const PHASE127_FORBIDDEN_RENDER_TEXT = Object.freeze([
  PHASE127_DISCLOSURE_CANARIES.path,
  PHASE127_DISCLOSURE_CANARIES.windowsPath,
  PHASE127_DISCLOSURE_CANARIES.urlWithCredential,
  PHASE127_DISCLOSURE_CANARIES.credential,
  PHASE127_DISCLOSURE_CANARIES.bearer,
  PHASE127_DISCLOSURE_CANARIES.command,
  PHASE127_DISCLOSURE_CANARIES.stdout,
  PHASE127_DISCLOSURE_CANARIES.stderr,
  PHASE127_DISCLOSURE_CANARIES.rawError,
  PHASE127_DISCLOSURE_CANARIES.argv.join(" "),
  ...Object.values(PHASE127_DISCLOSURE_CANARIES.environment),
  "safe to delete",
  "safe to remove",
  "confidence",
  "stale score",
])

export function phase127Rows(response: Phase127StaleResponse): ReadonlyArray<Phase127CandidateRow | Phase127IncompleteRow> {
  return [...response.candidates, ...response.incomplete]
}

export function phase127WorkspaceOrder(response: Phase127StaleResponse): string[] {
  return phase127Rows(response).map((row) => row.workspace_id)
}

export function assertPhase127RendererTextSafe(text: string): void {
  const normalized = text.toLocaleLowerCase("en-US")
  for (const value of PHASE127_FORBIDDEN_RENDER_TEXT) {
    if (normalized.includes(value.toLocaleLowerCase("en-US"))) {
      throw new Error(`Renderer exposed forbidden Phase 127 canary: ${value}`)
    }
  }
}
