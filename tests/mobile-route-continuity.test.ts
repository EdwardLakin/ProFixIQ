import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  requireMobileHref,
  resolveMobileHref,
} from "../features/mobile/navigation/mobile-route-continuity";

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile route continuity", () => {
  it.each([
    ["/dashboard", "/mobile"],
    ["/dashboard/workforce/attendance", "/mobile/workforce/attendance"],
    ["/work-orders/board", "/mobile/dispatch"],
    ["/work-orders/create", "/mobile/work-orders/create"],
    ["/work-orders/abc/quote-review", "/mobile/work-orders/abc"],
    ["/tech/queue", "/mobile/tech/queue"],
    ["/appointments?day=2026-07-19", "/mobile/appointments?day=2026-07-19"],
    [
      "/inspections/maintenance-50-air?workOrderId=wo",
      "/mobile/inspections/maintenance-50-air?workOrderId=wo",
    ],
    ["/parts/requests/123", "/mobile/parts"],
    ["/messages/chat-1", "/mobile/messages/chat-1"],
    ["/customers/customer-1", "/mobile/customers/customer-1"],
    ["/fleet/pretrip/unit-1", "/mobile/fleet/pretrip/unit-1"],
    ["/fleet/service-requests", "/mobile/fleet/service-requests"],
    ["/offline/sync", "/mobile/offline"],
    ["/assistant?workOrderId=wo", "/mobile/assistant?workOrderId=wo"],
    ["/agent/planner?goal=dispatch", "/mobile/planner?goal=dispatch"],
    ["/sign-in", "/mobile/sign-in"],
  ])("maps %s to %s", (source, expected) => {
    expect(resolveMobileHref(source)).toBe(expected);
  });

  it("preserves mobile, external, portal and shared auth destinations", () => {
    expect(resolveMobileHref("/mobile/work-orders?view=active")).toBe(
      "/mobile/work-orders?view=active",
    );
    expect(resolveMobileHref("https://example.com/work-orders")).toBeNull();
    expect(resolveMobileHref("mailto:service@example.com")).toBeNull();
    expect(resolveMobileHref("/portal/fleet")).toBeNull();
    expect(resolveMobileHref("/forgot-password?redirect=%2Fmobile")).toBeNull();
    expect(requireMobileHref("/unknown-internal-route")).toBe("/mobile");
  });

  it("installs a document-level guard for links rendered by shared components", () => {
    const shell = read("components/layout/MobileShell.tsx");
    expect(shell).toContain("resolveMobileHref");
    expect(shell).toContain('document.addEventListener("click"');
    expect(shell).toContain("anchor.origin !== window.location.origin");
    expect(shell).toContain("router.push(mobileHref)");
  });

  it("keeps authentication and mobile utilities inside mobile routes", () => {
    const menu = read("components/layout/MobileBottomNav.tsx");
    const signIn = read("app/mobile/sign-in/page.tsx");
    expect(menu).toContain('href: "/mobile/assistant"');
    expect(menu).toContain('href: "/mobile/planner"');
    expect(menu).toContain('href: "/mobile/offline"');
    expect(menu).toContain('router.replace("/mobile/sign-in")');
    expect(signIn).not.toContain('href="/sign-in"');
  });

  it("allows scoped drivers and fleet managers to read mobile service requests", () => {
    const route = read("app/api/fleet/service-requests/route.ts");
    expect(route).toContain(
      "actor.capabilities.canSeeFleetWideUnits || actor.isFleetActor",
    );
    expect(route).toContain("RLS and fleet membership remain");
  });
});
