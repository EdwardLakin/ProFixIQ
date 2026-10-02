import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("inspection voice control: GPT-Live output", () => {
  it("sends verified inspection feedback through the active Live session", () => {
    const screen = read(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );
    expect(screen).toContain("voice.speakText?.(text)");
    expect(screen).not.toContain('fetch("/api/inspections/speech"');
    expect(screen).not.toContain("voice.playAudio(audio)");
  });

  it("keeps browser speech only as a last-resort fallback", () => {
    const screen = read(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );
    const speakAt = screen.indexOf("const speak = (text: string): void => {");
    const localAt = screen.indexOf("speakLocal(text", speakAt);
    const liveAt = screen.indexOf("voice.speakText?.(text)", speakAt);
    expect(speakAt).toBeGreaterThan(-1);
    expect(liveAt).toBeGreaterThan(speakAt);
    expect(localAt).toBeGreaterThan(liveAt);
  });

  it("preserves generation guards so stale inspection feedback cannot enter a replacement session", () => {
    const screen = read(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );
    expect(screen).toContain("voiceGenerationRef.current += 1");
    expect(screen).toContain(
      "voiceGenerationRef.current === generation && speakSeqRef.current === seq",
    );
    expect(screen).toContain("if (!isCurrent()) return;");
  });

  it("uses the inspection transcription transport rather than the Technician Copilot surface", () => {
    const wrapper = read(
      "features/inspections/lib/inspection/useRealtimeVoice.ts",
    );
    const transport = read(
      "features/inspections/lib/inspection/useCostOptimizedInspectionVoice.ts",
    );
    expect(wrapper).toContain("useCostOptimizedInspectionVoice");
    expect(wrapper).not.toContain('surface: "technician_copilot"');
    expect(transport).toContain("/api/openai/inspection-transcription-token");
    expect(transport).not.toContain('surface: "technician_copilot"');
  });
});
