import {
  AgentTeamRequestError,
  agentTeamRequest,
} from "@/features/agent/server/teamClient";

export type AgentIntakeIntent =
  | "feature_request"
  | "bug_report"
  | "inspection_catalog_add"
  | "service_catalog_add"
  | "refactor";

type AgentGithubMeta = {
  issueNumber?: number | null;
  issueUrl?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
  branchName?: string | null;
  commitSha?: string | null;
  fileUrl?: string | null;
};

type AgentLLMMeta = {
  model?: string | null;
  confidence?: number | null;
  notes?: string | null;
  commentary?: string | null;
  summary?: string | null;
};

type AgentWorkerKick = {
  attempted?: boolean;
  ok?: boolean;
  status?: number;
};

export type AgentServiceResponse = {
  ok?: boolean;
  message?: string;
  requestId?: string | null;
  intent?: string | null;
  request?: Record<string, unknown> | null;
  engineeringCaseId?: string | null;
  currentStage?: string | null;
  status?: string | null;
  intakeJobId?: string | null;
  workerKick?: AgentWorkerKick | null;
  github?: AgentGithubMeta | null;
  llm?: AgentLLMMeta | null;
  analysis?: AgentLLMMeta | null;
};

export type SubmitAgentTeamRequestParams = {
  requestId: string;
  source: string;
  reporterId: string;
  shopId: string | null;
  role: string | null;
  description: string;
  intent: AgentIntakeIntent;
  expectedBehavior: string | null;
  actualBehavior: string;
  route: string | null;
  browser: string | null;
  screenshots: string[];
  context: Record<string, unknown>;
};

/**
 * Submit an existing durable ProFixIQ request to the canonical Agent intake.
 * The Agent service makes requestId idempotent for a repository ticket, so a
 * transport retry reuses the same engineering case instead of creating one.
 */
export async function submitAgentTeamRequest(
  params: SubmitAgentTeamRequestParams,
): Promise<AgentServiceResponse> {
  const endpoint = params.intent === "refactor" ? "/refactors" : "/feature-requests";
  const payload = params.intent === "refactor"
    ? {
        requestId: params.requestId,
        source: params.source,
        reporterId: params.reporterId,
        shopId: params.shopId,
        title: `Refactor: ${params.description.slice(0, 80)}`,
        description: params.description,
        expectedBehavior: params.expectedBehavior,
        actualBehavior: params.actualBehavior,
        route: params.route,
        platform: params.browser,
        context: params.context,
      }
    : {
        requestId: params.requestId,
        source: params.source,
        reporterId: params.reporterId,
        shopId: params.shopId,
        role: params.role,
        description: params.description,
        intent: params.intent,
        expectedBehavior: params.expectedBehavior,
        actualBehavior: params.actualBehavior,
        route: params.route,
        browser: params.browser,
        platform: params.browser,
        screenshots: params.screenshots,
        context: params.context,
      };

  const response = await agentTeamRequest<AgentServiceResponse>(endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.engineeringCaseId) {
    throw new AgentTeamRequestError(
      "ProFixIQ-Agent did not return an engineering case",
      502,
      "The Agent accepted the request without a durable engineeringCaseId.",
    );
  }

  return response;
}
