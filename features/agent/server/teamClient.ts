import { createClient } from "@supabase/supabase-js";
import { resolveAgentApiSecrets } from "@/features/shared/lib/server/agent-api-secrets";

const AGENT_SERVICE_URL = String(process.env.PROFIXIQ_AGENT_URL ?? "")
  .trim()
  .replace(/\/+$/, "");
const BRIDGE_CREDENTIAL_ID = "profixiq";

const bridgeSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

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

async function readBridgeSecret(): Promise<string> {
  const result = await bridgeSupabase
    .from("agent_bridge_credentials")
    .select("secret")
    .eq("id", BRIDGE_CREDENTIAL_ID)
    .eq("active", true)
    .maybeSingle();

  if (result.error) {
    console.error("agent bridge credential read failed", result.error);
    return "";
  }
  return String(result.data?.secret ?? "").trim();
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
}) {
  return agentTeamRequest<Record<string, unknown>>(
    `/engineering-missions/${encodeURIComponent(params.missionId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ approvedBy: params.approvedBy }),
    },
  );
}

export async function approveAgentTeamRelease(params: {
  engineeringCaseId: string;
  approvedBy: string;
}) {
  return agentTeamRequest<Record<string, unknown>>(
    `/engineering-cases/${encodeURIComponent(params.engineeringCaseId)}/approve-release`,
    {
      method: "POST",
      body: JSON.stringify({ approvedBy: params.approvedBy }),
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
  const summary = envelope.caseSummary?.summary
    ?? currentStep?.result?.summary
    ?? null;
  const decision = envelope.caseSummary?.decision
    ?? currentStep?.result?.decision
    ?? null;
  const missingInformation = envelope.caseSummary?.missingInformation
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

  return {
    engineeringCaseId: engineeringCase.id,
    requestId: engineeringCase.ticket.id,
    currentStage: engineeringCase.currentStage,
    caseStatus: engineeringCase.status,
    stepStatus: envelope.caseSummary?.stepStatus ?? currentStep?.status ?? null,
    summary,
    decision,
    missingInformation: Array.isArray(missingInformation)
      ? missingInformation.filter((value): value is string => typeof value === "string")
      : [],
    updatedAt: engineeringCase.updatedAt,
    mission: envelope.mission
      ? {
          id: envelope.mission.id,
          status: envelope.mission.status,
          title: nullableString(envelope.mission.title),
          desiredOutcome: nullableString(envelope.mission.desired_outcome),
          problemStatement: nullableString(envelope.mission.problem_statement),
          approvedAt: nullableString(envelope.mission.approved_at),
          approvedBy: nullableString(envelope.mission.approved_by),
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
