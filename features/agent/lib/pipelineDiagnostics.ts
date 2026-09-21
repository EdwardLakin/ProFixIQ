export type AgentPipelineSpecialist = {
  key: string;
  role: string;
  required: boolean;
  decision: string | null;
  summary: string | null;
};

export type AgentPipelineConflict = {
  topic: string;
  description: string;
};

export type AgentPipelineTeamSnapshot = {
  currentStage?: string | null;
  caseStatus?: string | null;
  stepStatus?: string | null;
  updatedAt?: string | null;
  syncedAt?: string | null;
  missionStatus?: string | null;
  internalDependency?: string | null;
  internalRequirements?: string[];
  specialists?: AgentPipelineSpecialist[];
  conflicts?: AgentPipelineConflict[];
};

export type AgentPipelineRequestSnapshot = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  notes?: string | null;
  reporterQuestions?: string[];
  team?: AgentPipelineTeamSnapshot | null;
};

export type AgentPipelineDiagnosticKind =
  | "authorization_failure"
  | "request_failure"
  | "reporter_input"
  | "internal_blocker"
  | "stalled"
  | "awaiting_approval"
  | "active"
  | "complete";

export type AgentPipelineDiagnostic = {
  kind: AgentPipelineDiagnosticKind;
  severity: "healthy" | "info" | "warning" | "error";
  title: string;
  explanation: string;
  actionLabel: string | null;
  ageMinutes: number | null;
  /**
   * The internal engineering dependency the Agent reported this stage is blocked
   * on (e.g. "openai_quota"), when known. Lets callers group/aggregate requests
   * blocked by the same underlying outage instead of treating each one as an
   * unrelated failure.
   */
  internalDependency: string | null;
};

const DEPENDENCY_LABELS: Record<string, string> = {
  openai_quota: "OpenAI quota exhausted",
  openai_rate_limit: "OpenAI rate limited",
  agent_authentication: "Agent authentication failing",
  agent_network: "Agent network dependency down",
  profixiq_database_evidence: "Database evidence provider unavailable",
  repository_evidence_retrieval: "Repository evidence retrieval failing",
  specialist_conflict: "Specialist review conflict",
  specialist_evidence_gap: "Specialist evidence gap",
};

export function describeInternalDependency(dependency: string): string {
  return DEPENDENCY_LABELS[dependency] ?? dependency.replace(/_/g, " ");
}

const STALE_ACTIVE_MINUTES = 30;
const INTERNAL_REQUIREMENT_PATTERNS = [
  /\b(import|call)\s+chain\b/i,
  /\bruntime\s+trace\b/i,
  /\bstate\s+matrix\b/i,
  /\bcross[-\s]?client\b/i,
  /\b(repository|source\s+file|code\s*path|handler|endpoint|rpc|schema|table|column|rls|polic(?:y|ies)|trigger|constraint|test|fixture)\b/i,
  /\b(deterministic|exhaustive|proven|proof|verification)\b.*\b(trace|mapping|matrix|coverage|evidence)\b/i,
  /\b(role|capability|tenant)\b.*\b(mapping|matrix|contract|coverage|demonstration|evidence)\b/i,
] as const;

