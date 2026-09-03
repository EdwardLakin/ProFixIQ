import { describe, expect, it } from "vitest";

import { resolveProductRouteBoundary } from "@/features/shared/lib/product-route-boundary";

function boundary(pathname: string) {
  return resolveProductRouteBoundary({
    pathname,
    fleetProductRequest: false,
    opsProductRequest: false,
  });
}

describe("resolveProductRouteBoundary", () => {
  it.each([
    "/dashboard",
    "/work-orders/wo-1",
    "/mobile",
  ])("classifies %s as Shop", (pathname) => {
    expect(boundary(pathname)).toBe("shop");
  });

  it.each(["/mobile/service", "/mobile/service/work-orders/wo-1"])(
    "classifies %s as Field",
    (pathname) => {
      expect(boundary(pathname)).toBe("field");
    },
  );

  it.each([
    "/mobile/appointments",
    "/mobile/inspections/inspection-1",
    "/mobile/parts",
    "/mobile/jobs/job-1",
    "/mobile/work-orders",
    "/mobile/work-orders/create",
    "/mobile/work-orders/wo-1",
    "/mobile/offline",
    "/offline/sync",
    "/launch",
  ])("preserves %s as a shared Shop/Field route", (pathname) => {
    expect(boundary(pathname)).toBe("shared");
  });

  it.each([
    "/account/billing",
    "/onboarding",
    "/dashboard/owner/fleet-access",
    "/portal/fleet",
  ])("does not apply the operational product gate to %s", (pathname) => {
    expect(boundary(pathname)).toBeNull();
  });

  it("leaves Fleet and Ops hosts outside the Shop boundary", () => {
    expect(
      resolveProductRouteBoundary({
        pathname: "/dashboard",
        fleetProductRequest: true,
        opsProductRequest: false,
      }),
    ).toBeNull();
    expect(
      resolveProductRouteBoundary({
        pathname: "/ops",
        fleetProductRequest: false,
        opsProductRequest: true,
      }),
    ).toBeNull();
  });
});
