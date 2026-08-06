import { describe, expect, it } from "vitest";
import { buildLogoPrompt } from "./logo-generation";

describe("brand logo generation", () => {
  it("keeps Forged Redline original and free of existing tool branding", () => {
    const prompt = buildLogoPrompt({
      shopName: "Precision Auto",
      prompt: "Create a strong shop mark",
      stylePreset: "forged-redline",
      transparentBackground: true,
    });

    expect(prompt).toContain("signal red, carbon black, and satin chrome");
    expect(prompt).toContain("Do not reference or imitate");
    expect(prompt).not.toMatch(/snap[- ]?on/i);
  });
});
