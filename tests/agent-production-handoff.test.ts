import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("production agent request handoff", () => {
  const route = read("app/api/agent/requests/route.ts");
  const detailRoute = read("app/api/agent/requests/[id]/route.ts");
  const teamClient = read("features/agent/server/teamClient.ts");
  const requestIntake = read("features/agent/server/requestIntake.ts");
  const consolePage = read("features/agent/agent-console/app/agent/page.tsx");
  const replyRoute = read("app/api/agent/requests/[id]/reply/route.ts");

  it("uses the canonical authenticated Agent team client", () => {
    expect(route).toContain("submitAgentTeamRequest");
    expect(requestIntake).toContain("agentTeamRequest<AgentServiceResponse>");
    expect(route).toContain("readAgentTeamCase(engineeringCaseId)");
    expect(route).toContain("projectAgentTeamCase");
    expect(teamClient).toContain("resolveAgentApiSecrets()");
    expect(teamClient).toContain('"x-agent-api-secret"');
    expect(route).not.toContain("app.github.dev");
  });

  it("sends canonical engineering context and screenshot evidence", () => {
    expect(route).toContain("const expectedBehavior = asNullableString(body.expected)");
    expect(route).toContain("const actualBehavior = asNullableString(body.actual)");
    expect(route).toContain("expectedBehavior,");
    expect(route).toContain("actualBehavior,");
    expect(route).toContain("const signedScreenshotUrls = signedAttachments.map");
    expect(route).toContain("screenshots: signedScreenshotUrls");
    expect(route).toContain("const route = asNullableString(body.location)");
    expect(route).toContain("const browser = asNullableString(body.device)");
  });

  it("fails visibly instead of leaving a broken request submitted", () => {
    expect(route).toContain('status: "failed" as AgentRequestStatus');
    expect(route).toContain('error: "ProFixIQ-Agent request failed"');
    expect(route).toContain("{ status: 502 }");
  });

  it("projects team blockers into the visible Agent Q&A contract", () => {
    expect(route).toContain("function projectionQuestions(projection: AgentTeamProjection)");
    expect(route).toContain("projection.missingInformation.map");
    expect(route).toContain("questions: projectionQuestions(projection)");
    expect(consolePage).toContain("selectedTeam?.missingInformation");
    expect(consolePage).toContain("The engineering team needs this information to continue:");
    expect(replyRoute).toContain("resumeAgentTeamCase");
  });

  it("projects an awaiting mission as diagnosis plus repair proposal rather than a fake Q&A blocker", () => {
    expect(teamClient).toContain("function missionApprovalSummary(");
    expect(teamClient).toContain("Diagnosis\\n");
    expect(teamClient).toContain("Proposed repair\\n");
    expect(teamClient).toContain("Repair scope preview\\n");
    expect(teamClient).toContain("Acceptance checks preview\\n");
    expect(teamClient).toContain("Engineering plan preview\\n");
    expect(teamClient).toContain("Human approval is required before the engineering team can change code");
    expect(teamClient).toContain("awaitingMissionApproval");
    expect(teamClient).toContain("? []");
  });

  it("keeps the expanded mission shape when reading the local request projection", () => {
    expect(detailRoute).toContain('acceptanceCriteria: stringArray(team.mission.acceptanceCriteria)');
    expect(detailRoute).toContain('constraints: stringArray(team.mission.constraints)');
    expect(detailRoute).toContain('risks: stringArray(team.mission.risks)');
    expect(detailRoute).toContain('planSteps: missionPlanSteps(team.mission.planSteps)');
    expect(detailRoute).toContain('NonNullable<AgentTeamProjection["mission"]>["planSteps"]');
  });

  it("only exposes approval when the Agent team has a mission or release gate", () => {
    expect(consolePage).toContain('selectedTeam?.mission?.status === "awaiting_approval"');
    expect(consolePage).toContain('selectedTeam?.caseStatus === "ready_for_human_approval"');
    expect(consolePage).toContain('selectedTeam?.currentStage === "release"');
    expect(consolePage).toContain("{canApprove && (");
    expect(consolePage).toContain('missionAwaitingApproval ? "Approve Mission" : "Approve Release"');
  });
});
