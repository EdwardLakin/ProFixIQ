import { describe, expect, it } from "vitest";
import { buildVoiceBrainFeedback } from "@/features/inspections/lib/inspection/voice/voiceBrain";

describe("one-phrase finding feedback", () => {
  it("confirms the finding, parts and labor and asks for a photo", () => {
    const cmd = {
      type: "inspection_finding",
      item: "RR Brake Chamber",
      status: "fail",
      parts: [{ description: "Clevis pins", qty: 1 }],
      laborHours: 1.5,
    } as never;
    const fb = buildVoiceBrainFeedback({
      rawSpeech: "x",
      parsed: [cmd],
      applied: [{ command: "inspection_finding", ok: true }],
    });
    expect(fb.spoken).toMatch(/failed/i);
    expect(fb.spoken).toMatch(/1\.5 hours labor/);
    expect(fb.followUp.kind).toBe("photo_prompt");
  });
});
