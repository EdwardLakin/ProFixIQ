import { createClient } from "@supabase/supabase-js";
import { resolveAgentApiSecrets } from "@/features/shared/lib/server/agent-api-secrets";

const AGENT_SERVICE_URL = String(process.env.PROFIXIQ_AGENT_URL ?? "")
  .trim()
  .replace(/\/+$/, "");
const BRIDGE_INTEGRATION_ID = "7c2da329-5117-48c0-a1ee-d51b5d63827d";
const BRIDGE_INTEGRATION_KIND = "profixiq_agent_bridge";

export type AgentTeamRequestStatus =
  | "submitted"
  | "in_progress"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "failed"
  | "merged";

export type AgentTeamStageResult = {
  decision?: string | null;
  summary?: string | null;
  missingInformation?: string[];
  data?: Record<string, unknown>;
};

export type AgentTeamEngineeringCase = {
  id: string;
  currentStage: string;
  status: string;
  updatedAt: string;
  ticket: {
    id: string;
    metadata?: Record<string, unknown>;
  };
  stages: Record<string, {
    status: string;
    result?: AgentTeamStageResult | null;
  }>;
};

export type AgentTeamMission = {
  id: string;
  status: string;
  title?: string | null;
  desired_outcome?: string | null;
  problem_statement?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  acceptanceCriteria?: unknown[];
  constraints?: unknown[];
  risks?: unknown[];
  planSteps?: unknown[];
};

export type AgentTeamCaseEnvelope = {
  ok?: boolean;
  engineeringCase: AgentTeamEngineeringCase;
  mission?: AgentTeamMission | null;
  caseSummary?: {
    stage?: string | null;
    caseStatus?: string | null;
    stepStatus?: string | null;
    summary?: string | null;
    decision?: string | null;
    missingInformation?: string[];
    updatedAt?: string | null;
  } | null;
};

export type AgentTeamProjection = {
  engineeringCaseId: string;
  requestId: string;
  currentStage: string;
  caseStatus: string;
  stepStatus: string | null;
  summary: string | null;
  decision: string | null;
  missingInformation: string[];
  updatedAt: string;
  mission: {
    id: string;
    status: string;
    title: string | null;
    desiredOutcome: string | null;
    problemStatement: string | null;
    approvedAt: string | null;
    approvedBy: string | null;
    acceptanceCriteria: string[];
    constraints: string[];
    risks: string[];
    planSteps: Array<{
      position: number | null;
      title: string;
      description: string | null;
      ownerStage: string | null;
    }>;
  } | null;
  pullRequest: {
    number: number | null;
    url: string | null;
    branch: string | null;
    headSha: string | null;
  };
};

export class AgentTeamRequestError extends Error {
  readonly status: number | null;
  readonly detail: string;

