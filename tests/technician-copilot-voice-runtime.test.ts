import { describe, expect, it } from "vitest";

import { runTechnicianCopilotTurn } from "@/features/copilot/technician/server/chat";

describe("Technician CoPilot voice runtime authorization", () => {
  it("rejects a voice turn before work discovery when voice is disabled", async () => {
    await expect(
      runTechnicianCopilotTurn({
        identity: {
          authUserId: "auth-tech",
          profileId: "profile-tech",
          shopId: "shop-1",
          documentationEnabled: true,
          voiceEnabled: false,
          supabase: {} as never,
        },
        message: "Start the Ford.",
        turnId: "voice-disabled-turn",
        inputSource: "voice",
      }),
    ).rejects.toThrow("Technician CoPilot voice is not enabled.");
  });
});
