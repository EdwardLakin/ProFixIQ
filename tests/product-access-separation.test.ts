import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("dedicated product access surfaces", () => {
  it("presents four equal product choices instead of a Shop-owned login page", () => {
    const chooser = read("app/sign-in/page.tsx");

    for (const label of [
      "ProFixIQ Shop",
      "ProFixIQ Field",
      "ProFixIQ Fleet",
      "Customer Portal",
    ]) {
      expect(chooser).toContain(label);
    }

    expect(chooser).toContain("Where do you work?");
    expect(chooser).toContain("PRODUCT_SIGN_IN[surface]");
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

    expect(field).toContain('surface: "field"');
    expect(field).toContain("Sign in to ProFixIQ Field");
    expect(route).toContain('surface === "field"');
    expect(route).toContain("getMobileFieldServiceAccess");
    expect(route).toContain('fieldAccess.canAccessFieldService');
    expect(route).toContain('"/mobile/service/setup"');
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
