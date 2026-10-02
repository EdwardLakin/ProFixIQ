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
const technicianRealtimeSource = readFileSync(
  "features/copilot/technician/voice/useTechnicianRealtimeVoice.ts",
  "utf8",
);
const sharedRealtimeTransportSource = readFileSync(
  "features/shared/voice/useRealtimeTranscription.ts",
  "utf8",
);
const liveRouteSource = readFileSync(
  "app/api/openai/realtime-token/route.ts",
  "utf8",
);
const technicianCopilotAuthSource = readFileSync(
  "features/copilot/technician/server/auth.ts",
  "utf8",
);
const inspectionVoiceWrapperSource = readFileSync(
  "features/inspections/lib/inspection/useRealtimeVoice.ts",
  "utf8",
);
const inspectionVoiceTransportSource = readFileSync(
  "features/inspections/lib/inspection/useCostOptimizedInspectionVoice.ts",
  "utf8",
);

describe("Technician CoPilot GPT-Live voice bridge boundaries", () => {
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

  it("keeps the CoPilot turn/gateway abstraction isolated from inspection and legacy command voice", () => {
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

  it("shares one GPT-Live WebRTC transport without merging feature authority", () => {
    expect(technicianRealtimeSource).toContain(
      'from "@/features/shared/voice/useRealtimeTranscription"',
    );
    expect(inspectionRealtimeSource).toContain(
      'from "@/features/shared/voice/useRealtimeTranscription"',
    );
    expect(sharedRealtimeTransportSource).toContain(
      "export function useRealtimeTranscription(",
    );
    expect(sharedRealtimeTransportSource).toContain("new RTCPeerConnection()");
    expect(sharedRealtimeTransportSource).toContain(
      'createDataChannel("oai-events")',
    );
    expect(sharedRealtimeTransportSource).toContain(
      '"session.delegation.created"',
    );
    expect(technicianRealtimeSource).toContain(
      'surface: "technician_copilot"',
    );
    expect(inspectionRealtimeSource).toContain('surface: "inspection"');
    expect(technicianRealtimeSource).not.toContain("new RTCPeerConnection(");
    expect(inspectionRealtimeSource).not.toContain("new RTCPeerConnection(");
  });
  it("authorizes each GPT-Live surface at its owning capability boundary", () => {
    expect(liveRouteSource).toContain("requireTechnicianCopilotAccess");
    expect(liveRouteSource).toContain("access.capabilities.voice");
    expect(liveRouteSource).toContain(
      'requiredCapability: "canRunInspections"',
    );
    expect(liveRouteSource).toContain('code: "live_invalid_surface"');
  });

  it("reserves bounded GPT-Live session spend in the existing operational budget", () => {
    expect(liveRouteSource).toContain("LIVE_SESSION_RESERVED_COST_USD");
    expect(liveRouteSource).toContain(
      'operation: "live_session_reservation"',
    );
    expect(liveRouteSource).toContain(
      "estimatedCostUsd: LIVE_SESSION_RESERVED_COST_USD",
    );
  });

  it("requires a paid assigned Technician Copilot seat outside the tester override", () => {
    expect(technicianCopilotAuthSource).toContain(
      '"edwardlakin35@gmail.com"',
    );
    expect(technicianCopilotAuthSource).toContain(
      '"technician_copilot_has_paid_access"',
    );
    expect(technicianCopilotAuthSource).toContain(
      '"technician_copilot_subscription_required"',
    );
  });

  it("keeps inspection voice off premium GPT-Live and sends only detected speech", () => {
    expect(inspectionVoiceWrapperSource).toContain(
      "useCostOptimizedInspectionVoice",
    );
    expect(inspectionVoiceTransportSource).toContain(
      '"/api/openai/inspection-transcription-token"',
    );
    expect(inspectionVoiceTransportSource).toContain(
      'type: "input_audio_buffer.append"',
    );
    expect(inspectionVoiceTransportSource).toContain(
      "if (!session.speaking) return;",
    );
    expect(inspectionVoiceTransportSource).toContain(
      "inspection-transcription-usage",
    );
    expect(inspectionVoiceWrapperSource).not.toContain(
      "useRealtimeTranscription",
    );
  });

});
