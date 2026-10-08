import { describe, expect, it } from "vitest";
import {
  isOutsideDesktopAppShell,
  isStandalonePublicRoute,
} from "./shellBoundaries";

describe("shell route boundaries", () => {
  it.each([
    "/",
    "/sign-in",
    "/shop/sign-in",
    "/field/sign-in",
    "/customer/sign-in",
    "/signup",
    "/compare-plans",
    "/compare/fullbay-alternative",
    "/compare/profixiq-vs-fullbay",
    "/field-service",
    "/fleet-maintenance",
    "/fleet-repair-management-software",
    "/dvir-defect-tracking-software",
    "/fleet-preventive-maintenance-software",
    "/heavy-duty-shop-management-software",
    "/diesel-repair-shop-software",
    "/heavy-duty-work-order-software",
    "/heavy-duty-inspection-software",
    "/repair-shop-management-software",
    "/mobile/sign-in",
    "/portal/auth/sign-in",
    "/portal/auth/sign-in?portal=fleet",
    "/demo/instant-shop-analysis",
  ])("keeps %s outside authenticated application chrome", (pathname) => {
    expect(isStandalonePublicRoute(pathname.split("?")[0])).toBe(true);
  });

  it.each(["/dashboard", "/work-orders/abc", "/parts/requests"])(
    "keeps %s inside authenticated application chrome",
    (pathname) => {
      expect(isStandalonePublicRoute(pathname)).toBe(false);
      expect(isOutsideDesktopAppShell(pathname)).toBe(false);
    },
  );

  it.each(["/portal", "/portal/history", "/mobile", "/mobile/work-orders/abc"])(
    "keeps %s outside the desktop shell",
    (pathname) => {
      expect(isOutsideDesktopAppShell(pathname)).toBe(true);
    },
  );

  it("does not treat similarly named routes as public", () => {
    expect(isStandalonePublicRoute("/compare-plans-private")).toBe(false);
    expect(isStandalonePublicRoute("/compare-private/fullbay")).toBe(false);
    expect(isStandalonePublicRoute("/fleet-repair-management-software-private")).toBe(false);
    expect(isStandalonePublicRoute("/dvir-defect-tracking-software-private")).toBe(false);
    expect(isStandalonePublicRoute("/sign-internal")).toBe(false);
    expect(isStandalonePublicRoute("/heavy-duty-work-order-software-private")).toBe(false);
    expect(isStandalonePublicRoute("/repair-shop-management-software-private")).toBe(false);
  });
});
