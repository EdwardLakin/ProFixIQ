import { describe, expect, it } from "vitest";
import { BRAND_STYLE_PRESETS, getBrandStylePreset } from "./brandStylePresets";

describe("brand style presets", () => {
  it("provides complete and visually distinct presets", () => {
    expect(BRAND_STYLE_PRESETS).toHaveLength(12);

    const values = BRAND_STYLE_PRESETS.map(({ value }) =>
      getBrandStylePreset(value),
    );
    expect(new Set(values.map((preset) => preset.primaryColor)).size).toBe(12);
    expect(
      new Set(values.map((preset) => preset.appBackground)).size,
    ).toBeGreaterThan(2);

    for (const preset of values) {
      expect(preset.stylePreset).toBeTruthy();
      expect(preset.primaryColor).toMatch(/^#[0-9A-F]{6}$/i);
      expect(preset.cardBackground).toMatch(/^#[0-9A-F]{6}$/i);
      expect(preset.inputText).toMatch(/^#[0-9A-F]{6}$/i);
      expect(preset.dashboardBackgroundBase).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("provides the original red, black, and chrome Forged Redline system", () => {
    const preset = getBrandStylePreset("forged-redline");

    expect(preset.primaryColor).toBe("#E21B23");
    expect(preset.secondaryColor).toBe("#0A0A0B");
    expect(preset.accentColor).toBe("#C9CDD1");
    expect(preset.dashboardBackgroundMode).toBe("gradient");
    expect(preset.stylePreset).toBe("forged-redline");
  });

  it("returns a copy so callers cannot mutate the catalog", () => {
    const first = getBrandStylePreset("performance");
    first.primaryColor = "#000000";

    expect(getBrandStylePreset("performance").primaryColor).toBe("#DC2626");
  });
});
