import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controller = readFileSync(
  "features/shared/signaturePad/controller.tsx",
  "utf8",
);

describe("shared signature pad touch and blank-capture safety", () => {
  it("attaches responsive and non-passive touch handling when the modal opens", () => {
    expect(controller).toContain("if (!open || !containerRef.current) return;");
    expect(controller).toContain(
      'addEventListener("touchmove", preventScroll, { passive: false })',
    );
    expect(controller).toContain("}, [open]);");
    expect(controller).toContain('touchAction: "none"');
  });

  it("uses the actual narrow-screen width instead of forcing canvas overflow", () => {
    expect(controller).toContain(
      "const w = measuredWidth > 0 ? measuredWidth : 480;",
    );
    expect(controller).not.toContain("Math.max(320");
  });

  it("rejects an exported canvas that contains no visible signature ink", () => {
    expect(controller).toContain("function canvasHasVisibleInk");
    expect(controller).toContain(
      "getImageData(0, 0, canvas.width, canvas.height)",
    );
    expect(controller).toContain("if (!canvasHasVisibleInk(canvas))");
    expect(
      controller.indexOf("if (!canvasHasVisibleInk(canvas))"),
    ).toBeLessThan(controller.indexOf('canvas.toDataURL("image/png")'));
  });

  it("resets SignaturePad state whenever a resize clears the bitmap", () => {
    const resizeBlock = controller.slice(
      controller.indexOf("if (canvas.width !== W || canvas.height !== H)"),
      controller.indexOf("// Prevent page scroll while signing"),
    );
    expect(resizeBlock.indexOf("sigRef.current?.clear?.()")).toBeGreaterThan(
      -1,
    );
    expect(resizeBlock.indexOf("sigRef.current?.clear?.()")).toBeLessThan(
      resizeBlock.indexOf("canvas.width = W"),
    );
  });
});
