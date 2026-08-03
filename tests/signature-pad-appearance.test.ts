import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "features/shared/signaturePad/controller.tsx",
  "utf8",
);

describe("signature pad appearance", () => {
  it("uses dark ink on a stable white drawing surface", () => {
    expect(source).toContain('const SIGNATURE_INK_COLOR = "#0f172a"');
    expect(source).toContain('const SIGNATURE_CANVAS_COLOR = "#ffffff"');
    expect(source).toContain("penColor={SIGNATURE_INK_COLOR}");
    expect(source).toContain("backgroundColor: SIGNATURE_CANVAS_COLOR");
    expect(source).not.toContain('penColor="white"');
  });

  it("keeps the clear control readable against the ink-color background", () => {
    expect(source).toContain("backgroundColor: SIGNATURE_INK_COLOR");
    expect(source).toContain("color: SIGNATURE_CANVAS_COLOR");
  });
});
