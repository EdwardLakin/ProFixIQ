import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MARKETING_PAGE_REGISTRY } from "@/features/marketing/media/types";

const read = (path: string) => readFileSync(path, "utf8");

describe("homepage managed story media", () => {
  it("keeps all homepage story and onboarding slots registered", () => {
    const slots = MARKETING_PAGE_REGISTRY.home.slots;
    expect(slots.hero).toBeDefined();
    expect(slots.inspection).toBeDefined();
    expect(slots.approval).toBeDefined();
    expect(slots.operations).toBeDefined();
    expect(slots.onboarding).toBeDefined();
  });

  it("wires each product story to managed homepage media with its synthetic fallback", () => {
    const landing = read("features/shared/components/ProFixIQLanding.tsx");

    expect(landing).toContain('pageKey="home" slotKey={story.visual}');
    expect(landing).toContain('fallback={<ProductVisual type={story.visual} />}');
    expect(landing).toContain('visual: "inspection"');
    expect(landing).toContain('visual: "approval"');
    expect(landing).toContain('visual: "operations"');
  });

  it("wires Shop Boost onboarding to managed media while preserving the authored fallback", () => {
    const landing = read("features/shared/components/ProFixIQLanding.tsx");

    expect(landing).toContain('pageKey="home" slotKey="onboarding"');
    expect(landing).toContain('fallback={<ShopBoostFallback />}');
    expect(landing).toContain("function ShopBoostFallback()");
    expect(landing).toContain("Run Instant Shop Analysis");
  });

  it("keeps homepage story reels user initiated by using ManagedMarketingMedia defaults", () => {
    const landing = read("features/shared/components/ProFixIQLanding.tsx");
    const renderer = read("features/marketing/components/ManagedMarketingMedia.tsx");

    expect(landing).not.toContain("autoPlayVideo=");
    expect(renderer).toContain("autoPlayVideo = false");
    expect(renderer).toContain("controls");
  });
});
