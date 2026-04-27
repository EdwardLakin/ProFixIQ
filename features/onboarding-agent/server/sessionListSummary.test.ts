import { describe, expect, it } from "vitest";
import { buildOnboardingSessionListPayload } from "@/features/onboarding-agent/server/sessionListSummary";

describe("onboarding session list summary", () => {
  it("uses persisted raw row totals instead of ai sampled row caps", () => {
    const sessions = buildOnboardingSessionListPayload({
      sessions: [
        {
          id: "session-1",
          status: "analysis_ready",
          summary: {
            rowsParsed: 1000,
            aiRowsSampled: 1000,
          },
        },
      ],
      fileCounts: new Map([["session-1", 8]]),
      rawRowsBySession: new Map([["session-1", 19717]]),
    });

    expect(sessions[0].file_count).toBe(8);
    expect((sessions[0].summary as Record<string, unknown>).rowsParsed).toBe(19717);
    expect((sessions[0].summary as Record<string, unknown>).rowsParsedTotal).toBe(19717);
    expect((sessions[0].summary as Record<string, unknown>).aiRowsSampled).toBe(1000);
    expect((sessions[0].summary as Record<string, unknown>).liveRecordsCreated).toBe(0);
  });
});
