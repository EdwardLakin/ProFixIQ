import { NextRequest, NextResponse } from "next/server";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import {
  AgentTeamRequestError,
  approveAgentTeamMission,
  approveAgentTeamRelease,
  mapAgentTeamRequestStatus,
  projectAgentTeamCase,
  readAgentTeamCase,
  rejectAgentTeamCase,
  type AgentTeamProjection,
} from "@/features/agent/server/teamClient";
import { mintAgentHumanApprovalIntent } from "@/features/agent/server/humanApprovalIntent";

type AgentRequestStatus =
  | "submitted"
  | "in_progress"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "failed"
  | "merged";

type PatchBody = {
  action?: "approve" | "reject";
  llm_notes?: string;
};


function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/$/, "");
  const segments = pathname.split("/");
  const id = segments[segments.length - 1];
  return id || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => nullableString(item)).filter((item): item is string => Boolean(item))
    : [];
}

function missionPlanSteps(value: unknown): NonNullable<AgentTeamProjection["mission"]>["planSteps"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((step) => ({
      position: Number.isFinite(Number(step.position)) ? Number(step.position) : null,
      title: nullableString(step.title) ?? "Plan step",
      description: nullableString(step.description),
      ownerStage: nullableString(step.ownerStage ?? step.owner_stage),
    }));
}

function projectionFromNormalized(value: unknown): AgentTeamProjection | null {
  if (!isRecord(value) || !isRecord(value.agentTeam)) return null;
  const team = value.agentTeam;
  const engineeringCaseId = nullableString(team.engineeringCaseId);
  if (!engineeringCaseId) return null;

  const mission = isRecord(team.mission)
    ? {
        id: nullableString(team.mission.id) ?? "",
        status: nullableString(team.mission.status) ?? "unknown",
        title: nullableString(team.mission.title),
        desiredOutcome: nullableString(team.mission.desiredOutcome),
        problemStatement: nullableString(team.mission.problemStatement),
        approvedAt: nullableString(team.mission.approvedAt),
        approvedBy: nullableString(team.mission.approvedBy),
        acceptanceCriteria: stringArray(team.mission.acceptanceCriteria),
        constraints: stringArray(team.mission.constraints),
        risks: stringArray(team.mission.risks),
        planSteps: missionPlanSteps(team.mission.planSteps),
      }
    : null;
  const pullRequest = isRecord(team.pullRequest) ? team.pullRequest : {};
  const missingInformation = Array.isArray(team.missingInformation)
    ? team.missingInformation.filter((item): item is string => typeof item === "string")
    : [];

  return {
    engineeringCaseId,
    requestId: nullableString(team.requestId) ?? "",
    currentStage: nullableString(team.currentStage) ?? "intake",
    caseStatus: nullableString(team.caseStatus) ?? "active",
    stepStatus: nullableString(team.stepStatus),
    summary: nullableString(team.summary),
    decision: nullableString(team.decision),
    missingInformation,
    updatedAt: nullableString(team.updatedAt) ?? new Date(0).toISOString(),
    mission: mission?.id ? mission : null,
    pullRequest: {
      number: Number.isFinite(Number(pullRequest.number))
        ? Number(pullRequest.number)
        : null,
      url: nullableString(pullRequest.url),
      branch: nullableString(pullRequest.branch),
      headSha: nullableString(pullRequest.headSha),
    },
  };
}

function agentErrorResponse(error: unknown) {
  if (error instanceof AgentTeamRequestError) {
    return NextResponse.json(
      {
        error: error.message,
        detail: error.detail,
        agentStatus: error.status,
      },
      { status: 502 },
    );
  }
  return NextResponse.json(
    {
      error: "Agent team request failed",
      detail: error instanceof Error ? error.message : String(error),
    },
    { status: 502 },
  );
}

/**
 * PATCH /api/agent/requests/:id
 *
 * The Agent database is the sole execution authority. This route only authorizes
 * the ProFixIQ user, mints a short-lived one-time proof for explicit human
 * approvals, forwards the decision, then refreshes the local console projection.
 */