function normalizedText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function timestamp(value: string | null | undefined): number | null {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function elapsedMinutes(value: string | null | undefined, now: number): number | null {
  const parsed = timestamp(value);
  return parsed == null ? null : Math.max(0, Math.floor((now - parsed) / 60_000));
}

export function partitionAgentQuestions(items: string[]): {
  reporterQuestions: string[];
  internalRequirements: string[];
} {
  const reporterQuestions: string[] = [];
  const internalRequirements: string[] = [];
  const seen = new Set<string>();

  for (const value of items) {
    const item = normalizedText(value);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (INTERNAL_REQUIREMENT_PATTERNS.some((pattern) => pattern.test(item))) {
      internalRequirements.push(item);
    } else {
      reporterQuestions.push(item);
    }
  }

  return { reporterQuestions, internalRequirements };
}

export function diagnoseAgentPipelineRequest(
  request: AgentPipelineRequestSnapshot,
  now = Date.now(),
): AgentPipelineDiagnostic {
  const team = request.team ?? null;
  const lastProgressAt = team?.updatedAt
    ?? team?.syncedAt
    ?? request.updatedAt
    ?? request.createdAt;
  const ageMinutes = elapsedMinutes(lastProgressAt, now);
  const status = request.status.trim().toLowerCase();
  const caseStatus = team?.caseStatus?.trim().toLowerCase() ?? null;
  const stage = team?.currentStage?.replace(/_/g, " ") ?? "current stage";
  const notes = request.notes?.toLowerCase() ?? "";
  const authorizationFailure = status === "failed"
    && (/\b40[13]\b/.test(notes) || notes.includes("access denied") || notes.includes("unauthorized"));

  if (authorizationFailure) {
    return {
      kind: "authorization_failure",
      severity: "error",
      title: "Agent authorization failed",
      explanation: "The request reached the Agent boundary but its bridge or API credential was rejected. Validate the protected Agent readiness path before replaying it.",
      actionLabel: "Retry dispatch",
      ageMinutes,
      internalDependency: null,
    };
  }

  if (status === "failed") {
    return {
      kind: "request_failure",
      severity: "error",
      title: "Agent request failed",
      explanation: "The request did not complete its current pipeline transition. Inspect the recorded error before retrying the durable request.",
      actionLabel: "Retry request",
      ageMinutes,
      internalDependency: null,
    };
  }

  if (caseStatus === "blocked") {
    if ((request.reporterQuestions?.length ?? 0) > 0) {
      return {
        kind: "reporter_input",
        severity: "warning",
        title: "Reporter input required",
        explanation: `The ${stage} stage is paused for information only the reporter can provide. Engineering evidence tasks remain internal to the Agent.`,
        actionLabel: "Provide evidence",
        ageMinutes,
        internalDependency: null,
      };
    }

    const dependency = normalizedText(team?.internalDependency);
    const conflictCount = team?.conflicts?.length ?? 0;

    // A specialist decision conflict gets its own explanation regardless of which
    // internal dependency label came back with it; the dependency is still
    // attached below so it can be aggregated into a pipeline-wide outage signal.
    if (conflictCount > 0) {
      return {
        kind: "internal_blocker",
        severity: "error",
        title: "Specialist review blocked",
        explanation: `${conflictCount} specialist decision conflict${conflictCount === 1 ? "" : "s"} must be resolved inside engineering; the reporter is not responsible for producing code evidence.`,
        actionLabel: "Restart from stage",
        ageMinutes,
        internalDependency: dependency,
      };
    }

    if (dependency) {
      return {
        kind: "internal_blocker",
        severity: "error",
        title: describeInternalDependency(dependency),
        explanation: `The ${stage} stage is paused on an internal Agent dependency (${describeInternalDependency(dependency).toLowerCase()}), not a code or reporter issue. Resolve the dependency, then retry.`,
        actionLabel: "Restart from stage",
        ageMinutes,
        internalDependency: dependency,
      };
    }

    return {
      kind: "internal_blocker",
      severity: "error",
      title: "Internal Agent dependency blocked",
      explanation: `The ${stage} stage is blocked on internal engineering work.`,
      actionLabel: "Restart from stage",
      ageMinutes,
      internalDependency: null,
    };
  }

  const missionAwaitingApproval = status === "awaiting_approval"
    || team?.missionStatus === "awaiting_approval"
    || caseStatus === "ready_for_human_approval";
  if (missionAwaitingApproval) {
    return {
      kind: "awaiting_approval",
      severity: "info",
      title: "Ready for owner approval",
      explanation: "The automated review completed and the pipeline is intentionally waiting for a human approval decision.",
      actionLabel: "Review approval package",
      ageMinutes,
      internalDependency: null,
    };
  }

  if (["submitted", "in_progress", "approved"].includes(status)
    && ageMinutes != null
    && ageMinutes >= STALE_ACTIVE_MINUTES) {
    return {
      kind: "stalled",
      severity: "warning",
      title: "Pipeline progress is stale",
      explanation: `No Agent stage progress has been recorded for ${ageMinutes} minutes while the request remains ${status.replace(/_/g, " ")}.`,
      actionLabel: "Inspect run",
      ageMinutes,
      internalDependency: null,
    };
  }

  if (["submitted", "in_progress", "approved"].includes(status)) {
    return {
      kind: "active",
      severity: "healthy",
      title: "Pipeline is progressing",
      explanation: `The request is active in ${stage}.`,
      actionLabel: "Inspect run",
      ageMinutes,
      internalDependency: null,
    };
  }

  return {
    kind: "complete",
    severity: "healthy",
    title: "Pipeline work is complete",
    explanation: `The request is ${status.replace(/_/g, " ")}.`,
    actionLabel: "View evidence",
    ageMinutes,
    internalDependency: null,
  };
}

export type AgentPipelineDependencyOutage = {
  dependency: string;
  label: string;
  count: number;
  requestIds: string[];
};

export function summarizeAgentPipeline(
  requests: AgentPipelineRequestSnapshot[],
  now = Date.now(),
) {
  const diagnostics = requests.map((request) => ({
    requestId: request.id,
    diagnostic: diagnoseAgentPipelineRequest(request, now),
  }));
  const attention = diagnostics.filter(({ diagnostic }) =>
    diagnostic.severity === "warning" || diagnostic.severity === "error",
  );

  // Group requests blocked on the same internal Agent dependency (e.g. an OpenAI
  // quota outage) so operators see one actionable signal ("N requests paused —
  // OpenAI quota exhausted") instead of N unrelated-looking blocked rows.
  const outagesByDependency = new Map<string, string[]>();
  for (const { requestId, diagnostic } of diagnostics) {
    if (!diagnostic.internalDependency) continue;
    const existing = outagesByDependency.get(diagnostic.internalDependency) ?? [];
    existing.push(requestId);
    outagesByDependency.set(diagnostic.internalDependency, existing);
  }
  const dependencyOutages: AgentPipelineDependencyOutage[] = [...outagesByDependency.entries()]
    .map(([dependency, requestIds]) => ({
      dependency,
      label: describeInternalDependency(dependency),
      count: requestIds.length,
      requestIds,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    state: attention.length > 0 ? "needs_attention" as const : "healthy" as const,
    issueCount: attention.length,
    issueIds: attention.map(({ requestId }) => requestId),
    failedCount: diagnostics.filter(({ diagnostic }) =>
      diagnostic.kind === "authorization_failure" || diagnostic.kind === "request_failure",
    ).length,
    blockedCount: diagnostics.filter(({ diagnostic }) =>
      diagnostic.kind === "internal_blocker" || diagnostic.kind === "reporter_input",
    ).length,
    staleCount: diagnostics.filter(({ diagnostic }) => diagnostic.kind === "stalled").length,
    approvalCount: diagnostics.filter(({ diagnostic }) => diagnostic.kind === "awaiting_approval").length,
    dependencyOutages,
  };
}
