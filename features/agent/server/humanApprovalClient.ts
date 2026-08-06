import "server-only";

import { agentTeamRequest } from "@/features/agent/server/teamClient";

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
