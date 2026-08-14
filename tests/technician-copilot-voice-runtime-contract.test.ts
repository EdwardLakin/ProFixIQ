import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  "app/api/copilot/technician/chat/route.ts",
  "utf8",
);
const sessionRouteSource = readFileSync(
  "app/api/copilot/technician/session/route.ts",
  "utf8",
);
const runtimeSource = readFileSync(
  "features/copilot/technician/server/chat.ts",
  "utf8",
);
const componentSource = readFileSync(
  "features/copilot/technician/components/TechnicianTextCopilot.tsx",
  "utf8",
);
const gatewaySource = readFileSync(
  "features/copilot/technician/voice/useTechnicianInteractionGateway.ts",
  "utf8",
);
const inspectionRealtimeSource = readFileSync(
  "features/inspections/lib/inspection/useRealtimeVoice.ts",
  "utf8",
);

describe("Technician CoPilot Realtime voice bridge boundaries", () => {
  it("returns the resolved voice capability to the call surface", () => {
    expect(sessionRouteSource).toContain(
      "voice: access.capabilities.voice",
    );
  });

  it("requires the explicit technician voice capability before a voice turn", () => {
    expect(routeSource).toContain('body.inputMode === "voice"');
    expect(routeSource).toContain("!access.capabilities.voice");
    expect(routeSource).toContain("technician_copilot_voice_disabled");
  });

  it("persists spoken turns through the Repair Session runtime with voice provenance", () => {
    expect(runtimeSource).toContain('type TechnicianTurnSource = "ui" | "voice"');
    expect(runtimeSource).toContain("origin: inputSource");
    expect(runtimeSource).toContain("inputMode: inputSource");
    expect(runtimeSource).toContain('eventType: "conversation.user"');
  });

  it("keeps the CoPilot transport isolated from inspection and legacy command voice", () => {
    expect(gatewaySource).toContain('from "./useTechnicianRealtimeVoice"');
    expect(gatewaySource).not.toContain("useRealtimeVoice");
    expect(gatewaySource).not.toContain("useRealtimeTranscription");
    expect(inspectionRealtimeSource).not.toContain(
      "useTechnicianInteractionGateway",
    );
    expect(componentSource).toContain("useTechnicianInteractionGateway");
    expect(componentSource).not.toContain("VoiceProvider");
    expect(componentSource).not.toContain("buildGoal");
  });
});
