import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shopCreateRoute = readFileSync("app/work-orders/create/page.tsx", "utf8");
const shopCreateWrapper = readFileSync(
  "features/work-orders/app/work-orders/create/ShopCreateWorkOrderPage.tsx",
  "utf8",
);
const portalIntakeRoute = readFileSync(
  "app/portal/work-orders/[id]/intake/page.tsx",
  "utf8",
);

describe("shop create quick intake removal", () => {
  it("routes shop work-order creation through the no-intake wrapper", () => {
    expect(shopCreateRoute).toContain("ShopCreateWorkOrderPage");
    expect(shopCreateRoute).not.toContain(
      'import CreateWorkOrderPage from "@/features/work-orders/app/work-orders/create/page"',
    );
  });

  it("suppresses the legacy post-save quick-intake trigger", () => {
    expect(shopCreateWrapper).toContain("pfq.create.intake.dismiss.v1");
    expect(shopCreateWrapper).toContain("localStorage.setItem");
    expect(shopCreateWrapper).toContain("<CreateWorkOrderPage />");
  });

  it("keeps portal appointment intake available", () => {
    expect(portalIntakeRoute).toContain('mode="portal"');
  });
});
