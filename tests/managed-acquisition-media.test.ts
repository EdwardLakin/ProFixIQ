import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MARKETING_PAGE_REGISTRY,
  getMarketingPageKeyForHref,
} from "@/features/marketing/media/types";

const read = (path: string) => readFileSync(path, "utf8");

describe("managed acquisition landing media", () => {
  it("registers the primary acquisition surfaces with product-proof slots", () => {
    const expected = [
      "/repair-shop-management-software",
      "/heavy-duty-shop-management-software",
      "/diesel-repair-shop-software",
      "/heavy-duty-work-order-software",
      "/heavy-duty-inspection-software",
      "/fleet-repair-management-software",
      "/fleet-preventive-maintenance-software",
      "/mobile-truck-repair-software",
      "/service-truck-work-order-software",
      "/equipment-maintenance-software",
      "/heavy-equipment-repair-software",
      "/off-highway-equipment-repair-software",
      "/compare/fullbay-alternative",
      "/compare/profixiq-vs-fullbay",
    ];

    for (const href of expected) {
      const pageKey = getMarketingPageKeyForHref(href);
      expect(pageKey).not.toBeNull();
      expect(
        Object.prototype.hasOwnProperty.call(
          MARKETING_PAGE_REGISTRY[pageKey!].slots,
          "product-proof",
        ),
      ).toBe(true);
    }
  });

  it("keeps the existing homepage hero slot intact", () => {
    expect(getMarketingPageKeyForHref("/")).toBe("home");
    expect(MARKETING_PAGE_REGISTRY.home.slots.hero).toBeDefined();
  });

  it("resolves managed media by pathname and preserves a responsive authored fallback", () => {
    const renderer = read(
      "features/marketing/components/ManagedMarketingMedia.tsx",
    );
    const shared = read(
      "features/marketing/components/publicMarketingMedia.ts",
    );
    const landing = read(
      "features/marketing/components/SearchLandingPage.tsx",
    );

    expect(renderer).toContain("usePathname()");
    expect(renderer).toContain("getMarketingPageKeyForHref(pathname)");
    expect(renderer).toContain("getPublishedMarketingSlots(resolvedPageKey)");
    expect(shared).toContain("/api/public/marketing/pages/${pageKey}");
    expect(renderer).toContain("if (!asset) return <>{fallback}</>");
    expect(renderer).toContain('autoPlayVideo = false');
    expect(renderer).toContain('aspect-[16/10]');
    expect(renderer).toContain("controls");
    expect(landing).toContain('import Image from "next/image"');
    expect(landing).toContain("<Image");
    expect(landing).toContain('sizes="(min-width: 1024px) 54vw, 100vw"');
    expect(landing).toContain("<ManagedMarketingMedia");
    expect(landing).toContain('slotKey="product-proof"');
    expect(landing).toContain("<ProductProofFallback media={section.media} />");
  });

  it("drives Ops page and slot selection from the registry and ignores stale page loads", () => {
    const editor = read(
      "features/ops/components/OpsMarketingMediaManager.tsx",
    );

    expect(editor).toContain("MARKETING_PAGE_REGISTRY");
    expect(editor).toContain('useState<MarketingPageKey>("home")');
    expect(editor).toContain("Object.entries(MARKETING_PAGE_REGISTRY)");
    expect(editor).toContain("Object.entries(definition.slots)");
    expect(editor).toContain("/api/ops/marketing/pages/${pageKey}");
    expect(editor).toContain("pageRequestRef");
    expect(editor).toContain("requestId !== pageRequestRef.current");
    expect(editor).not.toContain('/api/ops/marketing/pages/home", {');
  });
});