export async function PATCH(req: NextRequest) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ error: "Missing agent request id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json(
      {
        error: "action is required and must be approve or reject",
        example: { action: "approve" },
      },
      { status: 400 },
    );
  }

  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;
  const { supabase, user } = access;

  const { data: existing, error: existingError } = await supabase
    .from("agent_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    console.error("agent_requests PATCH load error", existingError);
    return NextResponse.json({ error: "Agent request not found" }, { status: 404 });
  }

  let currentProjection = projectionFromNormalized(existing.normalized_json);
  if (!currentProjection) {
    return NextResponse.json(
      { error: "This request is not linked to a canonical Agent engineering case" },
      { status: 409 },
    );
  }

  try {
    if (body.action === "approve") {
      if (currentProjection.mission?.status === "awaiting_approval") {
        const approvalProof = await mintAgentHumanApprovalIntent({
          requestId: id,
          engineeringCaseId: currentProjection.engineeringCaseId,
          missionId: currentProjection.mission.id,
          approvalKind: "mission",
          approverUserId: user.id,
        });
        await approveAgentTeamMission({
          missionId: currentProjection.mission.id,
          approvedBy: user.id,
          approvalProof,
        });
      } else if (
        currentProjection.caseStatus === "ready_for_human_approval"
        && currentProjection.currentStage === "release"
      ) {
        const approvalProof = await mintAgentHumanApprovalIntent({
          requestId: id,
          engineeringCaseId: currentProjection.engineeringCaseId,
          approvalKind: "release",
          approverUserId: user.id,
        });
        await approveAgentTeamRelease({
          engineeringCaseId: currentProjection.engineeringCaseId,
          approvedBy: user.id,
          approvalProof,
        });
      } else {
        return NextResponse.json(
          {
            error: "The Agent team is not waiting for a human approval at this stage",
            currentStage: currentProjection.currentStage,
            caseStatus: currentProjection.caseStatus,
            missionStatus: currentProjection.mission?.status ?? null,
          },
          { status: 409 },
        );
      }
    } else {
      await rejectAgentTeamCase({
        engineeringCaseId: currentProjection.engineeringCaseId,
        rejectedBy: user.id,
        reason: body.llm_notes?.trim() || "Rejected from the ProFixIQ Agent Console.",
      });
    }

    currentProjection = projectAgentTeamCase(
      await readAgentTeamCase(currentProjection.engineeringCaseId),
    );
  } catch (error) {
    return agentErrorResponse(error);
  }

  const normalized = isRecord(existing.normalized_json)
    ? existing.normalized_json
    : {};
  const finalStatus = mapAgentTeamRequestStatus(currentProjection) as AgentRequestStatus;

  const { data, error } = await supabase
    .from("agent_requests")
    .update({
      status: finalStatus,
      normalized_json: {
        ...normalized,
        agentTeam: {
          ...currentProjection,
          syncedAt: new Date().toISOString(),
        },
      },
      github_pr_number: currentProjection.pullRequest.number,
      github_pr_url: currentProjection.pullRequest.url,
      github_branch: currentProjection.pullRequest.branch,
      github_commit_sha: currentProjection.pullRequest.headSha,
      llm_notes: currentProjection.summary,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("agent_requests PATCH update error", error);
    return NextResponse.json(
      { error: "The Agent team was updated, but the local projection failed to refresh" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    request: data,
    engineeringCaseId: currentProjection.engineeringCaseId,
    currentStage: currentProjection.currentStage,
    caseStatus: currentProjection.caseStatus,
    missionStatus: currentProjection.mission?.status ?? null,
  });
}

/**
 * DELETE /api/agent/requests/:id
 *
 * Active canonical cases are rejected before their local projection is removed,
 * preventing invisible Agent work from continuing after deletion.
 */
export async function DELETE(req: NextRequest) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ error: "Missing agent request id" }, { status: 400 });
  }

  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;
  const { supabase, user } = access;

  const { data: existing, error: existingError } = await supabase
    .from("agent_requests")
    .select("id, normalized_json")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    console.error("agent_requests DELETE load error", existingError);
    return NextResponse.json({ error: "Agent request not found" }, { status: 404 });
  }

  const projection = projectionFromNormalized(existing.normalized_json);
  if (
    projection
    && projection.caseStatus !== "complete"
    && projection.caseStatus !== "rejected"
  ) {
    try {
      await rejectAgentTeamCase({
        engineeringCaseId: projection.engineeringCaseId,
        rejectedBy: user.id,
        reason: "Local Agent Console request deleted by an authorized developer.",
      });
    } catch (error) {
      return agentErrorResponse(error);
    }
  }

  try {
    const context = isRecord(existing.normalized_json)
      ? existing.normalized_json
      : {};
    const attachmentIds = Array.isArray(context.attachmentIds)
      ? context.attachmentIds.filter((value): value is string => typeof value === "string")
      : [];
    if (attachmentIds.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("agent_uploads")
        .remove(attachmentIds);
      if (storageError) console.error("agent_uploads cleanup error", storageError);
    }
  } catch (error) {
    console.error("Error processing attachmentIds for cleanup", error);
  }

  const { error: deleteError } = await supabase
    .from("agent_requests")
    .delete()
    .eq("id", id);
  if (deleteError) {
    console.error("agent_requests DELETE error", deleteError);
    return NextResponse.json({ error: "Failed to delete agent request" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
