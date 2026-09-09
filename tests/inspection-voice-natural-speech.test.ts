import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("inspection voice control: natural speech, not the flat device voice", () => {
  it("fetches the natural voice before ever falling back to speechSynthesis, without muting the mic during the fetch", () => {
    const screen = read(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );

    const naturalAt = screen.indexOf('fetch("/api/inspections/speech"');
    const localAt = screen.indexOf("function speakLocal(");
    const speakFnAt = screen.indexOf("const speak = (text: string): void => {");

    expect(naturalAt).toBeGreaterThan(-1);
    expect(localAt).toBeGreaterThan(-1);
    expect(speakFnAt).toBeGreaterThan(-1);

    // speak() must fetch the natural audio (fetchNaturalSpeechAudio) before
    // ever reaching speakLocal, so a technician gets the natural voice
    // whenever it's available and only hears the robotic fallback on real
    // failure — and the fetch must happen before voice.pause() is ever
    // called, so voice commands during the round trip aren't silently
    // dropped while the UI still claims to be listening.
    const speakBody = screen.slice(
      speakFnAt,
      screen.indexOf("\n  };", speakFnAt),
    );
    expect(speakBody).toContain("fetchNaturalSpeechAudio(text)");
    expect(speakBody.indexOf("fetchNaturalSpeechAudio")).toBeLessThan(
      speakBody.indexOf("voice.pause()"),
    );
    expect(speakBody.indexOf("fetchNaturalSpeechAudio")).toBeLessThan(
      speakBody.indexOf("speakLocal"),
    );
  });

  it("skips resuming or falling back once the voice session was stopped while the fetch was pending", () => {
    const screen = read(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );
    // stopVoice() bumps voiceGenerationRef so a speak() in flight can tell
    // its session is gone; speak() must check that before acting on the
    // fetch's result.
    expect(screen).toContain("voiceGenerationRef.current += 1");
    expect(screen).toContain("if (voiceGenerationRef.current !== generation) return;");

    // stopVoice() is the only place that should call voice.stop() directly
    // (it's what bumps the generation) — every other call site (startListening's
    // two branches, stopListening) must go through it instead of calling
    // voice.stop() on its own, or the generation guard above is pointless.
    const stopVoiceDefAt = screen.indexOf("const stopVoice = (): void => {");
    expect(stopVoiceDefAt).toBeGreaterThan(-1);
    const stopVoiceBody = screen.slice(
      stopVoiceDefAt,
      screen.indexOf("\n  };", stopVoiceDefAt),
    );
    expect(stopVoiceBody).toContain("voice.stop();");
    const restOfFile =
      screen.slice(0, stopVoiceDefAt) +
      screen.slice(screen.indexOf("\n  };", stopVoiceDefAt));
    // Matches the real statement form (with the trailing semicolon), not
    // this test's own or the source's prose mentioning "voice.stop()".
    expect(restOfFile).not.toMatch(/\bvoice\.stop\(\);/);
  });

  it("plays generated audio through the shared realtime transport's own audio graph", () => {
    const screen = read(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );
    expect(screen).toContain("await voice.playAudio(audio)");
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

  it("scopes inspection speech to the canRunInspections capability, not the Technician CoPilot's own gate or an overbroad staff-role allowlist", () => {
    const inspectionRoute = read("app/api/inspections/speech/route.ts");
    expect(inspectionRoute).toContain("requireShopScopedApiAccess");
    expect(inspectionRoute).toContain('requiredCapability: "canRunInspections"');
    expect(inspectionRoute).not.toContain("requireTechnicianCopilotAccess");
    // WORKFORCE_STAFF_ROLES includes "parts", which canRunInspections is
    // explicitly false for (see features/shared/lib/rbac.ts) — an
    // allowRoles gate here would let a parts-counter role spend the shop's
    // paid TTS budget on an endpoint it has no business calling.
    expect(inspectionRoute).not.toContain("WORKFORCE_STAFF_ROLES");
  });

  it("both speech routes preserve the exact 'not configured' response contract, checked before spending an enforcement slot", () => {
    for (const path of [
      "app/api/inspections/speech/route.ts",
      "app/api/copilot/technician/speech/route.ts",
    ]) {
      const route = read(path);
      const configuredAt = route.indexOf("isOpenAIConfigured()");
      const enforceAt = route.indexOf("enforceAIOperationalPolicy(");
      expect(configuredAt).toBeGreaterThan(-1);
      expect(enforceAt).toBeGreaterThan(-1);
      expect(configuredAt).toBeLessThan(enforceAt);
      expect(route).toContain('code: "speech_not_configured"');
      expect(route).toContain('errorCode: "speech_not_configured"');
    }
    expect(read("app/api/copilot/technician/speech/route.ts")).toContain(
      "Generated CoPilot voice is not configured.",
    );
    expect(read("app/api/inspections/speech/route.ts")).toContain(
      "Generated voice is not configured.",
    );
  });
});
