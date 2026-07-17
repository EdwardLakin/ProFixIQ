import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PWA install prompt safe-area positioning", () => {
  const runtime = readFileSync(
    "features/shared/components/pwa/PwaRuntime.tsx",
    "utf8",
  );

  it("keeps the runtime pill above iOS and iPadOS safe areas", () => {
    expect(runtime).toContain("safe-area-inset-bottom");
    expect(runtime).toContain("safe-area-inset-right");
    expect(runtime).toContain("viewportInsets.bottom");
    expect(runtime).toContain("viewportInsets.right");
  });

  it("tracks Safari visual viewport changes and removes its listeners", () => {
    expect(runtime).toContain('visualViewport?.addEventListener("resize"');
    expect(runtime).toContain('visualViewport?.addEventListener("scroll"');
    expect(runtime).toContain('visualViewport?.removeEventListener("resize"');
    expect(runtime).toContain('visualViewport?.removeEventListener("scroll"');
  });

  it("allows the compact prompt to wrap on narrow viewports", () => {
    expect(runtime).toContain("flex-wrap");
    expect(runtime).toContain("sm:flex-nowrap");
  });
});
