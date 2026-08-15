import { describe, expect, it } from "vitest";
import {
  diagnoseAgentPipelineRequest,
  partitionAgentQuestions,
  summarizeAgentPipeline,
} from "@/features/agent/lib/pipelineDiagnostics";

const NOW = Date.parse("2026-08-14T20:00:00.000Z");

describe("Agent pipeline diagnostics", () => {
  it("keeps engineering evidence tasks out of reporter Q&A", () => {
    expect(partitionAgentQuestions([
      "No proven import/call chain from PartsUsedList to the return API.",
      "No state matrix mapping allocation through UI confirmation.",
      "Which device and browser did you use?",
    ])).toEqual({
      reporterQuestions: ["Which device and browser did you use?"],
      internalRequirements: [
        "No proven import/call chain from PartsUsedList to the return API.",
        "No state matrix mapping allocation through UI confirmation.",
      ],
    });
  });

  it("explains historical bridge authorization failures", () => {
    expect(diagnoseAgentPipelineRequest({
      id: "request-1",
      status: "failed",
      createdAt: "2026-08-14T18:00:00.000Z",
      updatedAt: "2026-08-14T18:00:00.000Z",
      notes: 'ProFixIQ-Agent request failed: HTTP 403: {"error":"agent API access denied"}',
    }, NOW)).toMatchObject({
      kind: "authorization_failure",
      title: "Agent authorization failed",
      actionLabel: "Retry dispatch",
    });
  });

  it("marks internally blocked specialist work without asking the reporter", () => {
    expect(diagnoseAgentPipelineRequest({
      id: "request-2",
      status: "in_progress",
      createdAt: "2026-08-14T18:00:00.000Z",
      updatedAt: "2026-08-14T19:00:00.000Z",
      reporterQuestions: [],
      team: {
        caseStatus: "blocked",
        currentStage: "planning",
        updatedAt: "2026-08-14T19:00:00.000Z",
        internalDependency: "specialist_conflict",
        conflicts: [{ topic: "specialist_decision", description: "Reviewers disagree" }],
      },
    }, NOW)).toMatchObject({
      kind: "internal_blocker",
      title: "Specialist review blocked",
      actionLabel: "Restart from stage",
    });
  });

  it("summarizes failed, blocked, stale, and approval queues", () => {
    const requests = [
      {
        id: "failed",
        status: "failed",
        createdAt: "2026-08-14T18:00:00.000Z",
        updatedAt: "2026-08-14T18:00:00.000Z",
        notes: "HTTP 403 access denied",
      },
      {
        id: "stale",
        status: "in_progress",
        createdAt: "2026-08-14T18:00:00.000Z",
        updatedAt: "2026-08-14T18:00:00.000Z",
      },
      {
        id: "approval",
        status: "awaiting_approval",
        createdAt: "2026-08-14T18:00:00.000Z",
        updatedAt: "2026-08-14T19:59:00.000Z",
      },
    ];

    expect(summarizeAgentPipeline(requests, NOW)).toMatchObject({
      state: "needs_attention",
      issueCount: 2,
      failedCount: 1,
      staleCount: 1,
      approvalCount: 1,
    });
  });
});
