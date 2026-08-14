import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  "app/api/copilot/technician/chat/route.ts",
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
const realtimeSource = readFileSync(
  "features/inspections/lib/inspection/useRealtimeVoice.ts",
  "utf8",
);

describe("Technician CoPilot Realtime voice bridge contract", () => {
  it("requires the explicit technician voice capability before a voice turn", () => {
    expect(routeSource).toContain('body.inputMode === "voice"');
    expect(routeSource).toContain("!access.capabilities.voice");
    expect(routeSource).toContain("technician_copilot_voice_disabled");
  });

  it("persists spoken technician turns through the same repair-session runtime with voice provenance", () => {
    expect(runtimeSource).toContain('type TechnicianTurnSource = "ui" | "voice"');
    expect(runtimeSource).toContain("origin: inputSource");
    expect(runtimeSource).toContain("inputMode: inputSource");
    expect(runtimeSource).toContain('eventType: "conversation.user"');
  });

  it("does not reconnect the legacy command-style VoiceProvider", () => {
    expect(componentSource).toContain("useTechnicianInteractionGateway");
    expect(componentSource).not.toContain("VoiceProvider");
    expect(componentSource).not.toContain("buildGoal");
  });

  it("owns Realtime resources per startup generation so stale cleanup cannot tear down a replacement", () => {
    expect(realtimeSource).toContain("type RealtimeSessionResources");
    expect(realtimeSource).toContain("activeSessionRef");
    expect(realtimeSource).toContain("sessionIsCurrent(session)");
    expect(realtimeSource).toContain("cleanupSession(session)");
    expect(realtimeSource).toContain("activeSessionRef.current === session");
    expect(realtimeSource).toContain("stale startup owns only `session`");
  });

  it("resets a failed current startup so voice can be started again", () => {
    expect(realtimeSource).toContain("activeSessionRef.current = null");
    expect(realtimeSource).toContain("stoppedRef.current = true");
    expect(realtimeSource).toContain("throw caught instanceof Error");
  });

  it("treats a closing or closed paused socket as dead instead of re-enabling its microphone", () => {
    expect(realtimeSource).toContain(
      "socket.readyState !== WebSocket.OPEN &&",
    );
    expect(realtimeSource).toContain(
      "socket.readyState !== WebSocket.CONNECTING",
    );
    expect(realtimeSource).toContain("detachCurrentSession(session)");
    expect(realtimeSource).toContain("cleanupSession(session)");
    expect(realtimeSource).toContain("return false;");
  });
});
