import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AgentMissionDetails,
  isMissionReviewComplete,
  type AgentMissionReview,
} from "@/features/agent/agent-console/components/AgentMissionDetails";
import {
  projectAgentTeamCase,
  type AgentTeamCaseEnvelope,
} from "@/features/agent/server/teamClient";

function missionReview(): AgentMissionReview {
  return {
    id: "694f5648-c5db-4b73-82a9-fc10e40c93e3",
    status: "awaiting_approval",
    title: "Repair mission",
    problemStatement: "The canonical approval surface hides mission details.",
    desiredOutcome: "Show the complete review contract before approval.",
    acceptanceCriteria: Array.from(
      { length: 7 },
      (_, index) => `Acceptance criterion ${index + 1}`,
    ),
    constraints: ["Preserve shop isolation", "Do not merge automatically"],
    risks: ["Incomplete context could authorize the wrong scope"],
    planSteps: Array.from({ length: 7 }, (_, index) => ({
      position: index + 1,
      title: `Plan step ${index + 1}`,
      description: `Complete repair action ${index + 1}`,
      ownerStage: index === 0 ? "implementation" : "test",
    })),
  };
}

describe("Agent mission approval completeness", () => {
  it("renders every mission item and blocks incomplete mission contracts", () => {
    const mission = missionReview();
    const markup = renderToStaticMarkup(<AgentMissionDetails mission={mission} />);

    for (const criterion of mission.acceptanceCriteria ?? []) {
      expect(markup).toContain(criterion);
    }
    for (const step of mission.planSteps ?? []) {
      expect(markup).toContain(step.title);
      expect(markup).toContain(step.description);
    }
    for (const constraint of mission.constraints ?? []) {
      expect(markup).toContain(constraint);
    }
    for (const risk of mission.risks ?? []) {
      expect(markup).toContain(risk);
    }

    expect(isMissionReviewComplete(mission)).toBe(true);
    expect(isMissionReviewComplete({ ...mission, planSteps: undefined })).toBe(false);
    expect(isMissionReviewComplete({ ...mission, acceptanceCriteria: [] })).toBe(false);
  });

  it("projects the full mission while labeling the compact summary as a preview", () => {
    const mission = missionReview();
    const envelope = {
      engineeringCase: {
        id: "a2d023e1-704b-4069-bada-5635fcbcf4f4",
        currentStage: "implementation",
        status: "blocked",
        updatedAt: "2026-08-07T00:00:00.000Z",
        ticket: {
          id: "8b07673d-a003-462b-a4ef-dfdb9d3d4ed1",
          metadata: {},
        },
        stages: {
          root_cause: {
            status: "passed",
            result: { summary: "Root cause summary" },
          },
          planning: {
            status: "passed",
            result: {
              summary: "Repair summary",
              data: {
                recommendedFiles: Array.from(
                  { length: 8 },
                  (_, index) => `features/example/File${index + 1}.tsx`,
                ),
              },
            },
          },
          implementation: {
            status: "blocked",
            result: { summary: "Awaiting approval" },
          },
        },
      },
      mission: {
        id: mission.id!,
        status: mission.status!,
        title: mission.title,
        problem_statement: mission.problemStatement,
        desired_outcome: mission.desiredOutcome,
        acceptanceCriteria: mission.acceptanceCriteria!.map((criterion) => ({
          criterion,
        })),
        constraints: mission.constraints!.map((description) => ({ description })),
        risks: mission.risks!.map((description) => ({ description })),
        planSteps: mission.planSteps!.map((step) => ({
          position: step.position,
          title: step.title,
          description: step.description,
          owner_stage: step.ownerStage,
        })),
      },
    } satisfies AgentTeamCaseEnvelope;

    const projection = projectAgentTeamCase(envelope);

    expect(projection.mission?.acceptanceCriteria).toHaveLength(7);
    expect(projection.mission?.planSteps).toHaveLength(7);
    expect(projection.mission?.constraints).toHaveLength(2);
    expect(projection.mission?.risks).toHaveLength(1);
    expect(projection.summary).toContain("Repair scope preview");
    expect(projection.summary).toContain("+2 more files in the full mission review");
    expect(projection.summary).toContain("+2 more checks in the full mission review");
    expect(projection.summary).toContain("+2 more steps in the full mission review");
  });
});
