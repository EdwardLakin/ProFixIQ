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
    [
      "/work-orders/9c2a12b0-7708-4d5f-a776-532c25022337",
      "/mobile/work-orders/9c2a12b0-7708-4d5f-a776-532c25022337",
    ],
    [
      "/work-orders/view/9c2a12b0-7708-4d5f-a776-532c25022337?tab=parts#handoff",
      "/mobile/work-orders/9c2a12b0-7708-4d5f-a776-532c25022337?tab=parts#handoff",
    ],
    [
      "/quote-review/9c2a12b0-7708-4d5f-a776-532c25022337",
      "/mobile/work-orders/9c2a12b0-7708-4d5f-a776-532c25022337",
    ],
    [
      "/work-orders/quote-review?woId=9c2a12b0-7708-4d5f-a776-532c25022337",
      "/mobile/work-orders/9c2a12b0-7708-4d5f-a776-532c25022337",
    ],
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

  it("does not treat similar route names as dynamic record prefixes", () => {
    expect(resolveMobileHref("/work-orders/viewer")).toBe(
      "/mobile/work-orders/viewer",
    );
    expect(resolveMobileHref("/customers-list/customer-1")).toBeNull();
    expect(resolveMobileHref("/fleet/pretrips/unit-1")).toBe("/mobile/fleet");
  });

  it("installs client and server guards for desktop links opened on mobile", () => {
    const shell = read("components/layout/MobileShell.tsx");
    const middleware = read("middleware.ts");

    expect(shell).toContain("resolveMobileHref");
    expect(shell).toContain('document.addEventListener("click"');
    expect(shell).toContain("anchor.origin !== window.location.origin");
    expect(shell).toContain("event.preventDefault()");
    expect(shell).toContain("router.push(mobileHref)");

    expect(middleware).toContain("isMobileDeviceRequest");
    expect(middleware).toContain('req.headers.get("sec-ch-ua-mobile")');
    expect(middleware).toContain("resolveMobileHref(requestedHref)");
    expect(middleware).toContain("mobileDeviceRequest &&");
    expect(middleware).toContain("defaultAuthenticatedPath");
    expect(middleware).toContain('? "/mobile"');
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

  it("uses deterministic mobile back routes instead of browser history", () => {
    const job = read("app/mobile/jobs/[lineId]/page.tsx");
    const inspection = read("app/mobile/inspections/[id]/page.tsx");
    const chat = read("app/mobile/messages/[chatId]/page.tsx");
    const newMessage = read("features/mobile/messages/new/page.client.tsx");
    const vehicle = read("app/mobile/work-orders/[id]/vehicle/page.tsx");
    const pretrip = read("app/mobile/fleet/pretrip/[unitId]/page.tsx");
    const previous = read("features/shared/components/ui/PreviousPageButton.tsx");

    expect(job).toContain('router.push("/mobile/tech/queue")');
    expect(job).not.toContain("router.back()");
    expect(inspection).toContain("const backHref = workOrderId");
    expect(inspection).not.toContain("router.back()");
    expect(chat).toContain('href="/mobile/messages"');
    expect(chat).not.toContain("router.back()");
    expect(newMessage).toContain('href="/mobile/messages"');
    expect(vehicle).toContain(
      'href={`/mobile/work-orders/${workOrderId}`}',
    );
    expect(pretrip).toContain('href="/mobile/fleet/pretrip"');
    expect(previous).toContain('router.push("/mobile/work-orders")');
  });

  it("allows scoped drivers and fleet managers to read mobile service requests", () => {
    const route = read("app/api/fleet/service-requests/route.ts");
    expect(route).toContain(
      "actor.capabilities.canSeeFleetWideUnits || actor.isFleetActor",
    );
    expect(route).toContain("RLS and fleet membership remain");
  });
});