  constructor(message: string, status: number | null, detail: string) {
    super(message);
    this.name = "AgentTeamRequestError";
    this.status = status;
    this.detail = detail;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function nullableNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function recordStrings(value: unknown, key: string): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((row) => nullableString(row[key]))
    .filter((item): item is string => Boolean(item));
}

function stageStrings(
  engineeringCase: AgentTeamEngineeringCase,
  stage: string,
  key: string,
): string[] {
  const data = engineeringCase.stages[stage]?.result?.data;
  const value = isRecord(data) ? data[key] : null;
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function missionPlanSteps(value: unknown): AgentTeamProjection["mission"] extends infer Mission
  ? Mission extends { planSteps: infer Steps } ? Steps : never
  : never {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((row) => ({
      position: nullableNumber(row.position),
      title: nullableString(row.title) ?? "Plan step",
      description: nullableString(row.description),
      ownerStage: nullableString(row.owner_stage ?? row.ownerStage),
    }));
}

function missionApprovalSummary(
  engineeringCase: AgentTeamEngineeringCase,
  mission: AgentTeamMission,
  fallback: string | null,
): string | null {
  if (mission.status !== "awaiting_approval") return fallback;

  const diagnosis = nullableString(engineeringCase.stages.root_cause?.result?.summary)
    ?? nullableString(mission.problem_statement);
  const proposedRepair = nullableString(engineeringCase.stages.planning?.result?.summary)
    ?? nullableString(mission.desired_outcome);
  const allRecommendedFiles = stageStrings(
    engineeringCase,
    "planning",
    "recommendedFiles",
  );
  const allAcceptanceCriteria = recordStrings(
    mission.acceptanceCriteria,
    "criterion",
  );
  const allPlanSteps = missionPlanSteps(mission.planSteps);
  const recommendedFiles = allRecommendedFiles.slice(0, 6);
  const acceptanceCriteria = allAcceptanceCriteria.slice(0, 5);
  const planSteps = allPlanSteps.slice(0, 5);
  const omittedFiles = allRecommendedFiles.length - recommendedFiles.length;
  const omittedCriteria = allAcceptanceCriteria.length - acceptanceCriteria.length;
  const omittedSteps = allPlanSteps.length - planSteps.length;

  const lines = [
    diagnosis ? `Diagnosis\n${diagnosis}` : null,
    proposedRepair ? `Proposed repair\n${proposedRepair}` : null,
    recommendedFiles.length > 0
      ? `Repair scope preview\n${recommendedFiles.map((path) => `• ${path}`).join("\n")}${omittedFiles > 0 ? `\n• +${omittedFiles} more file${omittedFiles === 1 ? "" : "s"} in the full mission review` : ""}`
      : null,
    acceptanceCriteria.length > 0
      ? `Acceptance checks preview\n${acceptanceCriteria.map((criterion) => `• ${criterion}`).join("\n")}${omittedCriteria > 0 ? `\n• +${omittedCriteria} more check${omittedCriteria === 1 ? "" : "s"} in the full mission review` : ""}`
      : null,
    planSteps.length > 0
      ? `Engineering plan preview\n${planSteps.map((step, index) => `${step.position ?? index + 1}. ${step.title}${step.description ? ` — ${step.description}` : ""}`).join("\n")}${omittedSteps > 0 ? `\n${planSteps.length + 1}. +${omittedSteps} more step${omittedSteps === 1 ? "" : "s"} in the full mission review` : ""}`
      : null,
    "Human approval is required before the engineering team can change code. Review every item in the full mission review, then select Approve Mission.",
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n\n") || fallback;
}

async function readBridgeSecret(): Promise<string> {
  const supabaseUrl = nullableString(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = nullableString(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) return "";

  const bridgeSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await bridgeSupabase
    .from("integrations")
    .select("config")
    .eq("id", BRIDGE_INTEGRATION_ID)
    .eq("status", "enabled")
    .is("shop_id", null)
    .maybeSingle();

  if (result.error) {
    console.error("Agent bridge integration read failed", result.error);
    return "";
  }

  const config = isRecord(result.data?.config) ? result.data.config : {};
  if (config.kind !== BRIDGE_INTEGRATION_KIND) {
    console.error("Agent bridge integration has an invalid kind");
    return "";
  }
  return nullableString(config.secret) ?? "";
}

async function agentTeamHeaders(): Promise<Headers> {
  const environmentSecrets = resolveAgentApiSecrets();
  const bridgeSecret = await readBridgeSecret();
  if (!bridgeSecret && !environmentSecrets.primary) {
    throw new AgentTeamRequestError(
      "Agent team authentication is not configured",
      null,
      "No active database bridge credential or Agent API secret is available.",
    );
  }

  const headers = new Headers();
  headers.set("content-type", "application/json");
  if (bridgeSecret) headers.set("x-profixiq-bridge-secret", bridgeSecret);
  if (environmentSecrets.canonical || environmentSecrets.primary) {
    headers.set(
      "x-agent-api-secret",
      environmentSecrets.canonical || environmentSecrets.primary,
    );
  }
  if (environmentSecrets.profixiqAlias || environmentSecrets.primary) {
    headers.set(
      "x-agent-secret",
      environmentSecrets.profixiqAlias || environmentSecrets.primary,
    );
  }
  if (environmentSecrets.internalAlias || environmentSecrets.primary) {
    headers.set(
      "authorization",
      `Bearer ${environmentSecrets.internalAlias || environmentSecrets.primary}`,
    );
  }
  return headers;
}

export async function agentTeamRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!AGENT_SERVICE_URL) {
    throw new AgentTeamRequestError(
      "ProFixIQ-Agent URL is not configured",
      null,
      "PROFIXIQ_AGENT_URL is missing.",
    );
  }

  const headers = await agentTeamHeaders();
  const suppliedHeaders = new Headers(init.headers);
  suppliedHeaders.forEach((value, key) => headers.set(key, value));

  let response: Response;
  try {
    response = await fetch(`${AGENT_SERVICE_URL}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AgentTeamRequestError("Unable to reach ProFixIQ-Agent", null, detail);
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new AgentTeamRequestError(
      "ProFixIQ-Agent request failed",
      response.status,
      raw.slice(0, 2_000) || `HTTP ${response.status}`,
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new AgentTeamRequestError(
      "ProFixIQ-Agent returned invalid JSON",
      response.status,
      raw.slice(0, 2_000),
    );
  }
}

export async function readAgentTeamCase(
  engineeringCaseId: string,
): Promise<AgentTeamCaseEnvelope> {
  return agentTeamRequest<AgentTeamCaseEnvelope>(
    `/engineering-cases/${encodeURIComponent(engineeringCaseId)}`,
  );
}

export async function resumeAgentTeamCase(params: {
  engineeringCaseId: string;
  resumedBy: string;
  message: string;
  answers?: Record<string, string>;
}) {
  return agentTeamRequest<Record<string, unknown>>(
    `/engineering-cases/${encodeURIComponent(params.engineeringCaseId)}/resume`,
    {
      method: "POST",
      body: JSON.stringify({
        resumedBy: params.resumedBy,
        context: {
          message: params.message,
          answers: params.answers ?? null,
          source: "profixiq-agent-console",
        },
      }),
    },
  );
}

export async function approveAgentTeamMission(params: {
  missionId: string;
  approvedBy: string;
  approvalProof: string;
}) {
  return agentTeamRequest<Record<string, unknown>>(
    `/engineering-missions/${encodeURIComponent(params.missionId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({
        approvedBy: params.approvedBy,
        approvalProof: params.approvalProof,
      }),
    },
  );
}

export async function approveAgentTeamRelease(params: {
  engineeringCaseId: string;
  approvedBy: string;
  approvalProof: string;
}) {
  return agentTeamRequest<Record<string, unknown>>(
    `/engineering-cases/${encodeURIComponent(params.engineeringCaseId)}/approve-release`,
    {
      method: "POST",
      body: JSON.stringify({
        approvedBy: params.approvedBy,
        approvalProof: params.approvalProof,
      }),
    },
  );
}

export async function rejectAgentTeamCase(params: {
  engineeringCaseId: string;
  rejectedBy: string;
  reason: string;
}) {
  return agentTeamRequest<Record<string, unknown>>(
    `/engineering-cases/${encodeURIComponent(params.engineeringCaseId)}/reject`,
    {
      method: "POST",
      body: JSON.stringify({
        rejectedBy: params.rejectedBy,
        reason: params.reason,
      }),
    },
  );
}

export function projectAgentTeamCase(
  envelope: AgentTeamCaseEnvelope,
): AgentTeamProjection {
  const engineeringCase = envelope.engineeringCase;
  const currentStep = engineeringCase.stages[engineeringCase.currentStage] ?? null;
  const baseSummary = envelope.caseSummary?.summary
    ?? currentStep?.result?.summary
    ?? null;
  const decision = envelope.caseSummary?.decision
    ?? currentStep?.result?.decision
    ?? null;
  const rawMissingInformation = envelope.caseSummary?.missingInformation
    ?? currentStep?.result?.missingInformation
    ?? [];
  const metadata = isRecord(engineeringCase.ticket.metadata)
    ? engineeringCase.ticket.metadata
    : {};
  const productionWork = isRecord(metadata.productionWork)
    ? metadata.productionWork
    : {};
  const approvalPackage = isRecord(metadata.approvalPackage)
    ? metadata.approvalPackage
    : {};
  const mission = envelope.mission;
  const awaitingMissionApproval = mission?.status === "awaiting_approval";
  const summary = mission
    ? missionApprovalSummary(engineeringCase, mission, baseSummary)
    : baseSummary;
  const acceptanceCriteria = mission
    ? recordStrings(mission.acceptanceCriteria, "criterion")
    : [];
  const constraints = mission
    ? recordStrings(mission.constraints, "description")
    : [];
  const risks = mission
    ? recordStrings(mission.risks, "description")
    : [];
  const planSteps = mission ? missionPlanSteps(mission.planSteps) : [];

  return {
    engineeringCaseId: engineeringCase.id,
    requestId: engineeringCase.ticket.id,
    currentStage: engineeringCase.currentStage,
    caseStatus: engineeringCase.status,
    stepStatus: envelope.caseSummary?.stepStatus ?? currentStep?.status ?? null,
    summary,
    decision,
    missingInformation: awaitingMissionApproval
      ? []
      : Array.isArray(rawMissingInformation)
        ? rawMissingInformation.filter((value): value is string => typeof value === "string")
        : [],
    updatedAt: engineeringCase.updatedAt,
    mission: mission
      ? {
          id: mission.id,
          status: mission.status,
          title: nullableString(mission.title),
          desiredOutcome: nullableString(mission.desired_outcome),
          problemStatement: nullableString(mission.problem_statement),
          approvedAt: nullableString(mission.approved_at),
          approvedBy: nullableString(mission.approved_by),
          acceptanceCriteria,
          constraints,
          risks,
          planSteps,
        }
      : null,
    pullRequest: {
      number: nullableNumber(
        productionWork.pullRequestNumber ?? approvalPackage.pullRequestNumber,
      ),
      url: nullableString(
        productionWork.pullRequestUrl ?? approvalPackage.pullRequestUrl,
      ),
      branch: nullableString(
        productionWork.branchName ?? approvalPackage.headBranch,
      ),
      headSha: nullableString(
        productionWork.headSha ?? approvalPackage.headSha,
      ),
    },
  };
}

export function mapAgentTeamRequestStatus(
  projection: AgentTeamProjection,
): AgentTeamRequestStatus {
  if (projection.caseStatus === "rejected") return "rejected";
  if (projection.caseStatus === "complete") return "merged";
  if (
    projection.caseStatus === "ready_for_human_approval"
    || projection.mission?.status === "awaiting_approval"
  ) {
    return "awaiting_approval";
  }
  if (projection.caseStatus === "blocked") return "in_progress";
  if (projection.caseStatus === "active") return "in_progress";
  return "submitted";
}
