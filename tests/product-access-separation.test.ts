import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveFieldExistingSessionHref } from "../features/auth/lib/accessSurfaceRouting";

const read = (path: string) => readFileSync(path, "utf8");

describe("dedicated product access surfaces", () => {
  it("presents five equal product choices instead of a Shop-owned login page", () => {
    const chooser = read("app/sign-in/page.tsx");

    for (const label of [
      "ProFixIQ Shop",
      "Shop Mobile",
      "ProFixIQ Field",
      "ProFixIQ Fleet",
      "Customer Portal",
    ]) {
      expect(chooser).toContain(label);
    }

    expect(chooser).toContain("Where do you work?");
    expect(chooser).toContain('href: "/mobile/sign-in"');
    expect(chooser).not.toContain("<AuthPage");
  });

  it("gives Shop, Field, and Customer Portal dedicated pages", () => {
    expect(read("app/shop/sign-in/page.tsx")).toContain("<AuthPage />");
    expect(read("app/field/sign-in/page.tsx")).toContain("<FieldSignIn />");
    expect(read("app/customer/sign-in/page.tsx")).toContain(
      '<PortalSignInForm portalType="customer" />',
    );
  });

  it("makes Field a first-class authentication surface", () => {
    const field = read("features/auth/components/FieldSignIn.tsx");
    const route = read("app/api/auth/sign-in/route.ts");
    const accessRoute = read("app/api/mobile/field-service/access/route.ts");
    const routeGate = read(
      "features/mobile/service/MobileFieldServiceRouteGate.tsx",
    );

    expect(field).toContain('surface: "field"');
    expect(field).toContain("Sign in to ProFixIQ Field");
    expect(route).toContain('surface === "field"');
    expect(route).toContain("getMobileFieldServiceAccess");
    expect(route).toContain('fieldAccess.decision === "ready"');
    expect(route).toContain('"/mobile/service/setup"');
    expect(field).toContain("resolveFieldPostSignInHref");
    expect(field).toContain("resolveFieldExistingSessionHref");
    expect(field).toContain("We couldn't reach ProFixIQ");
    expect(route).toContain("resolveAuthenticatedStaffProfile");
    expect(accessRoute).toContain("mustChangePassword");
    expect(routeGate).toContain("resolveFieldExistingSessionHref");
    expect(routeGate).toContain('router.replace(destination ?? "/mobile")');
    expect(route).toContain('const rejectedSessionScope = "local" as const');
    expect(route).toContain(
      "supabase.auth.signOut({ scope: rejectedSessionScope })",
    );
  });

  it("keeps inactive owners inside a limited billing recovery surface", () => {
    const route = read("app/api/auth/sign-in/route.ts");
    const billingPage = read("app/account/billing/page.tsx");
    const shopSignIn = read("features/auth/components/SignIn.tsx");
    const mobileSignIn = read("app/mobile/sign-in/page.tsx");

    expect(route).toContain("billingRecoveryDestination");
    expect(route).toContain("resolveShopProductAccess");
    expect(billingPage).toContain('allowRoles: ["owner", "admin"]');
    expect(billingPage).toContain('requiredCapability: "canManageBilling"');
    expect(shopSignIn).toContain('access === "shop_required"');
    expect(mobileSignIn).toContain('access === "shop_required"');
  });

  it("forces existing Field sessions through password setup before routing", () => {
    expect(
      resolveFieldExistingSessionHref(
        {
          canAccessFieldService: true,
          mustChangePassword: true,
        },
        "/mobile/service/work-orders/work-order-1",
      ),
    ).toBe("/auth/set-password?redirect=%2Fmobile%2Fservice");

    expect(
      resolveFieldExistingSessionHref(
        {
          canAccessFieldService: true,
          mustChangePassword: false,
        },
        "/mobile/service/work-orders/work-order-1",
      ),
    ).toBe("/mobile/service/work-orders/work-order-1");

    expect(
      resolveFieldExistingSessionHref(
        { canConfigure: true, mustChangePassword: true },
        "/mobile/service",
      ),
    ).toBe(
      "/auth/set-password?redirect=%2Fmobile%2Fservice%2Fsetup",
    );

    expect(resolveFieldExistingSessionHref({}, "/mobile/service")).toBeNull();
    expect(
      resolveFieldExistingSessionHref(
        {
          decision: "plan_required",
          canConfigure: true,
          mustChangePassword: false,
        },
        "/mobile/service",
      ),
    ).toBeNull();
    expect(
      resolveFieldExistingSessionHref(
        {
          decision: "forbidden",
          canConfigure: true,
          mustChangePassword: false,
        },
        "/mobile/service/setup",
      ),
    ).toBe("/mobile/service/setup");
    expect(
      resolveFieldExistingSessionHref(
        {
          decision: "forbidden",
          canConfigure: true,
          mustChangePassword: false,
        },
        "/mobile/service",
      ),
    ).toBe("/mobile/service/setup");

    expect(
      resolveFieldExistingSessionHref(
        {
          decision: "forbidden",
          canConfigure: true,
          mustChangePassword: true,
        },
        "/mobile/service/setup",
      ),
    ).toBe("/auth/set-password?redirect=%2Fmobile%2Fservice%2Fsetup");

    expect(
      resolveFieldExistingSessionHref(
        {
          decision: "setup_required",
          canConfigure: false,
          mustChangePassword: false,
        },
        "/mobile/service",
      ),
    ).toBe("/mobile/service/setup");
  });

  it("keeps the public AI CTA on the implemented assistant route", () => {
    const buttons = read("features/shared/components/LandingButtons.tsx");

    expect(buttons).toContain(
      'href="/shop/sign-in?redirect=%2Fai%2Fassistant"',
    );
    expect(buttons).not.toContain('href="/shop/sign-in?redirect=%2Fai"');
  });

  it("removes Mobile companion from the public Shop sign-in hierarchy", () => {
    const shop = read("features/auth/components/SignIn.tsx");
    const landing = read("features/shared/components/ProFixIQLanding.tsx");
    const fieldMarketing = read("app/field-service/page.tsx");

    expect(shop).not.toContain("Mobile companion");
    expect(shop).toContain("Choose another ProFixIQ app");
    expect(landing).toContain('signInHref: "/field/sign-in"');
    expect(landing).toContain('signInHref: "/fleet/sign-in"');
    expect(fieldMarketing).toContain('signInHref: "/field/sign-in"');
  });
});
