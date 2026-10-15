import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  EQUIPMENT_HOME,
  EQUIPMENT_SIGN_IN,
  PRODUCT_SIGN_IN,
  resolveLegacySignInHref,
} from "@/features/auth/lib/accessSurfaceRouting";
import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";

const read = (path: string) => readFileSync(path, "utf8");

describe("Equipment sign-in door", () => {
  it("is the Shop sign-in continuing to the Equipment dashboard", () => {
    expect(EQUIPMENT_HOME).toBe("/equipment/dashboard");
    expect(EQUIPMENT_SIGN_IN).toBe("/shop/sign-in?redirect=%2Fequipment%2Fdashboard");
    expect(EQUIPMENT_SIGN_IN.startsWith(PRODUCT_SIGN_IN.shop)).toBe(true);

    // The shared sign-in applies this continuation after authentication.
    const redirect = new URL(EQUIPMENT_SIGN_IN, "https://example.test").searchParams.get("redirect");
    expect(safeInternalRedirect(redirect, "/dashboard")).toBe(EQUIPMENT_HOME);
  });

  it("adds no new authentication surface to the shared auth contract", () => {
    const routing = read("features/auth/lib/accessSurfaceRouting.ts");
    expect(routing).toContain('export type ProductAccessSurface = "shop" | "field" | "fleet" | "customer";');
    expect(Object.keys(PRODUCT_SIGN_IN).sort()).toEqual(["customer", "field", "fleet", "shop"]);
  });

  it("keeps a legacy Equipment continuation on the Shop sign-in", () => {
    const params = new URLSearchParams({ redirect: EQUIPMENT_HOME });
    expect(resolveLegacySignInHref(params)).toBe(EQUIPMENT_SIGN_IN);
  });

  it("sits beside the other doors on the sign-in chooser", () => {
    const chooser = read("app/sign-in/page.tsx");
    for (const label of [
      "ProFixIQ Shop",
      "Shop Mobile",
      "ProFixIQ Equipment",
      "ProFixIQ Field",
      "ProFixIQ Fleet",
      "Customer Portal",
    ]) {
      expect(chooser).toContain(label);
    }
    expect(chooser).toContain("href: EQUIPMENT_SIGN_IN");
    expect(chooser).toContain("Six clear doors");
    expect(chooser).not.toContain("Five clear doors");
    // The other doors still point where they did.
    expect(chooser).toContain("href: PRODUCT_SIGN_IN.shop");
    expect(chooser).toContain('href: "/mobile/sign-in"');
    expect(chooser).toContain("href: PRODUCT_SIGN_IN.field");
    expect(chooser).toContain("href: PRODUCT_SIGN_IN.fleet");
    expect(chooser).toContain("href: PRODUCT_SIGN_IN.customer");
  });

  it("is listed with the other sign-ins in the site footer", () => {
    const footer = read("features/shared/components/ui/Footer.tsx");
    expect(footer).toContain('{ label: "Equipment sign-in", href: EQUIPMENT_SIGN_IN }');
    for (const existing of ["/shop/sign-in", "/field/sign-in", "/fleet/sign-in", "/customer/sign-in"]) {
      expect(footer).toContain(`href: "${existing}"`);
    }
  });
});
