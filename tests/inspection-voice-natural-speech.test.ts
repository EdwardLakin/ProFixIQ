import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("inspection voice control: natural speech, not the flat device voice", () => {
  it("tries the shared neural voice endpoint before ever falling back to speechSynthesis", () => {
    const screen = read(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );

    const naturalAt = screen.indexOf('fetch("/api/inspections/speech"');
    const localAt = screen.indexOf("function speakLocal(");
    const speakFnAt = screen.indexOf("const speak = (text: string): void => {");

    expect(naturalAt).toBeGreaterThan(-1);
    expect(localAt).toBeGreaterThan(-1);
    expect(speakFnAt).toBeGreaterThan(-1);

    // speak() must attempt speakNatural (via voice.playAudio) before ever
    // reaching speakLocal, so a technician gets the natural voice whenever
    // it's available and only hears the robotic fallback on real failure.
    const speakBody = screen.slice(speakFnAt, screen.indexOf("\n  };", speakFnAt));
    expect(speakBody).toContain("speakNatural(text, voice.playAudio)");
    expect(speakBody.indexOf("speakNatural")).toBeLessThan(
      speakBody.indexOf("speakLocal"),
    );
  });

  it("plays generated audio through the shared realtime transport's own audio graph", () => {
    const screen = read(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );
    expect(screen).toContain("await playAudio(audio)");
  });

  it("routes through the shared naturalSpeech module server-side, the same one the Technician CoPilot uses", () => {
    const inspectionRoute = read("app/api/inspections/speech/route.ts");
    const copilotRoute = read("app/api/copilot/technician/speech/route.ts");
    const shared = read("features/shared/lib/server/naturalSpeech.ts");

    expect(inspectionRoute).toContain(
      '@/features/shared/lib/server/naturalSpeech"',
    );
    expect(copilotRoute).toContain(
      '@/features/shared/lib/server/naturalSpeech"',
    );
    expect(shared).toContain('"gpt-4o-mini-tts"');
    expect(shared).toContain('"marin"');
  });

  it("scopes inspection speech to any shop staff role, not the Technician CoPilot's own capability gate", () => {
    const inspectionRoute = read("app/api/inspections/speech/route.ts");
    expect(inspectionRoute).toContain("requireShopScopedApiAccess");
    expect(inspectionRoute).not.toContain("requireTechnicianCopilotAccess");
  });
});
